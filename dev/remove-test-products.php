<?php
declare(strict_types=1);
// Stage 5.5.3: takes the two 1 UAH test products of the owner preview / closed staging off the site before the opening
// (docs/release/GO_LIVE_RC2.md). The same row change as a PIM sync with hide_ids (hidden, not deleted; the PIM history
// table belongs to sync batches, so no row there), then the same catalogue refresh as after a sync. CLI only.
// Usage: php dev/remove-test-products.php   → prints how many were visible and hides them; exit 0.
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
define('RUBIZH_AUTH_NO_SESSION',true);
require __DIR__.'/../auth/bootstrap.php';
$ids=['rubizh-test-pay-now','rubizh-test-preorder'];
$db=shopStoreDatabase();
$q=$db->prepare('SELECT id FROM products WHERE visible=1 AND id IN (?,?)');$q->execute($ids);$visible=$q->fetchAll(PDO::FETCH_COLUMN);
$db->beginTransaction();try{$h=$db->prepare("UPDATE products SET visible=0,pim_publication_state='HIDDEN',pim_publication_reason='PIM_EXPLICIT_HIDE',updated_at=UTC_TIMESTAMP() WHERE id=?");foreach($ids as $id)$h->execute([$id]);$db->prepare("INSERT INTO meta(k,v) VALUES('pricing_catalog_version',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([bin2hex(random_bytes(16))]);$db->commit();}catch(Throwable $e){$db->rollBack();fwrite(STDERR,"Не вдалося приховати тестові товари: ".$e->getMessage()."\n");exit(1);}
if(function_exists('recount_categories'))try{recount_categories($db);}catch(Throwable){}
require_once __DIR__.'/../api/perf.php';try{shopCacheClear();}catch(Throwable){}
echo 'Тестові товари на сайті до запуску: '.count($visible).'. Тепер приховано: '.count($ids).".\n";
