// Stage 5.5 (5.5-10): `npm run owner-preview` — the stand starts, the owner's checklist (out/ПРОВЕРКА-ВЛАДЕЛЬЦА.md) passes in a
// real browser, nothing leaves the computer (no request outside the stand, PHP without network functions) and Ctrl+C stops it.
import {test} from 'node:test';import assert from 'node:assert/strict';import {spawn,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';import {chromium} from 'playwright';import path from 'node:path';import {line} from './helpers/crm-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const root=path.resolve(import.meta.dirname,'..'),script=path.join(root,'dev/owner-preview.mjs');
const mockRef=seed=>{const h=createHash('sha256').update('np-mock|'+seed).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;};
const KYIV=mockRef('city:kyiv'),WH=mockRef('wh:'+KYIV+':1');
// No run11 wave file in tests: the stand uses the test catalogue.
async function preview(args=[]){
 const child=spawn(process.execPath,[script,'--ready-json',...args],{env:{...process.env,RUBIZH_PREVIEW_CHUNKS:'/nonexistent'},stdio:['ignore','pipe','pipe']});
 let out='',err='';child.stderr.on('data',x=>err+=x);
 const info=await new Promise((resolve,reject)=>{child.stdout.on('data',x=>{out+=x;const l=out.split('\n').find(s=>s.startsWith('{'));if(l)resolve(JSON.parse(l));});child.once('exit',c=>reject(new Error('owner-preview exited '+c+': '+err.slice(-800))));});
 info.child=child;info.err=()=>err;info.stopped=()=>new Promise(r=>{if(child.exitCode!==null)return r(child.exitCode);child.once('exit',c=>r(c));});
 return info;
}
const outsideOf=urls=>urls.filter(u=>{const x=new URL(u);return /^https?:$/.test(x.protocol)&&!['127.0.0.1','localhost'].includes(x.hostname);});
async function crm(browser,s,role,urls){
 const ctx=await browser.newContext({viewport:{width:1280,height:900}});ctx.on('request',r=>urls.push(r.url()));const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(s.crm);await page.getByLabel('Email').fill(s.users.find(u=>u.role===role).email);await page.getByLabel('Пароль',{exact:true}).fill(s.password);await page.getByRole('button',{name:'Увійти'}).click();
 await page.getByRole('navigation',{name:'Основне'}).waitFor();
 const u={page,errors,close:()=>ctx.close()};
 u.order=async id=>{await page.goto(s.crm+'orders/'+id);await page.getByRole('heading',{level:1}).waitFor();await page.waitForLoadState('networkidle');};
 u.act=async(button,{fill,from}={})=>{
  await (from??page.locator('.actions-bar')).getByRole('button',{name:button,exact:true}).first().click({timeout:15000});
  const d=page.getByRole('dialog');await d.waitFor();if(fill)await fill(d);await d.locator('.dialog-actions button').last().click();
  await d.waitFor({state:'detached',timeout:20000});await page.waitForLoadState('networkidle');
 };
 return u;
}
test('owner-preview: buyer path 390/1280 with the FOP invoice, card payment on the local bank page, CRM for every role, TTN statuses to delivery, wholesale request, nothing leaves the stand, Ctrl+C',{skip,timeout:600000},async()=>{
 const s=await preview(),browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const urls=[];
 try{
  assert.equal(s.vat_note,true);assert.deepEqual(s.users.map(u=>u.role),['OWNER','MANAGER','WAREHOUSE','SUPPORT','ACCOUNTANT']);
  // PHP on the stand has no network functions at all.
  // With the stand's own PHP arguments (curl is loaded as in the site), the network functions are disabled.
  assert.ok(s.php_args.some(a=>/extension=.*curl|curl/.test(a))||process.platform==='darwin','curl is loaded for the check');
  const net=spawnSync(s.php,[...s.php_args,'-r','echo json_encode([function_exists("curl_init"),function_exists("fsockopen"),function_exists("stream_socket_client"),ini_get("allow_url_fopen")]);'],{encoding:'utf8'});
  assert.equal(net.stdout,'[false,false,false,"0"]',net.stderr);
  // Buyer path at 390 and 1280 px through the storefront UI: home, catalogue, product, cart, checkout with the FOP invoice.
  const store=(await (await fetch(s.site+'/shop/catalog.php?action=storefront')).json()).products,slug=store.find(p=>p.id==='m-jacket').slug;
  // Stage 5.5.3: the two 1 UAH test products (owner) are on the stand.
  for(const [slug,name] of [['test-oplata-odrazu','ТЕСТ — оплата одразу'],['test-pid-zamovlennia','ТЕСТ — під замовлення']]){const r=await fetch(s.site+'/product/'+slug);assert.equal(r.status,200,slug);assert.match(await r.text(),new RegExp(name),slug);}
  for(const [width,height] of [[390,844],[1280,900]]){
   const ctx=await browser.newContext({viewport:{width,height}});ctx.on('request',r=>urls.push(r.url()));const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(s.site+'/');await page.locator('[data-store-surface]').waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,width+': no horizontal scroll');
   await page.goto(s.site+'/catalog');await page.locator('[data-card-name]').first().waitFor();
   await page.goto(s.site+'/product/'+slug);await page.getByRole('heading',{level:1}).waitFor();
   await page.getByRole('button',{name:'M',exact:true}).first().click();
   await page.getByRole('button',{name:/До кошика/}).first().click();
   const go=page.getByRole('button',{name:'Продовжити',exact:true});if(await go.count())await go.click();
   await page.locator('header [aria-label="Кошик"]').click();await page.getByRole('heading',{name:'Оформлення замовлення'}).waitFor();
   await page.getByText('Оплата на рахунок ФОП',{exact:true}).waitFor();
   assert.equal(await page.getByText('Післяплата',{exact:true}).count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,width+': checkout fits');
   assert.deepEqual(errors,[],width+' JS errors');await ctx.close();
  }
  // Card order through the site's own endpoints; the bank address is the stand's local page; «Оплатити (тест)» = signed webhook.
  const ctx=await browser.newContext({viewport:{width:390,height:844}});ctx.on('request',r=>urls.push(r.url()));const page=await ctx.newPage();
  await page.goto(s.site+'/');
  const placed=await page.evaluate(async([city,wh,first])=>{
   const c=await (await fetch('/shop/customer.php',{credentials:'same-origin'})).json();
   const post=async(u,d)=>{const r=await fetch(u,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({csrf:c.csrf,...d})});return {status:r.status,data:await r.json()};};
   const lines=[first];
   const q=await post('/shop/checkout-quote.php',{lines,payment:'card'});if(q.status!==200)return {q};
   const contact={name:'Олена Петренко',recipient:'Олена Петренко',email:'',phone:'+380671230009',city:'Київ',address:'Відділення №1',delivery_type:'branch',np_delivery:{city_ref:city,warehouse_ref:wh}};
   const o=await post('/shop/order.php',{request_id:crypto.randomUUID().replaceAll('-',''),contact,payment:'card',lines,expected_total:q.data.quote.total,catalog_version:q.data.quote.catalog_version});if(o.status!==200)return {o};
   const pay=await post('/shop/payment-start.php',{order_id:o.data.order.id});
   const w=await post('/shop/wholesale-request.php',{request_id:crypto.randomUUID().replaceAll('-',''),name:'Ігор',phone:'067 123 45 67',buyer_type:'MILITARY',tax_id:'',email:'',kits:'4',composition:'Куртка M ×4',priority:'DONATION',consent:true});
   return {id:o.data.order.id,pay,w};
  },[KYIV,WH,line()]);
  assert.ok(placed.id,JSON.stringify(placed));
  assert.equal(placed.pay.status,200,JSON.stringify(placed.pay));assert.match(placed.pay.data.url,/^\/shop\/mono-mock-pay\.php\?invoice=mock[0-9a-f]{20}$/,'the bank page is the site\'s own test page (stage 5.5.3, same as the closed staging)');
  assert.equal(placed.w.status,200,JSON.stringify(placed.w));
  await page.goto(s.site+placed.pay.data.url);await page.getByRole('heading',{name:'Тестова оплата monobank'}).waitFor();
  await page.getByRole('button',{name:'Оплатити (тест)'}).click();await page.waitForURL(/payment-return\.php/);await page.getByText('Замовлення оплачено').waitFor();
  await ctx.close();
  // CRM: every role signs in with the printed password; OWNER sees «Швидкість сайту».
  for(const u of s.users){const c=await crm(browser,s,u.role,urls);if(u.role==='OWNER'){await c.page.goto(s.crm+'analytics');await c.page.getByRole('heading',{name:'Швидкість сайту'}).waitFor();}assert.deepEqual(c.errors,[],u.role+' JS errors');await c.close();}
  // MANAGER: the paid order → packing → parcel → TTN (NP stub) → `owner-preview ttn <n> 9` → delivered; wholesale request listed.
  const m=await crm(browser,s,'MANAGER',urls);
  await m.order(placed.id);assert.match(await m.page.locator('body').innerText(),/Оплачено/);
  for(const b of ['Взяти в роботу','Передати в комплектацію'])if(await m.page.locator('.actions-bar').getByRole('button',{name:b,exact:true}).count())await m.act(b);
  await m.act('Створити відправлення',{fill:async d=>{await d.getByLabel(/Фактичну наявність/).check();}});
  await m.act('Створити ТТН',{from:m.page.locator('.parcel').filter({hasText:'Чернетка'}).first()});
  const ttn=(await m.page.locator('body').innerText()).match(/\b2045\d{10}\b/)?.[0];assert.ok(ttn,'TTN number shown');
  const cmd=spawnSync(process.execPath,[script,'ttn',ttn,'9'],{encoding:'utf8'});assert.equal(cmd.status,0,cmd.stderr);
  await m.act('Оновити статус',{from:m.page.locator('.parcel').filter({hasText:'ТТН створено'}).first()});
  assert.equal(await m.page.locator('.parcel').filter({hasText:'Доставлено'}).count(),1,'delivered after the TTN status command');
  await m.page.goto(s.crm+'customers?segment=WHOLESALE');await m.page.getByText(placed.w.data.number).first().waitFor();
  assert.deepEqual(m.errors,[]);await m.close();
  assert.deepEqual(outsideOf(urls),[],'no request leaves the stand');
 }finally{await browser.close();s.child.kill('SIGINT');}
 assert.equal(await s.stopped(),0,'Ctrl+C stops the stand cleanly: '+s.err().slice(-400));
 assert.equal(await fetch(s.site+'/').then(()=>false,()=>true),true,'site stopped');
});
test('owner-preview --without-vat-note: payment to the FOP account is not offered (D-79)',{skip,timeout:300000},async()=>{
 const s=await preview(['--without-vat-note']);
 try{assert.equal(s.vat_note,false);assert.equal((await (await fetch(s.site+'/shop/customer.php')).json()).invoice_enabled,false);}
 finally{s.child.kill('SIGINT');}
 assert.equal(await s.stopped(),0);
});
