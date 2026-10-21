<?php
declare(strict_types=1);
// CLI-only renderer of the production account view using fictitious display data.
// This does not authenticate a browser or open a database connection.
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
define('RUBIZH_AUTH',true);
$tab=$argv[1]??'orders';if(!in_array($tab,['orders','favorites','delivery','profile'],true))$tab='orders';
$mode=$argv[2]??'';$fixturePhone=$mode==='unverified'?'':'+380000000000';
function esc(string $value):string{return htmlspecialchars($value,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');}
function customerId():string{return 'preview-customer';}
function customerVerifiedPhone(string $id):string{global $fixturePhone;return $fixturePhone;}
function customerIdentities(string $id):array{return [];}
function shopStoreDatabase():object{return new stdClass;}
function shopFavoriteIds(object $db,string $id):array{return [];}
function shopProductsByIds(object $db,array $ids):array{return [];}
function customerDate(string $date):string{return '06.10.2026';}
function customerMoney(mixed $sum,string $currency='UAH'):string{return number_format((float)$sum,0,'.',' ').' ₴';}
function shopCustomerStatus(array $order):array{return ['tone'=>'success','label'=>'Готуємо до відправлення'];}
function shopOrderReceipt(object $db,int $id):array{return [];}
require __DIR__.'/../shop/customer-states.php';
$_SESSION=['csrf'=>'design-preview-only','login_method'=>'phone'];
$profile=['email'=>'preview@example.invalid','first_name'=>'','last_name'=>'','phone'=>'+380000000000','city'=>'','delivery_address'=>'','delivery_type'=>'branch'];
$accountReady=true;$orderStats=['total'=>0,'active'=>0];$orderExplicit=false;$orderView='active';$orders=[];$order=null;$ordersPage=1;$ordersPages=1;$accountPhotos=[];
$preferences=['theme'=>'system','donation_channel'=>'viber','donation_phone'=>''];$smsReady=true;$googleReady=false;
if($mode==='populated'){$orders=[['id'=>1,'order_number'=>'DEMO-001','created_at'=>'2026-10-06 12:00:00','total'=>3200,'currency'=>'UAH','status'=>'preparing','payment_status'=>'paid','items_json'=>json_encode([['product_id'=>'fixture','name'=>'Демо · Спорядження','qty'=>1]])]];$orderStats=['total'=>1,'active'=>1];}
?>
<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/assets/theme.js?v=4"></script><link rel="stylesheet" href="/assets/theme.css?v=2"><link rel="stylesheet" href="/auth/account.css?v=6"><link rel="stylesheet" href="/assets/theme.css?v=2"><link rel="stylesheet" href="/auth/account-refresh.2026100606.css"><link rel="stylesheet" href="/auth/account-addendum.2026101102.css"><link rel="stylesheet" href="/assets/mobile-polish.2026100702.css"><link rel="stylesheet" href="/assets/form-fields.2026102101.css"><title>Перегляд дизайну кабінету — РУБІЖ</title></head><body class="cabinet-page"><div style="text-align:center;padding:6px;background:#f2a33c;color:#241c10;font-size:10px;font-weight:600">ПЕРЕГЛЯД ДИЗАЙНУ · ДЕМО-ДАНІ · ЗБЕРЕЖЕННЯ ВИМКНЕНО</div>
<?php require __DIR__.'/../auth/header.php';?><main class="account-main"><?php require __DIR__.'/../auth/account-view.php';?></main></body></html>
