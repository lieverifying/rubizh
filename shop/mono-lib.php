<?php
declare(strict_types=1);
require_once __DIR__.'/staging-gate.php';
function monoMockEnabled(): bool {return cfg('mono_mock')===true&&rubizhStagingRelaxed();}
function monoConfigured(): bool {return monoMockEnabled()||cfg('mono_activation_confirmed')===true&&trim((string)(getenv('RUBIZH_MONO_TOKEN')?:cfg('mono_token')))!=='';}
function monoMigrate(PDO $db): void {if(function_exists('rubizhSchemaPrepared')&&rubizhSchemaPrepared($db))return;static $ready=false;if($ready)return;
 $db->exec("CREATE TABLE IF NOT EXISTS rubizh_mono_invoices(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,order_id BIGINT UNSIGNED NOT NULL,invoice_id VARCHAR(100) NULL UNIQUE,reference VARCHAR(100) NOT NULL UNIQUE,amount BIGINT UNSIGNED NOT NULL,status VARCHAR(24) NOT NULL DEFAULT 'creating',page_url VARCHAR(500) NOT NULL DEFAULT '',modified_at VARCHAR(40) NOT NULL DEFAULT '',refund_ref VARCHAR(100) NOT NULL DEFAULT '',refund_status VARCHAR(24) NOT NULL DEFAULT '',created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,INDEX(order_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
 $db->exec("CREATE TABLE IF NOT EXISTS rubizh_mono_events(event_hash CHAR(64) PRIMARY KEY,invoice_id VARCHAR(100) NOT NULL,status VARCHAR(24) NOT NULL,created_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");$ready=true;
}
function monoApi(string $path,?array $body=null): array {
 if(defined('RUBIZH_MONO_TESTS')&&is_callable($GLOBALS['mono_test_transport']??null))return ($GLOBALS['mono_test_transport'])($path,$body);
 // Staging only: deterministic mock bank, no network; production config never sets both flags.
 if(monoMockEnabled()){require_once __DIR__.'/mono-mock.php';return monoMockApi($path,$body);}
 if(!monoConfigured())throw new RuntimeException('Карткову оплату ще не підключено.');
 $h=curl_init('https://api.monobank.ua/api/merchant/'.$path);try{curl_setopt_array($h,[CURLOPT_HTTPHEADER=>['X-Token: '.(string)(getenv('RUBIZH_MONO_TOKEN')?:cfg('mono_token')),'X-Cms: Rubizh','X-Cms-Version: 1.3','Content-Type: application/json'],CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_TIMEOUT=>20,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2]);if($body!==null)curl_setopt_array($h,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>json_encode($body,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);$raw=curl_exec($h);$status=(int)curl_getinfo($h,CURLINFO_HTTP_CODE);}finally{curl_close($h);}if(!is_string($raw)||$status!==200)throw new RuntimeException('monobank не підтвердив результат. Перевірте рахунок перед повтором.');$r=json_decode($raw,true,64,JSON_THROW_ON_ERROR);if(!is_array($r))throw new RuntimeException('Неповна відповідь monobank.');return $r;
}
// Public origin the bank calls back. Only an isolated staging copy may point it elsewhere (e.g. a sandbox endpoint);
// production always uses the real domain, whatever the config says.
function monoPublicBase(): string {$b=(string)(cfg('public_base_url')??'');return cfg('environment')==='staging'&&preg_match('~^https://[a-z0-9.-]+(?::\d{2,5})?$~D',$b)?$b:'https://rubizh.shop';}
function monoMinor(mixed $amount): int {if(!is_numeric($amount)||(float)$amount<=0||(float)$amount>10000000)throw new RuntimeException('Неприпустима сума оплати.');return (int)round((float)$amount*100);}
// Stage 5.5.3: the closed staging mode has no real bank — its mock invoice opens the site's own test page (mono-mock-pay.php),
// switched on explicitly (mono_mock_page) in the closed staging package and on the owner stand; never with a real bank.
function monoMockPage(): bool {return monoMockEnabled()&&cfg('mono_mock_page')===true;}
function monoClientUrl(string $url): string {return monoMockPage()&&preg_match('~^https://pay\.mbnk\.biz/(mock[0-9a-f]{20})$~D',$url,$m)===1?'/shop/mono-mock-pay.php?invoice='.$m[1]:$url;}
function monoPageUrl(string $url): bool {$p=parse_url($url);return ($p['scheme']??'')==='https'&&in_array(strtolower($p['host']??''),['pay.mbnk.biz','pay.monobank.ua'],true)&&!isset($p['user'])&&!isset($p['pass']);}
function monoCreate(PDO $db,int $orderId,?string $actor=null): array {
 if($actor!==null)shopRequirePermission($actor,'payment.invoice.create');
 elseif(!shopMayReadOrder($db,$orderId))throw new ShopPermissionException('Замовлення недоступне.');
 return npLocked($db,$orderId,function()use($db,$orderId,$actor){monoInvalidateFailed($db,$orderId);$db->beginTransaction();try{$order=npOrder($db,$orderId);if(in_array($order['payment_status'],['paid','refunded'],true)||in_array($order['status'],['cancelled','returned'],true))throw new RuntimeException('Це замовлення вже оплачене або закрите.');
 if(!shopPaymentReady($order))throw new RuntimeException('Дочекайтеся підтвердження наявності менеджером.');
 $due=$db->prepare('SELECT payment_due FROM rubizh_order_timing WHERE order_id=?');$due->execute([$orderId]);$paymentDue=$due->fetchColumn();if(is_string($paymentDue)&&$paymentDue<=gmdate('Y-m-d H:i:s'))throw new ShopOrderConflict('PAYMENT_NOT_ALLOWED',['blocker'=>'ORDER_EXPIRED'],'Строк оплати замовлення минув. Зверніться до менеджера.');
 if(function_exists('pimV3RevalidateForPayment'))pimV3RevalidateForPayment($db,$order);
 if(($order['contact']['payment']??'')!=='card')throw new RuntimeException('Для замовлення обрано інший спосіб оплати.');
 $q=$db->prepare('SELECT * FROM rubizh_mono_invoices WHERE order_id=? ORDER BY id DESC LIMIT 1');$q->execute([$orderId]);$last=$q->fetch(PDO::FETCH_ASSOC);
 if($last&&in_array($last['status'],['creating','unknown','created','processing','hold','awaiting_webhook'],true)){if($last['page_url']!==''&&monoPageUrl($last['page_url'])){$db->commit();return ['url'=>monoClientUrl((string)$last['page_url']),'invoice_id'=>$last['invoice_id']];}throw new RuntimeException('Результат створення рахунку потребує звірки з monobank. Новий рахунок поки не створюємо.');}
 $reference=$order['order_number'].'-'.bin2hex(random_bytes(6));$amount=monoMinor($order['total']);$db->prepare("INSERT INTO rubizh_mono_invoices(order_id,reference,amount,status,created_at,updated_at) VALUES(?,?,?,'creating',UTC_TIMESTAMP(),UTC_TIMESTAMP())")->execute([$orderId,$reference,$amount]);$id=(int)$db->lastInsertId();
 shopOrderAudit($db,$orderId,$actor??str_repeat('0',32),'payment.invoice.create',[],['reference'=>$reference,'amount'=>$amount],'Рахунок за перевіреним замовленням',$actor===null?'CUSTOMER':'USER');
 $basket=[];$lines=json_decode($order['items_json'],true)?:[];$allocated=npLines($db,$orderId);
 foreach($lines as $i=>$l){$total=monoMinor($allocated[$i]['line_amount']??($l['price']*$l['qty']));$basket[]=['name'=>mb_substr($l['name'],0,128),'qty'=>(float)$l['qty'],'sum'=>(int)round($total/(float)$l['qty']),'total'=>$total,'unit'=>($l['sale_unit']??'')==='m2'?'м²':'шт.','code'=>$l['sku']];}
 $db->commit();}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
 try{$r=monoApi('invoice/create',['amount'=>$amount,'ccy'=>980,'merchantPaymInfo'=>['reference'=>$reference,'destination'=>'Замовлення '.$order['order_number'].' · РУБІЖ','basketOrder'=>$basket],'redirectUrl'=>monoPublicBase().'/shop/payment-return.php?invoice='.$id,'webHookUrl'=>monoPublicBase().'/shop/mono-webhook.php','validity'=>3600,'paymentType'=>'debit']);if(!is_string($r['invoiceId']??null)||!monoPageUrl((string)($r['pageUrl']??'')))throw new RuntimeException('Некоректний результат monobank.');$db->beginTransaction();$db->prepare("UPDATE rubizh_mono_invoices SET invoice_id=?,page_url=?,status='created',updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$r['invoiceId'],$r['pageUrl'],$id]);if(!empty($GLOBALS['rubizh_pim_v3_columns']))$db->prepare("UPDATE rubizh_customer_orders SET pim_payment_state='PAYMENT_PENDING' WHERE id=? AND pim_contract_version=3 AND pim_payment_state='UNPAID'")->execute([$orderId]);$db->commit();return ['url'=>monoClientUrl((string)$r['pageUrl']),'invoice_id'=>$r['invoiceId']];}
 catch(Throwable $e){if($db->inTransaction())$db->rollBack();$db->prepare("UPDATE rubizh_mono_invoices SET status='unknown',updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$id]);throw $e;}});
}
function monoVerifySignature(string $raw,string $signature,string $base64key): bool {
 $key=base64_decode($base64key,true);$sig=base64_decode($signature,true);if($key===false||$sig===false||strlen($sig)>256)return false;return @openssl_verify($raw,$sig,$key,OPENSSL_ALGO_SHA256)===1;
}
// Stage 5.6-3: the key is bound to the token it was fetched with (a tag, never the token). A key fetched by the sandbox
// token is not used after the production token is set: the next call refetches at once. An untagged key (stored before
// this binding, or preloaded on a stand) is used as before and refreshed only when a signature fails.
function monoPublicKeyTag(): string {return substr(hash('sha256','rubizh-mono-pubkey|'.(string)(getenv('RUBIZH_MONO_TOKEN')?:cfg('mono_token'))),0,16);}
function monoPublicKeyOtherToken(PDO $db): bool {$tag=$db->query("SELECT v FROM meta WHERE k='mono_public_key_token'")->fetchColumn();return is_string($tag)&&$tag!==''&&!hash_equals($tag,monoPublicKeyTag());}
function monoPublicKey(PDO $db,bool $fresh=false): string {
 $key=$db->query("SELECT v FROM meta WHERE k='mono_public_key'")->fetchColumn();
 if(monoPublicKeyOtherToken($db)){$key=false;$fresh=true;}
 if(!$fresh&&is_string($key)&&$key!=='')return $key;
 // Invalid signatures cannot trigger unbounded outbound key refreshes.
 $claim=$db->query("SELECT GET_LOCK('rubizh-mono-pubkey',0)")->fetchColumn();
 if((int)$claim!==1){if(is_string($key)&&$key!=='')return $key;throw new RubizhHttpException(503,'Спробуйте пізніше.',5);}
 try{
  $other=monoPublicKeyOtherToken($db);$key=$other?false:$db->query("SELECT v FROM meta WHERE k='mono_public_key'")->fetchColumn();
  $last=(int)$db->query("SELECT v FROM meta WHERE k='mono_public_key_checked'")->fetchColumn();
  // A new token skips the 60 s wait once; a failing fetch for it is still limited (10 s) — no request flood to the bank.
  if($other){$tag=monoPublicKeyTag();[$atTag,$at]=array_pad(explode('|',(string)$db->query("SELECT v FROM meta WHERE k='mono_public_key_attempt'")->fetchColumn(),2),2,'0');
   if(hash_equals($tag,$atTag)&&(int)$at>time()-10)throw new RubizhHttpException(503,'Спробуйте пізніше.',10);
   $db->prepare("INSERT INTO meta(k,v) VALUES('mono_public_key_attempt',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([$tag.'|'.time()]);}
  if(!$other&&$last>time()-60){if(is_string($key)&&$key!=='')return $key;throw new RubizhHttpException(503,'Спробуйте пізніше.',60);}
  $db->prepare("INSERT INTO meta(k,v) VALUES('mono_public_key_checked',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([(string)time()]);
  $r=monoApi('pubkey');$key=(string)($r['key']??'');
  if(!openssl_pkey_get_public((string)base64_decode($key,true)))throw new RuntimeException('Неприпустимий відкритий ключ monobank.');
  $db->prepare("INSERT INTO meta(k,v) VALUES('mono_public_key',?),('mono_public_key_token',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([$key,monoPublicKeyTag()]);return $key;
 }finally{$db->query("SELECT RELEASE_LOCK('rubizh-mono-pubkey')");}
}
// A bank event that can never apply to its invoice (retrying cannot fix it), unlike a transient failure.
final class MonoEventRejected extends RuntimeException {}
/** A parked signed webhook triggers one authenticated status read of the same invoice; the bank's answer (or the read
 * failure) goes to the order audit for the manager. Diagnostic only: money states move by signed webhook / monoRefresh. */
function monoParkedReconcile(PDO $db,array $invoice): void {
 // Never replaces the parked answer (200) with an error, and a replayed parked event within a minute adds no bank call.
 try{$q=$db->prepare("SELECT 1 FROM rubizh_np_audit WHERE order_id=? AND action='mono_parked_reconcile' AND created_at>UTC_TIMESTAMP()-INTERVAL 60 SECOND LIMIT 1");$q->execute([(int)$invoice['order_id']]);if($q->fetchColumn())return;
  try{$r=monoApi('invoice/status?invoiceId='.rawurlencode((string)$invoice['invoice_id']));
   $note=($r['invoiceId']??$invoice['invoice_id'])!==$invoice['invoice_id']?'bank answered for another invoice':'bank status='.substr(preg_replace('/[^a-z_]/','',(string)($r['status']??'')),0,24).' amount='.substr(json_encode($r['amount']??null),0,24).' ccy='.substr(json_encode($r['ccy']??null),0,8);}
  catch(Throwable $read){$note='status read failed: '.get_class($read);}
  npAudit($db,str_repeat('0',32),'mono_parked_reconcile',(int)$invoice['order_id'],0,$note.' local='.substr((string)$invoice['status'],0,24));
 }catch(Throwable $e){error_log('rubizh mono parked reconcile: '.get_class($e));}
}
function monoValidateEvent(array $event,array $invoice): void {
 if(!is_string($event['invoiceId']??null)||$event['invoiceId']!==$invoice['invoice_id']||!is_int($event['amount']??null)||$event['amount']!==(int)$invoice['amount']||($event['ccy']??null)!==980)throw new MonoEventRejected('Рахунок, валюта або сума не збігаються.');
 if(!in_array($event['status']??'', ['created','processing','hold','success','failure','reversed','expired'],true))throw new MonoEventRejected('Невідомий статус оплати.');
 if(!is_string($event['modifiedDate']??null)||strtotime($event['modifiedDate'])===false)throw new MonoEventRejected('Немає часу зміни статусу.');
 // Validate the complete list before the refund ledger sees any entry. Duplicate facts can otherwise
 // compare against one old row snapshot and turn a just-successful refund back into a failure.
 if(array_key_exists('cancelList',$event)){
  $list=$event['cancelList'];if(!is_array($list)||!array_is_list($list)||count($list)>100)throw new MonoEventRejected('Некоректний список повернень.');
  $seen=[];foreach($list as $c){$ref=is_array($c)?($c['extRef']??null):null;
   if(!is_string($ref)||$ref===''||strlen($ref)>100||preg_match('/[\x00-\x1f\x7f]/',$ref)||isset($seen[$ref])||!is_int($c['amount']??null)||$c['amount']<=0||($c['ccy']??980)!==980||!in_array($c['status']??'',['success','processing','failure'],true))throw new MonoEventRejected('Некоректні або повторні факти повернення.');
   $seen[$ref]=true;
  }
 }
}
function monoApplyEvent(PDO $db,array $event,string $hash,bool $signedWebhook=false,bool $bankConfirmed=false): void {
 $q=$db->prepare('SELECT * FROM rubizh_mono_invoices WHERE invoice_id=?');$q->execute([(string)($event['invoiceId']??'')]);$invoice=$q->fetch(PDO::FETCH_ASSOC);if(!$invoice)throw new RuntimeException('Рахунок ще не записаний. Повторіть callback.');
 // A signed callback that fails validation is parked in the order audit for a manager; money states stay untouched.
 try{monoValidateEvent($event,$invoice);}catch(MonoEventRejected $e){if($signedWebhook){npAudit($db,str_repeat('0',32),'mono_event_rejected',(int)$invoice['order_id'],0,$e->getMessage().' status='.substr((string)($event['status']??''),0,24).' amount='.substr(json_encode($event['amount']??null),0,24));monoParkedReconcile($db,$invoice);}throw $e;}
 // Only a signed webhook may move money states; bank status reads stay diagnostic, except the
 // lost-webhook confirmation in monoRefresh (authenticated server read after the grace period).
 // updated_at keeps the first observation so the grace period is not restarted by every poll.
 npLocked($db,(int)$invoice['order_id'],function()use($db,$event,$hash,$invoice,$signedWebhook,$bankConfirmed){$db->beginTransaction();try{
 $q=$db->prepare('SELECT * FROM rubizh_mono_invoices WHERE id=? FOR UPDATE');$q->execute([$invoice['id']]);$current=$q->fetch(PDO::FETCH_ASSOC);
 if(!$signedWebhook&&!$bankConfirmed&&in_array($event['status'],['success','reversed'],true)){
  // Failure closes an attempt, not the payable invoice: a newer success observation must still
  // enter webhook grace. Expiry closes the invoice; older observations never supersede its evidence.
  if($current['status']==='expired'||$current['modified_at']!==''&&strtotime($event['modifiedDate'])<strtotime($current['modified_at'])){
   npAudit($db,str_repeat('0',32),'mono_observation_rejected',(int)$invoice['order_id'],0,'bank observation='.$event['status'].' local='.$current['status']);
  }else{
   if($event['status']==='success'&&!in_array($current['status'],['success','reversed'],true))$db->prepare("UPDATE rubizh_mono_invoices SET updated_at=IF(status='awaiting_webhook',updated_at,UTC_TIMESTAMP()),status='awaiting_webhook' WHERE id=?")->execute([$invoice['id']]);
   npAudit($db,str_repeat('0',32),'mono_observed_'.$event['status'],(int)$invoice['order_id']);
  }
  $db->commit();return;
 }
 $q=$db->prepare('INSERT IGNORE INTO rubizh_mono_events(event_hash,invoice_id,status,created_at) VALUES(?,?,?,UTC_TIMESTAMP())');$q->execute([$hash,$event['invoiceId'],$event['status']]);if(!$q->rowCount()){$db->commit();return;}
 if(in_array($current['status'],['success','reversed'],true)&&!in_array($event['status'],['success','reversed'],true)){$db->commit();return;}
 if($current['status']==='reversed'&&$event['status']==='success'){$db->commit();return;}
 // The bank already reported success for this invoice; a stale non-final read cannot roll it back.
 if($current['status']==='awaiting_webhook'&&in_array($event['status'],['created','processing','hold'],true)){$db->commit();return;}
 if($current['modified_at']!==''&&strtotime($event['modifiedDate'])<strtotime($current['modified_at'])){$db->commit();return;}
 // The no-ledger compatibility path represents only full refunds. Explicit cancellation facts
 // must prove the whole amount, and a pending local operation must match its own reference.
 // Partial/uncertain facts stay parked with a money-out hold instead of inventing a full refund.
 if($event['status']==='reversed'&&array_key_exists('cancelList',$event)&&(!crmSchemaReady($db)||!crmRefundRows($db,(int)$invoice['order_id']))){
  $total=0;$complete=true;foreach($event['cancelList'] as $c){
   if($c['status']!=='success'||$current['refund_ref']!==''&&$c['extRef']!==$current['refund_ref']||$c['amount']>(int)$current['amount']-$total){$complete=false;break;}
   $total+=$c['amount'];
  }
  if(!$complete||$total!==(int)$current['amount']){
   $db->prepare("UPDATE rubizh_mono_invoices SET refund_status='unknown' WHERE id=? AND refund_status<>'success'")->execute([$current['id']]);
   npAudit($db,str_repeat('0',32),'mono_event_rejected',(int)$invoice['order_id'],0,'incomplete or uncorrelated no-ledger reversal; full refund not established');
   $db->commit();throw new MonoEventRejected('Факти повернення потребують звірки. Повне повернення не підтверджено.');
  }
 }
 $db->prepare('UPDATE rubizh_mono_invoices SET status=?,modified_at=?,updated_at=UTC_TIMESTAMP() WHERE id=?')->execute([$event['status'],$event['modifiedDate'],$invoice['id']]);
 if($event['status']==='success'){shopReservationTransition($db,(int)$invoice['order_id'],'COMMITTED','MONOPAY_WEBHOOK');$u=$db->prepare("UPDATE rubizh_customer_orders SET payment_status='paid',updated_at=UTC_TIMESTAMP() WHERE id=? AND payment_status NOT IN ('paid','refunded')");$u->execute([$invoice['order_id']]);if($u->rowCount())shopQueueEvent($db,(int)$invoice['order_id'],'paid');if(!empty($GLOBALS['rubizh_pim_v3_columns']))$db->prepare("UPDATE rubizh_customer_orders SET pim_payment_state='PAID',pim_fulfillment_state=IF(pim_fulfillment_state='NOT_READY' AND pim_order_state='CONFIRMED','READY_TO_SHIP',pim_fulfillment_state) WHERE id=? AND pim_contract_version=3")->execute([$invoice['order_id']]);}
 elseif(in_array($event['status'],['failure','expired'],true)){$db->prepare("UPDATE rubizh_customer_orders SET payment_status='failed',updated_at=UTC_TIMESTAMP() WHERE id=? AND payment_status='pending'")->execute([$invoice['order_id']]);if(!empty($GLOBALS['rubizh_pim_v3_columns']))$db->prepare("UPDATE rubizh_customer_orders SET pim_payment_state='UNPAID' WHERE id=? AND pim_contract_version=3 AND payment_status='failed'")->execute([$invoice['order_id']]);}
 elseif($event['status']==='reversed'&&crmRefundWebhook($db,$event,$invoice)){shopReservationTransition($db,(int)$invoice['order_id'],'COMMITTED','MONOPAY_WEBHOOK');}
 elseif($event['status']==='reversed'){shopReservationTransition($db,(int)$invoice['order_id'],'COMMITTED','MONOPAY_WEBHOOK');$db->prepare("UPDATE rubizh_customer_orders SET payment_status='refunded',updated_at=UTC_TIMESTAMP() WHERE id=? AND payment_status<>'refunded'")->execute([$invoice['order_id']]);shopReservationTransition($db,(int)$invoice['order_id'],'RELEASED','MONOPAY_WEBHOOK');if(!empty($GLOBALS['rubizh_pim_v3_columns']))$db->prepare("UPDATE rubizh_customer_orders SET pim_payment_state='REFUNDED' WHERE id=? AND pim_contract_version=3")->execute([$invoice['order_id']]);$db->prepare("UPDATE rubizh_mono_invoices SET refund_status='success' WHERE id=?")->execute([$invoice['id']]);}
 if($event['status']==='success'&&crmSchemaReady($db))crmRefundState($db,(int)$invoice['order_id']);
 if($bankConfirmed)npAudit($db,str_repeat('0',32),'mono_status_confirmed',(int)$invoice['order_id'],0,'signed webhook not received; bank status read confirmed '.$event['status']);
 npAudit($db,str_repeat('0',32),'mono_'.$event['status'],(int)$invoice['order_id']);$db->commit();}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}});
}
// Before a retry creates a new invoice, the previous failed one is invalidated at the bank (invoice/remove
// works only while nothing was paid). If the bank refuses, no second payable invoice is created.
// expired invoices are already invalid at the bank.
function monoInvalidateFailed(PDO $db,int $orderId): void {
 $q=$db->prepare('SELECT * FROM rubizh_mono_invoices WHERE order_id=? ORDER BY id DESC LIMIT 1');$q->execute([$orderId]);$last=$q->fetch(PDO::FETCH_ASSOC);
 if(!$last||$last['status']!=='failure'||!$last['invoice_id'])return;
 $done=$db->prepare("SELECT COUNT(*) FROM rubizh_np_audit WHERE order_id=? AND action IN ('mono_invoice_removed','mono_invoice_final_not_removed') AND note=?");$done->execute([$orderId,$last['invoice_id']]);if((int)$done->fetchColumn()>0)return;
 try{monoApi('invoice/remove',['invoiceId'=>$last['invoice_id']]);}catch(Throwable $e){error_log('rubizh mono remove: '.get_class($e));
  // The bank did not close it: only its own final, non-payable status lets a new invoice through (no double payment).
  $state='';try{$r=monoApi('invoice/status?invoiceId='.rawurlencode($last['invoice_id']));if(($r['invoiceId']??null)===$last['invoice_id'])$state=(string)($r['status']??'');}catch(Throwable $read){error_log('rubizh mono status: '.get_class($read));}
  if($state==='expired'){npAudit($db,str_repeat('0',32),'mono_invoice_final_not_removed',$orderId,0,$last['invoice_id']);return;}
  $seen=$db->prepare("SELECT COUNT(*) FROM rubizh_np_audit WHERE order_id=? AND action='mono_invoice_remove_refused' AND note=?");$seen->execute([$orderId,$last['invoice_id']]);
  if((int)$seen->fetchColumn()===0)npAudit($db,str_repeat('0',32),'mono_invoice_remove_refused',$orderId,0,$last['invoice_id']);
  throw new RuntimeException('Попередній рахунок банк ще не закрив. Новий рахунок не створюємо, щоб не було подвійної оплати: менеджер перевірить його й зв’яжеться з вами.');}
 npAudit($db,str_repeat('0',32),'mono_invoice_removed',$orderId,0,$last['invoice_id']);
}
/**
 * S4-03: a staff cancellation of an unpaid order closes its open card invoice at the bank first (invoice/remove works
 * only while nothing is paid). A bank refusal is resolved from the bank's own status: expired → closed; paid or still
 * processing → the cancellation is refused, so a payment can never land on a cancelled order unnoticed.
 */
function monoCloseOpenInvoice(PDO $db,int $orderId,string $actor): void {
 $q=$db->prepare("SELECT * FROM rubizh_mono_invoices WHERE order_id=? AND status IN ('creating','unknown','created','processing','hold','awaiting_webhook') ORDER BY id");$q->execute([$orderId]);
 foreach($q->fetchAll(PDO::FETCH_ASSOC) as $i){
  if(!$i['invoice_id']||in_array($i['status'],['creating','unknown','processing','hold','awaiting_webhook'],true))throw new RuntimeException('Банк ще обробляє оплату або рахунок потребує звірки. Спочатку звірте платіж, потім скасовуйте.');
  try{monoApi('invoice/remove',['invoiceId'=>$i['invoice_id']]);$final='failure';$action='mono_invoice_removed';}
  catch(Throwable $e){error_log('rubizh mono remove: '.get_class($e));$state='';
   try{$r=monoApi('invoice/status?invoiceId='.rawurlencode($i['invoice_id']));if(($r['invoiceId']??null)===$i['invoice_id'])$state=(string)($r['status']??'');}catch(Throwable $read){error_log('rubizh mono status: '.get_class($read));}
   if($state!=='expired')throw new RuntimeException('Банк не закрив рахунок (можливо, оплата вже йде). Скасування не виконано — перевірте платіж.');
   $final='expired';$action='mono_invoice_final_not_removed';}
  $db->prepare("UPDATE rubizh_mono_invoices SET status=?,updated_at=UTC_TIMESTAMP() WHERE id=? AND status='created'")->execute([$final,$i['id']]);
  npAudit($db,$actor,$action,$orderId,0,$i['invoice_id']);
 }
}
// Grace period for the signed webhook before a lost callback is resolved from the bank status read.
const MONO_WEBHOOK_GRACE_SECONDS=900;
// The merchant API used here exposes status by invoiceId, not a supported reference search.
// Do not invent a provider endpoint or treat local abandonment as proof of bank payment.
function monoFailMissingInvoice(PDO $db,array $invoice,string $action,string $actor='',string $reason=''): void {
 npLocked($db,(int)$invoice['order_id'],function()use($db,$invoice,$action,$actor,$reason){$db->beginTransaction();try{
  $q=$db->prepare('SELECT * FROM rubizh_mono_invoices WHERE id=? FOR UPDATE');$q->execute([$invoice['id']]);$i=$q->fetch(PDO::FETCH_ASSOC);
  if(!$i||$i['invoice_id']||!in_array($i['status'],['creating','unknown'],true)){$db->commit();return;}
  if($actor===''&&strtotime((string)$i['created_at'].' UTC')>time()-MONO_WEBHOOK_GRACE_SECONDS){$db->commit();return;}
  $db->prepare("UPDATE rubizh_mono_invoices SET status='failure',updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$i['id']]);
  $db->prepare("UPDATE rubizh_customer_orders SET payment_status='failed',updated_at=UTC_TIMESTAMP() WHERE id=? AND payment_status='pending'")->execute([$i['order_id']]);
  if(!empty($GLOBALS['rubizh_pim_v3_columns']))$db->prepare("UPDATE rubizh_customer_orders SET pim_payment_state='UNPAID' WHERE id=? AND pim_contract_version=3 AND payment_status='failed'")->execute([$i['order_id']]);
  npAudit($db,$actor?:str_repeat('0',32),$action,(int)$i['order_id'],0,'reference='.$i['reference'].'; no invoice id; reference lookup unsupported; attempt failed, bank payment not confirmed');
  shopOrderAudit($db,(int)$i['order_id'],$actor?:str_repeat('0',32),'payment.manual_reconcile',['status'=>$i['status'],'reference'=>$i['reference']],['status'=>'failure','invoice_id'=>null],$reason?:'Пошук рахунку за reference API не підтримується; невизначену спробу завершено',$actor===''?'SYSTEM':'USER');
  $db->commit();
 }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}});
}
function monoReconcileNotCreated(PDO $db,int $orderId,string $actor,string $reason,?string $expectedUpdatedAt=null): void {
 shopRequirePermission($actor,'payment.manual_reconcile');$reason=shopFinancialReason($reason);$crmChecked=monoCrmVersionChecked($db,$orderId,$actor);
 npLocked($db,$orderId,function()use($db,$orderId,$actor,$reason,$expectedUpdatedAt,$crmChecked){
  monoCheckOrderVersion(npOrder($db,$orderId),$expectedUpdatedAt,$crmChecked);
  $q=$db->prepare("SELECT * FROM rubizh_mono_invoices WHERE order_id=? AND status IN ('creating','unknown') ORDER BY id DESC LIMIT 1");$q->execute([$orderId]);$i=$q->fetch(PDO::FETCH_ASSOC);
  if(!$i||$i['invoice_id'])throw new RuntimeException('Рахунок з ID потрібно звірити через банк.');
  monoFailMissingInvoice($db,$i,'mono_invoice_not_created',$actor,$reason);
 });
}
function monoRefresh(PDO $db,array $invoice): void {if(!$invoice['invoice_id']){
 if(in_array($invoice['status'],['creating','unknown'],true)&&strtotime((string)$invoice['created_at'].' UTC')<=time()-MONO_WEBHOOK_GRACE_SECONDS)monoFailMissingInvoice($db,$invoice,'mono_reference_lookup_unsupported');
 return;}
$e=monoApi('invoice/status?invoiceId='.rawurlencode($invoice['invoice_id']));
 // A paid order must not stay PENDING forever when the signed webhook is lost. The token-authenticated,
 // TLS-verified server read of this exact invoice confirms only a final success for the same reference;
 // amount, currency and invoice id are checked by monoValidateEvent, replay by the event hash.
 $confirmed=($invoice['status']??'')==='awaiting_webhook'&&($e['status']??'')==='success'&&($e['reference']??null)===$invoice['reference']
  &&strtotime((string)$invoice['updated_at'].' UTC')<=time()-MONO_WEBHOOK_GRACE_SECONDS;
 monoApplyEvent($db,$e,hash('sha256',json_encode($e,JSON_THROW_ON_ERROR)),false,$confirmed);}
// Cron/worker pass over invoices whose final state is still unknown to the shop. Returns the number of failed checks.
function monoWorkerRun(PDO $db): int {
 // Two queues: invoices waiting for a lost webhook keep their first-observation time and must not starve the rest.
 $rows=array_merge($db->query("SELECT * FROM rubizh_mono_invoices WHERE invoice_id IS NULL AND status IN ('creating','unknown') AND created_at<=UTC_TIMESTAMP()-INTERVAL 15 MINUTE ORDER BY created_at LIMIT 25")->fetchAll(PDO::FETCH_ASSOC),$db->query("SELECT * FROM rubizh_mono_invoices i WHERE invoice_id IS NOT NULL AND (status IN ('creating','unknown','created','processing','hold') OR refund_status IN ('processing','unknown') OR status='failure' AND NOT EXISTS (SELECT 1 FROM rubizh_np_audit a WHERE a.order_id=i.order_id AND a.action IN ('mono_invoice_removed','mono_invoice_final_not_removed') AND a.note=i.invoice_id)) ORDER BY updated_at LIMIT 25")->fetchAll(PDO::FETCH_ASSOC),
  $db->query("SELECT * FROM rubizh_mono_invoices WHERE invoice_id IS NOT NULL AND status='awaiting_webhook' AND refund_status NOT IN ('processing','unknown') ORDER BY RAND() LIMIT 10")->fetchAll(PDO::FETCH_ASSOC));$failed=0;
 foreach($rows as $i){try{monoRefresh($db,$i);}catch(Throwable $e){$failed++;error_log('rubizh mono-worker: invoice row '.(int)$i['id'].' order '.(int)$i['order_id'].' status check failed: '.get_class($e).': '.substr($e->getMessage(),0,160));}}return $failed;
}
// SITE forms/JSON use the existing updated_at version. The CRM caller already checks its stronger
// fingerprint under this same lock; only that authenticated, already-locked call (or CLI) may omit it.
function monoCrmVersionChecked(PDO $db,int $orderId,string $actor): bool {
 if(($GLOBALS['crm_staff_actor']['id']??null)!==$actor)return false;
 $q=$db->prepare('SELECT IS_USED_LOCK(?)=CONNECTION_ID()');$q->execute(['rubizh_np_order_'.$orderId]);return (int)$q->fetchColumn()===1;
}
function monoCheckOrderVersion(array $order,?string $expectedUpdatedAt,bool $crmChecked): void {
 if($expectedUpdatedAt===null){if(PHP_SAPI==='cli'||$crmChecked)return;throw new ShopOrderConflict('STATE_REQUIRED',[],'Відкрийте актуальну картку замовлення та повторіть дію.');}
 if((string)$order['updated_at']!==$expectedUpdatedAt)throw new ShopOrderConflict('STATE_CHANGED',['updated_at'=>(string)$order['updated_at']],'Замовлення змінилося після перегляду. Оновіть дані та повторіть дію.');
}
function monoRefund(PDO $db,int $orderId,string $actor,string $reason='',?string $expectedUpdatedAt=null): void {
 shopRequirePermission($actor,'payment.refund.request');shopRequirePermission($actor,'payment.refund.execute');$reason=shopFinancialReason($reason);
 $crmChecked=monoCrmVersionChecked($db,$orderId,$actor);
 npLocked($db,$orderId,function()use($db,$orderId,$actor,$reason,$expectedUpdatedAt,$crmChecked){$order=npOrder($db,$orderId);monoCheckOrderVersion($order,$expectedUpdatedAt,$crmChecked);if($order['payment_status']!=='paid')throw new RuntimeException('Замовлення не оплачене.');$q=$db->prepare("SELECT * FROM rubizh_mono_invoices WHERE order_id=? AND status='success' ORDER BY id DESC LIMIT 1");$q->execute([$orderId]);$i=$q->fetch(PDO::FETCH_ASSOC);if(crmSchemaReady($db)&&crmRefundRows($db,$orderId))throw new RuntimeException('Повернення ведеться через CRM ledger. Використайте його залишок.');if(!$i||$i['refund_status']!=='')throw new RuntimeException('Повернення недоступне або вже обробляється.');$ref='refund-'.$i['id'].'-'.bin2hex(random_bytes(6));$db->beginTransaction();try{shopOrderAudit($db,$orderId,$actor,'payment.refund.request',['payment_status'=>$order['payment_status'],'amount'=>(int)$i['amount']],['refund_ref'=>$ref,'refund_status'=>'processing'],$reason);$db->prepare("UPDATE rubizh_mono_invoices SET refund_ref=?,refund_status='processing' WHERE id=?")->execute([$ref,$i['id']]);npAudit($db,$actor,'mono_refund_requested',$orderId,0,$ref);$db->commit();}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
 try{$items=[];$lines=json_decode($order['items_json'],true)?:[];foreach($lines as $l)$items[]=['code'=>$l['sku'],'qty'=>(float)$l['qty']];$r=monoApi('invoice/cancel',['invoiceId'=>$i['invoice_id'],'extRef'=>$ref,'amount'=>(int)$i['amount'],'items'=>$items]);if(!in_array($r['status']??'', ['success','processing','failure'],true)||array_key_exists('amount',$r)&&(!is_int($r['amount'])||$r['amount']!==(int)$i['amount'])||array_key_exists('extRef',$r)&&$r['extRef']!==$ref)throw new RuntimeException('Невідомий або непов’язаний результат повернення.');$db->beginTransaction();try{$db->prepare('UPDATE rubizh_mono_invoices SET refund_status=? WHERE id=?')->execute([$r['status'],$i['id']]);if($r['status']==='success'){$db->prepare("UPDATE rubizh_customer_orders SET payment_status='refunded',updated_at=UTC_TIMESTAMP() WHERE id=? AND payment_status='paid'")->execute([$orderId]);shopReservationTransition($db,$orderId,'RELEASED','MONOPAY_REFUND');if(!empty($GLOBALS['rubizh_pim_v3_columns']))$db->prepare("UPDATE rubizh_customer_orders SET pim_payment_state='REFUNDED' WHERE id=? AND pim_contract_version=3")->execute([$orderId]);shopOrderAudit($db,$orderId,$actor,'payment.refund.execute',['payment_status'=>'paid'],['payment_status'=>'refunded'],$reason);}npAudit($db,$actor,'mono_refund_'.$r['status'],$orderId,0,$ref);$db->commit();}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}}
 catch(Throwable $e){$db->prepare("UPDATE rubizh_mono_invoices SET refund_status='unknown' WHERE id=?")->execute([$i['id']]);npAudit($db,$actor,'mono_refund_unknown',$orderId,0,$ref);throw $e;}});
}
function monoReconcile(PDO $db,int $orderId,string $invoiceId,string $actor,string $reason='',?string $expectedUpdatedAt=null): void {
 shopRequirePermission($actor,'payment.manual_reconcile');$reason=shopFinancialReason($reason);
 if(!preg_match('/^[A-Za-z0-9_-]{1,100}$/D',$invoiceId))throw new RuntimeException('Перевірте ID рахунку з кабінету monobank.');
 $crmChecked=monoCrmVersionChecked($db,$orderId,$actor);
 $event=npLocked($db,$orderId,function()use($db,$orderId,$invoiceId,$actor,$reason,$expectedUpdatedAt,$crmChecked){monoCheckOrderVersion(npOrder($db,$orderId),$expectedUpdatedAt,$crmChecked);$event=monoApi('invoice/status?invoiceId='.rawurlencode($invoiceId));$db->beginTransaction();try{$q=$db->prepare("SELECT * FROM rubizh_mono_invoices WHERE order_id=? AND status IN ('creating','unknown') ORDER BY id DESC LIMIT 1");$q->execute([$orderId]);$i=$q->fetch(PDO::FETCH_ASSOC);if(!$i)throw new RuntimeException('Немає невизначеного рахунку для звірки.');
 if(($event['reference']??'')!==$i['reference'])throw new RuntimeException('Рахунок має інший reference. Прив’язку відхилено.');$i['invoice_id']=$invoiceId;monoValidateEvent($event,$i);
 $db->prepare("UPDATE rubizh_mono_invoices SET invoice_id=?,page_url=?,status='created',updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$invoiceId,'https://pay.mbnk.biz/'.rawurlencode($invoiceId),$i['id']]);npAudit($db,$actor,'mono_invoice_reconciled',$orderId,0,$invoiceId);shopOrderAudit($db,$orderId,$actor,'payment.manual_reconcile',['invoice_id'=>null,'reference'=>$i['reference']],['invoice_id'=>$invoiceId,'reference'=>$i['reference']],$reason);$db->commit();return $event;}catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}});monoApplyEvent($db,$event,hash('sha256',json_encode($event,JSON_THROW_ON_ERROR)));
}
