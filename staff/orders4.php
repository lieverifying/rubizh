<?php
declare(strict_types=1);
// Stage 4 handlers: orders, payments, shipments, returns. Business logic stays in SITE (shop/*, A2); this layer adds
// the CRM rules: MANAGER order scope, expected version, reason, audit, feature switches and role-shaped responses.

function crmHandle(PDO $db,?array $actor,array $route,array $p,array $b,array $q,?string $key): mixed {
 $id=isset($p['id'])?(int)$p['id']:0;$line=isset($p['line'])?(int)$p['line']:0;
 return match($route['id']){
  'auth.login'=>crmLogin($db,['csrf'=>$_SESSION['staff_csrf']??'']+$b),
  'auth.logout'=>crmLogout($db,$actor),
  'auth.reauth'=>crmReauth($db,$actor,$b),
  'auth.totp.setup'=>crmTotpSetup($db,$actor),
  'auth.totp.enable'=>crmTotpEnable($db,$actor,$b['code']),
  'auth.token.accept'=>crmTokenAccept($db,$b['token'],$b['password']),
  'me.view'=>$actor,
  'me.preferences'=>crmPreferences($db,$actor,$b),
  'me.password'=>crmPasswordChange($db,$actor,$b),
  'me.sessions'=>crmSessionsList($db,$actor['id']),
  'me.sessions.revoke'=>crmRevokeOthers($db,$actor),
  'dashboard'=>crmDashboard4($db,$actor,$q),
  'orders.list'=>crmOrders($db,$q,$actor),
  'orders.counters'=>crmCounters($db,$actor),
  'orders.export'=>crmExportOrders($db,$actor,$q),
  'orders.create'=>crmPhoneOrder($db,$actor,$b,$key),
  'orders.bulk.assign'=>crmBulkAssign($db,$actor,$b),
  'orders.view'=>crmOrderCard($db,$id,$actor),
  'orders.invoice.pdf'=>crmInvoicePdf($db,$id,$actor),
  'orders.assign'=>crmAssign4($db,$actor,$id,$b),
  'orders.confirm','orders.resolve_item'=>crmConfirm4($db,$actor,$id,$b),
  'orders.line.stock'=>crmMutate($db,$actor,$id,$b,'order.line_stock',fn()=>shopConfirmLineStock($db,$id,$line,$actor['id'],$b['status'],(string)($b['note']??'')),true,(string)($b['note']??'')),
  'orders.line.replace'=>crmMutate($db,$actor,$id,$b,'order.line_replace',fn()=>shopReplaceLine($db,$id,$line,$actor['id'],$b['sku'],$b['reason'],$b['expected_total_minor']??null),true,$b['reason']),
  'orders.line.remove'=>crmMutate($db,$actor,$id,$b,'order.line_remove',fn()=>shopRemoveLine($db,$id,$line,$actor['id'],$b['reason']),true,$b['reason']),
  'orders.line.supplier'=>crmMutate($db,$actor,$id,$b,'order.line_supplier',fn()=>shopAssignLineSupplier($db,$id,$line,$actor['id'],$b['supplier_code'],$b['reason']),true,$b['reason']),
  'orders.invoice'=>crmMutate($db,$actor,$id,$b,'order.invoice',function($old)use($db,$id,$actor){if($old['order_status']!=='CONFIRMED')throw new CrmError('CONFIRMATION_REQUIRED',409);return ['invoice'=>monoCreate($db,$id,$actor['id'])];}),
  'orders.cancel'=>crmMutate($db,$actor,$id,$b,'order.cancel',function()use($db,$id,$actor,$b){shopCancelBlocker($db,$id,true);monoCloseOpenInvoice($db,$id,$actor['id']);shopCancelOrder($db,$id,false,$actor['id'],$b['reason']);},true,$b['reason']), // S4-03
  'orders.problem'=>crmMutate($db,$actor,$id,$b,'order.problem',fn()=>crmSetProblem($db,$actor,$id,$b['flag'],$b['reason']),false,$b['reason']),
  'orders.packing'=>crmMutate($db,$actor,$id,$b,'order.packing',fn()=>shopTransferToPacking($db,$id,$actor['id'])),
  'orders.complete'=>crmMutate($db,$actor,$id,$b,'order.complete',fn()=>shopCompleteOrder($db,$id,$actor['id'])),
  'orders.delivery'=>crmMutate($db,$actor,$id,$b,'order.delivery_update',fn()=>shopUpdateDelivery($db,$id,$actor['id'],$b['delivery'],$b['recipient']??null,$b['phone']??null,$b['reason']),true,$b['reason']),
  'orders.note'=>crmNote($db,$actor,'order',(string)$id,$b+['request_id'=>$key]),
  'orders.shipment.draft'=>crmOrderCardExtras($db,crmShipmentAction($db,$id,$actor,['version'=>$b['expected_version'],'request_id'=>$key]+$b,'draft'),$actor), // S4-01: the full card
  'orders.shipment.manual'=>crmOrderCardExtras($db,crmShipmentAction($db,$id,$actor,['version'=>$b['expected_version'],'request_id'=>$key]+$b,'manual'),$actor), // 5.6-2 (D-83)
  'orders.invoice.accept'=>crmMutate($db,$actor,$id,$b,'payment.invoice.accept',fn()=>shopAcceptInvoicePayment($db,$id,$actor['id'],$b['amount_minor'],$b['paid_on'],$b['document'],$b['reason']),false,$b['reason']),
  'orders.reconcile.not_created'=>crmMutate($db,$actor,$id,$b,'payment.reconcile_not_created',fn()=>monoReconcileNotCreated($db,$id,$actor['id'],$b['reason']),false,$b['reason']),
  'orders.reconcile.manual'=>crmMutate($db,$actor,$id,$b,'payment.manual_reconcile',fn()=>monoReconcile($db,$id,$b['invoice_id'],$actor['id'],$b['reason']),false,$b['reason']),
  'payments.list'=>crmPayments($db,$actor,$q),
  'payments.export'=>crmExportPayments($db,$actor,$q),
  'payments.review.list'=>crmReviews($db),
  'payments.review.check'=>crmReviewCheck($db,$actor,$p['rid']),
  'payments.review.resolve'=>crmReviewResolve($db,$actor,$p['rid'],$b['reason']),
  'payments.view'=>crmPaymentView($db,$actor,$id),
  'payments.refund'=>crmRefund4($db,$actor,$id,$b,$key),
  'shipments.list'=>crmShipmentsList($db,$actor,$q),
  'shipments.view'=>crmEntityView($db,$actor,'shipments',$id),
  'shipments.create','shipments.refresh','shipments.reconcile','shipments.cancel'=>crmShipment4($db,$actor,$id,$b,substr($route['id'],10)),
  'shipments.resolve'=>crmShipmentDomain($db,$actor,$id,$b,'shipment.resolve_unknown',fn($s)=>npResolveUnknown($db,(int)$s['order_id'],$id,$actor['id'],$b['choice'],(string)($b['number']??''),$b['reason'])),
  'shipments.deliver'=>crmShipmentDomain($db,$actor,$id,$b,'shipment.manual_deliver',fn($s)=>npManualDeliver($db,(int)$s['order_id'],$id,$actor['id'],$b['reason'])),
  'shipments.notify'=>crmShipmentNotify($db,$actor,$id),
  'shipments.note'=>crmNote($db,$actor,'shipment',(string)$id,$b+['request_id'=>$key]),
  'returns.list'=>crmReturnsList($db,$actor,$q),
  // S4-08: the answer is the same role view as the returns list (no refund money without refund.view).
  'returns.create'=>(fn($r)=>crmCan($actor,'refund.view')?$r:crmRedactReturn($r))(crmReturnCreate($db,$actor,['version'=>$b['expected_version'],'request_id'=>$key]+$b)),
  'returns.view'=>crmEntityView($db,$actor,'returns',$id),
  'returns.transition'=>crmReturnTransition4($db,$actor,$id,$b),
  'returns.note'=>crmNote($db,$actor,'return',(string)$id,$b+['request_id'=>$key]),
  default=>crmHandleMore($db,$actor,$route,$p,$b,$q,$key),
 };
}

function crmScopeWrite(array $order,array $actor): void {
 if($actor['role']==='MANAGER'&&$order['assigned_manager']!==null&&$order['assigned_manager']['id']!==$actor['id'])throw new CrmError('ORDER_NOT_ASSIGNED',403);
}
/** Lock → fresh read → expected version (409) → MANAGER scope → SITE domain call → audit with old/new version. */
function crmMutate(PDO $db,array $actor,int $id,array $b,string $action,callable $do,bool $scope=true,string $reason=''): array {
 crmOrder($db,$id,$actor);
 return npLocked($db,$id,function()use($db,$actor,$id,$b,$action,$do,$scope,$reason){
  // Business checks and the audit read the full order (S4-06): the role view (crmRedactOrder) is only for the response.
  $old=crmOrder($db,$id,[]);crmCheckVersion($old,['version'=>$b['expected_version']??null]);if($scope)crmScopeWrite($old,$actor);
  $result=$do($old);
  $after=crmOrder($db,$id,[]);$new=crmOrder($db,$id,$actor);
  crmAudit($db,$actor,'order',(string)$id,$action,['version'=>$old['version'],'display'=>$old['display']??null],['version'=>$after['version'],'display'=>$after['display']??null],$reason);
  if(is_array($result)&&isset($result['invoice']))$new['invoice']=$result['invoice'];
  return crmOrderCardExtras($db,$new,$actor);
 });
}

function crmOrderCard(PDO $db,int $id,array $actor): array {return crmOrderCardExtras($db,crmOrder($db,$id,$actor),$actor);}
/** History merges the customer timeline, SITE order audit and CRM staff audit (append-only sources). */
function crmOrderCardExtras(PDO $db,array $o,array $actor): array {
 $id=(int)$o['id'];$hist=[];
 foreach($o['timeline']??[] as $t)$hist[]=['at'=>$t['occurred_at'],'source'=>'timeline','action'=>$t['event'],'actor'=>null,'reason'=>'','detail'=>json_decode((string)$t['detail_json'],true)?:[]];
 foreach(crmQuery($db,'SELECT a.action,a.reason,a.actor_role,a.created_at,u.name FROM rubizh_order_audit a LEFT JOIN rubizh_staff_users u ON u.id=a.actor_id WHERE a.order_id=? ORDER BY a.id DESC LIMIT 100',[$id]) as $r)$hist[]=['at'=>$r['created_at'],'source'=>'site','action'=>$r['action'],'actor'=>$r['name']??($r['actor_role']==='SYSTEM'?'Система':null),'reason'=>crmCan($actor,'order.finance.view')||!str_starts_with($r['action'],'payment.')?$r['reason']:'','detail'=>[]];
 foreach(crmQuery($db,"SELECT s.action,s.reason,s.created_at,u.name FROM rubizh_staff_audit s LEFT JOIN rubizh_staff_users u ON u.id=s.actor_id WHERE s.entity='order' AND s.entity_id=? ORDER BY s.id DESC LIMIT 100",[(string)$id]) as $r)$hist[]=['at'=>$r['created_at'],'source'=>'crm','action'=>$r['action'],'actor'=>$r['name'],'reason'=>$r['reason'],'detail'=>[]];
 // History by role: MonoPay, invoice and refund events only with finance access; payment status events also need the amount view.
 if(!crmCan($actor,'order.finance.view')){$hide=crmCan($actor,'order.amount.view')?'/refund|invoice|mono|reconcil/i':'/pa(id|y)|refund|invoice|mono|reconcil/i';$hist=array_values(array_map(fn($h)=>['detail'=>[]]+$h,array_filter($hist,fn($h)=>!preg_match($hide,(string)$h['action']))));}
 usort($hist,fn($a,$b)=>strcmp($b['at'],$a['at']));$o['history']=array_slice($hist,0,150);
 $o['tasks']=crmQuery($db,'SELECT t.*,u.name assignee_name FROM rubizh_crm_tasks t LEFT JOIN rubizh_staff_users u ON u.id=t.assignee_id WHERE t.order_id=? ORDER BY t.state=\'DONE\',t.due_at IS NULL,t.due_at,t.id LIMIT 50',[$id]);
 foreach($o['tasks'] as &$t){$t['id']=(int)$t['id'];$t['order_id']=$t['order_id']===null?null:(int)$t['order_id'];$t['version']=(int)$t['version'];}unset($t);
 $o['notes']??=crmNotes($db,'order',(string)$id);
 $o['invoice_pdf']=crmInvoicePdfState($db,$id,$actor);
 return $o;
}
/** 5-3: whether the invoice PDF can be downloaded (null for roles without order.invoice.pdf). */
function crmInvoicePdfState(PDO $db,int $id,array $actor): ?array {
 if(!crmCan($actor,'order.invoice.pdf'))return null;require_once __DIR__.'/../shop/invoice-pdf.php';
 try{shopInvoiceData($db,$id,false);return ['available'=>true,'reason'=>null];}
 catch(ShopInvoiceUnavailable $e){$r=$e->getMessage();return ['available'=>false,'reason'=>$r,'message'=>crmInvoicePdfMessage($r,$actor)];}
 // The card must open even when one stored order cannot be turned into an invoice (review of stage 5).
 catch(Throwable $e){error_log('rubizh invoice state: '.get_class($e).' order '.$id);return ['available'=>false,'reason'=>'ERROR','message'=>'Рахунок тимчасово недоступний.'];}
}
function crmInvoicePdfMessage(string $reason,array $actor): string {
 return match($reason){'VAT_NOTE_MISSING'=>$actor['role']==='OWNER'?'Заповніть статус ПДВ у налаштуваннях':'Рахунок недоступний: власник ще не заповнив статус ПДВ у налаштуваннях.',
  'NOT_INVOICE'=>'Замовлення оплачується карткою — рахунок ФОП не потрібен.','NOT_READY'=>'Рахунок буде доступний після підтвердження замовлення.','CANCELLED'=>'Замовлення скасовано.',default=>'Рахунок недоступний.'};
}
/** GET /orders/{id}/invoice-pdf — the PDF itself; the order must be visible to the actor (crmOrder checks it). */
function crmInvoicePdf(PDO $db,int $id,array $actor): never {
 crmOrder($db,$id,$actor);require_once __DIR__.'/../shop/invoice-pdf.php';
 try{$data=shopInvoiceData($db,$id);$pdf=shopInvoicePdf($data);}
 catch(ShopInvoiceUnavailable $e){throw new CrmError($e->getMessage(),409,['message'=>crmInvoicePdfMessage($e->getMessage(),$actor)]);}
 crmAudit($db,$actor,'order',(string)$id,'order.invoice_pdf',[],['number'=>$data['number']]);
 header('Content-Type: application/pdf');header('Content-Disposition: attachment; filename="rakhunok-'.preg_replace('/[^A-Za-z0-9-]/','',$data['number']).'.pdf"');header('Content-Length: '.strlen($pdf));header('Cache-Control: private, no-store');header('X-Content-Type-Options: nosniff');
 http_response_code(200);echo $pdf;exit;
}

function crmAssign4(PDO $db,array $actor,int $id,array $b): array {
 $target=array_key_exists('staff_id',$b)?$b['staff_id']:$actor['id'];
 return crmMutate($db,$actor,$id,$b,'order.assign',function($old)use($db,$actor,$id,$b,$target){
  $current=$old['assigned_manager']['id']??null;
  if($target!==$actor['id'])crmPermit($actor,'order.assign.any');
  // Taking over or moving someone else's order is allowed with a reason; the previous manager sees it in history.
  if($current!==null&&$current!==$actor['id']&&$current!==$target||$current!==null&&$current!==$actor['id']&&$target===null){if(!is_string($b['reason']??null))throw new CrmError('REASON_REQUIRED',400);}
  if($target!==null&&!crmOne($db,"SELECT id FROM rubizh_staff_users WHERE id=? AND enabled=1 AND role IN ('OWNER','MANAGER')",[$target]))throw new CrmError('INVALID_ASSIGNEE',400);
  $db->prepare('INSERT INTO rubizh_order_assignments(order_id,staff_id,assigned_by,updated_at) VALUES(?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE staff_id=VALUES(staff_id),assigned_by=VALUES(assigned_by),updated_at=VALUES(updated_at)')->execute([$id,$target,$actor['id']]);
  if($target!==null&&$target!==$actor['id'])crmNotify($db,'staff:'.$target,'order_assigned','order',(string)$id,'Вам призначено замовлення '.$old['number'],false,'assign:'.$id.':'.$target.':'.time());
 },false,(string)($b['reason']??''));
}
function crmBulkAssign(PDO $db,array $actor,array $b): array {
 $out=[];foreach($b['ids'] as $id){try{crmAssign4($db,$actor,$id,['staff_id'=>array_key_exists('staff_id',$b)?$b['staff_id']:$actor['id'],'expected_version'=>$b['versions'][(string)$id]??'','reason'=>$b['reason']??null]);$out[]=['id'=>$id,'ok'=>true];}catch(CrmError $e){$out[]=['id'=>$id,'ok'=>false,'code'=>$e->reason];}catch(Throwable $e){error_log('CRM bulk assign '.get_class($e));$out[]=['id'=>$id,'ok'=>false,'code'=>$e instanceof RuntimeException&&preg_match('/\p{Cyrillic}/u',$e->getMessage())?'DOMAIN_CONFLICT':'SERVICE_UNAVAILABLE'];}}
 return ['results'=>$out];
}
/** Confirmation (and v3 pre-order): blocked by an OUT_OF_STOCK line; an explicit availability statement covers unchecked lines. */
function crmConfirm4(PDO $db,array $actor,int $id,array $b): array {
 return crmMutate($db,$actor,$id,$b,'order.confirm',function($old)use($db,$actor,$id,$b){
  foreach($old['lines']??[] as $l)if($l['stock_check']==='OUT_OF_STOCK')throw new CrmError('LINE_OUT_OF_STOCK',409,['line_no'=>$l['line_no']]);
  $GLOBALS['rubizh_request_resolution']=is_array($b['resolution']??null)?$b['resolution']:[];
  npConfirm($db,$id,$actor['id'],($b['availability_confirmed']??false)===true,($b['extra_delivery_agreed']??false)===true,(string)($b['payment_proof']??''),is_array($b['approval']??null)?$b['approval']:[]);
  if(($b['availability_confirmed']??false)===true)$db->prepare("INSERT IGNORE INTO rubizh_order_line_checks(order_id,line_no,status,note,checked_by,checked_at) SELECT order_id,line_no,'CONFIRMED','Підтверджено разом із замовленням',?,UTC_TIMESTAMP() FROM rubizh_order_fulfillment_lines WHERE order_id=?")->execute([$actor['id'],$id]);
  crmTasksAutoClose($db,'confirm:'.$id);
 },true,(string)($b['approval']['reason']??$b['reason']??''));
}
function crmSetProblem(PDO $db,array $actor,int $id,bool $flag,string $reason): void {
 $db->prepare('INSERT INTO rubizh_crm_order_flags(order_id,problem,reason,updated_by,updated_at) VALUES(?,?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE problem=VALUES(problem),reason=VALUES(reason),updated_by=VALUES(updated_by),updated_at=VALUES(updated_at)')->execute([$id,(int)$flag,$reason,$actor['id']]);
 if($flag)crmNotify($db,'role:OWNER','order_problem','order',(string)$id,'Проблема із замовленням: '.mb_substr($reason,0,120),false,'problem:'.$id.':'.time());
}

/** Telephone order (ТЗ 7.3): the same shopCreateOrder as the website; account link only after the buyer's SMS login. */
function crmPhoneOrder(PDO $db,array $actor,array $b,string $key): array {
 require_once dirname(__DIR__).'/shop/order-create.php';
 $existing=crmOne($db,'SELECT id FROM rubizh_customer_orders WHERE external_id=?',['crm:'.$key]);if($existing)return crmOrderCard($db,(int)$existing['id'],$actor);
 $delivery=npValidateDelivery($db,['np_delivery'=>$b['delivery']],$b['delivery']['type']);
 if(!empty($delivery['manual']))throw new CrmError('DELIVERY_UNVERIFIED',409);
 $c=shopOrderContact(['name'=>$b['customer']['name'],'phone'=>$b['customer']['phone'],'email'=>$b['customer']['email']??'','recipient'=>$b['customer']['recipient']??'','city'=>$delivery['city'],'address'=>$delivery['address'],'delivery_type'=>$b['delivery']['type'],'comment'=>$b['comment']??'']);
 $created=shopCreateOrder($db,array_map(fn($l)=>array_intersect_key($l,array_flip(['product_id','color_id','sku','qty'])),$b['lines']),$c,$delivery,$b['payment']??'card',[
  'external_id'=>'crm:'.$key,'owner'=>null,'promo'=>(string)($b['promo']??''),'expected_total'=>isset($b['expected_total_minor'])?$b['expected_total_minor']/100:null,'channel'=>$b['channel'],'staff'=>$actor['id'],
  'after_insert'=>function(int $id)use($db,$actor,$c){
   $db->prepare('INSERT INTO rubizh_phone_order_claims(order_id,phone,created_by,created_at) VALUES(?,?,?,UTC_TIMESTAMP())')->execute([$id,'+'.$c['phone'],$actor['id']]);
   $db->prepare('INSERT INTO rubizh_order_assignments(order_id,staff_id,assigned_by,updated_at) VALUES(?,?,?,UTC_TIMESTAMP())')->execute([$id,in_array($actor['role'],['OWNER','MANAGER'],true)?$actor['id']:null,$actor['id']]);
  }]);
 crmAudit($db,$actor,'order',(string)$created['id'],'order.create_phone',[],['channel'=>$b['channel'],'total'=>$created['quote']['total'],'lines'=>count($b['lines'])]);
 return crmOrderCard($db,$created['id'],$actor);
}

// ---- payments ----------------------------------------------------------------------------------------------------
/** MANAGER sees payments of own orders only (ТЗ 7.4); OWNER/ACCOUNTANT see all. */
function crmPaymentScope(array $actor): array {return $actor['role']==='MANAGER'?[' AND EXISTS(SELECT 1 FROM rubizh_order_assignments asg WHERE asg.order_id=e.order_id AND asg.staff_id=?)',[$actor['id']]]:['',[]];}
function crmPayments(PDO $db,array $actor,array $q): array {
 $p=crmPage($q);[$scope,$sargs]=crmPaymentScope($actor);$where='1=1'.$scope;$args=$sargs;
 if(($q['q']??'')!==''){$where.=" AND (o.order_number LIKE ? ESCAPE '!' OR e.invoice_id LIKE ? ESCAPE '!')";$args[]=crmLike($q['q']);$args[]=crmLike($q['q']);}
 $view=$q['view']??'all';
 if($view==='awaiting')$where.=" AND e.status IN ('creating','created','processing','hold','awaiting_webhook')";
 if($view==='paid')$where.=" AND e.status IN ('success','reversed')";
 if($view==='failed')$where.=" AND e.status IN ('failure','expired')";
 if($view==='review')$where.=" AND (e.status='unknown' OR e.refund_status='unknown')";
 if(in_array($view,['invoice_awaiting','invoice_review'],true)){
  // D-51: FOP-invoice orders are not MonoPay invoices; they are listed from the orders themselves.
  $cond=$view==='invoice_awaiting'?'t.payment_due>UTC_TIMESTAMP()':'t.payment_due<=UTC_TIMESTAMP()';$oscope=$actor['role']==='MANAGER'?' AND EXISTS(SELECT 1 FROM rubizh_order_assignments asg WHERE asg.order_id=o.id AND asg.staff_id=?)':'';
  $base="FROM rubizh_customer_orders o JOIN rubizh_order_details d ON d.order_id=o.id JOIN rubizh_order_timing t ON t.order_id=o.id WHERE JSON_UNQUOTE(JSON_EXTRACT(d.contact_json,'$.payment'))='invoice' AND o.payment_status NOT IN ('paid','refunded') AND o.status IN ('confirmed','processing') AND $cond$oscope";
  $total=(int)crmOne($db,"SELECT COUNT(*) n $base",$sargs)['n'];
  $rows=crmQuery($db,"SELECT o.id order_id,o.order_number,ROUND(o.total*100) amount,'invoice' method,t.payment_due,o.created_at $base ORDER BY t.payment_due LIMIT {$p['limit']} OFFSET {$p['offset']}",$sargs);
  foreach($rows as &$r){$r['order_id']=(int)$r['order_id'];$r['amount']=(int)$r['amount'];}unset($r);
  return ['rows'=>$rows,'pagination'=>crmPagination($p,$total),'kpi'=>crmPaymentKpi($db,$actor)];
 }
 $total=(int)crmOne($db,"SELECT COUNT(*) n FROM rubizh_mono_invoices e JOIN rubizh_customer_orders o ON o.id=e.order_id WHERE $where",$args)['n'];
 $rows=crmQuery($db,"SELECT e.id,e.order_id,e.invoice_id,e.reference,e.amount,e.status,e.refund_status,e.created_at,e.updated_at,o.order_number,o.payment_status FROM rubizh_mono_invoices e JOIN rubizh_customer_orders o ON o.id=e.order_id WHERE $where ORDER BY e.id DESC LIMIT {$p['limit']} OFFSET {$p['offset']}",$args);
 foreach($rows as &$r){$r['id']=(int)$r['id'];$r['order_id']=(int)$r['order_id'];$r['amount']=(int)$r['amount'];}unset($r);
 return ['rows'=>$rows,'pagination'=>crmPagination($p,$total),'kpi'=>crmPaymentKpi($db,$actor)];
}
function crmPagination(array $p,int $total): array {return ['page'=>$p['page'],'limit'=>$p['limit'],'total'=>$total,'pages'=>(int)ceil($total/$p['limit'])];}
function crmPaymentKpi(PDO $db,array $actor): array {
 [$scope,$args]=crmPaymentScope($actor);
 $r=crmOne($db,"SELECT SUM(e.status IN ('creating','created','processing','hold','awaiting_webhook')) awaiting,SUM(e.status IN ('success','reversed') AND e.updated_at>=UTC_TIMESTAMP()-INTERVAL 30 DAY) paid_30d,SUM(e.status IN ('failure','expired') AND e.updated_at>=UTC_TIMESTAMP()-INTERVAL 30 DAY) failed_30d,SUM(e.status='unknown' OR e.refund_status='unknown') review FROM rubizh_mono_invoices e WHERE 1=1$scope",$args);
 $out=array_map('intval',$r);
 if($actor['role']!=='MANAGER')$out['disputed']=(int)crmOne($db,"SELECT COUNT(*) n FROM rubizh_crm_payment_reviews WHERE state='OPEN'")['n'];
 return $out;
}
function crmPaymentView(PDO $db,array $actor,int $id): array {
 $row=crmOne($db,'SELECT * FROM rubizh_mono_invoices WHERE id=?',[$id]);if(!$row)throw new CrmError('NOT_FOUND',404);
 $order=crmOrder($db,(int)$row['order_id'],$actor);
 if($actor['role']==='MANAGER'&&($order['assigned_manager']['id']??null)!==$actor['id'])throw new CrmError('ORDER_NOT_ASSIGNED',403);
 $events=$row['invoice_id']?crmQuery($db,'SELECT event_hash,status,created_at FROM rubizh_mono_events WHERE invoice_id=? ORDER BY created_at',[$row['invoice_id']]):[];
 $audit=crmQuery($db,"SELECT action,note,created_at FROM rubizh_np_audit WHERE order_id=? AND action LIKE 'mono\\_%' ORDER BY id",[(int)$row['order_id']]);
 return ['record'=>$row,'order'=>$order,'events'=>$events,'bank_log'=>$audit,'refunds'=>crmCan($actor,'refund.view')?crmRefundRows($db,(int)$row['order_id']):[]];
}
/** CRM-4.1: signed MonoPay events that failed validation are parked; OWNER reviews them with a fresh bank read. */
function crmSyncReviews(PDO $db): void {
 $db->exec("INSERT IGNORE INTO rubizh_crm_payment_reviews(source_id,order_id,state,created_at) SELECT a.id,a.order_id,'OPEN',a.created_at FROM rubizh_np_audit a WHERE a.action='mono_event_rejected' AND a.id>COALESCE((SELECT MAX(source_id) FROM rubizh_crm_payment_reviews),0)");
 foreach(crmQuery($db,"SELECT r.id,r.order_id,o.order_number FROM rubizh_crm_payment_reviews r JOIN rubizh_customer_orders o ON o.id=r.order_id WHERE r.state='OPEN' AND r.created_at>=UTC_TIMESTAMP()-INTERVAL 30 DAY") as $r)crmNotify($db,'role:OWNER','payment_review','order',(string)$r['order_id'],'Подія MonoPay потребує перевірки: '.$r['order_number'],true,'review:'.$r['id']);
}
function crmReviewRow(array $r): array {return ['id'=>'review:'.$r['id'],'order_id'=>(int)$r['order_id'],'order_number'=>$r['order_number'],'kind'=>'mono_event_rejected','state'=>$r['state'],'bank_result'=>$r['bank_result']??$r['parked_note'],'detail'=>(string)$r['note'],'created_at'=>$r['created_at'],'resolved_reason'=>$r['resolved_reason'],'resolved_at'=>$r['resolved_at']];}
function crmReviews(PDO $db): array {
 crmSyncReviews($db);
 $rows=crmQuery($db,"SELECT r.*,a.note,o.order_number,(SELECT p.note FROM rubizh_np_audit p WHERE p.order_id=r.order_id AND p.action='mono_parked_reconcile' AND p.id>=r.source_id ORDER BY p.id DESC LIMIT 1) parked_note FROM rubizh_crm_payment_reviews r JOIN rubizh_np_audit a ON a.id=r.source_id JOIN rubizh_customer_orders o ON o.id=r.order_id ORDER BY r.state='RESOLVED',r.id DESC LIMIT 200");
 return ['rows'=>array_map('crmReviewRow',$rows)];
}
function crmReviewId(string $rid): int {if(!preg_match('/^review:(\d+)$/D',$rid,$m))throw new CrmError('NOT_FOUND',404);return (int)$m[1];}
function crmReviewCheck(PDO $db,array $actor,string $rid): array {
 $id=crmReviewId($rid);$r=crmOne($db,'SELECT * FROM rubizh_crm_payment_reviews WHERE id=?',[$id]);if(!$r)throw new CrmError('NOT_FOUND',404);
 $inv=crmOne($db,"SELECT * FROM rubizh_mono_invoices WHERE order_id=? AND invoice_id IS NOT NULL ORDER BY id DESC LIMIT 1",[(int)$r['order_id']]);
 if(!$inv)$result='рахунок у банку не створено';
 else{try{$s=monoApi('invoice/status?invoiceId='.rawurlencode((string)$inv['invoice_id']));$result='банк: статус '.preg_replace('/[^a-z_]/','',(string)($s['status']??'?')).', сума '.(is_int($s['amount']??null)?$s['amount']:'?').', локально '.$inv['status'];}catch(Throwable $e){$result='банк не відповів; спробуйте пізніше';}}
 $db->prepare('UPDATE rubizh_crm_payment_reviews SET bank_result=?,checked_at=UTC_TIMESTAMP() WHERE id=?')->execute([mb_substr($result,0,400),$id]);
 crmAudit($db,$actor,'payment_review',(string)$id,'payment.review.check',[],['bank_result'=>$result]);
 return crmReviewRow(crmOne($db,'SELECT r.*,a.note,o.order_number,NULL parked_note FROM rubizh_crm_payment_reviews r JOIN rubizh_np_audit a ON a.id=r.source_id JOIN rubizh_customer_orders o ON o.id=r.order_id WHERE r.id=?',[$id]));
}
function crmReviewResolve(PDO $db,array $actor,string $rid,string $reason): array {
 $id=crmReviewId($rid);$r=crmOne($db,'SELECT * FROM rubizh_crm_payment_reviews WHERE id=?',[$id]);if(!$r)throw new CrmError('NOT_FOUND',404);
 if($r['state']!=='RESOLVED'){$db->prepare("UPDATE rubizh_crm_payment_reviews SET state='RESOLVED',resolved_by=?,resolved_reason=?,resolved_at=UTC_TIMESTAMP() WHERE id=? AND state='OPEN'")->execute([$actor['id'],$reason,$id]);crmAudit($db,$actor,'payment_review',(string)$id,'payment.review.resolve',['state'=>'OPEN'],['state'=>'RESOLVED'],$reason);}
 return crmReviewRow(crmOne($db,'SELECT r.*,a.note,o.order_number,NULL parked_note FROM rubizh_crm_payment_reviews r JOIN rubizh_np_audit a ON a.id=r.source_id JOIN rubizh_customer_orders o ON o.id=r.order_id WHERE r.id=?',[$id]));
}
/** CRM-4.2: refund needs OWNER, step-up (router), the current order version and the live/mock refund adapter. */
function crmRefund4(PDO $db,array $actor,int $id,array $b,string $key): array {
 crmFeatureRequire('refund');
 $row=crmOne($db,'SELECT * FROM rubizh_mono_invoices WHERE id=?',[$id]);if(!$row)throw new CrmError('NOT_FOUND',404);
 $existing=crmOne($db,'SELECT * FROM rubizh_refund_operations WHERE idempotency_key=?',[$key]);if($existing&&(int)$existing['order_id']!==(int)$row['order_id'])throw new CrmError('IDEMPOTENCY_CONFLICT',409);
 if(!$existing)crmCheckVersion(crmOrder($db,(int)$row['order_id'],$actor),['version'=>$b['expected_version']]);
 return crmRefund($db,(int)$row['order_id'],$actor,(int)$b['amount'],$key,$b['reason'],$existing?null:$b['expected_version']);
}

// ---- shipments ---------------------------------------------------------------------------------------------------
function crmShipmentRow(PDO $db,int $id): array {$s=crmOne($db,'SELECT * FROM rubizh_order_shipments WHERE id=?',[$id]);if(!$s)throw new CrmError('NOT_FOUND',404);return $s;}
function crmShipment4(PDO $db,array $actor,int $id,array $b,string $action): array {
 $s=crmShipmentRow($db,$id);
 if($action==='create')crmFeatureRequire('np_ttn');
 if(in_array($action,['refresh','reconcile'],true))crmFeatureRequire('np_tracking');
 // 5.6-2: a manually entered TTN has no NP document of ours to delete — «cancel» withdraws the number instead.
 $manual=$action==='cancel'&&(json_decode((string)(crmOne($db,'SELECT origin_json FROM rubizh_order_shipments WHERE id=?',[$id])['origin_json']??''),true)['source']??'')==='manual';
 if($action==='cancel'&&$s['status']==='created'&&!$manual){crmFeatureRequire('np_ttn');return crmShipmentDomain($db,$actor,$id,$b,'shipment.delete_ttn',fn($s)=>npDeleteTtn($db,(int)$s['order_id'],$id,$actor['id']),true);}
 return crmOrderCardExtras($db,crmShipmentAction($db,(int)$s['order_id'],$actor,['version'=>$b['expected_version']]+$b,$action,$id),$actor);
}
function crmShipmentDomain(PDO $db,array $actor,int $id,array $b,string $action,callable $do,bool $scope=false): array {
 $s=crmShipmentRow($db,$id);
 return crmMutate($db,$actor,(int)$s['order_id'],$b,$action,fn()=>$do($s),$scope,(string)($b['reason']??''));
}
function crmShipmentNotify(PDO $db,array $actor,int $id): array {
 $s=crmShipmentRow($db,$id);if(($s['tracking_number']??'')==='')throw new CrmError('TTN_REQUIRED',409);
 $o=crmOrder($db,(int)$s['order_id'],$actor);crmScopeWrite($o,$actor);$phone=crmCustomerRawPhone($db,'order:'.$s['order_id']);if(!$phone)throw new CrmError('PHONE_REQUIRED',409);
 // R4-12: one customer notice per TTN in 10 minutes (SMS cost and spam once the live flag is on).
 if(!rubizhRateAllow('shipment-notify',(string)$id,1,600)){header('Retry-After: 600');throw new CrmError('RATE_LIMITED',429,['retry_after'=>600]);}
 $how=crmAdapterSend('sms',['to'=>$phone,'text'=>'RUBIZH: zamovlennia '.$o['number'].' vidpravleno, TTN '.$s['tracking_number']]);
 if($how==='shown')throw new CrmError('FEATURE_NOT_CONNECTED',409,['feature'=>'sms']);
 crmAudit($db,$actor,'order',(string)$s['order_id'],'shipment.notify',[],['shipment_id'=>$id,'delivery'=>$how]);
 return ['done'=>true];
}
function crmShipmentsList(PDO $db,array $actor,array $q): array {
 $r=crmList($db,'shipments',['_contact'=>crmCan($actor,'order.search.contact')]+$q);
 if(!crmCan($actor,'order.finance.view'))foreach($r['rows'] as &$row)unset($row['declared_value'],$row['delivery_cost'],$row['payload_json'],$row['result_json']);unset($row);
 foreach($r['rows'] as &$row){$row['supplier_name']=npOrigins()[$row['supplier_code']]['name']??$row['supplier_code'];unset($row['payload_json'],$row['result_json'],$row['origin_json']);}unset($row);
 if(!crmCan($actor,'order.search.contact'))foreach($r['rows'] as &$row)unset($row['email']);unset($row); // stage 4.1: no buyer e-mail for WAREHOUSE
 return $r;
}
function crmReturnsList(PDO $db,array $actor,array $q): array {
 $r=crmList($db,'returns',['_contact'=>crmCan($actor,'order.search.contact')]+$q);
 if(!crmCan($actor,'refund.view'))foreach($r['rows'] as &$row)$row=crmRedactReturn($row);unset($row);
 if(!crmCan($actor,'order.search.contact'))foreach($r['rows'] as &$row)unset($row['email']);unset($row); // stage 4.1: no buyer e-mail for WAREHOUSE
 return $r;
}
/** R4-04: refund amounts of a return are finance data (per-line refund, allocations, expected total). */
function crmRedactReturn(array $row): array {
 $row['refund_expected_minor']=null;$row['refund_allocations_json']=null;
 if(isset($row['lines_json'])){$l=json_decode((string)$row['lines_json'],true);if(is_array($l)){foreach($l as &$x)if(is_array($x))unset($x['refund_minor'],$x['amount_minor'],$x['unit_minor']);unset($x);$row['lines_json']=json_encode($l,JSON_UNESCAPED_UNICODE);}}
 return $row;
}
function crmEntityView(PDO $db,array $actor,string $entity,int $id): array {
 $table=['shipments'=>'rubizh_order_shipments','returns'=>'rubizh_returns'][$entity];$row=crmOne($db,"SELECT * FROM $table WHERE id=?",[$id]);if(!$row)throw new CrmError('NOT_FOUND',404);
 $money=crmCan($actor,'order.finance.view');
 if($entity==='shipments')$row=array_intersect_key($row,array_flip(['id','order_id','supplier_code','status','tracking_number','lines_json','error','created_at','updated_at',...($money?['declared_value','delivery_cost']:[])]));
 elseif(!crmCan($actor,'refund.view'))$row=crmRedactReturn($row);
 return ['record'=>$row,'order'=>crmOrder($db,(int)$row['order_id'],$actor),'notes'=>crmNotes($db,rtrim($entity,'s'),(string)$id)];
}
/** Return graph (ТЗ 7.5): review states need return.review; physical receipt needs return.receive. */
function crmReturnTransition4(PDO $db,array $actor,int $id,array $b): array {
 crmPermit($actor,in_array($b['state'],['IN_TRANSIT','RECEIVED'],true)?'return.receive':'return.review');
 if($b['state']==='CLOSED'&&!empty($b['refund_allocations']))crmRequireFresh();
 return crmReturnTransition($db,$id,$actor,['version'=>$b['return_version']??0]+$b);
}
