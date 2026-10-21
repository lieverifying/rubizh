<?php
declare(strict_types=1);
// Public read model for PIM contract 3 MODELs. Whitelist only: no supplier data, floors, quantities or provenance.

/** Whether the additive v3 columns exist on this connection (set once per request). */
function pimV3DetectColumns(PDO $db): void {
    try{$GLOBALS['rubizh_pim_v3_columns']=(string)$db->query("SELECT v FROM meta WHERE k='pim_v3_schema'")->fetchColumn()==='2';}catch(PDOException $e){$GLOBALS['rubizh_pim_v3_columns']=false;}
}
function pimV3IsModel(array $row): bool {return (int)($row['pim_contract_version']??0)===3;}
/** One usable-photo predicate for catalog, product, search, related, kits, sitemap and feeds. */
function shopUsablePhotoSql(string $alias='p'): string {
    if(!preg_match('/^[a-z]+$/D',$alias))throw new InvalidArgumentException('alias');
    return "EXISTS(SELECT 1 FROM photos uph WHERE uph.product_id=$alias.id AND (uph.status='ok' OR uph.status='pending' AND (uph.src_url LIKE 'https://%' OR uph.src_url LIKE '/%')))";
}
/** True when every visible product is a PIM v3 MODEL: legacy text/JSON predicates are then not generated at all. */
function pimV3OnlyCatalog(PDO $db): bool {
    static $memo=[];$key=spl_object_id($db);
    if(isset($memo[$key]))return $memo[$key];
    if(empty($GLOBALS['rubizh_pim_v3_columns']))return $memo[$key]=false;
    return $memo[$key]=(int)$db->query('SELECT COUNT(*) FROM products WHERE visible=1 AND pim_contract_version IS NULL')->fetchColumn()===0
        &&(int)$db->query('SELECT COUNT(*) FROM products WHERE visible=1 AND pim_contract_version=3')->fetchColumn()>0;
}
function pimV3VariantPublic(array $v,?array $policy): array {
    $data=json_decode((string)($v['data']??''),true)?:[];
    // Stage 5.4: a QUOTE SKU is never offered through the cart, whatever its stored columns say (fail closed).
    $quote=($data['sale_mode']??null)==='QUOTE';
    $availability=(string)$v['pim_effective_availability'];
    $size=trim((string)($v['pim_size_display']??''))?:trim((string)($v['pim_size_normalized']??''));
    $pricing=$policy!==null?shopPricingPublic($policy):['price'=>null,'site_price'=>null,'kit_price'=>null,'kit_discount_pct'=>0,'wholesale'=>[]];
    return ['sku'=>$v['sku'],'variant_id'=>$v['sku'],'color_id'=>$v['pim_color_id'],'color'=>(string)$v['color'],
        'size_status'=>$v['pim_size_status'],'size_display'=>$v['pim_size_status']==='NO_SIZE_REQUIRED'?'':$size,'size_native'=>$size,'size_system'=>$v['pim_size_system'],'size_type'=>'other',
        'availability_v3'=>$availability,'availability'=>$quote?'out':((int)$v['pim_payment_allowed']===1?'in':((int)$v['pim_order_submission_allowed']===1?'order':'out')),
        'order_submission_allowed'=>(int)$v['pim_order_submission_allowed']===1&&!$quote,'payment_allowed'=>(int)$v['pim_payment_allowed']===1&&!$quote,'requires_order_confirmation'=>(int)$v['pim_requires_order_confirmation']===1,
        'delivery_lead_time_days'=>$v['pim_delivery_lead_time_days']===null?null:(int)$v['pim_delivery_lead_time_days'],'ready_to_dispatch'=>(int)$v['pim_ready_to_dispatch']===1,
        'lead_time'=>$v['pim_delivery_lead_time_days']===null?'':'Орієнтовно '.(int)$v['pim_delivery_lead_time_days'].' дн.',
        'stock_freshness'=>($v['stock_freshness']??'FRESH')==='HIDDEN'?null:($v['stock_freshness']??'FRESH'),'availability_note'=>($v['stock_freshness']??'')==='CONFIRM'&&(int)$v['pim_order_submission_allowed']===1?SHOP_FRESHNESS_CONFIRM_NOTE:null,
        'size_unconfirmed'=>false,'stock'=>null,'pricing_policy_version'=>$policy!==null?1:null,
        'price'=>$pricing['price']??null,'kit_price'=>$pricing['kit_price']??null,'kit_discount_pct'=>$pricing['kit_discount_pct']??0,'wholesale'=>$pricing['wholesale']??[],
        'sale_mode'=>($data['sale_mode']??null)==='QUOTE'?'QUOTE':null,'price_unit'=>($data['price_unit']??null)==='m2'?'m2':null];
}
/** Photos of one MODEL with color ownership; same local-file/source fallback as legacy product_photos(). */
function pimV3Photos(PDO $db,string $id): array {
    $q=$db->prepare("SELECT ph.id,ph.pos,ph.src_url,ph.file,ph.thumb,ph.width,ph.height,ph.status FROM photos ph WHERE ph.product_id=? AND (ph.status='ok' OR ph.status='pending' AND (ph.src_url LIKE 'https://%' OR ph.src_url LIKE '/%')) ORDER BY ph.pos");$q->execute([$id]);
    $byId=[];foreach($q->fetchAll(PDO::FETCH_ASSOC) as $r){$ok=$r['status']==='ok'&&media_file_exists((string)$r['file']);
        // Supplier source is shown only over https while the local copy is pending.
        if(!$ok&&!str_starts_with((string)$r['src_url'],'https://')&&!str_starts_with((string)$r['src_url'],'/'))continue;
        $byId[(int)$r['id']]=['url'=>$ok?media_url($r['file']):$r['src_url'],'thumb'=>$ok?media_url(media_file_exists((string)$r['thumb'])?$r['thumb']:$r['file']):$r['src_url'],'width'=>(int)$r['width'],'height'=>(int)$r['height'],'local'=>$ok];}
    $c=$db->prepare('SELECT color_id,photo_id FROM rubizh_color_photos WHERE product_id=? ORDER BY sort');$c->execute([$id]);
    $colors=[];foreach($c->fetchAll(PDO::FETCH_ASSOC) as $r)if(isset($byId[(int)$r['photo_id']]))$colors[$r['color_id']][]=$byId[(int)$r['photo_id']];
    return [array_values($byId),$colors];
}
function pimV3ProductDto(PDO $db,array $row): array {
    $data=json_decode((string)$row['data'],true)?:[];$id=$row['id'];
    [$gallery,$colorPhotos]=pimV3Photos($db,$id);
    $q=$db->prepare('SELECT v.*,cp.policy_json FROM variants v LEFT JOIN rubizh_catalog_pricing cp ON cp.sku=v.sku AND cp.product_id=v.product_id WHERE v.product_id=? AND v.pim_active=1 ORDER BY v.sort');$q->execute([$id]);
    // Stage 5.1: the supplier data age, exactly now (same function as checkout).
    $variants=array_map(fn($v)=>pimV3VariantPublic(shopFreshnessApplyRow($db,$v),$v['policy_json']===null?null:json_decode($v['policy_json'],true,32,JSON_THROW_ON_ERROR)),$q->fetchAll(PDO::FETCH_ASSOC));
    $c=$db->prepare('SELECT color_id,color,camouflage FROM rubizh_product_colors WHERE product_id=? AND active=1 ORDER BY sort');$c->execute([$id]);
    $colors=[];foreach($c->fetchAll(PDO::FETCH_ASSOC) as $r){$skus=array_values(array_column(array_filter($variants,fn($v)=>$v['color_id']===$r['color_id']),'sku'));if(!$skus)continue;
        $colors[]=['id'=>$r['color_id'],'color'=>$r['color'],'camouflage'=>$r['camouflage'],'label'=>trim(implode(' / ',array_filter([$r['color'],$r['camouflage']])))?:'Колір','photos'=>$colorPhotos[$r['color_id']]??[],'skus'=>$skus];}
    $o=$db->prepare('SELECT option_id,scope,color_id,size,size_system FROM rubizh_size_options WHERE product_id=? AND active=1 ORDER BY option_id');$o->execute([$id]);
    $options=array_map(fn($r)=>['option_id'=>$r['option_id'],'scope'=>$r['scope'],'color_id'=>$r['color_id'],'size'=>$r['size'],'size_system'=>$r['size_system'],'availability_v3'=>'SIZE_CONFIRMATION_REQUIRED','order_submission_allowed'=>true,'payment_allowed'=>false,'requires_order_confirmation'=>true],$o->fetchAll(PDO::FETCH_ASSOC));
    $taxonomy=shopTaxonomyProduct($db,$row);
    // Any QUOTE SKU: checkout refuses size requests of such a model, so none are offered (consistent with PIM).
    $quote=$variants!==[]&&!array_filter($variants,fn($v)=>$v['sale_mode']!=='QUOTE');if(array_filter($variants,fn($v)=>$v['sale_mode']==='QUOTE'))$options=[];
    $payable=array_filter($variants,fn($v)=>$v['order_submission_allowed']&&$v['price']!==null);
    $prices=array_column($payable?:array_filter($variants,fn($v)=>$v['price']!==null),'price');
    return ['contract_version'=>3,'id'=>$id,'model_id'=>$row['pim_model_id']??$id,'slug'=>$row['slug'],'name'=>$row['name'],'brand'=>shopBrand((string)$row['brand']),
        // 5.7 (D-88): set at sync from the private supplier routing (pimV3SyncSupplierFlags); no supplier data leaves SITE.
        'cross_sell'=>!empty($data['cross_sell']),'separate_parcel'=>!empty($data['separate_parcel']),
        'canonical_category_id'=>$taxonomy['canonical_category_id']??($data['canonical_category_id']??null),'category'=>$taxonomy['category']??$row['category_path'],'category_url'=>$taxonomy['category_url']??null,
        'kit_slot'=>$row['pim_kit_slot']??null,'sale_unit'=>'pcs','description'=>shopDescription((string)($data['description']??$row['description'])),'attributes'=>is_array($data['attributes']??null)?$data['attributes']:[],
        'price_min'=>$prices?min($prices):null,'availability'=>$row['availability'],
        'order_submission_allowed'=>(bool)array_filter($variants,fn($v)=>$v['order_submission_allowed'])||$options!==[],'payment_allowed'=>(bool)array_filter($variants,fn($v)=>$v['payment_allowed']),
        'sale_mode'=>$quote?'QUOTE':null,'price_unit'=>$quote&&!array_filter($variants,fn($v)=>$v['price_unit']!=='m2')?'m2':null,'has_docs'=>false,'docs_note'=>'','photos'=>$gallery,'colors'=>$colors,'size_options'=>$options,'variants'=>$variants];
}
