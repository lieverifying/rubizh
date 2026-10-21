<?php
declare(strict_types=1);
require __DIR__.'/../auth/bootstrap.php';
try{
 $db=shopStoreDatabase();$code=(string)($_GET['code']??$_POST['code']??'');$row=shopCartReminderRow($db,$code);
 if(!$row)throw new RuntimeException('Посилання на кошик закінчилося. Оберіть товари в каталозі.');
 if(isset($_GET['unsubscribe'])||($_POST['action']??'')==='cancel'){
  if(($_SERVER['REQUEST_METHOD']??'')==='POST'){shopCsrf($_POST);shopCartReminderCancel($db,$row['scope_hash']);$message='Нагадування про цей кошик вимкнено.';}
  else{$message='Вимкнути нагадування про цей кошик?';$form=true;}
 }elseif(($_SERVER['REQUEST_METHOD']??'GET')==='GET'){
  // The code grants access only to a cart snapshot; it never logs in or exposes an order/profile.
  $_SESSION['cart_recovery']=$code;if(empty($_SESSION['checkout_scope']))$_SESSION['checkout_scope']=bin2hex(random_bytes(32));header('Location: /#cart',true,303);exit;
 }else throw new RuntimeException('Недозволений запит.');
}catch(Throwable $e){http_response_code(400);$message=$e instanceof PDOException?'Кошик тимчасово недоступний.':$e->getMessage();$form=false;}
?><!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Кошик — РУБІЖ</title><link rel="stylesheet" href="/auth/account.css"><script src="/assets/theme.js?v=4"></script><link rel="stylesheet" href="/assets/theme.css?v=5"></head><body><main class="auth-main"><section class="account-card"><h1><?=esc($message)?></h1><?php if(!empty($form)):?><form method="post"><input type="hidden" name="code" value="<?=esc($code)?>"><input type="hidden" name="csrf" value="<?=esc($_SESSION['csrf'])?>"><input type="hidden" name="action" value="cancel"><button class="button">Вимкнути нагадування</button></form><?php endif;?><a class="button inline-button secondary" href="/catalog">До каталогу →</a></section></main></body></html>
