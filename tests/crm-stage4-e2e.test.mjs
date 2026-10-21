// Stage 4 (ТЗ §10): twelve end-to-end scenarios on one stand — the SITE storefront/cabinet and the CRM in a real
// browser, the staging mock bank (signed webhooks) and the NP mock (directory, TTN save modes, tracking statuses).
import {test} from 'node:test';import assert from 'node:assert/strict';import {chromium} from 'playwright';import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import path from 'node:path';
import {startCrm,password,staffEmail} from './helpers/crm-fixture.mjs';import {php} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const reports=(process.env.RUBIZH_TEST_REPORTS||'/workspace/reports')+'/crm-e2e';mkdirSync(reports,{recursive:true});
const mockRef=seed=>{const h=createHash('sha256').update('np-mock|'+seed).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;};
const KYIV=mockRef('city:kyiv'),WH=mockRef('wh:'+KYIV+':1'),NP={np_delivery:{city_ref:KYIV,warehouse_ref:WH}};
const key=()=>crypto.randomUUID().replaceAll('-','');

/** One stand: SITE + CRM dist, NP mock, SMS codes to a local outbox, confirmed mock sender profiles. */
async function stand({stock=50}={}){
 const s=await startCrm({frontend:true,npMock:true,stock,extraConfig:",'staging_allow_loopback'=>true"});
 writeFileSync(path.join(s.site,'auth/config.php'),"<?php return ['sms_enabled'=>true,'turbosms_token'=>'fixture-token','turbosms_sender'=>'RUBIZH','google_enabled'=>false,'noreply_password'=>'','auth_secret'=>str_repeat('s',48),'sms_daily_limit'=>50,'sms_test_outbox'=>__DIR__.'/../sms-outbox.jsonl'];");
 // Same migrations as the go-live checklist (step 8): the R6 NP recovery columns.
 php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${s.site}/auth/bootstrap.php';npRecoveryMigrate(shopStoreDatabase());`);
 s.sql(`UPDATE rubizh_sender_profiles SET city='Київ',region='Київська',branch='1',city_ref='${KYIV}',warehouse_ref='${WH}',sender_ref='${mockRef('sender')}',contact_ref='${mockRef('contact')}',phone='+380671234567',confirmed=1`);
 s.browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 s.close=async()=>{await s.browser.close();s.stop();};
 s.one=q=>s.sql(q)[0];
 return s;
}
/** In-stock lines, one per supplier (the stand catalogue has several suppliers). */
function linesBySupplier(s){
 return JSON.parse(php(`require '${s.site}/dev/crm-synthetic.php';$db=shopStoreDatabase();$o=[];foreach($db->query("SELECT v.sku,v.product_id,v.pim_color_id color_id,f.supplier_name FROM variants v JOIN products p ON p.id=v.product_id LEFT JOIN rubizh_catalog_fulfillment f ON f.sku=v.sku AND f.product_id=v.product_id WHERE p.visible=1 AND p.pim_publication_state='ACTIVE' AND p.pim_contract_version=3 AND v.pim_active=1 AND v.pim_payment_allowed=1 AND v.pim_price_ready=1 ORDER BY v.pim_stock_quantity IS NULL,v.sku") as $r){$c=npSupplierCode($r['sku'],$r['product_id'],(string)$r['supplier_name']);if($c!==''&&!isset($o[$c]))$o[$c]=['product_id'=>$r['product_id'],'color_id'=>(string)$r['color_id'],'sku'=>$r['sku'],'qty'=>1];}echo json_encode(array_values($o));`).stdout);
}
/** Buyer in a browser context: SMS login (outbox code) and checkout through the site's own endpoints. */
async function buyer(s,phone){
 const ctx=await s.browser.newContext({viewport:{width:390,height:844}});const page=await ctx.newPage();const b={ctx,page};
 b.login=async()=>{
  await page.goto(s.base+'/auth/');await page.locator('#entry-phone').fill(phone);await page.getByRole('button',{name:/Отримати код/}).first().click();
  await page.getByLabel(/Код підтвердження/).waitFor({timeout:30000});
  const code=readFileSync(path.join(s.site,'sms-outbox.jsonl'),'utf8').trim().split('\n').map(l=>JSON.parse(l)).filter(x=>x.phone.replace(/\D/g,'').endsWith(phone.replace(/\D/g,'').slice(-9))).pop().code;
  await page.getByLabel(/Код підтвердження/).fill(code);await page.getByLabel(/Код підтвердження/).press('Enter');await page.waitForLoadState('networkidle');
 };
 // Same-origin fetch from the page, exactly as the storefront script sends it (session cookie, CSRF, Origin).
 b.post=async(url,data)=>{if(page.url()!==s.base+'/')await page.goto(s.base+'/');return page.evaluate(async([url,data])=>{const c=await (await fetch('/shop/customer.php',{credentials:'same-origin'})).json();const r=await fetch(url,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({csrf:c.csrf,...data})});return {status:r.status,data:await r.json()};},[url,data]);};
 b.checkout=async(lines,{payment='card'}={})=>{
  const q=await b.post('/shop/checkout-quote.php',{lines,payment});assert.equal(q.status,200,JSON.stringify(q.data));
  const contact={name:'Олена Петренко',recipient:'Олена Петренко',email:'',phone,city:'Київ',address:'Відділення №1',delivery_type:'branch',...NP};
  const o=await b.post('/shop/order.php',{request_id:key(),contact,payment,lines,expected_total:q.data.quote.total,catalog_version:q.data.quote.catalog_version});assert.equal(o.status,200,JSON.stringify(o.data));
  return o.data.order;
 };
 b.pay=async id=>{const r=await b.post('/shop/payment-start.php',{order_id:id});assert.equal(r.status,200,JSON.stringify(r.data));const inv=s.one('SELECT * FROM rubizh_mono_invoices WHERE order_id='+id+' AND invoice_id IS NOT NULL ORDER BY id DESC LIMIT 1');assert.equal((await s.webhook(inv)).status,200);return inv;};
 b.cabinet=async id=>{await page.goto(s.base+'/auth/?tab=orders&order='+id);await page.waitForLoadState('networkidle');return page.locator('body').innerText();};
 return b;
}
/** Staff member in the CRM UI. */
async function staff(s,role,{width=1440,height=900}={}){
 const ctx=await s.browser.newContext({viewport:{width,height}});const page=await ctx.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));if(process.env.E2E_DEBUG)page.on('response',async r=>{if(r.request().method()==='POST'&&r.url().includes('/api/staff/orders/')){try{const j=await r.json();console.error('RESP',r.url(),r.status(),JSON.stringify(Object.keys(j.data??j)).slice(0,600));}catch{}}});page.on('response',r=>{if(r.url().includes('/api/staff/')&&r.status()>=500)errors.push(r.status()+' '+r.url());});
 await page.goto(s.base+'/crm/');await page.getByLabel('Email').fill(staffEmail(role));await page.getByLabel('Пароль',{exact:true}).fill(password);await page.getByRole('button',{name:'Увійти'}).click();
 await page.getByRole('navigation',{name:'Основне'}).waitFor();
 const u={page,errors,ctx};
 u.order=async id=>{await page.goto(s.base+'/crm/orders/'+id);await page.getByRole('heading',{level:1}).waitFor();await page.waitForLoadState('networkidle');};
 /** Opens an action (from the order action bar or a given container), fills the dialog, submits, waits for it to close. */
 u.act=async(button,{reason,fill,from}={})=>{
  const btn=(from??page.locator('.actions-bar')).getByRole('button',{name:button,exact:true}).first();
  try{await btn.click({timeout:15000});}catch(e){await page.screenshot({path:reports+'/fail-'+button.replace(/\W+/g,'_')+'.png',fullPage:true});throw new Error(button+' not available; errors: '+JSON.stringify(errors)+' page: '+(await page.locator('body').innerText()).replace(/^[\s\S]*?Посилки/,'Посилки').slice(0,900));}
  const d=page.getByRole('dialog');await d.waitFor();if(fill)await fill(d);if(reason)await d.getByLabel('Причина').fill(reason);
  await d.locator('.dialog-actions button').last().click();
  try{await d.waitFor({state:'detached',timeout:20000});}catch{throw new Error(button+': '+(await d.innerText()));}
  await page.waitForLoadState('networkidle');
 };
 u.text=()=>page.locator('body').innerText();
 return u;
}
const card=async(s,id,role='OWNER')=>(await (await s.login(role)).get('/orders/'+id)).data.data;
const parcels=u=>u.page.locator('.parcel').filter({has:u.page.getByRole('button')});

test('E2E 1: in-stock order on SITE → CRM → bank webhook → paid in CRM and cabinet → packing → TTN for two suppliers → delivered → completed; cabinet shows two parcels',{skip,timeout:600000},async()=>{
 const s=await stand();
 try{
  const lines=linesBySupplier(s).slice(0,2);assert.equal(lines.length,2,'two suppliers in the stand catalogue');
  const b=await buyer(s,'+380671230001');await b.login();
  const o=await b.checkout(lines);const m=await staff(s,'MANAGER');
  await m.order(o.id);await m.act('Взяти в роботу');
  await b.pay(o.id);
  await m.order(o.id);assert.equal((await card(s,o.id)).display.payment.code,'PAID');assert.match(await b.cabinet(o.id),/Оплачено/);
  await m.act('Передати в комплектацію');
  for(let i=0;i<2;i++)await m.act('Створити відправлення',{from:m.page.locator('.actions-bar'),fill:async d=>{await d.getByRole('combobox').selectOption({index:i});await d.getByLabel(/Фактичну наявність/).check();const extra=d.getByLabel(/Окремі посилки/);if(await extra.count())await extra.check();}});
  for(let i=0;i<2;i++)await m.act('Створити ТТН',{from:m.page.locator('.parcel').filter({hasText:'Чернетка'}).first()});
  const ttns=s.sql('SELECT tracking_number FROM rubizh_order_shipments WHERE order_id='+o.id+" AND tracking_number<>''").map(r=>r.tracking_number);assert.equal(ttns.length,2,'two TTN');
  for(const t of ttns)s.sql(`INSERT INTO meta(k,v) VALUES('np_mock_status_${t}','9') ON DUPLICATE KEY UPDATE v='9'`);
  // One NP refresh reads the tracking of every parcel of the order.
  await m.act('Оновити статус',{from:m.page.locator('.parcel').filter({hasText:'ТТН створено'}).first()});
  assert.equal(await m.page.locator('.parcel').filter({hasText:'Доставлено'}).count(),2,'both parcels delivered');
  // SITE completes the order when every parcel is delivered; «Завершити» stays for an order not completed that way.
  await m.order(o.id);if(await m.page.locator('.actions-bar').getByRole('button',{name:'Завершити',exact:true}).count())await m.act('Завершити');
  const c=await card(s,o.id);assert.equal(c.display.order.code,'COMPLETED');assert.equal(c.display.delivery.code,'DELIVERED');
  const cab=await b.cabinet(o.id);for(const t of ttns)assert.match(cab,new RegExp(t));assert.match(cab,/Посилка 1 із 2/);assert.match(cab,/Посилка 2 із 2/);
  assert.deepEqual(m.errors,[]);
 }finally{await s.close();}
});

// Stage 5.6-2 (D-83): dropshipping — the supplier created the TTN in its own NP cabinet; the manager enters it in CRM.
test('E2E 13: «Внести ТТН вручну» → format check in the dialog → NP status «отримано» → order completed; the buyer sees the TTN',{skip,timeout:600000},async()=>{
 const s=await stand();
 try{
  const [l]=linesBySupplier(s);const b=await buyer(s,'+380671230013');await b.login();
  const o=await b.checkout([l]);const m=await staff(s,'MANAGER');
  await m.order(o.id);await m.act('Взяти в роботу');await b.pay(o.id);await m.order(o.id);
  // A wrong number is explained in the dialog and cannot be sent (the server refuses it too: stage56-manual-ttn); nothing is saved.
  await m.page.locator('.actions-bar').getByRole('button',{name:'Внести ТТН вручну',exact:true}).click();
  let d=m.page.getByRole('dialog');await d.getByLabel(/Номер ТТН/).fill('12345');await d.getByLabel(/Фактичну наявність/).check();
  await assertText(d,/14 цифр, наприклад/);assert.equal(await d.locator('.dialog-actions button').last().isDisabled(),true,'no request with a wrong number');
  assert.equal(s.sql('SELECT COUNT(*) n FROM rubizh_order_shipments WHERE order_id='+o.id)[0].n,0);
  await d.getByLabel(/Номер ТТН/).fill('2045 0123 4567 13');await d.locator('.dialog-actions button').last().click();await d.waitFor({state:'detached',timeout:20000});await m.page.waitForLoadState('networkidle');
  assert.match(await m.text(),/20450123456713/);assert.equal(s.one('SELECT tracking_number t FROM rubizh_order_shipments WHERE order_id='+o.id).t,'20450123456713');
  s.sql("INSERT INTO meta(k,v) VALUES('np_mock_status_20450123456713','9') ON DUPLICATE KEY UPDATE v='9'");
  await m.act('Оновити статус',{from:m.page.locator('.parcel').filter({hasText:'20450123456713'}).first()});
  const c=await card(s,o.id);assert.equal(c.display.delivery.code,'DELIVERED');assert.equal(c.display.order.code,'COMPLETED','all parcels received → completed');
  const cab=await b.cabinet(o.id);assert.match(cab,/20450123456713/);assert.match(cab,/Отримано/);
  assert.deepEqual(m.errors,[]);
 }finally{await s.close();}
});
async function assertText(locator,re){for(let i=0;i<50;i++){if(re.test(await locator.innerText().catch(()=>'')))return;await new Promise(r=>setTimeout(r,100));}assert.match(await locator.innerText(),re);}

const PREORDER=()=>{const m=JSON.parse(readFileSync(path.resolve(import.meta.dirname,'../contracts/pim-v3/2/wire.exact.json'),'utf8')).products.find(p=>p.id==='m-pouch');const v=m.variants.find(x=>x.sku==='RUB-F0020');return {product_id:'m-pouch',color_id:m.colors.find(c=>c.variant_skus.includes('RUB-F0020')).id,sku:'RUB-F0020',qty:1,_variant:v};};
const IN_STOCK=()=>({product_id:'m-jacket',color_id:JSON.parse(readFileSync(path.resolve(import.meta.dirname,'../contracts/pim-v3/2/wire.exact.json'),'utf8')).products.find(p=>p.id==='m-jacket').colors.find(c=>c.variant_skus.includes('RUB-F0001')).id,sku:'RUB-F0001',qty:1});
const lineOnly=l=>{const {_variant,...x}=l;return x;};
/** «Посилання на оплату»: the dialog stays open with the bank link; copy and close. */
async function invoiceLink(u){
 await u.page.locator('.actions-bar').getByRole('button',{name:'Посилання на оплату',exact:true}).click();
 const d=u.page.getByRole('dialog');await d.locator('.dialog-actions button').last().click();
 const link=await d.getByLabel('Посилання на оплату').inputValue();assert.match(link,/^https:\/\/pay\.mbnk\.biz\//);
 await d.locator('.dialog-actions button').last().click();await d.waitFor({state:'detached'});return link;
}
async function shipAndDeliver(s,u,id){
 await u.act('Створити відправлення',{fill:async d=>{await d.getByLabel(/Фактичну наявність/).check();}});
 await u.act('Створити ТТН',{from:u.page.locator('.parcel').filter({hasText:'Чернетка'}).first()});
 for(const r of s.sql('SELECT tracking_number FROM rubizh_order_shipments WHERE order_id='+id+" AND tracking_number<>''"))s.sql(`INSERT INTO meta(k,v) VALUES('np_mock_status_${r.tracking_number}','9') ON DUPLICATE KEY UPDATE v='9'`);
 await u.act('Оновити статус',{from:u.page.locator('.parcel').filter({hasText:'ТТН створено'}).first()});
}

test('E2E 2: preorder → manager confirmation → payment link → bank payment → packing → TTN → delivered',{skip,timeout:600000},async()=>{
 const s=await stand();
 try{
  const b=await buyer(s,'+380671230002');await b.login();const o=await b.checkout([lineOnly(PREORDER())]);
  let c=await card(s,o.id);assert.equal(c.display.order.code,'WAITING_CONFIRMATION');assert.ok(c.actions.includes('confirm'),JSON.stringify(c.actions));
  const m=await staff(s,'MANAGER');await m.order(o.id);await m.act('Взяти в роботу');
  await m.act('Підтвердити замовлення',{fill:async d=>{await d.getByLabel(/Наявність і комплектацію всіх позицій/).check();}});
  await invoiceLink(m);
  const inv=s.one('SELECT * FROM rubizh_mono_invoices WHERE order_id='+o.id+' AND invoice_id IS NOT NULL ORDER BY id DESC LIMIT 1');assert.equal((await s.webhook(inv)).status,200);
  await m.order(o.id);await m.act('Передати в комплектацію');await shipAndDeliver(s,m,o.id);
  c=await card(s,o.id);assert.equal(c.display.payment.code,'PAID');assert.equal(c.display.delivery.code,'DELIVERED');assert.match(await b.cabinet(o.id),/Оплачено/);
  assert.deepEqual(m.errors,[]);
 }finally{await s.close();}
});

test('E2E 3: preorder confirmation after a price change stops with an explanation; the manager cannot approve the new price',{skip,timeout:600000},async()=>{
 const s=await stand();
 try{
  const b=await buyer(s,'+380671230003');await b.login();const o=await b.checkout([lineOnly(PREORDER())]);
  // PIM publishes a new price for the SKU (contract-3 sync of the same catalogue with another price).
  const w=structuredClone(s.wire);for(const m of w.products)for(const v of m.variants)if(v.sku==='RUB-F0020'){v.price=Math.round(v.price*1.2);if(v.site_price)v.site_price=Math.round(v.site_price*1.2);}
  const {publish}=await import('./helpers/site-fixture.mjs');assert.equal((await publish(s,w)).status,200);
  const m=await staff(s,'MANAGER');await m.order(o.id);await m.act('Взяти в роботу');
  await m.page.locator('.actions-bar').getByRole('button',{name:'Підтвердити замовлення',exact:true}).click();
  const d=m.page.getByRole('dialog');await d.getByLabel(/Наявність і комплектацію всіх позицій/).check();await d.locator('.dialog-actions button').last().click();
  await d.getByText(/Ціна змінилася: було/).waitFor();assert.match(await d.innerText(),/Погодити нову ціну може лише власник/);
  assert.equal(await d.locator('.dialog-actions button').last().isDisabled(),true,'manager cannot approve');
  const c=await card(s,o.id);assert.equal(c.display.order.code,'WAITING_CONFIRMATION','order stays unconfirmed');assert.equal(+s.one('SELECT COUNT(*) n FROM rubizh_mono_invoices WHERE order_id='+o.id).n,0,'no payment link');
 }finally{await s.close();}
});

test('E2E 4: telephone order in the CRM → payment link → bank payment → the order appears in the cabinet after SMS login',{skip,timeout:600000},async()=>{
 const s=await stand();
 try{
  const m=await staff(s,'MANAGER');const p=m.page;await p.goto(s.base+'/crm/orders/new');await p.getByRole('heading',{name:'Нове замовлення'}).waitFor();
  await p.getByLabel('Модель або SKU').fill('RUB-F0001');await p.locator('.cmdk-item').first().click();
  const color=p.getByLabel('Колір');await p.waitForFunction(()=>{const sel=[...document.querySelectorAll('label')].find(l=>l.textContent.trim().startsWith('Колір'))?.querySelector('select');return !sel||sel.options.length>1;});if(await color.count()){const opts=await color.locator('option').evaluateAll(os=>os.map(o=>o.value).filter(Boolean));if(opts.length)await color.selectOption(opts[0]);}
  await p.getByLabel('Розмір').waitFor({timeout:10000}).catch(async e=>{await p.screenshot({path:reports+'/e2e4-picker.png',fullPage:true});throw new Error('size select: '+(await p.locator('form').innerText()).slice(0,600));});
  {const opts=await p.getByLabel('Розмір').locator('option').evaluateAll(os=>os.map(o=>o.value).filter(Boolean));await p.getByLabel('Розмір').selectOption(opts.includes('RUB-F0001')?'RUB-F0001':opts[0]);}
  await p.getByRole('button',{name:'Додати'}).click();
  await p.getByLabel('Місто').fill('Київ');await p.locator('.cmdk-item').filter({hasText:'Київ'}).first().click();
  await p.getByLabel('Відділення').locator('option').nth(1).waitFor({state:'attached',timeout:15000});
  const wh=await p.getByLabel('Відділення').locator('option').evaluateAll(os=>os.map(o=>o.value).filter(Boolean));await p.getByLabel('Відділення').selectOption(wh[0]);
  await p.getByLabel('Телефон (+380…)').fill('+380 67 123 00 04');await p.getByLabel('Ім’я та прізвище').fill('Тарас Шевченко');
  await p.getByRole('button',{name:'Перевірити суму'}).click();await p.getByRole('button',{name:'Створити замовлення'}).click();
  await p.getByRole('heading',{level:1}).filter({hasText:/^RB-/}).waitFor();const id=+p.url().split('/').pop();
  await p.waitForLoadState('networkidle');await invoiceLink(m);
  const inv=s.one('SELECT * FROM rubizh_mono_invoices WHERE order_id='+id+' AND invoice_id IS NOT NULL ORDER BY id DESC LIMIT 1');assert.equal((await s.webhook(inv)).status,200);
  assert.equal((await card(s,id)).channel,'phone');assert.equal(+s.one('SELECT COUNT(*) n FROM rubizh_account_orders WHERE order_id='+id).n,0,'no account link before SMS login');
  const b=await buyer(s,'+380671230004');await b.login();const cab=await b.cabinet(id);
  assert.match(cab,new RegExp(s.one('SELECT order_number FROM rubizh_customer_orders WHERE id='+id).order_number));assert.match(cab,/Оплачено/);
  assert.deepEqual(m.errors,[]);
 }finally{await s.close();}
});

test('E2E 5: cancellation before payment releases the reserve and closes the bank invoice',{skip,timeout:600000},async()=>{
 const s=await stand();
 try{
  const b=await buyer(s,'+380671230005');await b.login();const o=await b.checkout([IN_STOCK()]);
  const r=await b.post('/shop/payment-start.php',{order_id:o.id});assert.equal(r.status,200,JSON.stringify(r.data));
  assert.equal(+s.one("SELECT COUNT(*) n FROM rubizh_mono_invoices WHERE order_id="+o.id+" AND status='created'").n,1);
  const m=await staff(s,'MANAGER');await m.order(o.id);await m.act('Взяти в роботу');await m.act('Скасувати замовлення',{reason:'Покупець відмовився до оплати'});
  const c=await card(s,o.id);assert.equal(c.display.order.code,'CANCELLED');
  assert.equal(+s.one("SELECT COUNT(*) n FROM rubizh_mono_invoices WHERE order_id="+o.id+" AND status IN ('created','processing','hold','creating')").n,0,'no open bank invoice');
  assert.deepEqual(s.sql('SELECT DISTINCT status FROM rubizh_stock_reservations WHERE order_id='+o.id).map(x=>x.status),['RELEASED'],'reserve released');
  assert.match(await b.cabinet(o.id),/Скасовано/);
 }finally{await s.close();}
});

test('E2E 6: paid order → return request → partial refund → «повернено частково» in the CRM and in the cabinet',{skip,timeout:600000},async()=>{
 const s=await stand();
 try{
  const b=await buyer(s,'+380671230006');await b.login();const o=await b.checkout([{...IN_STOCK(),qty:2}]);await b.pay(o.id);
  const m=await staff(s,'OWNER');await m.order(o.id);await m.act('Взяти в роботу');await m.act('Передати в комплектацію');await shipAndDeliver(s,m,o.id);
  await m.order(o.id);await m.act('Запит повернення',{reason:'Не підійшов розмір одного товару',fill:async d=>{const q=d.locator('input[type=number]').first();if(await q.count())await q.fill('1');}});
  const inv=s.one("SELECT id,amount FROM rubizh_mono_invoices WHERE order_id="+o.id+" AND status='success'");
  await m.page.goto(s.base+'/crm/payments/'+inv.id);await m.page.getByRole('heading',{level:1}).waitFor();
  const half=Math.round(+inv.amount/2);
  await m.act('Повернути кошти',{from:m.page.locator('body'),reason:'Повернення одного з двох товарів',fill:async d=>{await d.getByLabel(/Сума/).fill(String(half/100));}});
  const c=await card(s,o.id);assert.equal(c.display.payment.code,'PARTIALLY_REFUNDED');
  await m.order(o.id);assert.match(await m.text(),/повернено частково/);
  assert.match(await b.cabinet(o.id),/повернено частково|Повернено частково/i);
 }finally{await s.close();}
});

test('E2E 7: disputed MonoPay event → «Потребують перевірки» → bank check → resolved with audit; an attempt without bank id → «рахунок у банку не створено» (R-C1)',{skip,timeout:600000},async()=>{
 const s=await stand();
 try{
  const b=await buyer(s,'+380671230007');await b.login();const o=await b.checkout([IN_STOCK()]);
  const r=await b.post('/shop/payment-start.php',{order_id:o.id});assert.equal(r.status,200);
  const inv=s.one('SELECT * FROM rubizh_mono_invoices WHERE order_id='+o.id+' AND invoice_id IS NOT NULL');
  const w=await s.webhook({...inv,amount:+inv.amount+100});assert.equal(w.status,200,'permanent mismatch is acknowledged and parked');
  // 5.6.1: the worker must really run and succeed — allowFail hid «Cannot redeclare database()» since CRM stage 4.
  php(`require '${s.site}/staff/worker.php';echo json_encode(crmWorkerRun(shopStoreDatabase()));`);
  const u=await staff(s,'OWNER');await u.page.goto(s.base+'/crm/payments?view=review');await u.page.getByRole('heading',{level:1}).waitFor();await u.page.waitForLoadState('networkidle');
  const row=()=>u.page.locator('.parcel').filter({hasText:o.number}).first();await row().waitFor();
  await row().getByRole('button',{name:'Перевірити в банку зараз'}).click();await u.page.getByText('Банк перевірено').first().waitFor();
  await u.act('Позначити розглянутим',{from:row(),reason:'Сума в банку відповідає рахунку, подія помилкова'});
  await row().getByText('розглянуто').waitFor();
  assert.ok(s.sql("SELECT action FROM rubizh_staff_audit WHERE action LIKE 'payment.review%'").length>=2,'check and resolution audited');
  // R-C1: an attempt that never got a bank id.
  const o2=await b.checkout([IN_STOCK()]);s.sql("INSERT INTO rubizh_mono_invoices(order_id,reference,amount,status,created_at,updated_at) VALUES("+o2.id+",'rc1-e2e',286000,'creating',UTC_TIMESTAMP()-INTERVAL 1 HOUR,UTC_TIMESTAMP()-INTERVAL 1 HOUR)");
  await u.order(o2.id);await u.act('Рахунок у банку не створено',{reason:'У кабінеті банку рахунку немає'});
  assert.equal(s.one("SELECT status FROM rubizh_mono_invoices WHERE reference='rc1-e2e'").status,'failure');
  assert.deepEqual(u.errors,[]);
 }finally{await s.close();}
});

test('E2E 8: supplier has no stock for a line → the line is removed and the total is recomputed',{skip,timeout:600000},async()=>{
 const s=await stand();
 try{
  const lines=linesBySupplier(s);const b=await buyer(s,'+380671230008');await b.login();const o=await b.checkout([IN_STOCK(),...lines.filter(l=>l.sku!=='RUB-F0001').slice(0,1)]);
  const before=(await card(s,o.id)).total_minor;const m=await staff(s,'MANAGER');await m.order(o.id);await m.act('Взяти в роботу');
  await m.act('Немає',{from:m.page.locator('.line').nth(1)});
  await m.act('Прибрати позицію',{from:m.page.locator('.line').nth(1),reason:'Постачальник не має товару'});
  const c=await card(s,o.id);assert.equal(c.lines.length,1);assert.ok(c.total_minor<before,'total recomputed');
  assert.ok(s.sql("SELECT action FROM rubizh_order_audit WHERE order_id="+o.id).some(r=>/line_remove|reline/.test(r.action)));
 }finally{await s.close();}
});

test('E2E 9: manager B cannot change manager A’s order without reassignment; WAREHOUSE sees no finance; SUPPORT cannot change orders',{skip,timeout:600000},async()=>{
 const s=await stand();
 try{
  s.sql("INSERT INTO rubizh_staff_users(id,email,name,password_hash,role,created_at,updated_at) SELECT 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','manager.b@fixture.test','Менеджер Б',password_hash,'MANAGER',UTC_TIMESTAMP(),UTC_TIMESTAMP() FROM rubizh_staff_users WHERE email='"+staffEmail('MANAGER')+"'");
  const b=await buyer(s,'+380671230009');await b.login();const o=await b.checkout([lineOnly(PREORDER())]);
  const a=await staff(s,'MANAGER');await a.order(o.id);await a.act('Взяти в роботу');
  const ctx=await s.browser.newContext({viewport:{width:1440,height:900}});const p=await ctx.newPage();
  await p.goto(s.base+'/crm/');await p.getByLabel('Email').fill('manager.b@fixture.test');await p.getByLabel('Пароль',{exact:true}).fill(password);await p.getByRole('button',{name:'Увійти'}).click();await p.getByRole('navigation',{name:'Основне'}).waitFor();
  await p.goto(s.base+'/crm/orders/'+o.id);await p.getByRole('heading',{level:1}).waitFor();await p.waitForLoadState('networkidle');
  const bar=await p.locator('.actions-bar').innerText();assert.doesNotMatch(bar,/Підтвердити замовлення|Скасувати замовлення/,'B sees no change actions');assert.match(bar,/Призначити/);
  const api=await p.evaluate(async id=>{const s=await (await fetch('/api/staff/auth/session')).json();const card=await (await fetch('/api/staff/orders/'+id)).json();const r=await fetch('/api/staff/orders/'+id+'/cancel',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':s.meta.csrf,'Idempotency-Key':crypto.randomUUID().replaceAll('-','')},body:JSON.stringify({reason:'Спроба чужого менеджера',expected_version:card.data.version})});return {status:r.status,code:(await r.json()).error?.code};},o.id);
  assert.equal(api.status,403);assert.equal(api.code,'ORDER_NOT_ASSIGNED');
  const w=await staff(s,'WAREHOUSE');await w.order(o.id);const wt=await w.text();assert.doesNotMatch(wt,/Фінанси|Разом|Оплачено|₴/,'warehouse sees no money');
  const sp=await staff(s,'SUPPORT');await sp.order(o.id);assert.equal(await sp.page.locator('.actions-bar button').count(),0,'support has no order actions');
  assert.equal(s.one('SELECT status FROM rubizh_customer_orders WHERE id='+o.id).status,'new');
 }finally{await s.close();}
});

test('E2E 10: a deactivated staff member loses access at once',{skip,timeout:600000},async()=>{
 const s=await stand();
 try{
  const m=await staff(s,'MANAGER');await m.page.goto(s.base+'/crm/orders');await m.page.getByRole('heading',{level:1}).waitFor();
  const o=await staff(s,'OWNER');await o.page.goto(s.base+'/crm/staff');await o.page.getByRole('heading',{level:1}).waitFor();await o.page.waitForLoadState('networkidle');
  await o.act('Змінити',{from:o.page.locator('tr,.mcard').filter({hasText:staffEmail('MANAGER')}).first(),reason:'Співробітник звільнився',fill:async d=>{await d.getByLabel(/Активний/).uncheck();}});
  const r=await m.page.evaluate(async()=>(await fetch('/api/staff/orders')).status);assert.equal(r,401,'the next request is refused');
  await m.page.reload();await m.page.getByLabel('Email').waitFor();
 }finally{await s.close();}
});

test('E2E 11: TTN with an unknown result → OWNER resolves it: «ТТН існує» (link the number) and «ТТН не створено»',{skip,timeout:600000},async()=>{
 const s=await stand();
 try{
  const b=await buyer(s,'+380671230011');await b.login();const u=await staff(s,'OWNER');
  for(const choice of ['link','not_created']){
   const o=await b.checkout([IN_STOCK()]);await b.pay(o.id);await u.order(o.id);await u.act('Взяти в роботу');await u.act('Передати в комплектацію');
   await u.act('Створити відправлення',{fill:async d=>{await d.getByLabel(/Фактичну наявність/).check();}});
   s.sql("INSERT INTO meta(k,v) VALUES('np_mock_save','unknown') ON DUPLICATE KEY UPDATE v='unknown'");
   await u.page.locator('.parcel').filter({hasText:'Чернетка'}).first().getByRole('button',{name:'Створити ТТН',exact:true}).click();
   const d=u.page.getByRole('dialog');await d.locator('.dialog-actions button').last().click();await d.getByText(/не підтвердив|не відповіла|невідом/i).waitFor().catch(()=>{});await d.locator('.dialog-actions button').first().click().catch(()=>{});
   await u.order(o.id);const sid=s.one('SELECT id FROM rubizh_order_shipments WHERE order_id='+o.id+' ORDER BY id DESC LIMIT 1').id;
   assert.match(s.one('SELECT status FROM rubizh_order_shipments WHERE id='+sid).status,/unknown|creating/);
   // NP lost the answer and its document list does not show the parcel yet: the reconciliation finds nothing.
   const doc=s.one("SELECT k,v FROM meta WHERE k LIKE 'np_mock_doc_%' ORDER BY k DESC LIMIT 1");s.sql("DELETE FROM meta WHERE k LIKE 'np_mock_doc_%'");
   await u.act('Звірити з НП',{from:u.page.locator('.parcel').filter({has:u.page.getByRole('button',{name:'Звірити з НП'})}).first()});
   if(choice==='link'){
    // The OWNER finds the TTN in the NP cabinet (it now appears in NP's list) and links the number.
    s.sql(`INSERT INTO meta(k,v) VALUES('${doc.k}','${doc.v.replace(/'/g,"''")}')`);const number=JSON.parse(doc.v).IntDocNumber;
    await u.act('Розбір ТТН',{from:u.page.locator('.parcel').filter({has:u.page.getByRole('button',{name:'Звірити з НП'})}).first(),reason:'Номер ТТН знайдено в кабінеті НП',fill:async d=>{await d.getByRole('radio',{name:'ТТН існує'}).click();await d.getByLabel(/Номер ТТН/).fill(number);}});
    const row=s.one('SELECT status,tracking_number FROM rubizh_order_shipments WHERE id='+sid);assert.equal(row.status,'created');assert.equal(row.tracking_number,number);
   }else{
    // Two hours after the zero reconciliation the OWNER may record that no TTN exists.
    s.sql('UPDATE rubizh_order_shipments SET reconciliation_zero_at=UTC_TIMESTAMP()-INTERVAL 3 HOUR WHERE id='+sid);
    await u.order(o.id);
    await u.act('Розбір ТТН',{from:u.page.locator('.parcel').filter({has:u.page.getByRole('button',{name:'Звірити з НП'})}).first(),reason:'У кабінеті НП такої ТТН немає',fill:async d=>{await d.getByRole('radio',{name:'ТТН не створено'}).click();}});
    assert.match(s.one('SELECT status FROM rubizh_order_shipments WHERE id='+sid).status,/cancelled|draft|error/);
   }
   assert.ok(s.sql("SELECT action FROM rubizh_np_audit WHERE order_id="+o.id).some(r=>/resolve|reconcile/.test(r.action)),'audited');
  }
  assert.deepEqual(u.errors,[]);
 }finally{await s.close();}
});

test('E2E 12: an expired bank invoice → the buyer pays again before payment_due (R5/PAY-03)',{skip,timeout:600000},async()=>{
 const s=await stand();
 try{
  const b=await buyer(s,'+380671230012');await b.login();const o=await b.checkout([IN_STOCK()]);
  const r=await b.post('/shop/payment-start.php',{order_id:o.id});assert.equal(r.status,200);
  const first=s.one('SELECT * FROM rubizh_mono_invoices WHERE order_id='+o.id+' AND invoice_id IS NOT NULL');assert.equal((await s.webhook(first,'expired')).status,200);
  let c=await card(s,o.id);assert.notEqual(c.display.payment.code,'PAID');assert.notEqual(c.display.order.code,'CANCELLED','still before payment_due');
  const again=await b.post('/shop/payment-start.php',{order_id:o.id});assert.equal(again.status,200,JSON.stringify(again.data));
  const second=s.one('SELECT * FROM rubizh_mono_invoices WHERE order_id='+o.id+' AND invoice_id IS NOT NULL ORDER BY id DESC LIMIT 1');assert.notEqual(second.id,first.id,'a new invoice');
  assert.equal((await s.webhook(second)).status,200);c=await card(s,o.id);assert.equal(c.display.payment.code,'PAID');assert.match(await b.cabinet(o.id),/Оплачено/);
 }finally{await s.close();}
});
