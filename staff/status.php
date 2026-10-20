<?php
declare(strict_types=1);
// One server-side projection of the three customer-visible statuses (docs/crm/02-CRM_STATE_MAP.md) for list, card,
// mobile card and export. Facts only: no state is invented and the SITE domain remains the writer.

function crmStatusLabels(): array {
 return [
  'order'=>['NEW'=>'нове','WAITING_CONFIRMATION'=>'очікує підтвердження менеджера','CONFIRMED'=>'підтверджене','PACKING'=>'у комплектації','HANDED_TO_DELIVERY'=>'передане на доставку','COMPLETED'=>'завершене','CANCELLED'=>'скасоване','REVIEW'=>'потребує перевірки'],
  'payment'=>['NOT_ISSUED'=>'ще не виставлено','AWAITING'=>'очікує оплати','PAID'=>'оплачено','FAILED'=>'неуспішно','EXPIRED_RETRY'=>'рахунок прострочено','PARTIALLY_REFUNDED'=>'повернено частково','REFUNDED'=>'повернено','NEEDS_REVIEW'=>'потребує перевірки'],
  'delivery'=>['NONE'=>'не створено','PREPARING'=>'готується','SENT'=>'відправлено','DELIVERED'=>'доставлено','RETURNING'=>'повернення','NEEDS_REVIEW'=>'потребує розбору'],
 ];
}

/** @param array $f facts: order row, shipments, invoices, refunds, timing, open_review, invoice_payment, coverage_complete */
function crmDisplayStatus(array $f): array {
 $o=$f['order'];$ships=array_values(array_filter($f['shipments'],fn($s)=>$s['status']!=='cancelled'));$inv=$f['invoices'];$labels=crmStatusLabels();
 $legacy=(string)$o['status'];$v3=(int)($o['pim_contract_version']??0)===3?(string)($o['pim_order_state']??''):'';
 $order=match(true){
  $legacy==='cancelled'||$v3==='CANCELLED'=>'CANCELLED',
  $legacy==='completed'||$v3==='COMPLETED'=>'COMPLETED',
  in_array($legacy,['partially_shipped','shipped','delivered','returned','partially_returned'],true)=>'HANDED_TO_DELIVERY',
  $legacy==='processing'=>'PACKING',
  $v3==='NEW'=>'NEW',
  $legacy==='new'||$v3==='WAITING_CONFIRMATION'=>'WAITING_CONFIRMATION',
  $legacy==='confirmed'||$v3==='CONFIRMED'=>'CONFIRMED',
  default=>'REVIEW',
 };
 // Payment: ledger of successful refunds against verified paid invoices; card attempts; FOP invoice deadline (D-51).
 $paidMinor=0;foreach($inv as $i)if(in_array($i['status'],['success','reversed'],true))$paidMinor+=(int)$i['amount'];
 if($f['invoice_payment'])$paidMinor+=(int)$f['invoice_payment']['amount_minor'];
 $refunded=0;$refundUnknown=false;foreach($f['refunds'] as $r){if($r['status']==='success')$refunded+=(int)$r['amount'];if($r['status']==='unknown')$refundUnknown=true;}
 $last=$inv?$inv[count($inv)-1]:null;$due=$f['timing']['payment_due']??null;$beforeDue=$due===null||strtotime($due.' UTC')>time();
 $method=(string)($f['contact']['payment']??'');$unknownInvoice=(bool)array_filter($inv,fn($i)=>$i['status']==='unknown'||$i['refund_status']==='unknown'||$i['status']==='creating'&&strtotime($i['created_at'].' UTC')<time()-900);
 $payment=match(true){
  $f['open_review']||$refundUnknown||$unknownInvoice||in_array('STATE_CONFLICT',$f['flags']??[],true)=>'NEEDS_REVIEW',
  $o['payment_status']==='refunded'||$paidMinor>0&&$refunded>=$paidMinor=>'REFUNDED',
  $refunded>0=>'PARTIALLY_REFUNDED',
  $o['payment_status']==='paid'=>'PAID',
  $method==='invoice'&&in_array($order,['CONFIRMED','PACKING'],true)&&!$beforeDue=>'NEEDS_REVIEW',
  $last&&in_array($last['status'],['creating','created','processing','hold','awaiting_webhook'],true)=>'AWAITING',
  $method==='invoice'&&in_array($order,['CONFIRMED','PACKING'],true)=>'AWAITING',
  $last&&$last['status']==='failure'&&$beforeDue&&$order!=='CANCELLED'=>'FAILED',
  $last&&$last['status']==='expired'&&$beforeDue&&$order!=='CANCELLED'=>'EXPIRED_RETRY',
  default=>'NOT_ISSUED',
 };
 $states=array_column($ships,'status');$total=count($ships);$sent=count(array_filter($states,fn($s)=>in_array($s,['sent','delivered'],true)));
 $delivery=match(true){
  !$ships=>'NONE',
  (bool)array_intersect($states,['unknown','error','manual']) =>'NEEDS_REVIEW',
  in_array('returned',$states,true)=>'RETURNING',
  count(array_filter($states,fn($s)=>$s==='delivered'))===$total&&$f['coverage_complete']=>'DELIVERED',
  $sent>0=>'SENT',
  default=>'PREPARING',
 };
 $d=['code'=>$delivery,'label'=>$labels['delivery'][$delivery],'parcels_total'=>$total,'parcels_sent'=>$sent];
 if($delivery==='SENT')$d['label']='відправлено (посилка '.$sent.' із '.$total.')';
 $p=['code'=>$payment,'label'=>$labels['payment'][$payment]];
 if($payment==='EXPIRED_RETRY'&&$due)$p['label'].=' — можна оплатити повторно до '.crmKyiv($due);
 if($payment==='NEEDS_REVIEW'&&$method==='invoice'&&!$beforeDue&&$o['payment_status']!=='paid')$p['label']='потребує звірки виписки';
 return ['order'=>['code'=>$order,'label'=>$labels['order'][$order]],'payment'=>$p,'delivery'=>$d];
}
function crmKyiv(string $utc): string {return (new DateTimeImmutable($utc,new DateTimeZone('UTC')))->setTimezone(new DateTimeZone('Europe/Kyiv'))->format('d.m.Y H:i');}

/** Attention markers for list filters and «Потребує уваги». */
function crmAttention(array $f,array $display,array $lines): array {
 $a=[];
 if($display['order']['code']==='WAITING_CONFIRMATION')$a[]='CONFIRMATION';
 if($display['payment']['code']==='NEEDS_REVIEW')$a[]='PAYMENT_REVIEW';
 if($display['delivery']['code']==='NEEDS_REVIEW')$a[]='DELIVERY_REVIEW';
 if($display['delivery']['code']==='RETURNING')$a[]='RETURNING';
 if(!empty($f['problem']))$a[]='PROBLEM';
 foreach($lines as $l)if(($l['supplier_code']??'')===''){$a[]='NO_SUPPLIER';break;}
 foreach($lines as $l)if(($l['stock_check']??null)==='OUT_OF_STOCK'){$a[]='OUT_OF_STOCK';break;}
 if($display['payment']['code']==='PAID'&&$display['delivery']['code']==='NONE'&&in_array($display['order']['code'],['CONFIRMED','PACKING'],true))$a[]='READY_TO_SHIP';
 return $a;
}

/** Actions the actor can start now. The server re-checks every one of them; this only drives the UI. */
function crmOrderActions(array $v,array $actor): array {
 $can=fn($p)=>crmCan($actor,$p);$o=$v['display']['order']['code'];$p=$v['display']['payment']['code'];$d=$v['display']['delivery']['code'];
 $own=$actor['role']!=='MANAGER'||$v['assigned_manager']===null||$v['assigned_manager']['id']===$actor['id'];$open=!in_array($o,['COMPLETED','CANCELLED'],true);
 $paid=in_array($p,['PAID','PARTIALLY_REFUNDED'],true);$unpaid=in_array($p,['NOT_ISSUED','AWAITING','FAILED','EXPIRED_RETRY'],true);
 $live=array_filter($v['shipments'],fn($s)=>!in_array($s['status'],['draft','error','cancelled'],true));
 $out=[];$add=function(string $id,bool $ok)use(&$out){if($ok)$out[]=$id;};
 $add('assign_self',$can('order.assign.self')&&$open&&($v['assigned_manager']['id']??null)!==$actor['id']&&$own);
 $add('assign',$can('order.assign.any')&&$open);
 $add('confirm',$can('order.confirm')&&$own&&$o==='WAITING_CONFIRMATION');
 $add('line_stock',$can('order.confirm')&&$own&&in_array($o,['WAITING_CONFIRMATION','CONFIRMED','NEW'],true)&&!$live);
 $add('line_replace',$can('order.confirm')&&$own&&$unpaid&&$open&&!$live&&$o!=='PACKING');
 $add('line_remove',$can('order.confirm')&&$own&&$unpaid&&$open&&!$live&&count($v['items'])>1);
 $add('invoice',$can('payment.invoice.create')&&$own&&in_array($o,['CONFIRMED','PACKING'],true)&&in_array($p,['NOT_ISSUED','AWAITING','FAILED','EXPIRED_RETRY'],true)&&($v['contact']['payment']??'')==='card');
 $add('cancel',$can('order.cancel')&&$own&&$open&&$unpaid&&!$live&&$o!=='HANDED_TO_DELIVERY');
 $add('problem',$can('order.problem'));
 $add('packing',$can('order.packing')&&$own&&$o==='CONFIRMED'&&$paid);
 $add('shipment',$can('shipment.manage')&&$paid&&in_array($o,['CONFIRMED','PACKING','HANDED_TO_DELIVERY'],true)&&array_filter($v['remaining']??[],fn($l)=>$l['qty']>0.00001));
 // 5.6-2 (D-83): a TTN created outside CRM (dropshipping) — same conditions as a new parcel.
 $add('manual_ttn',$can('shipment.manage')&&$paid&&in_array($o,['CONFIRMED','PACKING','HANDED_TO_DELIVERY'],true)&&array_filter($v['remaining']??[],fn($l)=>$l['qty']>0.00001));
 $add('complete',$can('order.complete')&&$own&&$d==='DELIVERED'&&in_array($p,['PAID','PARTIALLY_REFUNDED','REFUNDED'],true)&&$o!=='COMPLETED');
 $add('delivery_edit',$can('order.delivery.edit')&&$own&&$open&&!array_filter($v['shipments'],fn($s)=>($s['tracking_number']??'')!==''&&$s['status']!=='cancelled'));
 $add('line_supplier',$can('order.line.supplier')&&in_array('NO_SUPPLIER',$v['attention'],true)&&!$live);
 $add('return',$can('return.create')&&$paid);
 $add('refund',$can('payment.refund.execute')&&$paid);
 $add('accept_invoice',$can('payment.invoice.accept')&&($v['contact']['payment']??'')==='invoice'&&$unpaid&&in_array($o,['CONFIRMED','PACKING'],true));
 $add('reconcile_not_created',$can('payment.manual_reconcile')&&(bool)array_filter($v['payments'],fn($i)=>!$i['invoice_id']&&in_array($i['status'],['creating','unknown'],true)));
 $add('reconcile_link',$can('payment.manual_reconcile')&&(bool)array_filter($v['payments'],fn($i)=>in_array($i['status'],['creating','unknown'],true)));
 $add('note',$can('note.create'));
 $add('task',$can('task.manage'));
 return $out;
}
function crmPrimaryAction(array $actions,array $display): ?string {
 foreach(['confirm','invoice','accept_invoice','packing','shipment','complete'] as $a)if(in_array($a,$actions,true))return $a;
 return null;
}
