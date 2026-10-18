// Stage 5.5.3 (owner: «не смог войти в кабинет и сделать пробный заказ»). Found:
//  1) the closed staging sent the buyer to https://pay.mbnk.biz/mock… — a page that does not exist; nobody holds the key that
//     signs bank callbacks there, so a test order could never be paid → the site's own test bank page (staging mock only);
//  2) the owner stand runs on http://127.0.0.1 and every cookie was Secure — Safari drops them, so the SMS sign-in said
//     «Оновіть сторінку…» and checkout lost its session → not Secure only on the local stand (built-in server, loopback,
//     staging_allow_loopback); production never matches;
//  3) two 1 UAH test products and a command that takes them off the site before the opening.
import {test} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {spawnSync} from 'node:child_process';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const USER='rubizh-test',PASSWORD='stage553-closed-mode-password',INVOICE='mock0123456789abcdef0123';
function request(base,path,{host='rubizh.shop',auth=null,method='GET',headers={},body=null}={}){
 const u=new URL(base);const h={Host:host,...headers};if(auth)h.Authorization='Basic '+Buffer.from(auth.join(':')).toString('base64');if(body!==null)h['Content-Type']='application/x-www-form-urlencoded';
 return new Promise((resolve,reject)=>{const r=http.request({host:u.hostname,port:u.port,path,method,headers:h},res=>{let b='';res.on('data',d=>b+=d);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:b}));});r.on('error',reject);if(body!==null)r.write(body);r.end();});
}

test('5.5.3: closed staging — the mock invoice opens the site\'s own test bank page; a page from another site cannot pay; production has no such page',{skip,timeout:240000},async()=>{
 const {startSite,php}=await import('./helpers/site-fixture.mjs');
 const hash=php(`echo password_hash(${JSON.stringify(PASSWORD)},PASSWORD_DEFAULT);`).stdout.trim();
 const site=await startSite({enableV3:false,extraConfig:`,'environment'=>'staging','mono_mock'=>true,'mono_mock_page'=>true,'staging_gate'=>['user'=>'${USER}','password_hash'=>'${hash}']`});
 const url=(host,u)=>php(`$_SERVER['HTTP_HOST']=${JSON.stringify(host)};require '${site.site}/api/lib.php';require_once '${site.site}/shop/mono-lib.php';echo monoClientUrl(${JSON.stringify(u)});`).stdout;
 try{
  assert.equal(url('rubizh.shop','https://pay.mbnk.biz/'+INVOICE),'/shop/mono-mock-pay.php?invoice='+INVOICE,'behind the gate: the site\'s own page');
  assert.equal(url('rubizh.shop','https://pay.mbnk.biz/real-invoice-1'),'https://pay.mbnk.biz/real-invoice-1','a real bank address is never rewritten');
  const page='/shop/mono-mock-pay.php?invoice='+INVOICE;
  assert.equal((await request(site.base,page)).status,401,'behind the staging password');
  assert.equal((await request(site.base,page,{auth:[USER,PASSWORD]})).status,404,'no such invoice');
  site.sql(`INSERT INTO rubizh_mono_invoices(order_id,invoice_id,reference,amount,status,page_url,created_at,updated_at) VALUES(424242,'${INVOICE}','ref-553',100,'created','https://pay.mbnk.biz/${INVOICE}',UTC_TIMESTAMP(),UTC_TIMESTAMP())`);
  const get=await request(site.base,page,{auth:[USER,PASSWORD]});assert.equal(get.status,200);assert.match(get.body,/Тестова оплата monobank/);assert.match(get.body,/Оплатити \(тест\)/);
  assert.equal(get.headers['referrer-policy'],'same-origin','the form sends its origin to the page itself');
  const form='invoice='+INVOICE+'&result=success';
  for(const headers of [{Origin:'https://evil.example'},{'Sec-Fetch-Site':'cross-site',Origin:'http://rubizh.shop'},{}]){
   const r=await request(site.base,'/shop/mono-mock-pay.php',{auth:[USER,PASSWORD],method:'POST',headers,body:form});assert.equal(r.status,403,JSON.stringify(headers));assert.match(r.body,/Відкрийте тестову оплату/);
  }
  assert.equal(site.sql(`SELECT status FROM rubizh_mono_invoices WHERE invoice_id='${INVOICE}'`)[0].status,'created','nothing applied by a foreign page');
 }finally{site.stop();}
 // Production configuration with the stub flag set by mistake: the page does not exist, the bank address is untouched.
 const prod=await startSite({enableV3:false,extraConfig:",'mono_mock'=>true,'mono_mock_page'=>true"});
 try{
  assert.equal((await request(prod.base,'/shop/mono-mock-pay.php?invoice='+INVOICE)).status,404);
  assert.equal(php(`$_SERVER['HTTP_HOST']='rubizh.shop';$GLOBALS['rubizh_config_file']='${prod.site}/api/config.php';require '${prod.site}/api/lib.php';require_once '${prod.site}/shop/mono-lib.php';echo monoClientUrl('https://pay.mbnk.biz/${INVOICE}');`).stdout,'https://pay.mbnk.biz/'+INVOICE);
 }finally{prod.stop();}
});

test('5.5.3: cookies are Secure everywhere except the local owner stand (Safari drops Secure cookies on http://127.0.0.1)',{skip,timeout:240000},async()=>{
 const {startSite}=await import('./helpers/site-fixture.mjs');
 const cookies=async site=>{const r=await fetch(site.base+'/auth/');await r.text();return r.headers.getSetCookie().filter(c=>/^(rubizh_customer|rz_dev)=/.test(c));};
 const stand=await startSite({enableV3:false,extraConfig:",'environment'=>'staging','staging_allow_loopback'=>true"});
 try{const c=await cookies(stand);assert.ok(c.some(x=>x.startsWith('rubizh_customer=')),c.join(' | '));for(const x of c)assert.doesNotMatch(x,/;\s*secure/i,x);}finally{stand.stop();}
 const prod=await startSite({enableV3:false});
 try{const c=await cookies(prod);assert.ok(c.some(x=>x.startsWith('rubizh_customer=')),c.join(' | '));for(const x of c)assert.match(x,/;\s*secure/i,x);}finally{prod.stop();}
});

test('5.5.3: the two 1 UAH test products — no markup or discounts; «remove-test-products» takes them off the site',{skip,timeout:240000},async()=>{
 const {startSite,wire,PIM_KEY,phpArgs,runtime,phpEnv}=await import('./helpers/site-fixture.mjs');const {testProducts,TEST_PRODUCT_IDS,testBatchId}=await import('../dev/test-products.mjs');
 const site=await startSite();
 try{
  const {products:_,...head}=wire,batch={...head,batch_id:testBatchId(),chunk_index:0,chunk_count:1,hide_ids:[],products:testProducts(wire.products)};
  const r=await site.post('/api/pim/sync',batch,{'Authorization':'Bearer '+PIM_KEY});assert.equal(r.status,200,JSON.stringify(r.data).slice(0,600));
  const ids=TEST_PRODUCT_IDS.map(x=>"'"+x+"'").join(',');
  assert.deepEqual(site.sql(`SELECT id,visible FROM products WHERE id IN (${ids}) ORDER BY id`).map(x=>[x.id,Number(x.visible)]),[['rubizh-test-pay-now',1],['rubizh-test-preorder',1]]);
  const v=b=>site.sql(`SELECT price,kit_price,JSON_EXTRACT(data,'$.payment_allowed') pay,JSON_EXTRACT(data,'$.requires_order_confirmation') confirm,JSON_EXTRACT(data,'$.wholesale') wholesale FROM variants WHERE product_id='${b}'`)[0];
  const now=v('rubizh-test-pay-now'),pre=v('rubizh-test-preorder');
  assert.deepEqual([Number(now.price),now.kit_price,now.pay,now.confirm,now.wholesale],[1,null,'true','false','[]'],'1 UAH, direct payment, no kit price, no wholesale tiers');
  assert.deepEqual([Number(pre.price),pre.pay,pre.confirm],[1,'false','true'],'«під замовлення»: manager confirmation, no payment before it');
  const cli=spawnSync(runtime+'/bin/php8.4',[...phpArgs,'-d','display_errors=stderr',site.site+'/dev/remove-test-products.php'],{env:phpEnv,encoding:'utf8'});assert.equal(cli.status,0,cli.stdout+cli.stderr);assert.match(cli.stdout,/до запуску: 2/);
  assert.equal(Number(site.sql(`SELECT SUM(visible) n FROM products WHERE id IN (${ids})`)[0].n),0);
 }finally{site.stop();}
});
