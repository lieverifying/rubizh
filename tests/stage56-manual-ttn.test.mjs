// Stage 5.6-2 (D-83): for dropshipping the TTN is created by the owner or the supplier outside CRM, in another Nova
// Poshta cabinet; staff enters the number by hand: «Внести ТТН вручну» on the order — format check, one TTN per parcel,
// a parcel from unallocated lines (one or several parcels per order). The number is tracked like any TTN (the buyer's
// phone from the order goes with it, so a TTN from another cabinet is readable), the buyer sees it in the cabinet, and
// the order completes when every parcel is received (OD-4.8). NP is the stand mock: no real TTN, no real network.
import {test} from 'node:test';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import path from 'node:path';
import {startCrm,line} from './helpers/crm-fixture.mjs';import {runtime,phpArgs,phpEnv} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET,key=()=>crypto.randomUUID().replaceAll('-','');
// The NP mock directory (same refs as crm-stage4-e2e): a Kyiv branch.
const mockRef=seed=>{const h=createHash('sha256').update('np-mock|'+seed).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;};
const KYIV=mockRef('city:kyiv'),NP={np_delivery:{city_ref:KYIV,warehouse_ref:mockRef('wh:'+KYIV+':1')}};
const data=r=>{assert.ok(r.status===200||r.status===201,JSON.stringify(r.data));return r.data.data;};
async function paidOrder(s,owner,qty=2){const o=await s.checkout([{...line(),qty}],NP);let order=data(await owner.get('/orders/'+o.id));await owner.send('/orders/'+o.id+'/invoice',{version:order.version});
 const inv=s.sql('SELECT * FROM rubizh_mono_invoices WHERE order_id='+o.id+' ORDER BY id DESC LIMIT 1')[0];assert.equal((await s.webhook(inv)).status,200);return data(await owner.get('/orders/'+o.id));}

test('5.6-2 manual TTN: format, RBAC, paid order only, one TTN per parcel, idempotent, a wrong number can be withdrawn',{skip,timeout:240000},async()=>{
 const s=await startCrm({npMock:true,stock:20});
 try{
  const owner=await s.login('OWNER'),wh=await s.login('LOGISTICS'),support=await s.login('READ_ONLY');
  let order=await paidOrder(s,owner);const route='/orders/'+order.id+'/shipments/manual';
  const body=(extra={})=>({version:order.version,request_id:key(),availability_confirmed:true,extra_delivery_agreed:true,lines:[{line_no:0,qty:1}],tracking_number:'20 4501 2345 6789',...extra});
  assert.equal((await support.send(route,body())).status,403,'SUPPORT cannot enter a TTN');
  for(const bad of ['12345','2045012345678','204501234567890','20450123456ABC','00450123456789','']){const r=await wh.send(route,body({tracking_number:bad}));assert.equal(r.status,422,bad+' '+JSON.stringify(r.data));assert.equal(r.data.error.code,'TTN_FORMAT_INVALID',bad);}
  assert.match((await wh.send(route,body({tracking_number:'123'}))).data.error.message,/14 цифр/);
  assert.equal(s.sql('SELECT COUNT(*) n FROM rubizh_order_shipments')[0].n,0,'nothing saved for a wrong number');
  // An unpaid order: no TTN (nothing ships without payment).
  const unpaid=await s.checkout([{...line(),qty:1}],NP);const u=data(await owner.get('/orders/'+unpaid.id));
  const r0=await wh.send('/orders/'+unpaid.id+'/shipments/manual',{version:u.version,request_id:key(),availability_confirmed:true,lines:[{line_no:0,qty:1}],tracking_number:'20450000000001'});
  assert.equal(r0.status,409);assert.equal(r0.data.error.code,'PAID_ORDER_REQUIRED');
  // First parcel.
  const first=body();let r=await wh.send(route,first);assert.equal(r.status,201,JSON.stringify(r.data));order=r.data.data;
  assert.equal((await wh.send(route,first)).status,201,'the same request is idempotent');assert.equal(s.sql('SELECT COUNT(*) n FROM rubizh_order_shipments')[0].n,1);
  const p1=order.shipments[0];assert.equal(p1.tracking_number,'20450123456789','spaces removed');assert.equal(order.fulfillment_status,'TTN_CREATED');
  const row=s.sql('SELECT status,origin_json,declared_value FROM rubizh_order_shipments WHERE id='+p1.id)[0];assert.equal(row.status,'created');assert.equal(JSON.parse(row.origin_json).source,'manual');assert.ok(+row.declared_value>0);
  // The same number on another parcel → refused; more than the unallocated quantity → refused.
  r=await wh.send(route,body({version:order.version,tracking_number:'20450123456789'}));assert.equal(r.status,409);assert.equal(r.data.error.code,'TTN_ALREADY_USED');
  r=await wh.send(route,body({version:order.version,lines:[{line_no:0,qty:2}],tracking_number:'59000123456789'}));assert.equal(r.status,409,'more than the unallocated quantity');
  // A mistyped TTN is withdrawn (before NP shows movement) and the line gets the right number — nothing is lost.
  r=await wh.send(route,body({version:order.version,tracking_number:'59000999999999'}));assert.equal(r.status,201,JSON.stringify(r.data));order=r.data.data;
  const wrong=order.shipments.find(p=>p.tracking_number==='59000999999999');
  r=await wh.send('/shipments/'+wrong.id+'/cancel',{version:order.version});assert.equal(r.status,200,JSON.stringify(r.data));order=r.data.data;
  assert.deepEqual(s.sql('SELECT status,tracking_number FROM rubizh_order_shipments WHERE id='+wrong.id)[0],{status:'cancelled',tracking_number:null});
  r=await wh.send(route,body({version:order.version,tracking_number:'59000123456789'}));assert.equal(r.status,201,JSON.stringify(r.data));order=r.data.data;
  assert.equal(order.shipments.filter(p=>p.tracking_number).length,2,'two parcels, two TTN');
  // A TTN with NP movement is not withdrawn by this action.
  s.sql(`INSERT INTO meta(k,v) VALUES('np_mock_status_20450123456789','5') ON DUPLICATE KEY UPDATE v='5'`);
  order=data(await wh.send('/shipments/'+p1.id+'/refresh',{version:order.version}));
  assert.equal((await wh.send('/shipments/'+p1.id+'/cancel',{version:order.version})).status,409,'a moving parcel cannot be withdrawn');
  assert.ok(s.sql("SELECT COUNT(*) n FROM rubizh_np_audit WHERE action IN ('shipment_manual_ttn','shipment_manual_ttn_withdrawn')")[0].n>=4,'every manual TTN and withdrawal is audited');
 }finally{s.stop();}
});

test('5.6-2 manual TTNs are tracked by the worker with the buyer phone; «отримано» on every parcel → order completed;',{skip,timeout:240000},async()=>{
 const s=await startCrm({npMock:true,stock:20});
 try{
  const owner=await s.login('OWNER'),wh=await s.login('LOGISTICS');let order=await paidOrder(s,owner);const route='/orders/'+order.id+'/shipments/manual';
  for(const t of ['20450000000011','20450000000012']){const r=await wh.send(route,{version:order.version,request_id:key(),availability_confirmed:true,extra_delivery_agreed:true,lines:[{line_no:0,qty:1}],tracking_number:t});assert.equal(r.status,201,JSON.stringify(r.data));order=r.data.data;}
  const worker=()=>{s.sql("UPDATE rubizh_order_shipments SET checked_at=NULL");const p=spawnSync(runtime+'/bin/php8.4',[...phpArgs,path.join(s.site,'shop/np-worker.php')],{env:phpEnv,encoding:'utf8'});assert.equal(p.status,0,p.stdout+p.stderr);};
  s.sql(`INSERT INTO meta(k,v) VALUES('np_mock_status_20450000000011','9') ON DUPLICATE KEY UPDATE v='9'`);worker();
  order=data(await owner.get('/orders/'+order.id));assert.notEqual(order.display.order.code,'COMPLETED','one of two parcels received');
  assert.deepEqual(s.sql('SELECT status FROM rubizh_order_shipments WHERE order_id='+order.id+' ORDER BY id').map(x=>x.status),['delivered','created']);
  s.sql(`INSERT INTO meta(k,v) VALUES('np_mock_status_20450000000012','10') ON DUPLICATE KEY UPDATE v='10'`);worker();
  order=data(await owner.get('/orders/'+order.id));assert.equal(order.display.delivery.code,'DELIVERED');assert.equal(order.display.order.code,'COMPLETED','all parcels received → completed (OD-4.8)');
  // The phone of the order goes with every tracking request (needed for a TTN of another cabinet).
  const asked=JSON.parse(s.sql("SELECT v FROM meta WHERE k='np_mock_last_tracking'")[0]?.v||'[]');assert.ok(asked.length>0&&asked.every(d=>/^380\d{9}$/.test(d.Phone)),JSON.stringify(asked));
  // The buyer cabinet with a logged-in buyer: crm-stage4-e2e «E2E 13» (manual TTN from the CRM screen).
 }finally{s.stop();}
});
