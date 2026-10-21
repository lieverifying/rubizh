<?php
declare(strict_types=1);
require __DIR__.'/shop/catalog-lib.php';
// Stage 5.5 (D-80): no sitemap in the closed staging mode (a local stand keeps it).
if(rubizhStagingGateConfigured()||rubizhSiteNoindex()){http_response_code(404);header('Cache-Control: no-store');exit;}
// Buffered: a failure in the middle answers 503, never a truncated XML with 200 (review of stage 5).
ob_start();
try{$db=db();header('Content-Type: application/xml; charset=utf-8');header('Cache-Control: public,max-age=3600');echo '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">';
    foreach(['','catalog','categories','porady','kit/','offer','privacy'] as $path)echo '<url><loc>https://rubizh.shop/'.$path.'</loc></url>';
    foreach(json_decode(file_get_contents(__DIR__.'/shop/guides.json'),true) as $g)echo '<url><loc>'.htmlspecialchars('https://rubizh.shop/porady/'.$g['slug'],ENT_XML1,'UTF-8').'</loc></url>';
    // Stage 5 (D-62): the indexable group pages.
    foreach(shopCategoryGroups() as $g)echo '<url><loc>https://rubizh.shop/rozdil/'.htmlspecialchars($g['slug'],ENT_XML1,'UTF-8').'</loc></url>';
    foreach(shopCategories($db) as $c)echo '<url><loc>'.htmlspecialchars('https://rubizh.shop/catalog/'.$c['url_path'],ENT_XML1,'UTF-8').'</loc></url>';
    // Етап 5.4.1 (власник): також товари «за заявкою» (ціна за м², QUOTE), поки модель показана (правило давності її приховує як будь-яку).
    // Лише опубліковані товари, які можна купити зараз або під замовлення. Карта будується на кожен запит, тож оновлюється одразу після публікації з PIM.
    // SEO-5.4: each product carries its photos (image sitemap, up to 10 per page, absolute https URLs only).
    $rows=$db->query("SELECT p.id,p.slug,p.updated_at FROM products p WHERE p.visible=1 AND ".shopUsablePhotoSql('p')." AND (p.availability IN ('in','order') AND EXISTS(SELECT 1 FROM variants av WHERE av.product_id=p.id AND ".shopBuyableSql('av').")".(!empty($GLOBALS['rubizh_pim_v3_columns'])?" OR EXISTS(SELECT 1 FROM variants qv WHERE qv.product_id=p.id AND qv.pim_active=1 AND qv.price>0 AND JSON_VALID(qv.data) AND JSON_UNQUOTE(JSON_EXTRACT(qv.data,'$.sale_mode'))='QUOTE')":'').")")->fetchAll(PDO::FETCH_ASSOC);
    foreach(array_chunk($rows,500) as $chunk){$photos=product_photos($db,array_column($chunk,'id'));
        foreach($chunk as $p){$images='';foreach(array_slice($photos[$p['id']]??[],0,10) as $ph){$u=(string)$ph['url'];if(str_starts_with($u,'/'))$u='https://rubizh.shop'.$u;if(str_starts_with($u,'https://'))$images.='<image:image><image:loc>'.htmlspecialchars($u,ENT_XML1,'UTF-8').'</image:loc></image:image>';}
            echo '<url><loc>'.htmlspecialchars('https://rubizh.shop/product/'.$p['slug'],ENT_XML1,'UTF-8').'</loc><lastmod>'.substr($p['updated_at'],0,10).'</lastmod>'.$images.'</url>';}}
    echo '</urlset>';
    ob_end_flush();
}catch(Throwable $e){ob_end_clean();error_log('rubizh sitemap: '.get_class($e));header_remove('Cache-Control');header('Content-Type: text/plain; charset=utf-8');header('Retry-After: 300');http_response_code(503);echo 'Карта сайту тимчасово недоступна.';}
