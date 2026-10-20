<?php
declare(strict_types=1);
// CRM cron job (shop/automation-worker.sh → every 60 s, flock + DB lock): payment review sync (CRM-4.1), auto-tasks,
// notification producers, critical e-mail to OWNER (adapter, mock/off by flag) and a stalled-queue alarm.
// Every producer is idempotent through dedupe keys / auto_key, so a repeated or overlapping run changes nothing.
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
define('RUBIZH_AUTH_NO_SESSION',true);
require_once dirname(__DIR__).'/auth/bootstrap.php';require_once __DIR__.'/bootstrap.php';

function crmWorkerRun(PDO $db): array {
 if(!crmApiSchemaReady($db))return ['skipped'=>'schema'];
 $lock=$db->query("SELECT GET_LOCK('rubizh-crm-worker',0)")->fetchColumn();if((int)$lock!==1)return ['skipped'=>'locked'];
 $done=[];
 try{
  $s=crmSettingsValues($db);
  crmSyncReviews($db);$done[]='reviews';
  // Auto-tasks (ТЗ 7.10): order waiting for confirmation longer than N minutes; paid order without TTN longer than N hours.
  foreach(crmQuery($db,"SELECT o.id,o.order_number,a.staff_id FROM rubizh_customer_orders o LEFT JOIN rubizh_order_assignments a ON a.order_id=o.id WHERE (o.status='new' OR o.pim_order_state='WAITING_CONFIRMATION') AND o.created_at<UTC_TIMESTAMP()-INTERVAL ? MINUTE AND o.created_at>UTC_TIMESTAMP()-INTERVAL 30 DAY LIMIT 200",[$s['auto_task_unconfirmed_minutes']]) as $o)
   $db->prepare("INSERT IGNORE INTO rubizh_crm_tasks(title,body,order_id,assignee_id,state,due_at,auto_key,created_by,created_at,updated_at) VALUES(?,?,?,?,'OPEN',UTC_TIMESTAMP(),?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())")->execute(['Підтвердити замовлення '.$o['order_number'],'Замовлення чекає підтвердження довше встановленого строку.',$o['id'],$o['staff_id'],'confirm:'.$o['id'],str_repeat('0',32)]);
  foreach(crmQuery($db,"SELECT o.id,o.order_number,a.staff_id,t.paid_at FROM rubizh_customer_orders o JOIN rubizh_order_timing t ON t.order_id=o.id LEFT JOIN rubizh_order_assignments a ON a.order_id=o.id WHERE o.payment_status='paid' AND o.status IN ('confirmed','processing') AND t.paid_at<UTC_TIMESTAMP()-INTERVAL ? HOUR AND t.paid_at>UTC_TIMESTAMP()-INTERVAL 30 DAY AND NOT EXISTS(SELECT 1 FROM rubizh_order_shipments s WHERE s.order_id=o.id AND s.tracking_number IS NOT NULL AND s.status<>'cancelled') LIMIT 200",[$s['auto_task_no_ttn_hours']]) as $o)
   $db->prepare("INSERT IGNORE INTO rubizh_crm_tasks(title,body,order_id,assignee_id,state,due_at,auto_key,created_by,created_at,updated_at) VALUES(?,?,?,?,'OPEN',UTC_TIMESTAMP(),?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())")->execute(['Створити ТТН для '.$o['order_number'],'Оплачене замовлення без ТТН довше встановленого строку.',$o['id'],$o['staff_id'],'ttn:'.$o['id'],str_repeat('0',32)]);
  // Close auto-tasks whose condition is gone.
  $db->exec("UPDATE rubizh_crm_tasks t JOIN rubizh_customer_orders o ON o.id=t.order_id SET t.state='DONE',t.version=t.version+1,t.updated_at=UTC_TIMESTAMP() WHERE t.auto_key LIKE 'confirm:%' AND t.state IN ('OPEN','IN_PROGRESS') AND o.status<>'new' AND COALESCE(o.pim_order_state,'')<>'WAITING_CONFIRMATION'");
  $db->exec("UPDATE rubizh_crm_tasks t SET t.state='DONE',t.version=t.version+1,t.updated_at=UTC_TIMESTAMP() WHERE t.auto_key LIKE 'ttn:%' AND t.state IN ('OPEN','IN_PROGRESS') AND EXISTS(SELECT 1 FROM rubizh_order_shipments s WHERE s.order_id=t.order_id AND s.tracking_number IS NOT NULL AND s.status<>'cancelled')");
  $done[]='tasks';
  // Notifications (ТЗ 7.14), last 2 days only so a first run on old data does not flood the bell.
  foreach(crmQuery($db,"SELECT id,order_number,status,pim_order_state FROM rubizh_customer_orders WHERE created_at>UTC_TIMESTAMP()-INTERVAL 2 DAY") as $o){
   crmNotify($db,'role:MANAGER','new_order','order',(string)$o['id'],'Нове замовлення '.$o['order_number'],false,'new:'.$o['id']);crmNotify($db,'role:OWNER','new_order','order',(string)$o['id'],'Нове замовлення '.$o['order_number'],false,'new-owner:'.$o['id']);
   if($o['status']==='new'||$o['pim_order_state']==='WAITING_CONFIRMATION')crmNotify($db,'role:MANAGER','confirmation_waiting','order',(string)$o['id'],'Замовлення '.$o['order_number'].' чекає підтвердження',false,'wait:'.$o['id']);
  }
  foreach(crmQuery($db,"SELECT o.id,o.order_number FROM rubizh_order_timing t JOIN rubizh_customer_orders o ON o.id=t.order_id WHERE t.paid_at>UTC_TIMESTAMP()-INTERVAL 2 DAY") as $o)foreach(['MANAGER','OWNER','ACCOUNTANT'] as $r)crmNotify($db,'role:'.$r,'payment_received','order',(string)$o['id'],'Оплату отримано: '.$o['order_number'],false,'paid:'.$r.':'.$o['id']);
  foreach(crmQuery($db,"SELECT o.id,o.order_number,i.id iid FROM rubizh_mono_invoices i JOIN rubizh_customer_orders o ON o.id=i.order_id WHERE i.status IN ('failure','expired') AND i.updated_at>UTC_TIMESTAMP()-INTERVAL 2 DAY") as $o)crmNotify($db,'role:MANAGER','payment_failed','order',(string)$o['id'],'Оплата не пройшла: '.$o['order_number'],false,'failed:'.$o['iid']);
  foreach(crmQuery($db,"SELECT s.id,s.order_id,o.order_number FROM rubizh_order_shipments s JOIN rubizh_customer_orders o ON o.id=s.order_id WHERE (s.status='created' AND s.updated_at<UTC_TIMESTAMP()-INTERVAL 48 HOUR) OR (s.status='sent' AND s.updated_at<UTC_TIMESTAMP()-INTERVAL 7 DAY) LIMIT 200") as $p){crmNotify($db,'role:MANAGER','delivery_delay','order',(string)$p['order_id'],'Затримка посилки: '.$p['order_number'],false,'delay:'.$p['id'].':'.gmdate('Ymd'));crmNotify($db,'role:WAREHOUSE','delivery_delay','order',(string)$p['order_id'],'Затримка посилки: '.$p['order_number'],false,'delay-w:'.$p['id'].':'.gmdate('Ymd'));}
  foreach(crmQuery($db,"SELECT r.id,r.order_id,o.order_number FROM rubizh_returns r JOIN rubizh_customer_orders o ON o.id=r.order_id WHERE r.state='REQUESTED'") as $r)foreach(['OWNER','MANAGER'] as $role)crmNotify($db,'role:'.$role,'return_request','return',(string)$r['id'],'Запит повернення: '.$r['order_number'],false,'return:'.$role.':'.$r['id']);
  foreach(crmQuery($db,"SELECT o.id,o.order_number FROM rubizh_customer_orders o JOIN rubizh_order_details d ON d.order_id=o.id JOIN rubizh_order_timing t ON t.order_id=o.id WHERE JSON_UNQUOTE(JSON_EXTRACT(d.contact_json,'$.payment'))='invoice' AND o.payment_status NOT IN ('paid','refunded') AND o.status IN ('confirmed','processing') AND t.payment_due<=UTC_TIMESTAMP()") as $o)foreach(['OWNER','ACCOUNTANT'] as $r)crmNotify($db,'role:'.$r,'invoice_reconcile','order',(string)$o['id'],'Потребує звірки виписки: '.$o['order_number'],true,'invoice-due:'.$r.':'.$o['id']);
  foreach(crmQuery($db,"SELECT id,title,assignee_id FROM rubizh_crm_tasks WHERE state IN ('OPEN','IN_PROGRESS') AND due_at<UTC_TIMESTAMP() AND assignee_id IS NOT NULL AND due_at>UTC_TIMESTAMP()-INTERVAL 7 DAY") as $t)crmNotify($db,'staff:'.$t['assignee_id'],'task_overdue','task',(string)$t['id'],'Прострочене завдання: '.mb_substr($t['title'],0,120),false,'overdue:'.$t['id']);
  $done[]='notifications';
  // Stalled queues: shipments not tracked for 6 h or bank attempts unresolved for 6 h → critical OWNER alert once a day.
  $stalled=(int)crmOne($db,"SELECT COUNT(*) n FROM rubizh_order_shipments WHERE tracking_number IS NOT NULL AND status IN ('created','sent') AND COALESCE(checked_at,created_at)<UTC_TIMESTAMP()-INTERVAL 6 HOUR")['n']+(int)crmOne($db,"SELECT COUNT(*) n FROM rubizh_mono_invoices WHERE status IN ('creating','unknown') AND created_at<UTC_TIMESTAMP()-INTERVAL 6 HOUR")['n']
   // 5.6 review: a bank status check that keeps failing leaves invoices in created/processing/hold/awaiting_webhook or a refund in processing.
   +(int)crmOne($db,"SELECT COUNT(*) n FROM rubizh_mono_invoices WHERE invoice_id IS NOT NULL AND (status IN ('created','processing','hold','awaiting_webhook') OR refund_status IN ('processing','unknown')) AND updated_at<UTC_TIMESTAMP()-INTERVAL 6 HOUR")['n'];
  if($stalled>0)crmNotify($db,'role:OWNER','worker_alert','system','queues','Черги оплат або доставки не оновлюються: '.$stalled,true,'stalled:'.gmdate('Ymd'));
  // Critical e-mail to OWNER (CRM_EMAIL_LIVE; mock outbox on staging; off → shown in CRM only).
  $owners=crmQuery($db,"SELECT email FROM rubizh_staff_users WHERE role='OWNER' AND enabled=1");
  foreach(crmQuery($db,"SELECT id,title FROM rubizh_crm_notifications WHERE critical=1 AND mailed_at IS NULL AND audience IN ('role:OWNER','role:ALL') ORDER BY id LIMIT 20") as $n){
   foreach($owners as $o)crmAdapterSend('email',['to'=>$o['email'],'template'=>'owner_alert','text'=>'CRM РУБІЖ: '.$n['title']]);
   $db->prepare('UPDATE rubizh_crm_notifications SET mailed_at=UTC_TIMESTAMP() WHERE id=?')->execute([$n['id']]);
  }
  $done[]='alerts';
  $db->exec("DELETE FROM rubizh_crm_idempotency WHERE created_at<UTC_TIMESTAMP()-INTERVAL 7 DAY");
  $db->exec("INSERT INTO rubizh_crm_cron_runs(job,last_ok_at,failures) VALUES('crm',UTC_TIMESTAMP(),0) ON DUPLICATE KEY UPDATE last_ok_at=VALUES(last_ok_at),failures=0");
 }catch(Throwable $e){
  $db->exec("INSERT INTO rubizh_crm_cron_runs(job,last_error_at,failures) VALUES('crm',UTC_TIMESTAMP(),1) ON DUPLICATE KEY UPDATE last_error_at=VALUES(last_error_at),failures=failures+1");
  $f=(int)crmOne($db,"SELECT failures FROM rubizh_crm_cron_runs WHERE job='crm'")['failures'];
  if($f>=3)crmNotify($db,'role:OWNER','worker_alert','system','crm','Фонова обробка CRM повторно не вдалася ('.$f.' разів поспіль)',true,'crm-fail:'.gmdate('YmdH'));
  throw $e;
 }finally{$db->query("SELECT RELEASE_LOCK('rubizh-crm-worker')");}
 return ['done'=>$done];
}
if(realpath($_SERVER['SCRIPT_FILENAME']??'')===__FILE__){
 try{$db=shopStoreDatabase();$r=crmWorkerRun($db);echo json_encode($r,JSON_UNESCAPED_UNICODE),"\n";}
 catch(Throwable $e){fwrite(STDERR,'CRM worker failed: '.get_class($e)."\n");exit(1);}
}
