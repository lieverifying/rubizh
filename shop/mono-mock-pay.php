<?php
declare(strict_types=1);
// Stage 5.5.3: the test bank page of the closed staging mode (mono_mock + mono_mock_page behind the staging gate). The mock bank has no real
// payment page and nobody holds the key that signs bank callbacks, so a test order could never be paid on staging. Here
// «Оплатити (тест)» / «Відмовитись» apply the same event the bank callback would (monoApplyEvent). 404 everywhere else.
define('RUBIZH_AUTH_NO_SESSION',true);
require __DIR__.'/../auth/bootstrap.php';
if(!monoMockPage()){http_response_code(404);exit;}
$invoice=(string)($_POST['invoice']??$_GET['invoice']??'');
if(preg_match('/^mock[0-9a-f]{20}$/D',$invoice)!==1){http_response_code(404);exit;}
$db=shopStoreDatabase();
$q=$db->prepare('SELECT order_id,amount,status FROM rubizh_mono_invoices WHERE invoice_id=?');$q->execute([$invoice]);$inv=$q->fetch(PDO::FETCH_ASSOC);
if(!$inv){http_response_code(404);exit;}
if(($_SERVER['REQUEST_METHOD']??'GET')==='POST'){
 // Same-origin form only (the page is behind the staging password anyway): the browser's Sec-Fetch-Site, else the Origin.
 $origin=(string)($_SERVER['HTTP_ORIGIN']??'');$host=strtolower((string)($_SERVER['HTTP_HOST']??''));$o=parse_url($origin);
 $same=($_SERVER['HTTP_SEC_FETCH_SITE']??'')==='same-origin'||is_array($o)&&strtolower(($o['host']??'').(isset($o['port'])?':'.$o['port']:''))===$host;
 if(!$same||isset($_SERVER['HTTP_SEC_FETCH_SITE'])&&$_SERVER['HTTP_SEC_FETCH_SITE']!=='same-origin'){http_response_code(403);header('Content-Type: text/plain; charset=utf-8');echo "Відкрийте тестову оплату зі сторінки замовлення на сайті.\n";exit;}
 shopLimit($db,'mono-mock-pay',30,60);
 $status=($_POST['result']??'')==='success'?'success':'failure';
 $event=['invoiceId'=>$invoice,'status'=>$status,'amount'=>(int)$inv['amount'],'ccy'=>980,'modifiedDate'=>gmdate('Y-m-d\TH:i:s\Z')];
 try{monoApplyEvent($db,$event,hash('sha256',json_encode($event)),true);}catch(Throwable $e){error_log('rubizh mono mock pay rejected');http_response_code(409);header('Content-Type: text/plain; charset=utf-8');echo "Оплату не застосовано. Оновіть сторінку замовлення.\n";exit;}
 header('Location: /shop/payment-return.php?order='.(int)$inv['order_id'],true,303);exit;
}
// The site's no-referrer policy makes the form's Origin «null»; this page sends its origin to itself only.
header('Content-Type: text/html; charset=utf-8');header('Cache-Control: no-store');header('Referrer-Policy: same-origin');
header("Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
?><!doctype html><html lang="uk"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Тестова оплата</title>
<body style="font:16px/1.5 system-ui,sans-serif;max-width:440px;margin:40px auto;padding:0 16px">
<h1>Тестова оплата monobank</h1>
<p>Закритий тестовий режим: гроші не списуються, банк не викликається.</p>
<p>Сума: <b><?=number_format(((int)$inv['amount'])/100,2,',',' ')?> грн</b> · статус рахунку: <?=htmlspecialchars((string)$inv['status'],ENT_QUOTES)?></p>
<form method="post" style="display:flex;gap:12px;flex-wrap:wrap"><input type="hidden" name="invoice" value="<?=htmlspecialchars($invoice,ENT_QUOTES)?>">
<button name="result" value="success" style="font-size:18px;padding:10px 18px">Оплатити (тест)</button>
<button name="result" value="failure" style="font-size:18px;padding:10px 18px">Відмовитись</button></form>
</body></html>
