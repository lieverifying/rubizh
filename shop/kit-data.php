<?php
declare(strict_types=1);
require_once __DIR__.'/catalog-lib.php';require_once __DIR__.'/pricing.php';
function shopKitPalette(string $c): ?string {$c=shopColor($c);return in_array($c,['Піксель','Мультикам','Койот','Олива','Чорний'],true)?$c:null;}
function shopKitRole(array $p): string {
 $n=mb_strtolower($p['name']);
 if(preg_match('/^(підсум|чохол|футляр|сумк)/u',$n))return preg_match('/підсум.*магазин/u',$n)?'magazine':'';
 if(preg_match('/шапк|балаклав|кепк|баф|шолом|каск|термоковдр|балістичн.*пакет|ремінь.*плитоноск/u',$n))return '';
 if(preg_match('/рукавич|рукавиц/u',$n))return 'gloves';
 if(preg_match('/аптеч|ifak/u',$n))return preg_match('/порожн|без наповнення|підсум|сумк|чохол/u',$n)?'':'ifak';
 if(preg_match('/плитоноск|бронежилет/u',$n))return 'protection';
 if(preg_match('/бронеплит/u',$n))return 'plate';
 if(preg_match('/термобілиз|термобель/u',$n))return 'thermal';
 if(preg_match('/убакс|ubacs|бойова сороч/u',$n))return preg_match('/комплект|костюм/u',$n)?'':'ubacs';
 if(preg_match('/штани|брюки/u',$n))return 'pants';
 if(preg_match('/рюкзак/u',$n))return preg_match('/дрон|бпла|гвинтів|рушниц|чохол/u',$n)?'':'backpack';
 if(preg_match('/фліс|флис|флісов/u',$n)&&preg_match('/фліс|флис|кофт|куртк|худі|джемпер/u',$n))return 'fleece';
 if(preg_match('/курт|пончо/u',$n))return 'outer';return '';
}
function shopKitWithPlates(array $p): bool {$n=$p['name'].' '.($p['attributes']['Комплектація']??'');return !preg_match('/без\s+(броне)?плит|плити.{0,30}не\s+вход|лише\s+плитоноск/iu',$n)&&preg_match('/(?:з|із|зі|с)\s+(броне)?плит|плити\s+(в комплекті|входять)/iu',$n);}
function shopKitResolve(array $kit,array $byId,?PDO $db=null): ?array {
 if(count($kit['items']??[])<2||count($kit['items']??[])>8||mb_strlen($kit['name']??'')>24||mb_strlen($kit['note']??'')>80)return null;
 $items=[];$used=[];$pre=0;$sets=[];$roles=[];$priceLines=[];
 foreach($kit['items'] as $raw){$it=is_string($raw)?['product_id'=>$raw,'color'=>'']:$raw;$id=$it['product_id']??'';$p=$byId[$id]??null;
 if(!$p||isset($used[$id])||shopSaleUnit($p)==='m2'||!$p['photos']||!trim($p['description'])||preg_match('/патрон|глушник|боєприпас|реб|репліка|страйкбол/iu',$p['name']))return null;$used[$id]=true;
 $role=shopKitRole($p);if($role===''||isset($it['role'])&&$it['role']!==$role)return null;$roles[]=$role;
 if($role==='protection'&&!shopKitWithPlates($p))return null;
 $vs=array_values(array_filter($p['variants'],fn($v)=>shopVariantCanBuy($v)));if(!$vs)return null;usort($vs,fn($a,$b)=>($a['availability']==='order')<=>($b['availability']==='order'));
 $wanted=(string)($it['color']??'');$exact=array_values(array_filter($vs,fn($v)=>$wanted===''||$v['color']===$wanted||shopKitPalette($wanted)!==null&&shopKitPalette($v['color'])===shopKitPalette($wanted)));
 if(isset($it['sku']))$exact=array_values(array_filter($exact,fn($v)=>$v['sku']===$it['sku']));
 if(!$exact)return null;
 $v=$exact[0];if($v['availability']==='order'&&++$pre>1)return null;
 $selected=array_filter($vs,fn($x)=>$x['color']===$v['color']);if(in_array($role,['ubacs','pants','thermal','fleece','outer','gloves'],true)&&shopSaleUnit($p)==='piece'&&!preg_match('/пончо|універсаль/iu',$p['name'])){$sizes=array_unique(array_map(fn($x)=>(string)$x['size_display'],$selected));$letters=count(array_intersect($sizes,['M','L','XL']));$numbers=count(array_intersect($sizes,['48','50','52','54']));if($letters<3&&$numbers<3)return null;}
 $colors=[];$palette=[];foreach($vs as $x){if(($colors[$x['color']]??'')!=='in')$colors[$x['color']]=$x['availability'];if($c=shopKitPalette($x['color']))$palette[$c]=true;}
 $ps=array_keys($palette);if(count($ps)>1)$sets[]=$ps;
 if($db===null)return null;
 $priced=$v;$priced['qty']=$it['qty']??1;$priced['kit_group']=$kit['id'];$priced['price_mode']='kit';$priced['_pricing']=shopPricingRead($db,$v['sku'],$id);
 try{shopPricingUnit($priced);}catch(ShopPricingException $e){return null;}$priceLines[]=$priced;
 $items[]=['product_id'=>$id,'qty'=>$priced['qty'],'color'=>$v['color'],'role'=>$role,'color_card_id'=>$id.'--'.slugify($v['color']),'color_fallback'=>$wanted!==''&&!$exact,'requested_color'=>$wanted,'colors'=>array_map(fn($c,$a)=>['color'=>$c,'availability'=>$a],array_keys($colors),array_values($colors))];
 }
 $required=['b1'=>['ubacs','pants','magazine','backpack'],'b2'=>['protection','ubacs','ifak'],'b3'=>['thermal','fleece','gloves','outer']][$kit['id']]??[];if(array_diff($required,$roles))return null;
 $total=shopPriceLines($priceLines)['subtotal'];$range=['b1'=>[8000,12000],'b2'=>[12000,25000],'b3'=>[7000,12000]][$kit['id']]??null;if($range&&($total<$range[0]||$total>$range[1]))return null;
 $palettes=$sets?array_shift($sets):[];foreach($sets as $set)$palettes=array_values(array_intersect($palettes,$set));return ['id'=>$kit['id'],'name'=>$kit['name'],'note'=>$kit['note']??'','items'=>$items,'palettes'=>$palettes];
}
// Дані главної/конструктора: кеш за версією каталогу + набором комплектів; у відповідь — лише поля для плиток і комплектів.
function shopStorefront(PDO $db): array {
 $kits=(string)$db->query("SELECT v FROM meta WHERE k='site_kits'")->fetchColumn();
 return shopCached('storefront-compact-v1',fn()=>shopStorefrontBuild($db),$kits,['operation'=>'storefront']);
}
function shopStorefrontBuild(PDO $db): array {
 $stored=$db->query("SELECT v FROM meta WHERE k='site_kits'")->fetchColumn();$kits=json_decode((string)$stored,true);if(!is_array($kits))$kits=[];$ids=[];
 foreach(['head','body','legs','boots','armor','gear','med','small'] as $slot){
  $size=in_array($slot,['body','legs','boots'],true)?" AND TRIM(TRIM(LEADING ':' FROM TRIM(av.size))) NOT IN ('','Один розмір','OS','Універсальний')":'';
  // Only initial recommendations travel with the page. The selector fetches the
  // complete slot catalogue separately, with its own pagination and filters.
  $q=$db->prepare("SELECT p.id FROM products p WHERE p.visible=1 AND ".shopUsablePhotoSql('p')." AND EXISTS(SELECT 1 FROM variants av WHERE av.product_id=p.id AND ".shopBuyableSql('av').") AND ".shopKitPrimarySql($slot)." AND ".shopKitSlotSql()."=? ORDER BY FIELD(p.availability,'in','order','out'), CASE WHEN LOWER(p.name) REGEXP 'убакс|ubacs|куртк|плитоноск|шолом|рюкзак|турнікет|аптечка' THEN 0 ELSE 1 END,p.price_min,p.id LIMIT 12");$q->execute([$slot]);array_push($ids,...$q->fetchAll(PDO::FETCH_COLUMN));
 }
 // 5.7 (D-88): the cross-sell sets travel with the page — «Додати до замовлення» is offered under every order.
 $q=$db->query("SELECT p.id FROM products p WHERE p.visible=1 AND ".shopUsablePhotoSql('p')." AND (CASE WHEN JSON_VALID(p.data) THEN JSON_UNQUOTE(JSON_EXTRACT(p.data,'$.cross_sell')) END)='true' AND EXISTS(SELECT 1 FROM variants av WHERE av.product_id=p.id AND ".shopBuyableSql('av').") ORDER BY p.price_min,p.id LIMIT 8");array_push($ids,...$q->fetchAll(PDO::FETCH_COLUMN));
 foreach($kits as $b)foreach($b['items']??[] as $it)$ids[]=is_string($it)?$it:($it['product_id']??'');$products=[];foreach(array_chunk(array_values(array_unique($ids)),200) as $batch)array_push($products,...shopProductsByIds($db,$batch));$byId=array_column($products,null,'id');
 $resolved=[];$used=[];foreach($kits as $b){$r=shopKitResolve($b,$byId,$db);if(!$r||array_intersect($used,array_column($r['items'],'product_id')))continue;$resolved[]=$r;array_push($used,...array_column($r['items'],'product_id'));}
 $keepAttrs=['Сезон','Сезонність','Сезонность','Комплектація','Комплектация','Одиниця продажу','Одиниця виміру'];
 foreach($products as &$p){$p['description']='';$p['docs_note']='';$p['attributes']=array_intersect_key((array)$p['attributes'],array_flip($keepAttrs));$p['photos']=array_map(fn($ph)=>['url'=>$ph['thumb']??$ph['url'],'thumb'=>$ph['thumb']??$ph['url'],'width'=>$ph['width']??0,'height'=>$ph['height']??0],array_slice($p['photos'],0,1));foreach($p['variants'] as &$v){unset($v['availability_date']);}unset($v);}unset($p);
 return ['ok'=>true,'kits'=>$resolved,'products'=>$products];
}
