<?php
declare(strict_types=1);
require_once __DIR__.'/customer-states.php';
function shopUiMigrate(PDO $db): void {if(function_exists('rubizhSchemaPrepared')&&rubizhSchemaPrepared($db))return;
 static $ready=false;if($ready)return;
 $db->exec("CREATE TABLE IF NOT EXISTS rubizh_customer_preferences(customer_id CHAR(32) PRIMARY KEY,theme VARCHAR(12) NOT NULL DEFAULT 'system',donation_channel VARCHAR(12) NOT NULL DEFAULT 'viber',donation_phone VARCHAR(20) NOT NULL DEFAULT '',updated_at DATETIME NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
 $db->exec("CREATE TABLE IF NOT EXISTS rubizh_order_timeline(order_id BIGINT UNSIGNED NOT NULL,event VARCHAR(24) NOT NULL,event_key VARCHAR(80) NOT NULL,occurred_at DATETIME NOT NULL,detail_json TEXT NOT NULL,PRIMARY KEY(order_id,event,event_key),INDEX(order_id,occurred_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");$ready=true;
}
function shopPreferences(PDO $db,string $id): array {$q=$db->prepare('SELECT theme,donation_channel,donation_phone FROM rubizh_customer_preferences WHERE customer_id=?');$q->execute([$id]);return $q->fetch(PDO::FETCH_ASSOC)?:['theme'=>'system','donation_channel'=>'viber','donation_phone'=>''];}
function shopSavePreferences(PDO $db,string $id,array $input): void {
 $p=shopPreferences($db,$id);foreach(['theme','donation_channel','donation_phone'] as $key)if(isset($input[$key])&&is_string($input[$key]))$p[$key]=trim($input[$key]);if(!in_array($p['theme'],['light','dark','system'],true)||!in_array($p['donation_channel'],['viber','telegram'],true))throw new RuntimeException('Перевірте тему та месенджер.');
 $phone=preg_replace('/\D/','',$p['donation_phone']);if(preg_match('/^0\d{9}$/D',$phone))$phone='38'.$phone;if($phone!==''&&!preg_match('/^380\d{9}$/D',$phone))throw new RuntimeException('Перевірте телефон для скріна донату.');
 $db->prepare('INSERT INTO rubizh_customer_preferences(customer_id,theme,donation_channel,donation_phone,updated_at) VALUES(?,?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE theme=VALUES(theme),donation_channel=VALUES(donation_channel),donation_phone=VALUES(donation_phone),updated_at=VALUES(updated_at)')->execute([$id,$p['theme'],$p['donation_channel'],$phone===''?'':'+'.$phone]);
 setcookie('rubizh_theme',$p['theme'],['expires'=>time()+31536000,'path'=>'/','secure'=>rubizhCookieSecure(),'httponly'=>false,'samesite'=>'Lax']);
}
function shopTimelineEvent(PDO $db,int $id,string $event,string $key,string $time,array $detail=[]): void {$db->prepare('INSERT IGNORE INTO rubizh_order_timeline(order_id,event,event_key,occurred_at,detail_json) VALUES(?,?,?,?,?)')->execute([$id,$event,$key,$time,json_encode($detail,JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR)]);}
function shopTimeline(PDO $db,array $o): array {
 $id=(int)$o['id'];shopTimelineEvent($db,$id,'created','order',$o['created_at']);$q=$db->prepare('SELECT paid_at FROM rubizh_order_timing WHERE order_id=?');$q->execute([$id]);$paid=$q->fetchColumn();if($paid)shopTimelineEvent($db,$id,'paid','payment',(string)$paid,['method'=>$o['contact']['payment']??'']);
 $q=$db->prepare('SELECT action,created_at,note FROM rubizh_np_audit WHERE order_id=? AND action IN (\'order_confirmed\',\'customer_cancelled\',\'staff_cancelled\') ORDER BY id');$q->execute([$id]);foreach($q->fetchAll(PDO::FETCH_ASSOC) as $r)shopTimelineEvent($db,$id,$r['action']==='order_confirmed'?'preparing':'cancelled',$r['action'],$r['created_at']);
 if(in_array($o['status'],['cancelled','returned','completed','delivered'],true))shopTimelineEvent($db,$id,in_array($o['status'],['completed','delivered'],true)?'received':$o['status'],'order',$o['updated_at']);
 $q=$db->prepare('SELECT * FROM rubizh_order_timeline WHERE order_id=? ORDER BY occurred_at');$q->execute([$id]);return $q->fetchAll(PDO::FETCH_ASSOC);
}
function shopCustomerStatus(array $o): array {
 if(in_array($o['status'],['cancelled','returned','partially_returned'],true)||$o['payment_status']==='refunded')return ['label'=>$o['payment_status']==='refunded'||$o['status']!=='cancelled'?'Повернено':'Скасовано','tone'=>'danger'];
 if(in_array($o['status'],['delivered','completed'],true))return ['label'=>'Отримано','tone'=>'success'];
 if(in_array($o['status'],['shipped','partially_shipped'],true))return ['label'=>'Відправлено','tone'=>'info'];
 if(($o['status']??'')==='new'&&in_array($o['payment_status'],['pending','failed'],true))return ['label'=>'Очікує підтвердження менеджера','tone'=>'waiting'];
 if(in_array($o['payment_status'],['pending','failed'],true))return ['label'=>'Очікує оплати','tone'=>'waiting'];
 if(in_array($o['status'],['confirmed','processing'],true))return ['label'=>'Готуємо','tone'=>'neutral'];
 return ['label'=>$o['payment_status']==='paid'?'Оплачено':'Нове','tone'=>$o['payment_status']==='paid'?'success':'neutral'];
}
function shopHistoryStatus(array $o): bool {return in_array($o['status'],['cancelled','returned','partially_returned','delivered','completed'],true)||$o['payment_status']==='refunded';}
function shopTimelineCurrent(array $o): string {
 if($o['payment_status']==='refunded'||in_array($o['status'],['returned','partially_returned'],true))return 'returned';
 if($o['status']==='cancelled')return 'cancelled';
 if(in_array($o['status'],['delivered','completed'],true))return 'received';
 $events=[];foreach($o['timeline']??[] as $e)$events[$e['event']][$e['event_key']??'']=true;
 $shipments=array_values(array_filter($o['shipments']??[],fn($s)=>!empty($s['tracking_number'])&&!in_array($s['status'],['cancelled','returned'],true)));
 if($shipments){$allArrived=true;foreach($shipments as $s)if(($s['status']??'')!=='delivered'&&empty($events['arrived'][$s['tracking_number']]))$allArrived=false;if($allArrived)return 'arrived';}
 if(in_array($o['status'],['shipped','partially_shipped'],true))return 'sent';
 if(in_array($o['status'],['confirmed','processing'],true))return 'preparing';
 return $o['payment_status']==='paid'?'paid':'created';
}
function shopOrderUiVersion(array $o): string {
 $ships=array_map(fn($s)=>[(string)($s['tracking_number']??''),(string)($s['status']??'')],array_filter($o['shipments']??[],fn($s)=>!empty($s['tracking_number'])));sort($ships);
 $events=array_map(fn($e)=>[(string)$e['event'],(string)($e['event_key']??''),(string)$e['occurred_at'],(string)$e['detail_json']],$o['timeline']??[]);sort($events);
 return hash('sha256',json_encode([$o['status'],$o['payment_status'],$events,$ships,$o['donation']??null],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR));
}
function shopOrderThumbs(PDO $db,array $orders): array {
 $ids=[];foreach($orders as $o)foreach(json_decode($o['items_json'],true)?:[] as $l)if(!empty($l['product_id']))$ids[]=$l['product_id'];$ids=array_slice(array_unique($ids),0,500);return $ids?product_photos($db,$ids):[];
}
