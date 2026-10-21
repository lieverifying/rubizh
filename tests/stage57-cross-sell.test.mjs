// Stage 5.7 (owner D-88): under every order the storefront offers the SHOWER PACK sets and Starter Pack («Додати до
// замовлення» in the cart / checkout); single items are not offered; an item already in the cart is not offered. Such items
// carry «Надійде окремою посилкою, доставка за тарифом Нової пошти» (block, cart, product card) and travel as a separate
// parcel with its own supplier and its own hand-entered TTN; the order completes when every parcel is received (OD-4.8).
// The fixture belt (supplier Tactical Belt, article TB-D-BK) plays the SHOWER PACK set; SITE marks it from its own config.
import {test} from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {existsSync,mkdirSync} from 'node:fs';import {spawnSync} from 'node:child_process';import path from 'node:path';
import {chromium} from 'playwright';
import {startCrm,line} from './helpers/crm-fixture.mjs';import {wire,runtime,phpArgs,phpEnv,chunksFor} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const exe=process.env.CHROMIUM_PATH||'/usr/bin/chromium',NOTE='Надійде окремою посилкою, доставка за тарифом Нової пошти';
const CONFIG=",'separate_parcel_suppliers'=>['Tactical Belt'],'cross_sell_supplier_skus'=>['Tactical Belt'=>['TB-D-BK']]";
const mockRef=seed=>{const h=createHash('sha256').update('np-mock|'+seed).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;};
const KYIV=mockRef('city:kyiv'),NP={np_delivery:{city_ref:KYIV,warehouse_ref:mockRef('wh:'+KYIV+':1')}};
const belt=()=>({product_id:'m-belt',color_id:wire.products.find(m=>m.id==='m-belt').colors[0].id,sku:'RUB-F0030',qty:1});
const key=()=>crypto.randomUUID().replaceAll('-','');const data=r=>{assert.ok(r.status===200||r.status===201,JSON.stringify(r.data));return r.data.data;};

test('5.7 cross-sell: flags from SITE config, the block on a phone, add from the block, two parcels in CRM',{skip,timeout:400000},async()=>{
 const s=await startCrm({npMock:true,stock:20,extraConfig:CONFIG});
 const browser=await chromium.launch({executablePath:existsSync(exe)?exe:undefined,args:['--no-sandbox']});
 try{
  // The fixture belt is not orderable (UNKNOWN); make it in stock like the jacket so the storefront may offer it.
  const w=structuredClone(s.wire),jacket=w.products.find(m=>m.id==='m-jacket').variants.find(v=>v.sku==='RUB-F0001'),bv=w.products.find(m=>m.id==='m-belt').variants[0];
  for(const k of ['availability','availability_status','availability_source','availability_confirmation','order_submission_allowed','payment_allowed','requires_order_confirmation','stock','stock_quantity','stock_status','inventory_mode','inventory_policy_confirmed','stock_observed_at','ready_to_dispatch'])if(k in jacket)bv[k]=structuredClone(jacket[k]);
  for(const body of chunksFor(w))assert.equal((await s.post('/api/pim/sync',body,s.auth)).status,200);s.wire=w;
  // Public flags only — the supplier name and article never reach the storefront.
  const product=async id=>(await s.get('/shop/catalog.php?action=product&id='+id)).data.product;
  const b=await product('m-belt'),j=await product('m-jacket');
  assert.equal(b.cross_sell,true);assert.equal(b.separate_parcel,true);assert.equal(j.cross_sell,false);assert.equal(j.separate_parcel,false);
  assert.doesNotMatch(JSON.stringify([b,j]),/Tactical Belt|TB-D-BK|M-WIN|MW-J/);

  const ctx=await browser.newContext({viewport:{width:390,height:844}});await ctx.addInitScript(()=>{try{localStorage.setItem('rubizh.theme','light');}catch{}});const page=await ctx.newPage();
  await page.goto(s.base+'/product/kurtka-fixture-softshell');await page.locator('[data-store-surface]').waitFor();
  await page.getByRole('button',{name:'M',exact:true}).click();await page.getByRole('button',{name:/До кошика/}).first().click();
  const go=page.getByRole('button',{name:'Продовжити',exact:true});if(await go.count())await go.first().click();
  await page.locator('header [aria-label="Кошик"]').click();await page.getByRole('heading',{name:'Оформлення замовлення'}).waitFor();
  const block=page.locator('[data-cross-sell]');await block.waitFor();
  const cards=block.locator('[data-cross-sell-card]');assert.equal(await cards.count(),1,'only the cross-sell set is offered');
  assert.match(await cards.first().innerText(),/Ремінь Fixture Duty/);assert.doesNotMatch(await block.innerText(),/Штани|Підсумок|Куртка/,'single items and the cart item are not offered');
  assert.match(await cards.first().innerText(),new RegExp(NOTE));
  const button=cards.first().locator('[data-cross-sell-add]');const box=await button.boundingBox();assert.ok(box.height>=44&&box.width>=44,'button ≥ 44 px: '+JSON.stringify(box));
  for(const sel of ['.rz-xsell-name','.rz-separate-note','.rz-xsell-add'])assert.ok(parseFloat(await cards.first().locator(sel).evaluate(e=>getComputedStyle(e).fontSize))>=14,sel+' ≥ 14 px');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal scroll at 390 px');
  if(process.env.RUBIZH_SHOT_DIR){mkdirSync(process.env.RUBIZH_SHOT_DIR,{recursive:true});await block.screenshot({path:path.join(process.env.RUBIZH_SHOT_DIR,'cross-sell-phone-light.png')});}
  // Add from the block: the set is in the cart with its note, and the block no longer offers it.
  // The storefront locks a repeated add for 1.5 s after the previous one (double-click guard); a buyer never adds faster.
  await page.waitForTimeout(1600);await button.click();const cont=page.getByRole('button',{name:'Продовжити',exact:true});try{await cont.first().waitFor({timeout:5000});await cont.first().click();}catch{}
  await page.locator('[data-cross-sell]').waitFor({state:'detached'});
  assert.match(await page.locator('main, body').first().innerText(),/Ремінь Fixture Duty/i,'the set is in the cart (cart lines are upper-cased by CSS)');
  assert.ok(await page.locator('[data-separate-parcel]').count()>=1,'cart line carries the separate-parcel note');
  // The product card carries the note too.
  await page.goto(s.base+'/product/remin-fixture-duty');await page.locator('[data-store-surface]').waitFor();await page.getByText(NOTE).first().waitFor();
  await ctx.close();

  // CRM: the jacket (M-WIN) and the set (Tactical Belt) are two parcels with their own TTN; one TTN cannot mix suppliers.
  const owner=await s.login('OWNER'),wh=await s.login('LOGISTICS');
  const o=await s.checkout([{...line(),qty:1},belt()],NP);let order=data(await owner.get('/orders/'+o.id));
  await owner.send('/orders/'+o.id+'/invoice',{version:order.version});const inv=s.sql('SELECT * FROM rubizh_mono_invoices WHERE order_id='+o.id+' ORDER BY id DESC LIMIT 1')[0];assert.equal((await s.webhook(inv)).status,200);
  order=data(await owner.get('/orders/'+o.id));const route='/orders/'+o.id+'/shipments/manual';
  const lineNo=sku=>order.lines.findIndex(l=>l.sku===sku);
  const ttn=(lines,number)=>wh.send(route,{version:order.version,request_id:key(),availability_confirmed:true,extra_delivery_agreed:true,lines,tracking_number:number});
  let r=await ttn([{line_no:lineNo('RUB-F0001'),qty:1},{line_no:lineNo('RUB-F0030'),qty:1}],'20450000000571');assert.notEqual(r.status,201,'one TTN for two suppliers is refused: '+JSON.stringify(r.data));
  r=await ttn([{line_no:lineNo('RUB-F0001'),qty:1}],'20450000000572');assert.equal(r.status,201,JSON.stringify(r.data));order=r.data.data;
  r=await ttn([{line_no:lineNo('RUB-F0030'),qty:1}],'20450000000573');assert.equal(r.status,201,JSON.stringify(r.data));order=r.data.data;
  assert.equal(order.shipments.filter(p=>p.tracking_number).length,2,'two parcels');
  assert.equal(new Set(s.sql('SELECT supplier_code FROM rubizh_order_shipments WHERE order_id='+o.id+' AND tracking_number IS NOT NULL').map(x=>x.supplier_code)).size,2,'each parcel has its own supplier');
  const worker=()=>{s.sql('UPDATE rubizh_order_shipments SET checked_at=NULL');const p=spawnSync(runtime+'/bin/php8.4',[...phpArgs,path.join(s.site,'shop/np-worker.php')],{env:phpEnv,encoding:'utf8'});assert.equal(p.status,0,p.stdout+p.stderr);};
  s.sql(`INSERT INTO meta(k,v) VALUES('np_mock_status_20450000000572','9'),('np_mock_status_20450000000573','9') ON DUPLICATE KEY UPDATE v='9'`);worker();
  assert.equal(data(await owner.get('/orders/'+o.id)).display.order.code,'COMPLETED','all parcels received → completed (OD-4.8)');
 }finally{await browser.close();s.stop();}
});
