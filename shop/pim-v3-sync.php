<?php
declare(strict_types=1);
// PIM contract 3 ingestion: exact products[] envelope from PIM pimSiteWire(), chunked, atomic finalize.
// Existing products = MODEL storage, variants = real SKU storage; no second catalog, no text inference.
require_once __DIR__.'/pim-v3-contract.php';
require_once __DIR__.'/pim-v3-schema.php';

const PIM_V3_CONTRACT=['contract_version'=>3,'version'=>3,'pricing_policy_version'=>1,'category_catalog_version'=>2,'size_catalog_version'=>1,'inventory_policy_version'=>1,'order_policy_version'=>1,'model_colors_version'=>1];
const PIM_V3_MAX_CHUNK_MODELS=200;
const PIM_V3_MAX_CHUNKS=200;

final class PimV3Rejected extends RuntimeException {
    public function __construct(public readonly string $reason,public readonly array $results=[],int $status=422){parent::__construct($reason,$status);}
}

function pimV3SchemaReady(PDO $db): bool {
    static $ready=[];$key=spl_object_id($db);
    if(isset($ready[$key]))return $ready[$key];
    try{return $ready[$key]=(string)$db->query("SELECT v FROM meta WHERE k='pim_v3_schema'")->fetchColumn()==='2';}catch(PDOException){return $ready[$key]=false;}
}
// Capability is advertised only when the operator enabled it AND the additive schema is applied.
function pimV3Enabled(PDO $db): bool {return cfg('pim_v3_sync')===true&&pimV3SchemaReady($db);}
function pimV3Capabilities(PDO $db): array {
    if(!pimV3Enabled($db))return ['pricing_policy_version'=>1];
    return PIM_V3_CONTRACT+['envelope'=>'products','max_chunk_models'=>PIM_V3_MAX_CHUNK_MODELS,'freshness_policy_version'=>1,'quote_sale_version'=>1];
}

function pimV3Translit(string $s): string {
    $map=['а'=>'a','б'=>'b','в'=>'v','г'=>'h','ґ'=>'g','д'=>'d','е'=>'e','є'=>'ie','ж'=>'zh','з'=>'z','и'=>'y','і'=>'i','ї'=>'i','й'=>'i','к'=>'k','л'=>'l','м'=>'m','н'=>'n','о'=>'o','п'=>'p','р'=>'r','с'=>'s','т'=>'t','у'=>'u','ф'=>'f','х'=>'kh','ц'=>'ts','ч'=>'ch','ш'=>'sh','щ'=>'shch','ь'=>'','ю'=>'iu','я'=>'ia','ы'=>'y','э'=>'e','ё'=>'e','ъ'=>''];
    $s=strtr(mb_strtolower($s),$map);$s=preg_replace('/[^a-z0-9]+/','-',$s);return trim((string)$s,'-');
}

/** Validate the envelope/chunk header. Returns decoded arrays (assoc) and objects (for the pinned schema). */
function pimV3ParseChunk(string $raw): array {
    if(strlen($raw)>8*1024*1024)throw new PimV3Rejected('BYTE_LIMIT',[],413);
    try{$obj=json_decode($raw,false,64,JSON_THROW_ON_ERROR);$arr=json_decode($raw,true,64,JSON_THROW_ON_ERROR);}catch(JsonException){throw new PimV3Rejected('INVALID_JSON',[],400);}
    if(!$obj instanceof stdClass)throw new PimV3Rejected('BATCH_CONTRACT',[],400);
    if(($arr['currency']??null)!=='UAH')throw new PimV3Rejected('CURRENCY',[],400);
    foreach(PIM_V3_CONTRACT as $k=>$v)if(($arr[$k]??null)!==$v)throw new PimV3Rejected('UNSUPPORTED_VERSION:'.$k,[],409);
    if(isset($arr['models'])||!is_array($arr['products']??null)||!array_is_list($arr['products']))throw new PimV3Rejected('ENVELOPE_PRODUCTS_REQUIRED',[],400);
    if(!is_string($arr['batch_id']??null)||!preg_match('/^PB-[a-f0-9]{16}-[a-f0-9]{16}$/D',$arr['batch_id']))throw new PimV3Rejected('BATCH_ID',[],400);
    $i=$arr['chunk_index']??null;$n=$arr['chunk_count']??null;
    if(!is_int($i)||!is_int($n)||$n<1||$n>PIM_V3_MAX_CHUNKS||$i<0||$i>=$n)throw new PimV3Rejected('CHUNK_INDEX',[],400);
    if(count($arr['products'])>PIM_V3_MAX_CHUNK_MODELS)throw new PimV3Rejected('CHUNK_TOO_LARGE',[],413);
    if(!is_array($arr['hide_ids']??null)||!array_is_list($arr['hide_ids'])||count($arr['hide_ids'])>20000||array_filter($arr['hide_ids'],fn($id)=>!pimV3Identifier($id)))throw new PimV3Rejected('HIDE_IDS',[],400);
    if($i<$n-1&&$arr['hide_ids']!==[])throw new PimV3Rejected('HIDE_IDS_LAST_CHUNK_ONLY',[],400);
    if($i===0&&!is_array($arr['categories']??null))throw new PimV3Rejected('CATEGORIES_REQUIRED',[],400);
    // Stage 5.1: the owner's supplier data freshness thresholds (optional, chunk 0; invalid → the whole batch is refused).
    if(array_key_exists('freshness_policy',$arr)&&($i!==0||shopFreshnessPolicyErrors($arr['freshness_policy'])))throw new PimV3Rejected('FRESHNESS_POLICY',['errors'=>$i!==0?['CHUNK_0_ONLY']:shopFreshnessPolicyErrors($arr['freshness_policy'])],400);
    if(!is_string($arr['catalog_revision']??null)||!preg_match('/^[A-Za-z0-9_.:-]{8,64}$/D',$arr['catalog_revision']))throw new PimV3Rejected('CATALOG_REVISION',[],400);
    return [$arr,$obj];
}

/** Category registry from the PIM payload: exact IDs and parents; slugs/URLs fixed at first sight. */
function pimV3CategoryErrors(array $categories): array {
    $ids=[];$errors=[];
    foreach($categories as $i=>$c){
        if(!is_array($c)||!pimV3Identifier($c['id']??null)||!is_string($c['name']??null)||trim($c['name'])===''||isset($ids[$c['id']])){$errors[]=['path'=>'$.categories['.$i.']','code'=>'CATEGORY_IDENTITY'];continue;}
        $ids[$c['id']]=$c['parent_id']??null;
    }
    foreach($ids as $id=>$parent)if($parent!==null&&!array_key_exists($parent,$ids))$errors[]=['path'=>'$.categories','code'=>'CATEGORY_PARENT:'.$id];
    foreach(array_keys($ids) as $id){$seen=[];for($x=$id;$x!==null;$x=$ids[$x]??null){if(isset($seen[$x])){$errors[]=['path'=>'$.categories','code'=>'CATEGORY_CYCLE:'.$id];break;}$seen[$x]=true;}}
    return $errors;
}
function pimV3SyncCategories(PDO $db,array $categories,string $revision): void {
    $byId=array_column($categories,null,'id');
    $existing=$db->query('SELECT category_id,slug,url_path FROM rubizh_pim_categories')->fetchAll(PDO::FETCH_UNIQUE|PDO::FETCH_ASSOC);
    $site=[];foreach(shopTaxonomySpec()['categories'] as $c)$site[$c['category_id']]=$c;
    $taken=[];foreach($site as $c)if($c['url_path']!=='')$taken[$c['url_path']]=$c['category_id'];
    foreach($existing as $id=>$c)$taken[$c['url_path']]=$id;
    $url=function(string $id)use(&$url,&$taken,$byId,$existing,$site):array{
        if(isset($existing[$id]))return [$existing[$id]['slug'],$existing[$id]['url_path']];
        // Shared IDs keep the shop's established slug and URL.
        if(isset($site[$id])&&$site[$id]['status']==='active')return [$site[$id]['slug'],$site[$id]['url_path']];
        $c=$byId[$id];$slug=pimV3Translit((string)$c['name'])?:pimV3Translit($id);
        $parent=$c['parent_id']??null;$prefix=$parent?$url($parent)[1].'/':'';$path=$prefix.$slug;
        // Another category already owns that URL (renamed SITE ID): the ID keeps it unambiguous.
        if(isset($taken[$path])&&$taken[$path]!==$id){$slug=str_replace('_','-',$id);$path=$prefix.$slug;}
        $taken[$path]=$id;return [$slug,$path];
    };
    $name=function(string $id)use(&$name,$byId):string{$c=$byId[$id];return ($c['parent_id']??null)?$name($c['parent_id']).' / '.$c['name']:$c['name'];};
    $q=$db->prepare('INSERT INTO rubizh_pim_categories(category_id,parent_id,name,slug,path,url_path,sort_order,revision,updated_at) VALUES(?,?,?,?,?,?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE parent_id=VALUES(parent_id),name=VALUES(name),path=VALUES(path),sort_order=VALUES(sort_order),revision=VALUES(revision),updated_at=VALUES(updated_at)');
    foreach(array_values($categories) as $i=>$c){[$slug,$path]=$url($c['id']);$q->execute([$c['id'],$c['parent_id']??null,mb_substr((string)$c['name'],0,255),$slug,mb_substr($name($c['id']),0,600),$path,$i,$revision]);}
    $db->prepare("INSERT INTO meta(k,v) VALUES('pim_v3_category_revision',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([$revision]);
}

// PIM kit_component (structured product type) → storefront kit slot.
function pimV3KitSlot(?string $component): ?string {
    return ['combat_shirt'=>'body','outer_layer'=>'body','fleece'=>'body','base_layer'=>'body','pants'=>'legs','footwear'=>'boots','socks'=>'small','gloves'=>'small','knee_protection'=>'small',
        'carrier'=>'armor','plates'=>'armor','helmet'=>'head','hearing'=>'head','eye_protection'=>'head','backpack'=>'gear','pouch'=>'gear','rps'=>'gear','battle_belt'=>'gear','ifak'=>'med','tourniquet'=>'med'][$component??'']??null;
}
function pimV3PublicVariantData(array $v): array {
    $keep=['sku','color_id','color','camouflage','size','size_raw','size_display','size_normalized','size_system','size_status','size_type','size_alpha','size_fit','size_height','availability','order_submission_allowed','payment_allowed','requires_order_confirmation','delivery_lead_time_days','ready_to_dispatch','price_ready','pricing_policy_version','price','site_price','kit_price','wholesale','stock_observed_at','stock_imported_at','stock_valid_until','stale_source','expires_at','barcode','sale_mode','price_unit'];
    $out=array_intersect_key($v,array_fill_keys($keep,true));
    if(isset($out['wholesale']))$out['wholesale']=array_map(fn($t)=>array_intersect_key((array)$t,array_fill_keys(['price','discount','requested_discount','capped'],true)),(array)$out['wholesale']);
    return $out;
}
function pimV3LegacyAvailability(array $v): string {
    // Legacy columns stay readable for old screens; v3 permissions are authoritative.
    if(!empty($v['payment_allowed']))return 'in';
    return !empty($v['order_submission_allowed'])?'order':'out';
}

/** Collect every validation problem before any write; returns per-model errors. */
function pimV3ValidateBatch(PDO $db,array $products,array $objects,array $categories): array {
    $errors=[];$results=[];
    $check=pimV3ValidateModels($objects,'$.products',true);
    foreach($check['errors'] as $e)$errors[]=$e;
    $catIds=array_column($categories,'parent_id','id');
    $owner=$db->prepare('SELECT product_id FROM variants WHERE sku=?');
    foreach($products as $i=>$m){
        $p='$.products['.$i.']';
        $id=(string)($m['id']??'');
        foreach(['slug','name','description'] as $k)if(!is_string($m[$k]??null)||trim($m[$k])==='')$errors[]=['path'=>$p.'.'.$k,'code'=>'REQUIRED_TEXT'];
        if(!is_array($m['photos']??null)||$m['photos']===[])$errors[]=['path'=>$p.'.photos','code'=>'NO_PHOTOS'];
        $cat=$m['canonical_category_id']??null;
        if(!is_string($cat)||!array_key_exists($cat,$catIds)||$catIds[$cat]===null)$errors[]=['path'=>$p.'.canonical_category_id','code'=>'CATEGORY_NOT_LEAF'];
        foreach(is_array($m['variants']??null)?$m['variants']:[] as $j=>$v){
            if(isset($v['checkout_allowed']))$errors[]=['path'=>$p.'.variants['.$j.']','code'=>'LEGACY_CHECKOUT_ALLOWED'];
            // Stage 5.4 (owner): a per-m² price is not an item price — QUOTE SKU are shown without the cart (manager quote, D-54).
            if(array_key_exists('sale_mode',$v)&&!in_array($v['sale_mode'],[null,'QUOTE'],true))$errors[]=['path'=>$p.'.variants['.$j.'].sale_mode','code'=>'SALE_MODE'];
            if(array_key_exists('price_unit',$v)&&!in_array($v['price_unit'],[null,'m2'],true))$errors[]=['path'=>$p.'.variants['.$j.'].price_unit','code'=>'PRICE_UNIT'];
            // A per-m² price on an ordinary SKU would be charged as an item price: m² only with QUOTE.
            if(($v['price_unit']??null)==='m2'&&($v['sale_mode']??null)!=='QUOTE')$errors[]=['path'=>$p.'.variants['.$j.'].price_unit','code'=>'PRICE_UNIT_WITHOUT_QUOTE'];
            if(!is_string($v['sku']??null))continue;$owner->execute([$v['sku']]);$found=$owner->fetchColumn();
            if($found!==false&&strcasecmp((string)$found,$id)!==0)$errors[]=['path'=>$p.'.variants['.$j.'].sku','code'=>'SKU_OWNED_BY_OTHER_MODEL'];
            if(!empty($v['price_ready'])){try{if(shopPricingPolicy($v)===null)$errors[]=['path'=>$p.'.variants['.$j.']','code'=>'PRICING_V1_FIELDS'];}catch(ShopPricingException $e){$errors[]=['path'=>$p.'.variants['.$j.']','code'=>'PRICING_POLICY:'.$e->reason];}}
        }
    }
    foreach($products as $i=>$m){
        $mine=array_values(array_filter($errors,fn($e)=>str_starts_with($e['path'],'$.products['.$i.']')));
        $results[]=['id'=>(string)($m['id']??''),'status'=>$mine?'error':'valid','errors'=>array_slice(array_column($mine,'code'),0,10)];
    }
    return [$errors,$results];
}

// Multi-row INSERT with the same rows in the same order as one statement per row (identical AUTO_INCREMENT order).
function pimV3InsertRows(PDO $db,string $head,int $width,array $rows,string $tail=''): void {
    foreach(array_chunk($rows,300) as $part){
        $db->prepare($head.' VALUES '.implode(',',array_fill(0,count($part),'('.implode(',',array_fill(0,$width,'?')).')')).$tail)->execute(array_merge(...$part));
    }
}
function pimV3PhotoSync(PDO $db,string $id,array $urls): array {
    // Same positional photo storage and worker queue as legacy sync; only changed positions are re-queued.
    $cur=$db->prepare('SELECT id,pos,src_hash FROM photos WHERE product_id=?');$cur->execute([$id]);
    $have=[];foreach($cur->fetchAll(PDO::FETCH_ASSOC) as $r)$have[(int)$r['pos']]=$r;
    $rows=[];foreach(array_values($urls) as $pos=>$u){$h=sha1($u);if(($have[$pos]['src_hash']??null)!==$h)$rows[]=[$id,$pos,$u,$h];}
    foreach(array_chunk($rows,300) as $part)$db->prepare('INSERT INTO photos(product_id,pos,src_url,src_hash,status,updated_at) VALUES '.implode(',',array_fill(0,count($part),"(?,?,?,?,'pending',UTC_TIMESTAMP())")).' ON DUPLICATE KEY UPDATE src_url=VALUES(src_url),src_hash=VALUES(src_hash),file=\'\',thumb=\'\',status=\'pending\',error=\'\',tries=0,updated_at=VALUES(updated_at)')->execute(array_merge(...$part));
    // Photos beyond the new list are detached from model/color relations first, then removed.
    $db->prepare('DELETE FROM rubizh_color_photos WHERE product_id=?')->execute([$id]);
    $db->prepare('DELETE FROM rubizh_model_photos WHERE product_id=?')->execute([$id]);
    $db->prepare('DELETE FROM photos WHERE product_id=? AND pos>=?')->execute([$id,count($urls)]);
    $q=$db->prepare('SELECT pos,id FROM photos WHERE product_id=?');$q->execute([$id]);
    return $q->fetchAll(PDO::FETCH_KEY_PAIR);
}

function pimV3WriteModel(PDO $db,array $m,string $batch,string $revision): string {
    $id=$m['id'];$hash=sha1(json_encode($m,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
    $old=$db->prepare('SELECT hash,visible,pim_contract_version FROM products WHERE id=?');$old->execute([$id]);$before=$old->fetch(PDO::FETCH_ASSOC)?:null;
    if($before&&$before['hash']===$hash&&(int)$before['visible']===1&&(int)$before['pim_contract_version']===3){
        $db->prepare('UPDATE products SET synced_at=UTC_TIMESTAMP(),pim_revision=? WHERE id=?')->execute([$revision,$id]);return 'unchanged';
    }
    // Stage 5.4: a QUOTE SKU (price per m²) is never ordered or paid through the cart, whatever else the batch says (fail
    // closed) — applied before prices, legacy availability, the model flags, the stored columns and the data JSON.
    foreach($m['variants'] as $i=>$v)if(($v['sale_mode']??null)==='QUOTE'){$m['variants'][$i]['order_submission_allowed']=false;$m['variants'][$i]['payment_allowed']=false;$m['variants'][$i]['requires_order_confirmation']=true;}
    if($m['variants']!==[]&&!array_filter($m['variants'],fn($v)=>($v['sale_mode']??null)!=='QUOTE')){$m['order_submission_allowed']=false;$m['payment_allowed']=false;$m['requires_order_confirmation']=true;}
    $variants=$m['variants'];$policies=[];$prices=[];
    foreach($variants as $v){$policy=!empty($v['price_ready'])?shopPricingPolicy($v):null;$policies[$v['sku']]=$policy;if($policy!==null&&!empty($v['order_submission_allowed']))$prices[]=$policy['price_cents'];}
    if(!$prices)foreach($policies as $policy)if($policy!==null)$prices[]=$policy['price_cents'];
    $best=in_array('in',array_map('pimV3LegacyAvailability',$variants),true)?'in':(in_array('order',array_map('pimV3LegacyAvailability',$variants),true)?'order':'out');
    $path=(string)$db->query('SELECT path FROM rubizh_pim_categories WHERE category_id='.$db->quote($m['canonical_category_id']))->fetchColumn();
    $public=['contract_version'=>3,'id'=>$id,'model_id'=>$m['model_id'],'name'=>$m['marketing_name_uk'],'brand'=>is_string($m['brand']??null)?$m['brand']:'','description'=>$m['description'],
        'canonical_category_id'=>$m['canonical_category_id'],'attributes'=>is_array($m['filter_attributes']??null)?$m['filter_attributes']:[],'availability'=>$m['availability'],
        'order_submission_allowed'=>$m['order_submission_allowed'],'payment_allowed'=>$m['payment_allowed'],'requires_order_confirmation'=>$m['requires_order_confirmation'],
        'pricing_policy_version'=>1,'related'=>array_values(array_filter((array)($m['recommended_with']??[]),'is_string')),'kit_component'=>$m['kit_component']??null,'kit_component_tags'=>$m['kit_component_tags']??[]];
    // The contract allows ACTIVE/HIDDEN/ARCHIVED; only ACTIVE is published (D-14).
    $state=in_array($m['publication_state']??null,['HIDDEN','ARCHIVED'],true)?$m['publication_state']:'ACTIVE';
    $slug=unique_slug($db,slugify((string)$m['slug'])?:slugify((string)$m['marketing_name_uk']),$id);
    $db->prepare("INSERT INTO products(id,slug,name,brand,category_id,category_path,description,attributes,links,has_docs,docs_note,price_min,price_max,availability,variants_count,visible,hash,data,created_at,updated_at,synced_at,
        pim_contract_version,pim_model_id,pim_publication_state,pim_publication_reason,pim_revision,pim_usable_photo_count,pim_media_revision,pim_classification_version,pim_category_catalog_version,pim_size_catalog_version,pim_order_policy_version,pim_inventory_policy_version,pim_pricing_policy_version)
        VALUES(?,?,?,?,?,?,?,?,'{}',0,'',?,?,?,?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP(),UTC_TIMESTAMP(),3,?,?,?,?,?,?,1,2,1,1,1,1)
        ON DUPLICATE KEY UPDATE slug=VALUES(slug),name=VALUES(name),brand=VALUES(brand),category_id=VALUES(category_id),category_path=VALUES(category_path),description=VALUES(description),attributes=VALUES(attributes),
        price_min=VALUES(price_min),price_max=VALUES(price_max),availability=VALUES(availability),variants_count=VALUES(variants_count),visible=VALUES(visible),hash=VALUES(hash),data=VALUES(data),updated_at=VALUES(updated_at),synced_at=VALUES(synced_at),
        pim_contract_version=3,pim_model_id=VALUES(pim_model_id),pim_publication_state=VALUES(pim_publication_state),pim_publication_reason=VALUES(pim_publication_reason),pim_revision=VALUES(pim_revision),pim_usable_photo_count=VALUES(pim_usable_photo_count),pim_media_revision=VALUES(pim_media_revision),
        pim_classification_version=1,pim_category_catalog_version=2,pim_size_catalog_version=1,pim_order_policy_version=1,pim_inventory_policy_version=1,pim_pricing_policy_version=1")
        ->execute([$id,$slug,mb_substr($m['marketing_name_uk'],0,500),mb_substr($public['brand'],0,191),$path!==''?sha1($path):null,$path,$m['description'],json_encode((object)$public['attributes'],JSON_UNESCAPED_UNICODE),
            $prices?shopMoneyValue(min($prices)):null,$prices?shopMoneyValue(max($prices)):null,$best,count($variants),$state==='ACTIVE'?1:0,$hash,json_encode($public,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),
            $m['model_id'],$state,$state==='ACTIVE'?null:'PIM_PUBLICATION_STATE',$revision,count($m['photos']),sha1(json_encode([$m['photos'],array_column($m['colors'],'photos','id')],JSON_THROW_ON_ERROR))]);
    // Colors: composite (model,color) identity; inactive colors keep history.
    $db->prepare('UPDATE products SET pim_kit_slot=? WHERE id=?')->execute([pimV3KitSlot(is_string($m['kit_component']??null)?$m['kit_component']:null),$id]);
    $db->prepare('UPDATE rubizh_product_colors SET active=0 WHERE product_id=?')->execute([$id]);
    $color=$db->prepare('INSERT INTO rubizh_product_colors(product_id,color_id,color,camouflage,sort,revision,active) VALUES(?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE color=VALUES(color),camouflage=VALUES(camouflage),sort=VALUES(sort),revision=VALUES(revision),active=1');
    foreach($m['colors'] as $i=>$c)$color->execute([$id,$c['id'],isset($c['color'])?mb_substr((string)$c['color'],0,120):null,isset($c['camouflage'])?mb_substr((string)$c['camouflage'],0,120):null,$i,$revision]);
    // Photos: model gallery first, then color-owned photos; ownership UNKNOWN unless PIM bound it to a color.
    $urls=[];foreach($m['photos'] as $u)$urls[$u]=true;foreach($m['colors'] as $c)foreach($c['photos'] as $u)$urls[$u]=true;
    $ids=pimV3PhotoSync($db,$id,array_keys($urls));$posOf=array_flip(array_keys($urls));
    $owned=[];foreach($m['colors'] as $c)foreach($c['photos'] as $u)$owned[$u][]=$c['id'];
    $mpRows=[];$cpRows=[];
    foreach($urls as $u=>$_){$photo=$ids[$posOf[$u]]??null;if($photo===null)continue;$mpRows[]=[$id,$photo,$posOf[$u],isset($owned[$u])?'CONFIRMED':'UNKNOWN',$revision];foreach($owned[$u]??[] as $cid)$cpRows[]=[$id,$cid,$photo,$posOf[$u],$revision,'CONFIRMED'];}
    pimV3InsertRows($db,'INSERT INTO rubizh_model_photos(product_id,photo_id,sort,assignment_state,revision)',5,$mpRows);
    pimV3InsertRows($db,'INSERT INTO rubizh_color_photos(product_id,color_id,photo_id,sort,revision,assignment_state)',6,$cpRows);
    // Real SKU: never deleted (orders, mappings and history may reference them); absent ones become inactive.
    $db->prepare("UPDATE variants SET pim_active=0,availability='out',pim_order_submission_allowed=0,pim_payment_allowed=0 WHERE product_id=?")->execute([$id]);
    $cols=['sku','product_id','size','color','barcode','price','kit_price','availability','lead_time','sort','data','pim_variant_id','pim_color_id','pim_size_system','pim_size_raw','pim_size_normalized','pim_size_display','pim_size_status','pim_size_confidence_tier','pim_source_binding_status','pim_effective_availability','pim_stock_status','pim_stock_quantity','pim_availability_status','pim_availability_source','pim_availability_confirmation','pim_inventory_mode','pim_inventory_policy_id','pim_inventory_policy_version','pim_stock_observed_at','pim_source_updated_at','pim_stock_data_age_hours','pim_stock_warning_hours','pim_expires_at','pim_delivery_lead_time_days','pim_revision','pim_order_submission_allowed','pim_payment_allowed','pim_requires_order_confirmation','pim_inventory_policy_confirmed','pim_stale_source','pim_ready_to_dispatch','pim_price_ready','pim_binding_confirmation_required','pim_size_confirmation_required','pim_active'];
    $vRows=[];$vTail=' ON DUPLICATE KEY UPDATE '.implode(',',array_map(fn($c)=>"$c=VALUES($c)",array_slice($cols,1)));
    $str=static fn($v,int $n=120)=>is_string($v)&&$v!==''?mb_substr($v,0,$n):null;$flag=static fn($v)=>$v===null?null:($v?1:0);
    $time=static fn($v)=>is_int($v)&&$v>0?$v:(is_string($v)&&($t=strtotime($v))!==false?$t*1000:null);
    $fulfillment=[];$articles=[];
    foreach(array_values($variants) as $i=>$v){
        $policy=$policies[$v['sku']];$display=$v['size_display']??$v['size_normalized']??$v['size']??'';
        $vRows[]=[$v['sku'],$id,mb_substr((string)($display??''),0,120),mb_substr(trim(implode(' / ',array_filter([$v['color']??null,$v['camouflage']??null]))),0,120),mb_substr((string)($v['barcode']??''),0,64),
            $policy?shopMoneyValue($policy['price_cents']):null,$policy&&$policy['kit_cents']!==null?shopMoneyValue($policy['kit_cents']):null,pimV3LegacyAvailability($v),
            isset($v['delivery_lead_time_days'])&&is_int($v['delivery_lead_time_days'])?mb_substr($v['delivery_lead_time_days'].' дн.',0,60):'',$i,json_encode(pimV3PublicVariantData($v),JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),
            $str($v['variant_id']??null,64),$v['color_id'],$str($v['size_system']??null,32),$str($v['size_raw']??null),$str(isset($v['size_normalized'])?(string)$v['size_normalized']:null),$str($v['size_display']??null),$v['size_status'],$v['size_confidence_tier'],$v['source_binding_status'],
            $v['availability'],$v['stock_status'],$v['stock_quantity'],$v['availability_status'],$v['availability_source'],$v['availability_confirmation'],$v['inventory_mode'],$str($v['inventory_policy_id']??null,64),$v['inventory_policy_version'],
            $time($v['stock_observed_at']),$time($v['source_updated_at']),is_numeric($v['stock_data_age_hours'])?round((float)$v['stock_data_age_hours'],2):null,is_numeric($v['stock_warning_hours']??null)?$v['stock_warning_hours']:null,$time($v['expires_at']??null),
            is_int($v['delivery_lead_time_days'])?$v['delivery_lead_time_days']:null,$revision,$flag($v['order_submission_allowed']),$flag($v['payment_allowed']),$flag($v['requires_order_confirmation']),$flag($v['inventory_policy_confirmed']),$flag($v['stale_source']),
            $flag($v['ready_to_dispatch']),$flag($v['price_ready']),$flag($v['binding_confirmation_required']),$flag($v['size_confirmation_required']),1];
        // Private routing only: supplier name for the NP origin map, supplier article for the supplier order.
        if(is_string($v['fulfillment_supplier']??null)&&$v['fulfillment_supplier']!=='')$fulfillment[$v['sku']]=mb_substr($v['fulfillment_supplier'],0,191);
        if(is_string($v['fulfillment_supplier_sku']??null)&&$v['fulfillment_supplier_sku']!=='')$articles[$v['sku']]=['supplier_name'=>$fulfillment[$v['sku']]??'','supplier_sku'=>mb_substr($v['fulfillment_supplier_sku'],0,120)];
    }
    pimV3InsertRows($db,'INSERT INTO variants('.implode(',',$cols).')',count($cols),$vRows,$vTail);
    sync_product_fulfillment($db,$id,$fulfillment);sync_product_supplier_articles($db,$id,$articles);pimV3SyncSupplierFlags($db,$id,$fulfillment,$articles);
    shopPricingStore($db,$id,array_filter($policies));
    // Size catalogs/options are assortment, not inventory; options never carry SKU/stock.
    $sc=$db->prepare('INSERT INTO rubizh_size_catalogs(product_id,catalog_id,scope,color_id,size_system,allowed_sizes_json,revision) VALUES(?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE scope=VALUES(scope),color_id=VALUES(color_id),size_system=VALUES(size_system),allowed_sizes_json=VALUES(allowed_sizes_json),revision=VALUES(revision)');
    foreach($m['size_catalogs'] as $c)$sc->execute([$id,$c['catalog_id'],$c['scope'],$c['color_id']??null,(string)($c['size_system']??'other'),json_encode(array_values(array_map('strval',$c['allowed_sizes'])),JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$revision]);
    $db->prepare('UPDATE rubizh_size_options SET active=0 WHERE product_id=?')->execute([$id]);
    $so=$db->prepare("INSERT INTO rubizh_size_options(product_id,option_id,catalog_id,scope,color_id,size,size_system,revision,active) VALUES(?,?,?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE catalog_id=VALUES(catalog_id),scope=VALUES(scope),color_id=VALUES(color_id),size=VALUES(size),size_system=VALUES(size_system),revision=VALUES(revision),active=1");
    foreach($m['size_options'] as $o)$so->execute([$id,$o['option_id'],$o['catalog_id']??null,$o['scope'],$o['color_id']??null,mb_substr((string)$o['size'],0,120),$str($o['size_system']??null,32),$revision]);
    // Category: PIM canonical ID, except a SITE administrator lock that already exists.
    $locked=false;
    static $decisionTable=[];$dbKey=spl_object_id($db);
    $decisionTable[$dbKey]??=(int)$db->query("SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='rubizh_category_decisions'")->fetchColumn()===1;
    if($decisionTable[$dbKey]){$q=$db->prepare('SELECT manual_category_lock FROM rubizh_category_decisions WHERE product_id=?');$q->execute([$id]);$locked=(int)$q->fetchColumn()===1;}
    if(!$locked)$db->prepare("INSERT INTO rubizh_product_categories(product_id,category_id,legacy_path,derived_attributes,filter_attributes,reason,revision) VALUES(?,?,?,'{}',?,'PIM_V3',?) ON DUPLICATE KEY UPDATE category_id=VALUES(category_id),legacy_path=VALUES(legacy_path),derived_attributes='{}',filter_attributes=VALUES(filter_attributes),reason='PIM_V3',revision=VALUES(revision)")
        ->execute([$id,$m['canonical_category_id'],$path,json_encode((object)$public['attributes'],JSON_UNESCAPED_UNICODE),$revision]);
    $db->prepare("INSERT INTO rubizh_pim_history(batch_id,entity_type,entity_id,operation,before_json,after_json,proof_reference,created_at) VALUES(?,'model',?,?,?,?,?,UTC_TIMESTAMP())")
        ->execute([$batch,$id,$before?'UPDATE':'CREATE',$before?json_encode(['hash'=>$before['hash'],'contract'=>$before['pim_contract_version']]):null,json_encode(['hash'=>$hash,'category'=>$m['canonical_category_id'],'skus'=>array_column($variants,'sku'),'category_locked'=>$locked]),$revision]);
    return $before?'updated':'created';
}

function pimV3Hide(PDO $db,array $ids,string $batch): array {
    $hidden=[];$q=$db->prepare("UPDATE products SET visible=0,pim_publication_state='HIDDEN',pim_publication_reason='PIM_EXPLICIT_HIDE',updated_at=UTC_TIMESTAMP() WHERE id=?");
    $h=$db->prepare("INSERT INTO rubizh_pim_history(batch_id,entity_type,entity_id,operation,before_json,after_json,proof_reference,created_at) VALUES(?,'model',?,'HIDE',NULL,NULL,'hide_ids',UTC_TIMESTAMP())");
    foreach($ids as $id){$q->execute([$id]);$h->execute([$batch,$id]);$hidden[]=$id;}
    return $hidden;
}

/** Handle one POST /pim/sync chunk. Returns the ACK array; throws PimV3Rejected for refusals. */
function pimV3HandleSync(PDO $db,string $raw): array {
    if(!pimV3Enabled($db))throw new PimV3Rejected('CONTRACT_V3_NOT_ENABLED',[],409);
    [$chunk,$object]=pimV3ParseChunk($raw);
    $batch=$chunk['batch_id'];$index=$chunk['chunk_index'];$count=$chunk['chunk_count'];$hash=hash('sha256',$raw);
    $existing=$db->prepare('SELECT * FROM rubizh_pim_batches WHERE batch_id=?');$existing->execute([$batch]);$row=$existing->fetch(PDO::FETCH_ASSOC);
    if($row&&$row['status']==='COMMITTED'){
        $c=$db->prepare('SELECT content_hash FROM rubizh_pim_batch_chunks WHERE batch_id=? AND chunk_no=?');$c->execute([$batch,$index]);
        if($c->fetchColumn()!==$hash)throw new PimV3Rejected('BATCH_HASH_CONFLICT',[],409);
        $summary=json_decode((string)$row['summary_json'],true)?:[];
        return $index===$count-1?$summary+['replayed'=>true]:['ok'=>true,'batch_id'=>$batch,'chunk_index'=>$index,'status'=>'STAGED','replayed'=>true];
    }
    if($row&&$row['status']==='REJECTED')throw new PimV3Rejected('BATCH_REJECTED',[],409);
    $categoryHash=$index===0?hash('sha256',json_encode($chunk['categories'],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)):str_repeat('0',64);
    if(!$row)$db->prepare("INSERT INTO rubizh_pim_batches(batch_id,content_hash,contract_version,pricing_policy_version,category_hash,status,revision,created_at,updated_at) VALUES(?,?,3,1,?,'RECEIVED',?,UTC_TIMESTAMP(),UTC_TIMESTAMP())")->execute([$batch,$hash,$categoryHash,$chunk['catalog_revision']]);
    elseif($row['revision']!==$chunk['catalog_revision'])throw new PimV3Rejected('BATCH_REVISION_CONFLICT',[],409);
    $c=$db->prepare('SELECT content_hash FROM rubizh_pim_batch_chunks WHERE batch_id=? AND chunk_no=?');$c->execute([$batch,$index]);$saved=$c->fetchColumn();
    if($saved!==false&&$saved!==$hash)throw new PimV3Rejected('BATCH_HASH_CONFLICT',[],409);
    if($saved===false)$db->prepare('INSERT INTO rubizh_pim_batch_chunks(batch_id,chunk_no,content_hash,private_payload,created_at) VALUES(?,?,?,?,UTC_TIMESTAMP())')->execute([$batch,$index,$hash,$raw]);
    if($index<$count-1)return ['ok'=>true,'batch_id'=>$batch,'chunk_index'=>$index,'status'=>'STAGED'];
    // Final chunk: assemble, validate everything, then one atomic catalog write. A proxy timeout must not cut the
    // transaction short: PHP keeps running and the PIM re-send of the same batch gets the stored ACK.
    ignore_user_abort(true);if(function_exists('set_time_limit'))@set_time_limit(300);
    $q=$db->prepare('SELECT chunk_no,private_payload FROM rubizh_pim_batch_chunks WHERE batch_id=? ORDER BY chunk_no');$q->execute([$batch]);$chunks=$q->fetchAll(PDO::FETCH_KEY_PAIR);
    if(count($chunks)!==$count||array_keys($chunks)!==range(0,$count-1))throw new PimV3Rejected('MISSING_CHUNKS',[],409);
    $products=[];$objects=[];$categories=null;
    $freshness=null;
    foreach($chunks as $no=>$payload){[$a,$o]=pimV3ParseChunk($payload);if($a['batch_id']!==$batch||$a['chunk_count']!==$count||$a['catalog_revision']!==$chunk['catalog_revision'])throw new PimV3Rejected('BATCH_MIXED',[],409);array_push($products,...$a['products']);array_push($objects,...$o->products);if($no===0){$categories=$a['categories'];$freshness=$a['freshness_policy']??null;}}
    $hide=$chunk['hide_ids'];
    $fail=function(string $code,array $results,int $status=422)use($db,$batch){$db->prepare("UPDATE rubizh_pim_batches SET status='REJECTED',error_code=?,summary_json=?,updated_at=UTC_TIMESTAMP() WHERE batch_id=?")->execute([mb_substr($code,0,64),json_encode(['results'=>$results],JSON_UNESCAPED_UNICODE),$batch]);throw new PimV3Rejected($code,$results,$status);};
    $catErrors=pimV3CategoryErrors($categories);
    if($catErrors)$fail('CATEGORY_CATALOG',array_map(fn($p)=>['id'=>(string)($p['id']??''),'status'=>'error','errors'=>['CATEGORY_CATALOG']],$products));
    $ids=array_map(fn($m)=>strtolower((string)($m['id']??'')),$products);
    if(count($ids)!==count(array_unique($ids)))$fail('DUPLICATE_MODEL',[]);
    if(array_intersect(array_map('strtolower',$hide),$ids))$fail('HIDE_AND_PUBLISH_CONFLICT',[]);
    [$errors,$results]=pimV3ValidateBatch($db,$products,$objects,$categories);
    if($errors)$fail('INVALID_MODELS',array_map(fn($r)=>$r+['status'=>$r['status']==='valid'?'error':'error'],$results));
    // Idempotent CREATE IF NOT EXISTS must run before the transaction (DDL commits implicitly).
    shopTaxonomySchema($db);
    if((int)$db->query("SELECT GET_LOCK('rubizh-category-migration',10)")->fetchColumn()!==1)throw new PimV3Rejected('CATALOG_BUSY',[],503);
    // A re-send that waited for a still-running commit of the same batch returns that stored ACK instead of rewriting.
    $again=$db->prepare('SELECT status,summary_json FROM rubizh_pim_batches WHERE batch_id=?');$again->execute([$batch]);$now=$again->fetch(PDO::FETCH_ASSOC);
    if(($now['status']??'')==='COMMITTED'){$db->query("SELECT RELEASE_LOCK('rubizh-category-migration')");return (json_decode((string)$now['summary_json'],true)?:[])+['replayed'=>true];}
    $out=[];$hidden=[];$policyChanged=false;$catalogRevision=$chunk['catalog_revision'];
    try{
        $db->beginTransaction();
        shopPricingCatalogVersion($db,true);
        pimV3SyncCategories($db,$categories,$catalogRevision);
        foreach($products as $m)$out[]=['id'=>$m['id'],'status'=>pimV3WriteModel($db,$m,$batch,$catalogRevision),'contract_version'=>3,'pricing_policy_version'=>1,'canonical_category_id'=>$m['canonical_category_id']];
        $hidden=pimV3Hide($db,$hide,$batch);
        $policyChanged=$freshness!==null&&$freshness!==shopFreshnessPolicy($db);
        if($freshness!==null)shopFreshnessPolicyStore($db,$freshness);
        // Stage 5.1 (review L2): the models just written get their data-age state in the same transaction.
        // A failure here never aborts the catalog write: the forced sweep after the commit applies the rule anyway.
        foreach(array_chunk(array_column($out,'id'),500) as $ids)try{shopFreshnessSweep($db,true,$ids);}catch(PDOException $e){error_log('rubizh freshness sweep (sync): '.$e->getCode());}
        $changed=count(array_filter($out,fn($r)=>$r['status']!=='unchanged'))+count($hidden);
        $db->exec("INSERT INTO meta(k,v) VALUES('catalog_updated','".now().'-pim3-'.substr(hash('sha256',$batch),0,8)."') ON DUPLICATE KEY UPDATE v=VALUES(v)");
        if($changed)$db->prepare("INSERT INTO meta(k,v) VALUES('pricing_catalog_version',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([bin2hex(random_bytes(16))]);
        $db->prepare("INSERT INTO sync_log(at,mode,received,saved,unchanged,hidden,errors,note) VALUES(?,?,?,?,?,?,0,?)")->execute([now(),'v3',count($out),count(array_filter($out,fn($r)=>$r['status']!=='unchanged')),count(array_filter($out,fn($r)=>$r['status']==='unchanged')),count($hidden),'PIM contract 3 '.$batch]);
        $ack=['ok'=>true,'batch_id'=>$batch,'chunk_index'=>$index,'status'=>'COMMITTED','contract_version'=>3,'pricing_policy_version'=>1,'catalog_revision'=>$catalogRevision,'results'=>$out,'hidden_ids'=>$hidden];
        $db->prepare("UPDATE rubizh_pim_batches SET status='COMMITTED',summary_json=?,updated_at=UTC_TIMESTAMP() WHERE batch_id=?")->execute([json_encode($ack,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$batch]);
        $db->commit();
    }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
    finally{$db->query("SELECT RELEASE_LOCK('rubizh-category-migration')");}
    // Stage 5.1: rewritten SKUs carry PIM's own flags; apply the data age before anyone reads them.
    try{if(shopFreshnessSweep($db,true,null,$policyChanged))$changed=true;}catch(Throwable $e){error_log('rubizh freshness sweep: '.get_class($e));}
    if(function_exists('recount_categories'))try{recount_categories($db);}catch(Throwable){}
    // Public snapshots may otherwise stay stale for minutes; explicit hides must not linger in listings.
    if($changed&&function_exists('shopCacheClear'))try{shopCacheClear();}catch(Throwable){}
    return $ack;
}
// 5.7 (owner D-88): public flags from the private routing — the supplier name never leaves SITE. separate_parcel: the supplier
// ships its own parcel (config separate_parcel_suppliers); cross_sell: offered under every order (cross_sell_supplier_skus:
// supplier name → supplier articles). Stored in products.data so every reader (catalog, product, cart) sees the same flags.
function pimV3SyncSupplierFlags(PDO $db,string $id,array $fulfillment,array $articles): void {
    $low=static fn($s)=>mb_strtolower(trim((string)$s));
    $separate=array_map($low,array_filter((array)(cfg('separate_parcel_suppliers')??[]),'is_string'));
    $cross=[];foreach((array)(cfg('cross_sell_supplier_skus')??[]) as $supplier=>$skus)if(is_string($supplier)&&is_array($skus))foreach($skus as $sku)if(is_string($sku))$cross[$low($supplier).'|'.$low($sku)]=true;
    $flags=['separate_parcel'=>(bool)array_filter($fulfillment,fn($s)=>in_array($low($s),$separate,true)),
        'cross_sell'=>(bool)array_filter($articles,fn($a)=>isset($cross[$low($a['supplier_name']??'').'|'.$low($a['supplier_sku']??'')]))];
    $q=$db->prepare('SELECT data FROM products WHERE id=?');$q->execute([$id]);$data=json_decode((string)$q->fetchColumn(),true);if(!is_array($data))return;
    if(($data['separate_parcel']??false)===$flags['separate_parcel']&&($data['cross_sell']??false)===$flags['cross_sell'])return;
    $db->prepare('UPDATE products SET data=? WHERE id=?')->execute([json_encode(array_merge($data,$flags),JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$id]);
}
