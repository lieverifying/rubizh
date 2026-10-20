<?php
declare(strict_types=1);
// Stage 5.6-3 (D-84): before the live 1 UAH payment. The data time of the two 1 UAH test products is the build of the
// launch database; after the first PIM publication (PIM policy 72 h) «ТЕСТ — оплата одразу» would only go through the
// manager. This sets the data time of the two test products ONLY (no price, no other product) to now and recomputes
// their payment permission. Refuses once the test products are taken off the site (dev/remove-test-products.php).
// Usage: php dev/refresh-test-products.php   → «оновлено: 2», exit 0.
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
define('RUBIZH_AUTH_NO_SESSION',true);
require __DIR__.'/../auth/bootstrap.php';
$ids=['rubizh-test-pay-now','rubizh-test-preorder'];
$db=shopStoreDatabase();
$q=$db->prepare('SELECT COUNT(*) FROM products WHERE visible=1 AND id IN (?,?)');$q->execute($ids);
if((int)$q->fetchColumn()!==2){fwrite(STDOUT,"Тестові товари приховано або їх немає — оновлення не потрібне.\n");exit(1);}
$u=$db->prepare('UPDATE variants SET pim_stock_observed_at=? WHERE product_id IN (?,?) AND pim_active=1');$u->execute([(int)floor(microtime(true)*1000),...$ids]);
shopFreshnessSweep($db,true,$ids);
$db->prepare("INSERT INTO meta(k,v) VALUES('pricing_catalog_version',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([bin2hex(random_bytes(16))]);
require_once __DIR__.'/../api/perf.php';try{shopCacheClear();}catch(Throwable){}
$p=$db->prepare("SELECT MAX(pim_payment_allowed) FROM variants WHERE product_id='rubizh-test-pay-now'");$p->execute();
echo 'Тестові товари: оновлено: '.$u->rowCount().'. «ТЕСТ — оплата одразу»: '.((int)$p->fetchColumn()===1?'оплата карткою доступна':'оплата недоступна — напишіть виконавцю').".\n";
