<?php
declare(strict_types=1);
require_once __DIR__.'/np-lib.php';
function npMigrate(PDO $db): void {if(function_exists('rubizhSchemaPrepared')&&rubizhSchemaPrepared($db))return;
    $version=(int)$db->query("SELECT v FROM meta WHERE k='rubizh_np_schema'")->fetchColumn();if($version>=3)return;
    $db->exec("CREATE TABLE IF NOT EXISTS rubizh_order_fulfillment_lines(order_id BIGINT UNSIGNED NOT NULL,line_no SMALLINT UNSIGNED NOT NULL,product_id VARCHAR(64) NOT NULL,sku VARCHAR(64) NOT NULL,qty DECIMAL(12,2) NOT NULL,supplier_code VARCHAR(32) NOT NULL DEFAULT '',line_amount DECIMAL(12,2) NULL,created_at DATETIME NOT NULL,PRIMARY KEY(order_id,line_no),INDEX(supplier_code,order_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->exec("ALTER TABLE rubizh_order_fulfillment_lines MODIFY qty DECIMAL(12,2) NOT NULL");
    npAddColumn($db,'rubizh_order_fulfillment_lines','line_amount','DECIMAL(12,2) NULL');
    npAddColumn($db,'rubizh_order_fulfillment_lines','sale_unit',"VARCHAR(8) NOT NULL DEFAULT 'piece'");
    $db->exec("CREATE TABLE IF NOT EXISTS rubizh_order_shipments(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,order_id BIGINT UNSIGNED NOT NULL,supplier_code VARCHAR(32) NOT NULL,tracking_number VARCHAR(32) NULL UNIQUE,np_document_ref VARCHAR(64) NOT NULL DEFAULT '',origin_label VARCHAR(200) NOT NULL DEFAULT '',status VARCHAR(24) NOT NULL DEFAULT 'draft',created_at DATETIME NOT NULL,updated_at DATETIME NOT NULL,INDEX(order_id,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->exec("ALTER TABLE rubizh_order_shipments MODIFY tracking_number VARCHAR(32) NULL DEFAULT NULL");
    foreach(['operation_key'=>'CHAR(32) NULL','lines_json'=>'TEXT NULL','package_json'=>'TEXT NULL','payload_json'=>'MEDIUMTEXT NULL','origin_json'=>'TEXT NULL','result_json'=>'MEDIUMTEXT NULL','error'=>"VARCHAR(300) NOT NULL DEFAULT ''",'attempted_at'=>'DATETIME NULL','checked_at'=>'DATETIME NULL','declared_value'=>'DECIMAL(12,2) NULL','delivery_cost'=>'DECIMAL(12,2) NULL'] as $c=>$type)npAddColumn($db,'rubizh_order_shipments',$c,$type);
    $q=$db->query("SHOW INDEX FROM rubizh_order_shipments WHERE Key_name='np_operation'");if(!$q->fetch())$db->exec('CREATE UNIQUE INDEX np_operation ON rubizh_order_shipments(operation_key)');
    $db->exec("CREATE TABLE IF NOT EXISTS rubizh_np_order_confirmations(order_id BIGINT UNSIGNED PRIMARY KEY,availability_confirmed TINYINT NOT NULL DEFAULT 0,extra_delivery_agreed TINYINT NOT NULL DEFAULT 0,confirmed_at DATETIME NULL,confirmed_by CHAR(32) NULL,payment_proof VARCHAR(240) NOT NULL DEFAULT '',updated_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->exec("CREATE TABLE IF NOT EXISTS rubizh_np_audit(id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,actor_id CHAR(32) NOT NULL,action VARCHAR(40) NOT NULL,order_id BIGINT UNSIGNED NOT NULL DEFAULT 0,shipment_id BIGINT UNSIGNED NOT NULL DEFAULT 0,note VARCHAR(400) NOT NULL DEFAULT '',created_at DATETIME NOT NULL,INDEX(order_id,id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->exec("CREATE TABLE IF NOT EXISTS rubizh_np_cache(cache_key CHAR(64) PRIMARY KEY,payload MEDIUMTEXT NOT NULL,expires_at DATETIME NOT NULL,INDEX(expires_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    $db->exec("INSERT INTO meta(k,v) VALUES('rubizh_np_schema','3') ON DUPLICATE KEY UPDATE v='3'");
}
function npAddColumn(PDO $db,string $table,string $column,string $type): void {
    $q=$db->prepare('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?');$q->execute([$table,$column]);if(!(int)$q->fetchColumn())$db->exec("ALTER TABLE `$table` ADD COLUMN `$column` $type");
}
function npManagerId(): string {
    $id=customerId();if($id!==null&&shopStaffRole($id)!=='')return $id;
    throw new ShopPermissionException('Увійдіть до уповноваженого облікового запису.');
}
function shopShipmentActor(string $actor): void {
    if($actor===str_repeat('0',32)&&PHP_SAPI==='cli')return;
    shopRequirePermission($actor,'shipment.manage');
}
function npAudit(PDO $db,string $actor,string $action,int $order=0,int $shipment=0,string $note=''): void {
    $db->prepare('INSERT INTO rubizh_np_audit(actor_id,action,order_id,shipment_id,note,created_at) VALUES(?,?,?,?,?,UTC_TIMESTAMP())')->execute([$actor,$action,$order,$shipment,mb_substr($note,0,400)]);
}
function npOrder(PDO $db,int $id): array {
    $q=$db->prepare('SELECT o.*,d.contact_json,d.subtotal,d.discount_amount,d.shipping_amount FROM rubizh_customer_orders o LEFT JOIN rubizh_order_details d ON d.order_id=o.id WHERE o.id=?');$q->execute([$id]);$o=$q->fetch(PDO::FETCH_ASSOC);if(!$o)throw new RuntimeException('Замовлення не знайдено.');
    $o['contact']=json_decode((string)($o['contact_json']??''),true)?:[];$o['items']=json_decode((string)$o['items_json'],true)?:[];
    return $o;
}
function npLines(PDO $db,int $order): array {$q=$db->prepare('SELECT * FROM rubizh_order_fulfillment_lines WHERE order_id=? ORDER BY line_no');$q->execute([$order]);return $q->fetchAll(PDO::FETCH_ASSOC);}
function npShipments(PDO $db,int $order): array {$q=$db->prepare('SELECT * FROM rubizh_order_shipments WHERE order_id=? ORDER BY id');$q->execute([$order]);return $q->fetchAll(PDO::FETCH_ASSOC);}
function npLocked(PDO $db,int $order,callable $work): mixed {
    $key='rubizh_np_order_'.$order;$q=$db->prepare('SELECT GET_LOCK(?,2)');$q->execute([$key]);if((int)$q->fetchColumn()!==1)throw new RuntimeException('Замовлення вже обробляється. Зачекайте.');
    try{return $work();}finally{$db->prepare('SELECT RELEASE_LOCK(?)')->execute([$key]);}
}
function npRemaining(array $lines,array $shipments): array {
    $left=[];foreach($lines as $l)$left[(int)$l['line_no']]=['qty'=>(float)$l['qty'],'amount'=>$l['line_amount']===null?null:(float)$l['line_amount']];
    foreach($shipments as $s){if($s['status']==='cancelled')continue;
      foreach(json_decode((string)($s['lines_json']??''),true)?:[] as $l){$i=(int)$l['line_no'];if(isset($left[$i])){$left[$i]['qty']=round($left[$i]['qty']-(float)$l['qty'],2);if($left[$i]['amount']!==null)$left[$i]['amount']=round($left[$i]['amount']-(float)$l['amount'],2);}}
    }return $left;
}
function npPackage(array $input): array {
    $places=$input['places']??null;if(!is_array($places)||count($places)<1||count($places)>100)throw new RuntimeException('Додайте фактичні місця посилки з вагою та габаритами.');
    $total=0;$clean=[];
    foreach($places as $p){if(!is_array($p))throw new RuntimeException('Перевірте дані місця.');$row=[];
      foreach(['weight','length','width','height'] as $f){$v=$p[$f]??null;if(is_bool($v)||!is_numeric($v)||!is_finite((float)$v)||(float)$v<=0||(float)$v>30000)throw new RuntimeException('Вкажіть додатну фактичну вагу та габарити кожного місця.');$row[$f]=round((float)$v,3);if($row[$f]<=0)throw new RuntimeException('Недопустима вага або габарити.');}
      $total+=$row['weight'];$clean[]=$row;
    }return ['places'=>$clean,'weight'=>round($total,3),'seats'=>count($clean)];
}
function npAllocation(array $lines,array $shipments,string $code,array $selected,bool $requireOrigin=true): array {
    if($requireOrigin&&!isset(npOrigins()[$code]))throw new RuntimeException('Невідомий постачальник — ручне уточнення.');
    $left=npRemaining($lines,$shipments);$out=[];$seen=[];
    foreach($selected as $p){if(!is_array($p))throw new RuntimeException('Перевірте позиції посилки.');$i=$p['line_no']??null;if(!is_int($i)||isset($seen[$i]))throw new RuntimeException('Невірна або повторена позиція.');$seen[$i]=true;
      $line=null;foreach($lines as $l)if((int)$l['line_no']===$i)$line=$l;
      if(!$line||$line['supplier_code']!==$code)throw new RuntimeException('Позиція належить іншому місцю відправки.');
      $qty=$p['qty']??null;shopQuantity($qty,$line['sale_unit']??'piece');if(is_bool($qty)||!is_numeric($qty)||!is_finite((float)$qty)||(float)$qty<=0 || abs((float)$qty-round((float)$qty,2))>0.00001 || (float)$qty>$left[$i]['qty']+0.00001)throw new RuntimeException('Кількість перевищує нерозподілений залишок замовлення.');
      if($left[$i]['amount']===null)throw new RuntimeException('Для старої позиції немає підтвердженої суми. Потрібна ручна звірка.');
      $amount=(float)$qty===$left[$i]['qty']?$left[$i]['amount']:round((float)$line['line_amount']*(float)$qty/(float)$line['qty'],2);
      if($amount<=0||$amount>$left[$i]['amount']+0.001)throw new RuntimeException('Перевірте оголошену вартість позиції.');
      $out[]=['line_no'=>$i,'sku'=>$line['sku'],'qty'=>(float)$qty,'amount'=>$amount];
    }
    if(!$out)throw new RuntimeException('Оберіть позиції цієї посилки.');return $out;
}
function npDraft(PDO $db,int $order,string $actor,string $op,string $code,array $selected,array $package): int {
    shopShipmentActor($actor);
    if(!preg_match('/^[a-f0-9]{32}$/D',$op))throw new RuntimeException('Оновіть форму посилки.');
    return npLocked($db,$order,function()use($db,$order,$actor,$op,$code,$selected,$package){
      $q=$db->prepare('SELECT id,order_id FROM rubizh_order_shipments WHERE operation_key=?');$q->execute([$op]);if($r=$q->fetch(PDO::FETCH_ASSOC)){if((int)$r['order_id']!==$order)throw new RuntimeException('Ключ належить іншому замовленню.');return (int)$r['id'];}
      $o=npOrder($db,$order);if(in_array($o['status'],['cancelled','returned','completed'],true))throw new RuntimeException('Замовлення закрите.');
      $items=npAllocation(npLines($db,$order),npShipments($db,$order),$code,$selected);$pack=npPackage($package);
      $value=round(array_sum(array_column($items,'amount')),2);
      $db->prepare("INSERT INTO rubizh_order_shipments(order_id,supplier_code,operation_key,lines_json,package_json,declared_value,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'draft',UTC_TIMESTAMP(),UTC_TIMESTAMP())")->execute([$order,$code,$op,json_encode($items,JSON_THROW_ON_ERROR),json_encode($pack,JSON_THROW_ON_ERROR),$value]);$id=(int)$db->lastInsertId();npAudit($db,$actor,'shipment_draft',$order,$id);return $id;
    });
}
// Stage 5.6-2 (D-83): for dropshipping the owner or the supplier creates the TTN outside CRM (another NP cabinet) and
// staff enters it by hand. One TTN = one parcel of unallocated lines of one supplier; paid orders only; the parcel is
// then tracked and aggregated like any other (np-worker, npAggregateOrder). No NP call is made here.
function npTrackingNumber(string $raw): string {
    $n=(string)preg_replace('/[\s-]+/u','',$raw);
    if(!preg_match('/^[1-9][0-9]{13}$/D',$n))throw new InvalidArgumentException('ТТН Нової пошти — 14 цифр, наприклад 20450123456789.');
    return $n;
}
function npManualShipment(PDO $db,int $order,string $actor,string $op,array $selected,string $number): int {
    shopShipmentActor($actor);
    if(!preg_match('/^[a-f0-9]{32}$/D',$op))throw new RuntimeException('Оновіть форму посилки.');
    $number=npTrackingNumber($number);
    return npLocked($db,$order,function()use($db,$order,$actor,$op,$selected,$number){
      $q=$db->prepare('SELECT id,order_id,tracking_number FROM rubizh_order_shipments WHERE operation_key=?');$q->execute([$op]);
      if($r=$q->fetch(PDO::FETCH_ASSOC)){if((int)$r['order_id']!==$order||$r['tracking_number']!==$number)throw new RuntimeException('Ключ належить іншій посилці.');return (int)$r['id'];}
      $o=npOrder($db,$order);if(in_array($o['status'],['cancelled','returned','completed'],true))throw new RuntimeException('Замовлення закрите.');
      $method=$o['contact']['payment']??'';
      if($method==='cod')throw new RuntimeException('Післяплату вимкнено. Погодьте з покупцем онлайн-оплату перед відправкою.');
      if(!in_array($method,['card','invoice'],true)||$o['payment_status']!=='paid')throw new RuntimeException('Замовлення ще не оплачене.');
      $c=$db->prepare('SELECT availability_confirmed FROM rubizh_np_order_confirmations WHERE order_id=?');$c->execute([$order]);
      if((int)$c->fetchColumn()!==1)throw new RuntimeException('Спочатку підтвердьте наявність і комплектацію.');
      $used=$db->prepare('SELECT order_id FROM rubizh_order_shipments WHERE tracking_number=?');$used->execute([$number]);
      if(($other=$used->fetchColumn())!==false)throw new NpTrackingNumberUsed('Ця ТТН уже внесена (замовлення №'.(int)$other.').');
      $lines=npLines($db,$order);$codes=[];
      foreach($selected as $p)foreach($lines as $l)if(is_array($p)&&(int)$l['line_no']===($p['line_no']??null))$codes[$l['supplier_code']]=true;
      if(count($codes)!==1)throw new RuntimeException('Одна ТТН — одна посилка від одного постачальника. Оберіть позиції одного постачальника.');
      $code=(string)array_key_first($codes);if($code==='')throw new RuntimeException('Позиція без постачальника: спершу призначте постачальника.');$items=npAllocation($lines,npShipments($db,$order),$code,$selected,false);
      $value=round(array_sum(array_column($items,'amount')),2);
      // Two orders entering the same TTN at once: the UNIQUE index decides, the second gets the same «already used».
      try{$db->prepare("INSERT INTO rubizh_order_shipments(order_id,supplier_code,operation_key,tracking_number,origin_label,origin_json,lines_json,declared_value,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'created',UTC_TIMESTAMP(),UTC_TIMESTAMP())")
        ->execute([$order,$code,$op,$number,'ТТН внесено вручну',json_encode(['source'=>'manual','entered_by'=>$actor],JSON_THROW_ON_ERROR),json_encode($items,JSON_THROW_ON_ERROR),$value]);}
      catch(PDOException $e){if((int)($e->errorInfo[1]??0)===1062)throw new NpTrackingNumberUsed('Ця ТТН уже внесена.');throw $e;}
      $id=(int)$db->lastInsertId();npAudit($db,$actor,'shipment_manual_ttn',$order,$id,$number);npAggregateOrder($db,$order);return $id;
    });
}
final class NpTrackingNumberUsed extends RuntimeException {}
function npConfirm(PDO $db,int $order,string $actor,bool $availability,bool $extra,string $proof,array $approval=[],?string $expectedUpdatedAt=null): void {
    shopRequirePermission($actor,'order.confirm');
    if(!$availability)throw new RuntimeException('Підтвердьте наявність і комплектацію всіх позицій.');
    if(trim($proof)!==''){shopRequirePermission($actor,'payment.manual_reconcile');shopFinancialReason((string)($approval['reason']??''));}
    $crmChecked=monoCrmVersionChecked($db,$order,$actor);
    npLocked($db,$order,function()use($db,$order,$actor,$extra,$proof,$approval,$expectedUpdatedAt,$crmChecked){
        $db->beginTransaction();
        try{
            $fresh=npOrder($db,$order);monoCheckOrderVersion($fresh,$expectedUpdatedAt,$crmChecked);$method=$fresh['contact']['payment']??'';
            if(in_array($fresh['status'],['cancelled','returned','completed'],true)||$fresh['payment_status']==='refunded')throw new RuntimeException('Замовлення оплачене або закрите.');
            if(!in_array($method,['invoice','card'],true))throw new ShopOrderConflict('PAYMENT_NOT_ALLOWED',[],'Спосіб оплати потребує окремої звірки.');
            // Q-7 can be paid before a manager confirms fulfillment. Keep the
            // paid snapshot, deadline and committed reserve intact; this action
            // records only availability and the separate-parcel agreement.
            if($fresh['payment_status']==='paid'){
                if(trim($proof)!=='')throw new RuntimeException('Оплачене замовлення потребує лише підтвердження комплектації, без повторної звірки оплати.');
                $db->prepare('INSERT INTO rubizh_np_order_confirmations(order_id,availability_confirmed,extra_delivery_agreed,confirmed_at,confirmed_by,payment_proof,updated_at) VALUES(?,1,?,UTC_TIMESTAMP(),?,\'\',UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE availability_confirmed=1,extra_delivery_agreed=VALUES(extra_delivery_agreed),confirmed_at=VALUES(confirmed_at),confirmed_by=VALUES(confirmed_by),updated_at=VALUES(updated_at)')->execute([$order,$extra?1:0,$actor]);
                npAudit($db,$actor,'paid_fulfillment_confirmed',$order,0,$extra?'Separate parcel delivery agreed':'Separate parcel delivery not agreed');
                $db->commit();return;
            }
            $v=pimV3ConfirmRequests($db,$order,is_array($GLOBALS['rubizh_request_resolution']??null)?$GLOBALS['rubizh_request_resolution']:[],$actor,$approval);
            $db->prepare('INSERT INTO rubizh_np_order_confirmations(order_id,availability_confirmed,extra_delivery_agreed,confirmed_at,confirmed_by,payment_proof,updated_at) VALUES(?,1,?,UTC_TIMESTAMP(),?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE availability_confirmed=1,extra_delivery_agreed=VALUES(extra_delivery_agreed),confirmed_at=VALUES(confirmed_at),confirmed_by=VALUES(confirmed_by),payment_proof=IF(LENGTH(VALUES(payment_proof))=0,payment_proof,VALUES(payment_proof)),updated_at=VALUES(updated_at)')->execute([$order,$extra?1:0,$actor,mb_substr($proof,0,240)]);
            $db->prepare("UPDATE rubizh_customer_orders SET status='confirmed',updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$order]);
            if(!empty($GLOBALS['rubizh_pim_v3_columns']))$db->prepare("UPDATE rubizh_customer_orders SET pim_order_state='CONFIRMED',pim_confirmation_revision=? WHERE id=? AND pim_contract_version=3")->execute([$v['quote_hash'],$order]);
            shopStartPaymentTiming($db,$fresh);$timing=shopEnsureTiming($db,$fresh);
            shopReserveLines($db,$order,$v['raw'],$timing['payment_due']);
            if($method==='invoice'&&trim($proof)!==''){
                $db->prepare("UPDATE rubizh_customer_orders SET payment_status='paid' WHERE id=?")->execute([$order]);
                if(!empty($GLOBALS['rubizh_pim_v3_columns']))$db->prepare("UPDATE rubizh_customer_orders SET pim_payment_state='PAID',pim_fulfillment_state='READY_TO_SHIP' WHERE id=? AND pim_contract_version=3")->execute([$order]);
                shopReservationTransition($db,$order,'COMMITTED','BANK_RECONCILIATION');
                shopOrderAudit($db,$order,$actor,'payment.manual_reconcile',['payment_status'=>$fresh['payment_status']],['payment_status'=>'paid','evidence'=>trim($proof)],shopFinancialReason((string)$approval['reason']));shopQueueEvent($db,$order,'paid');
            }
            npAudit($db,$actor,'order_confirmed',$order);$db->commit();
        }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
    });
}
function npAssertReady(array $order,array $confirmation,array $lines,array $shipments,array $shipment): void {
    if(cfg('np_ttn_enabled')!==true)throw new RuntimeException('Випуск ТТН ще не увімкнено власником після перевірки налаштувань.');
    if(in_array($order['status'],['cancelled','returned','completed'],true))throw new RuntimeException('Замовлення закрите.');
    if((int)($confirmation['availability_confirmed']??0)!==1)throw new RuntimeException('Спочатку підтвердьте наявність і комплектацію.');
    if(!isset(npOrigins()[$shipment['supplier_code']]))throw new RuntimeException('Для цієї посилки постачальник не визначений; потрібне ручне уточнення.');
    $method=$order['contact']['payment']??'';
    if(in_array($method,['card','invoice'],true)&&$order['payment_status']!=='paid')throw new RuntimeException('Замовлення ще не оплачене.');
    if($method==='card'&&cfg('np_card_payment_verified')!==true&&!(function_exists('monoConfigured')&&monoConfigured()))throw new RuntimeException('Платіжний сервіс ще не підключено до перевірки оплати.');
    // Cash on delivery is forbidden; a historical COD order needs an agreed online payment before any TTN.
    if($method==='cod')throw new RuntimeException('Післяплату вимкнено. Погодьте з покупцем онлайн-оплату перед оформленням ТТН.');
    if(!in_array($method,['card','invoice'],true))throw new RuntimeException('Невідомий спосіб оплати.');
    $active=array_filter($shipments,fn($s)=>$s['status']!=='cancelled');$codes=array_unique(array_column($lines,'supplier_code'));
    if((count($active)>1||count($codes)>1) && (int)($confirmation['extra_delivery_agreed']??0)!==1)throw new RuntimeException('Погодьте з покупцем доставку кожної окремої посилки.');
    if(!is_array($order['contact']['np_delivery']??null))throw new RuntimeException('Для цього старого замовлення адресу ще не перевірено в довіднику НП.');
    $delivery=$order['contact']['np_delivery'];$deliveryType=$order['contact']['delivery_type']??($delivery['type']??'');
    if(!empty($delivery['manual'])||isset($delivery['unverified_refs'])||!npRef($delivery['city_ref']??'')
      ||!in_array($deliveryType,['branch','postomat','courier'],true)
      ||!npRef($delivery[$deliveryType==='courier'?'street_ref':'warehouse_ref']??'')
      ||($deliveryType==='courier'&&trim((string)($delivery['building']??''))===''))throw new RuntimeException('Перевірте адресу одержувача в довіднику НП перед випуском ТТН.');
    if(count(preg_split('/\s+/u',trim((string)(($order['contact']['recipient']??'')?:($order['contact']['name']??'')))))<2)throw new RuntimeException('Вкажіть ім’я та прізвище одержувача.');
    npPackage(json_decode((string)$shipment['package_json'],true)?:[]);
    if((float)$shipment['declared_value']<=0)throw new RuntimeException('Немає підтвердженої оголошеної вартості.');
}
function npSaveProperties(array $shipment,array $origin,array $sender,array $delivery,array $contact,string $recipientRef,string $contactRef,string $recipientAddress): array {
    $package=npPackage(json_decode((string)$shipment['package_json'],true)?:[]);
    $props=['PayerType'=>'Recipient','PaymentMethod'=>'Cash','DateTime'=>(new DateTimeImmutable('now',new DateTimeZone('Europe/Kyiv')))->format('d.m.Y'),'CargoType'=>$package['weight']>30?'Cargo':'Parcel','Weight'=>(string)$package['weight'],'ServiceType'=>$delivery['type']==='courier'?'WarehouseDoors':'WarehouseWarehouse','SeatsAmount'=>(string)$package['seats'],'Description'=>'Товари','Cost'=>number_format((float)$shipment['declared_value'],2,'.',''),'CitySender'=>$origin['city_ref'],'Sender'=>$sender['ref'],'SenderAddress'=>$origin['warehouse_ref'],'ContactSender'=>$sender['contact_ref'],'SendersPhone'=>preg_replace('/\D/','',$sender['phone']),'CityRecipient'=>$delivery['city_ref'],'Recipient'=>$recipientRef,'RecipientAddress'=>$recipientAddress,'ContactRecipient'=>$contactRef,'RecipientsPhone'=>preg_replace('/\D/','',$contact['phone']),'InfoRegClientBarcodes'=>'RB-'.$shipment['operation_key'],'AdditionalInformation'=>'RB-'.$shipment['operation_key']];
    $props['OptionsSeat']=array_map(fn($p)=>['weight'=>(string)$p['weight'],'volumetricVolume'=>(string)round($p['length']*$p['width']*$p['height']/1000000,6),'volumetricLength'=>(string)$p['length'],'volumetricWidth'=>(string)$p['width'],'volumetricHeight'=>(string)$p['height']],$package['places']);
    return $props;
}
function npRecipient(array $contact,array $delivery): array {
    $name=trim((string)(($contact['recipient']??'')?:$contact['name']));$parts=preg_split('/\s+/u',$name);
    if(count($parts)<2)throw new RuntimeException('Для НП потрібні ім’я та прізвище одержувача.');
    $result=npApiCall('Counterparty','save',['FirstName'=>$parts[0],'LastName'=>$parts[1],'MiddleName'=>implode(' ',array_slice($parts,2)),'Phone'=>preg_replace('/\D/','',$contact['phone']),'Email'=>$contact['email'],'CounterpartyType'=>'PrivatePerson','CounterpartyProperty'=>'Recipient','CityRef'=>$delivery['city_ref']]);
    $r=$result[0]??[];if(!npRef($r['Ref']??''))throw new NpUnknownResult('НП не повернула ідентифікатор одержувача.');
    $persons=$r['ContactPerson']['data']??null;
    if(!is_array($persons))$persons=npApiCall('Counterparty','getCounterpartyContactPersons',['Ref'=>$r['Ref']]);
    $phone=preg_replace('/\D/','',$contact['phone']);$person=null;foreach($persons as $p)if(npRef($p['Ref']??'') && str_contains(preg_replace('/\D/','',(string)($p['Phones']??'')),$phone))$person=$p;
    if(!$person)throw new RuntimeException('Контакт одержувача не підтверджено в НП.');
    $address=$delivery['warehouse_ref']??'';
    if($delivery['type']==='courier'){
      $rows=npApiCall('Address','save',['CounterpartyRef'=>$r['Ref'],'StreetRef'=>$delivery['street_ref'],'BuildingNumber'=>$delivery['building'],'Flat'=>$delivery['flat']]);$address=$rows[0]['Ref']??'';
    }if(!npRef($address))throw new NpUnknownResult('НП не підтвердила адресу одержувача.');
    return ['ref'=>$r['Ref'],'contact_ref'=>$person['Ref'],'address_ref'=>$address];
}
function npCreate(PDO $db,int $order,int $id,string $actor): array {
    shopShipmentActor($actor);
    return npLocked($db,$order,function()use($db,$order,$id,$actor){
      $q=$db->prepare('SELECT * FROM rubizh_order_shipments WHERE id=? AND order_id=?');$q->execute([$id,$order]);$s=$q->fetch(PDO::FETCH_ASSOC);if(!$s)throw new RuntimeException('Посилку не знайдено.');
      if(!empty($s['tracking_number']))return $s;
      if($s['status']==='creating' && $s['attempted_at']!==null){$db->prepare("UPDATE rubizh_order_shipments SET status='unknown',error='Перерваний випуск: потрібна звірка',updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$id]);throw new RuntimeException('Перерваний випуск: звірте результат у НП.');}
      if($s['status']!=='draft')throw new RuntimeException('Повторний випуск заблоковано. Перевірте стан та результат у НП.');
      $o=npOrder($db,$order);$q=$db->prepare('SELECT * FROM rubizh_np_order_confirmations WHERE order_id=?');$q->execute([$order]);$confirmation=$q->fetch(PDO::FETCH_ASSOC)?:[];
      npAssertReady($o,$confirmation,npLines($db,$order),npShipments($db,$order),$s);
      // All read-only checks run before recording an attempted remote mutation.
      $delivery=npValidateDelivery($db,['np_delivery'=>$o['contact']['np_delivery']],$o['contact']['delivery_type']);$package=npPackage(json_decode((string)$s['package_json'],true)?:[]);
      // LOG-04: the supplier's sender profile (single source) decides origin and sender for every channel.
      $profiled=npUseSenderProfile($db,$s['supplier_code']);try{$origin=npVerifiedOrigin($db,$s['supplier_code'],$package['weight']);$sender=npVerifiedSender($db);}finally{if($profiled)unset($GLOBALS['crm_domain_config']);}
      $db->prepare("UPDATE rubizh_order_shipments SET status='creating',attempted_at=UTC_TIMESTAMP(),origin_json=?,origin_label=?,error='',updated_at=UTC_TIMESTAMP() WHERE id=? AND status='draft'")->execute([json_encode($origin,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),mb_substr($origin['label'],0,200),$id]);npAudit($db,$actor,'shipment_create_attempt',$order,$id);
      try{
        $recipient=npRecipient($o['contact'],$delivery);$props=npSaveProperties($s,$origin,$sender,$delivery,$o['contact'],$recipient['ref'],$recipient['contact_ref'],$recipient['address_ref']);
        $db->prepare('UPDATE rubizh_order_shipments SET payload_json=? WHERE id=?')->execute([json_encode($props,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$id]);
        // A5: cash on delivery never reaches the carrier, whatever the caller built.
        if(array_intersect_key($props,array_flip(['BackwardDeliveryData','AfterpaymentOnGoodsCost','RedeliveryCalculate'])))throw new NpRejected('Повернення грошей через НП заборонене: оплата лише карткою або на рахунок.');
        $rows=npApiCall('InternetDocument','save',$props);$r=$rows[0]??[];
        if(!npRef($r['Ref']??'')||!preg_match('/^[0-9]{14}$/D',(string)($r['IntDocNumber']??'')))throw new NpUnknownResult('НП не підтвердила номер ТТН.');
        $db->prepare("UPDATE rubizh_order_shipments SET status='created',np_document_ref=?,tracking_number=?,result_json=?,delivery_cost=?,error='',updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$r['Ref'],$r['IntDocNumber'],json_encode($r,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),is_numeric($r['CostOnSite']??null)?$r['CostOnSite']:null,$id]);
        npAggregateOrder($db,$order);npAudit($db,$actor,'shipment_created',$order,$id,$r['IntDocNumber']);return array_merge($s,['tracking_number'=>$r['IntDocNumber'],'np_document_ref'=>$r['Ref'],'status'=>'created']);
      }catch(Throwable $e){
        // Even a local persistence error after a successful save has an unknown remote result.
        $state=$e instanceof NpRejected?'error':'unknown';$message=($e instanceof NpRejected||$e instanceof NpUnknownResult)?$e->getMessage():'Результат операції потребує звірки з НП.';
        $db->prepare('UPDATE rubizh_order_shipments SET status=?,error=?,updated_at=UTC_TIMESTAMP() WHERE id=?')->execute([$state,mb_substr($message,0,300),$id]);npAudit($db,$actor,'shipment_'.$state,$order,$id,$message);throw new RuntimeException($message);
      }
    });
}
// Additive operator-only migration; never called by a request.
function npRecoveryMigrate(PDO $db): void {
    if(PHP_SAPI!=='cli')throw new RuntimeException('CLI migration only');
    foreach(['reconciliation_zero_at'=>'DATETIME NULL','reconciliation_matches'=>'INT NULL','reconciliation_evidence'=>'MEDIUMTEXT NULL'] as $c=>$type)npAddColumn($db,'rubizh_order_shipments',$c,$type);
}
function npDocumentReconciliation(array $shipment): array {
    if(!preg_match('/^[a-f0-9]{32}$/D',(string)($shipment['operation_key']??'')))throw new RuntimeException('Немає ключа операції для звірки НП.');
    $from=(new DateTimeImmutable($shipment['attempted_at']?:$shipment['created_at'],new DateTimeZone('UTC')))->modify('-1 day')->format('d.m.Y');$to=gmdate('d.m.Y');$matches=[];$complete=false;$pages=0;
    for($page=1;$page<=20;$page++){
        $rows=npApiCall('InternetDocument','getDocumentList',['DateTimeFrom'=>$from,'DateTimeTo'=>$to,'Page'=>(string)$page,'Limit'=>'100']);$pages=$page;
        foreach($rows as $r){$marker=(string)($r['InfoRegClientBarcodes']??'').' '.(string)($r['AdditionalInformation']??'');if(str_contains($marker,'RB-'.$shipment['operation_key']))$matches[]=$r;}
        if(count($rows)<100){$complete=true;break;}
    }
    return ['matches'=>$matches,'complete'=>$complete,'evidence'=>['complete'=>$complete,'pages'=>$pages,'matches'=>count($matches),'marker'=>'RB-'.$shipment['operation_key'],'from'=>$from,'to'=>$to,'checked_at'=>gmdate('Y-m-d H:i:s')]];
}
function npResolveUnknown(PDO $db,int $order,int $id,string $actor,string $choice,string $number,string $reason): void {
    if(shopStaffRole($actor)!=='OWNER')throw new ShopPermissionException('Потрібні права власника.');
    // Reuse the existing OWNER step-up contract, including this actor's own login timestamp.
    shopRequirePermission($actor,'payment.manual_reconcile');$reason=shopFinancialReason($reason);
    npLocked($db,$order,function()use($db,$order,$id,$actor,$choice,$number,$reason){
        $q=$db->prepare('SELECT * FROM rubizh_order_shipments WHERE id=? AND order_id=?');$q->execute([$id,$order]);$s=$q->fetch(PDO::FETCH_ASSOC);
        if(!$s||!in_array($s['status'],['unknown','creating'],true)||!empty($s['tracking_number']))throw new RuntimeException('Посилка вже не має невідомого результату.');
        $result=[];
        if($choice==='not_created'){
            $at=strtotime((string)($s['reconciliation_zero_at']??'').' UTC');
            if($at===false||$at>=time()-7200||(int)($s['reconciliation_matches']??-1)!==0||empty($s['reconciliation_evidence']))throw new RuntimeException('Потрібна повна звірка з нульовим результатом понад 2 години тому.');
            $freshScan=npDocumentReconciliation($s);
            if(!$freshScan['complete']||count($freshScan['matches'])!==0)throw new RuntimeException('Свіжа звірка не підтвердила відсутність ТТН. Скасування заблоковано.');
            $state='cancelled';
        }elseif($choice==='link'){
            if(!preg_match('/^[0-9]{14}$/D',$number))throw new InvalidArgumentException('ТТН має містити 14 цифр.');
            $rows=npApiCall('InternetDocument','getDocumentList',['IntDocNumber'=>$number,'Page'=>'1','Limit'=>'100']);
            $matches=array_values(array_filter($rows,fn($r)=>(string)($r['IntDocNumber']??'')===$number&&npRef($r['Ref']??'')));
            if(count($matches)!==1)throw new RuntimeException('НП не підтвердила однозначну існуючу ТТН.');
            $result=$matches[0];$state='created';
        }else throw new InvalidArgumentException('Оберіть результат звірки.');
        $db->beginTransaction();try{
            $q=$db->prepare('SELECT * FROM rubizh_order_shipments WHERE id=? AND order_id=? FOR UPDATE');$q->execute([$id,$order]);$latest=$q->fetch(PDO::FETCH_ASSOC);
            foreach(['status','tracking_number','np_document_ref','operation_key','attempted_at','reconciliation_zero_at','reconciliation_matches','reconciliation_evidence','updated_at'] as $field)if(!$latest||($latest[$field]??null)!==($s[$field]??null))throw new RuntimeException('Стан або докази посилки змінилися під час звірки. Повторіть перевірку.');
            if($choice==='not_created')$db->prepare('UPDATE rubizh_order_shipments SET reconciliation_evidence=? WHERE id=?')->execute([json_encode($freshScan['evidence'],JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE),$id]);
            $db->prepare("UPDATE rubizh_order_shipments SET status=?,tracking_number=?,np_document_ref=?,result_json=?,error='',checked_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$state,$state==='created'?$number:null,$result['Ref']??'',json_encode($result,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE),$id]);
            shopOrderAudit($db,$order,$actor,'shipment.resolve_unknown',['shipment_id'=>$id,'status'=>$s['status']],['status'=>$state,'tracking_number'=>$number,'choice'=>$choice,'evidence'=>$choice==='not_created'?$freshScan['evidence']:($s['reconciliation_evidence']??null)],$reason);
            npAudit($db,$actor,'shipment_unknown_resolved',$order,$id,$reason);npAggregateOrder($db,$order);$db->commit();
        }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
    });
}
function npReconcile(PDO $db,int $order,int $id,string $actor): bool {
    shopShipmentActor($actor);
    return npLocked($db,$order,function()use($db,$order,$id,$actor){
      $q=$db->prepare('SELECT * FROM rubizh_order_shipments WHERE id=? AND order_id=?');$q->execute([$id,$order]);$s=$q->fetch(PDO::FETCH_ASSOC);if(!$s)throw new RuntimeException('Посилку не знайдено.');if(!empty($s['tracking_number']))return true;
      if(!in_array($s['status'],['unknown','creating'],true))throw new RuntimeException('Цій посилці звірка не потрібна.');
      $scan=npDocumentReconciliation($s);$matches=$scan['matches'];$complete=$scan['complete'];
      $db->prepare('UPDATE rubizh_order_shipments SET reconciliation_zero_at=IF(?,UTC_TIMESTAMP(),NULL),reconciliation_matches=?,reconciliation_evidence=? WHERE id=?')->execute([$complete&&count($matches)===0?1:0,$complete?count($matches):null,json_encode($scan['evidence'],JSON_THROW_ON_ERROR),$id]);
      if(!$complete||count($matches)!==1||!npRef($matches[0]['Ref']??'')||!preg_match('/^[0-9]{14}$/D',(string)($matches[0]['IntDocNumber']??''))){$db->prepare("UPDATE rubizh_order_shipments SET status='unknown',error='Немає однозначного збігу у НП. Повтор заблоковано.',checked_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$id]);npAudit($db,$actor,'shipment_reconcile_manual',$order,$id);return false;}
      $r=$matches[0];$db->prepare("UPDATE rubizh_order_shipments SET status='created',np_document_ref=?,tracking_number=?,result_json=?,error='',checked_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$r['Ref'],$r['IntDocNumber'],json_encode($r,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR),$id]);npAggregateOrder($db,$order);npAudit($db,$actor,'shipment_reconciled',$order,$id,$r['IntDocNumber']);return true;
    });
}
function npCancelDraft(PDO $db,int $order,int $id,string $actor): void {
    shopShipmentActor($actor);
    npLocked($db,$order,function()use($db,$order,$id,$actor){
      // 5.6-2: a manually entered TTN (no NP movement yet) can be withdrawn when it was mistyped; the number stays in the audit.
      $m=$db->prepare("SELECT tracking_number,origin_json FROM rubizh_order_shipments WHERE order_id=? AND id=? AND status='created' AND tracking_number IS NOT NULL");$m->execute([$order,$id]);$manual=$m->fetch(PDO::FETCH_ASSOC);
      if($manual&&(json_decode((string)$manual['origin_json'],true)['source']??'')==='manual'){
        $w=$db->prepare("UPDATE rubizh_order_shipments SET status='cancelled',tracking_number=NULL,updated_at=UTC_TIMESTAMP() WHERE order_id=? AND id=? AND status='created'");$w->execute([$order,$id]);
        if(!$w->rowCount())throw new RuntimeException('Статус посилки змінився — оновіть сторінку.');
        npAudit($db,$actor,'shipment_manual_ttn_withdrawn',$order,$id,(string)$manual['tracking_number']);npAggregateOrder($db,$order);return;
      }
      $q=$db->prepare("UPDATE rubizh_order_shipments SET status='cancelled',updated_at=UTC_TIMESTAMP() WHERE order_id=? AND id=? AND status IN ('draft','error') AND tracking_number IS NULL");$q->execute([$order,$id]);if(!$q->rowCount())throw new RuntimeException('Можна скасувати лише чернетку або явно відхилений запит. Невідомий результат потребує звірки.');npAudit($db,$actor,'shipment_draft_cancelled',$order,$id);});
}
function npTrackingState(string $code): string {
    return match($code){'1'=>'created','2'=>'cancelled','3'=>'manual','4','5','6','7','8','41','101','104','111','112','12'=>'sent','9','10','11','106'=>'delivered','102','103','108'=>'returned',default=>'manual'};
}
function npTrackingTransition(string $before,string $observed): string {
    // Only the linear progress path has an order. Terminal branches remain sticky.
    if(in_array($before,['cancelled','returned','delivered'],true))return $before;
    if($before==='sent'&&$observed==='cancelled')return 'manual';
    if($before==='manual'&&in_array($observed,['created','cancelled','manual'],true))return 'manual';
    $progress=['created'=>0,'sent'=>1,'delivered'=>2];
    if(isset($progress[$before])&&isset($progress[$observed])&&$progress[$observed]<$progress[$before])return $before;
    if($observed==='manual'&&in_array($before,['created','sent'],true))return $before;
    return $observed;
}
function npDeliveryMailEvent(string $code): string {return match($code){'4','5','6','41'=>'shipped','7','8'=>'arrived','9','10','11'=>'received',default=>''};}
function npRefresh(PDO $db,int $order,string $actor): void {
    shopShipmentActor($actor);
    npLocked($db,$order,function()use($db,$order,$actor){$o=npOrder($db,$order);$ships=npShipments($db,$order);$to=[];
      foreach($ships as $s)if(!empty($s['tracking_number'])&&(!in_array($s['status'],['delivered','cancelled','returned'],true))&&($s['checked_at']===null||strtotime($s['checked_at'].' UTC')<time()-900))$to[]=['DocumentNumber'=>$s['tracking_number'],'Phone'=>preg_replace('/\D/','',$o['contact']['phone']??'')];
      $db->beginTransaction();try{
      if($to){$rows=npApiCall('TrackingDocument','getStatusDocuments',['Documents'=>$to]);$allowed=array_column($to,'DocumentNumber');$seen=[];foreach($rows as $r){$number=(string)($r['Number']??'');if(!in_array($number,$allowed,true))continue;$seen[$number]=true;$db->prepare("UPDATE rubizh_order_shipments SET status=?,error='',checked_at=UTC_TIMESTAMP(),updated_at=UTC_TIMESTAMP() WHERE order_id=? AND tracking_number=?")->execute([npTrackingTransition((string)array_column($ships,'status','tracking_number')[$number],npTrackingState((string)($r['StatusCode']??''))),$order,$number]);$code=(string)($r['StatusCode']??'');if($code==='2'){npAudit($db,$actor,'shipment_np_deleted',$order,(int)array_column($ships,'id','tracking_number')[$number],$number);supplierQueueNpCancellation($db,$order,(int)array_column($ships,'id','tracking_number')[$number]);}$mailEvent=npDeliveryMailEvent($code);if($mailEvent!=='')shopQueueBuyerMail($db,$order,$mailEvent,$number);if(function_exists('shopTimelineEvent')){$time=gmdate('Y-m-d H:i:s');$detail=['tracking'=>$number,'address'=>(string)($r['WarehouseRecipient']??$o['delivery_label']),'storage_until'=>(string)($r['DateFreeStorage']??''),'observed'=>true];if(in_array($code,['4','5','6','7','8','9','10','11','41'],true)){shopTimelineEvent($db,$order,'sent',$number,$time,$detail);}if(in_array($code,['7','8'],true)){shopTimelineEvent($db,$order,'arrived',$number,$time,$detail);}if(in_array($code,['9','10','11'],true)){shopTimelineEvent($db,$order,'received',$number,$time,$detail);}if(in_array($code,['102','103','108'],true))shopTimelineEvent($db,$order,'returned',$number,$time,$detail);}}}
      // 5.6 review: a TTN NP did not answer for (another cabinet without the phone, a mistyped manual TTN) is marked, not silently skipped;
      // checked_at stays old, so the 6 h stalled-queue alert reaches the OWNER.
      if($to)foreach(array_diff(array_column($to,'DocumentNumber'),array_keys($seen)) as $missing)$db->prepare("UPDATE rubizh_order_shipments SET error='Нова пошта не повернула статус цієї ТТН — перевірте номер.',updated_at=UTC_TIMESTAMP() WHERE order_id=? AND tracking_number=?")->execute([$order,$missing]);
      npAggregateOrder($db,$order);npAudit($db,$actor,'tracking_refresh',$order);$db->commit();
      }catch(Throwable $e){if($db->inTransaction())$db->rollBack();throw $e;}
    });
}
function npAggregateOrder(PDO $db,int $order): void {
    $o=npOrder($db,$order);if(in_array($o['status'],['cancelled','returned','completed'],true))return;
    $allShips=npShipments($db,$order);if(!$allShips)return;$ships=array_values(array_filter($allShips,fn($s)=>$s['status']!=='cancelled'));if(!$ships){$db->prepare("UPDATE rubizh_customer_orders SET status='confirmed',pim_fulfillment_state=IF(pim_contract_version=3,'READY_TO_SHIP',pim_fulfillment_state),updated_at=UTC_TIMESTAMP() WHERE id=?")->execute([$order]);npAudit($db,str_repeat('0',32),'shipment_none_live',$order);return;}
    $remaining=npRemaining(npLines($db,$order),$ships);$covered=true;foreach($remaining as $r)if($r['qty']>0.00001)$covered=false;
    $states=array_column($ships,'status');$returned=count(array_filter($states,fn($s)=>$s==='returned'));$moving=count(array_filter($states,fn($s)=>in_array($s,['sent','delivered'],true)));$status=null;
    if($returned===count($ships))$status='returned';elseif($returned>0)$status='partially_returned';
    elseif($covered&&count(array_filter($states,fn($s)=>$s==='delivered'))===count($ships))$status='delivered';
    elseif($covered&&$moving===count($ships))$status='shipped';elseif($moving>0)$status='partially_shipped';
    if($status){
        $own=$status==='returned'&&!$db->inTransaction();if($own)$db->beginTransaction();
        try{$db->prepare('UPDATE rubizh_customer_orders SET status=?,updated_at=UTC_TIMESTAMP() WHERE id=?')->execute([$status,$order]);
            if($status==='returned')shopReservationTransition($db,$order,'RELEASED','SYSTEM');
            if($own)$db->commit();
        }catch(Throwable $e){if($own&&$db->inTransaction())$db->rollBack();throw $e;}
    }
    // PIM v3 orders keep fulfillment separate from order/payment state.
    if(!empty($GLOBALS['rubizh_pim_v3_columns'])&&(int)($o['pim_contract_version']??0)===3){
        $delivered=count(array_filter($states,fn($s)=>$s==='delivered'));$ttn=count(array_filter($ships,fn($s)=>trim((string)($s['tracking_number']??''))!==''));
        $f=$returned>0?'NOT_READY':($covered&&$delivered===count($ships)?'DELIVERED':($moving>0?'IN_TRANSIT':($ttn>0?'TTN_CREATED':null)));
        if($f!==null)$db->prepare('UPDATE rubizh_customer_orders SET pim_fulfillment_state=?,pim_order_state=IF(?=\'DELIVERED\' AND payment_status=\'paid\' AND pim_order_state=\'CONFIRMED\',\'COMPLETED\',pim_order_state) WHERE id=?')->execute([$f,$f,$order]);
    }
}
