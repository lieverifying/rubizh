// Stage 5.4 (owner decision on the 5.2 rehearsal, 2026-10-17): goods a supplier prices per m² (made-to-measure nets) are
// shown on the site WITHOUT the cart and without MonoPay; the button «Розрахувати вартість» opens the wholesale request
// (D-54) with the product filled in; a manager calculates and invoices. PIM sends such SKU with sale_mode QUOTE and
// price_unit m2 (additive variant fields of contract 3); SITE advertises quote_sale_version 1 and enforces it on the
// server: no cart line, no size request, no order through the API, whatever the batch flags say.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {startCrm,line} from './helpers/crm-fixture.mjs';import {chunksFor} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
async function republish(s,edit,{policy}={}){const w=structuredClone(s.wire);edit(w);s.lastWire=w;const chunks=chunksFor(w);if(policy)chunks[0].freshness_policy=policy;let r;for(const body of chunks){r=await s.post('/api/pim/sync',body,s.auth);if(r.status!==200)return r;}return r;}
const product=async s=>(await s.get('/shop/catalog.php?action=product&id=m-jacket')).data.product;
const quote=async(s,lines)=>{const c=await s.get('/shop/customer.php'),cookie=c.headers.get('set-cookie').split(';')[0];return s.post('/shop/checkout-quote.php',{csrf:c.data.csrf,lines,payment:'card'},{Cookie:cookie});};
// Every SKU of the model becomes a per-m² QUOTE SKU; PIM's flags are deliberately left permissive to prove SITE fails closed.
const quoteAll=w=>{for(const m of w.products)if(m.id==='m-jacket')for(const v of m.variants){v.sale_mode='QUOTE';v.price_unit='m2';}};

test('SITE advertises quote_sale_version 1 and refuses an unknown sale mode or price unit',{skip,timeout:300000},async()=>{
 const s=await startCrm();
 try{
  const st=await s.get('/api/pim/status',s.auth);assert.equal(st.data.capabilities.quote_sale_version,1);
  let r=await republish(s,w=>{w.products.find(m=>m.id==='m-jacket').variants[0].sale_mode='FREE';});assert.notEqual(r.status,200,'unknown sale mode refused');
  r=await republish(s,w=>{w.products.find(m=>m.id==='m-jacket').variants[0].price_unit='kg';});assert.notEqual(r.status,200,'unknown price unit refused');
  r=await republish(s,w=>{w.products.find(m=>m.id==='m-jacket').variants[0].price_unit='m2';});assert.notEqual(r.status,200,'an m² price on an ordinary SKU is refused');
 }finally{s.stop();}
});

test('a per-m² model is shown with its m² price, without cart, payment or size requests, and cannot be ordered through the API',{skip,timeout:300000},async()=>{
 const s=await startCrm();
 try{
  assert.equal((await republish(s,quoteAll)).status,200);
  const p=await product(s);assert.equal(p.sale_mode,'QUOTE');assert.equal(p.price_unit,'m2');
  assert.equal(p.order_submission_allowed,false);assert.equal(p.payment_allowed,false);assert.deepEqual(p.size_options,[]);assert.ok(p.price_min>0,'the m² price is shown');
  for(const v of p.variants){assert.equal(v.sale_mode,'QUOTE');assert.equal(v.price_unit,'m2');assert.equal(v.order_submission_allowed,false,v.sku);assert.equal(v.payment_allowed,false,v.sku);}
  const stored=s.sql("SELECT pim_order_submission_allowed o,pim_payment_allowed p FROM variants WHERE product_id='m-jacket' AND pim_active=1");
  assert.ok(stored.every(r=>+r.o===0&&+r.p===0),'stored permissions are off even though the batch said otherwise');
  // The API: neither the exact SKU nor a wholesale price mode nor a size request gets through.
  let q=await quote(s,[line()]);assert.notEqual(q.status,200);assert.match(q.data.error,/Розрахувати вартість/);
  q=await quote(s,[{...line(),price_mode:'wholesale'}]);assert.notEqual(q.status,200);
  const opt=s.sql("SELECT option_id,color_id FROM rubizh_size_options WHERE product_id='m-jacket' AND active=1 LIMIT 1")[0];
  if(opt){q=await quote(s,[{product_id:'m-jacket',color_id:opt.color_id||undefined,option_id:opt.option_id,qty:1,price_mode:'retail'}]);assert.notEqual(q.status,200,'no size request for a QUOTE model');}
  assert.equal(+s.sql('SELECT COUNT(*) n FROM rubizh_customer_orders')[0].n,0,'no order was created');
  // The server HTML (crawlers, no JavaScript): no schema.org Offer with the m² price as an item price; the price says «/ м²».
  const html=(await s.get('/product/'+p.slug)).text;assert.doesNotMatch(html.match(/<script id="rubizh-product-schema"[^>]*>(.*?)<\/script>/s)?.[1]||'missing',/"Offer"/);
  assert.match(html,/Ціна за розрахунком: від [\d\s]+ ₴ \/ м²/);
  // Back to a normal price: the same SKU is sold through the cart again (the mode is per batch, nothing sticks).
  assert.equal((await republish(s,()=>{})).status,200);
  const back=await product(s);assert.equal(back.sale_mode,null);assert.ok(back.variants.some(v=>v.order_submission_allowed));
  q=await quote(s,[line()]);assert.equal(q.status,200,JSON.stringify(q.data));
 }finally{s.stop();}
});

test('a looser freshness policy recomputes permissions from the stored data and never re-opens a QUOTE SKU',{skip,timeout:300000},async()=>{
 const s=await startCrm();
 try{
  assert.equal((await republish(s,quoteAll,{policy:{version:1,pay_fresh_hours:200,sell_max_days:30}})).status,200);
  const p=await product(s);for(const v of p.variants){assert.equal(v.order_submission_allowed,false,v.sku);assert.equal(v.payment_allowed,false,v.sku);}
  assert.notEqual((await quote(s,[line()])).status,200);
 }finally{s.stop();}
});

test('storefront: a QUOTE model shows its m² price and «Розрахувати вартість» (no cart); the button opens the wholesale request with the product filled in',{skip,timeout:300000},async()=>{
 const {chromium}=await import('playwright');const {startSite,wire,publish}=await import('./helpers/site-fixture.mjs');
 const site=await startSite();const browser=await chromium.launch({executablePath:(process.env.CHROMIUM_PATH||'/usr/bin/chromium'),args:['--no-sandbox']});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==','base64');
 try{
  const w=structuredClone(wire);quoteAll(w);assert.equal((await publish(site,w)).status,200);const jacket=w.products.find(p=>p.id==='m-jacket');
  for(const viewport of [{width:390,height:844},{width:1440,height:900}]){
   const page=await browser.newPage({viewport});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
   await page.route('https://rubizh.shop/**',r=>r.fulfill({contentType:'image/png',body:png}));await page.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
   await page.goto(site.base+'/product/'+jacket.slug);const button=page.locator('[data-quote-button]').first();await button.waitFor();
   assert.equal((await button.innerText()).trim().toLowerCase(),'розрахувати вартість');
   assert.match(await page.locator('body').innerText(),/\/ м²/,'the price is per m²');
   assert.equal(await page.evaluate(()=>[...document.querySelectorAll('script[type="application/ld+json"]')].some(x=>/"@type":"Offer"/.test(x.textContent))),false,'no schema.org Offer with an item price');
   assert.equal(await page.getByText(/До кошика/).count(),0,'no cart button');
   await button.click();await page.locator('#b2b-form textarea').first().waitFor();
   await page.waitForFunction(()=>/Розрахувати вартість:/.test(document.querySelector('#b2b-form textarea')?.value||''));
   const text=await page.locator('#b2b-form textarea').first().inputValue();assert.match(text,new RegExp(jacket.name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
   assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('rubizh.cart')||'[]')),[],'nothing in the cart');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'no horizontal overflow');
   assert.deepEqual(errors,[]);await page.close();
  }
  // Catalog card: «від … / м²» and «Ціна за розрахунком», never a bare item price.
  const page=await browser.newPage({viewport:{width:1440,height:900}});await page.route('https://rubizh.shop/**',r=>r.fulfill({contentType:'image/png',body:png}));await page.route(/fonts\.(googleapis|gstatic)/,r=>r.abort());
  await page.goto(site.base+'/catalog');await page.getByText('Ціна за розрахунком').first().waitFor();
  assert.match(await page.locator('body').innerText(),/від [\d\s\u00a0]+₴ \/ м²/);await page.close();
 }finally{await browser.close();site.stop();}
});

test('storefront bundles: QUOTE label in the new bundle; earlier bundles kept byte for byte (Q-9)',async()=>{
 const {readFileSync}=await import('node:fs'),path=await import('node:path'),vm=await import('node:vm'),crypto=await import('node:crypto');
 const root=path.resolve(import.meta.dirname,'..'),html=readFileSync(path.join(root,'index.html'),'utf8'),live=html.match(/src="\/(assets\/shop-client\.[^"?]+\.js)/)[1];
 const src=readFileSync(path.join(root,live),'utf8'),ctx={};
 vm.runInNewContext(src.match(/const STORE_V3_LABEL=\{[^}]*\};/)[0].replace('const ','this.')+src.match(/function storeV3Status\(p\)\{[^\n]*\}/)[0]+';this.storeV3Status=storeV3Status;',ctx);
 assert.equal(ctx.storeV3Status({variants:[{sale_mode:'QUOTE',availability_v3:'IN_STOCK'}]}),'QUOTE');assert.equal(ctx.STORE_V3_LABEL.QUOTE,'Ціна за розрахунком');
 assert.equal(ctx.storeV3Status({variants:[{sale_mode:'QUOTE'},{availability_v3:'IN_STOCK',payment_allowed:true}]}),'IN_STOCK','a mixed model sells its normal SKU');
 const sha=f=>crypto.createHash('sha256').update(readFileSync(path.join(root,f))).digest('hex');
 // Stage 5.4.1: the D-62 slow-CPU anchor fix shipped as shop-client.2026101702.js; the stage 5.4 bundle is kept as it was.
 // Stage 5.5: D-79 shipped as shop-client.2026101801.js; the 5.4.1 bundle is kept as it was.
 // Stage 5.5 review (a11y): the payment choice state and the «no payment method» notice shipped as shop-client.2026101802.js.
 // Stage 5.5.3: the closed staging test bank page shipped as shop-client.2026101803.js.
 assert.equal(sha('assets/shop-client.2026101802.js'),'b11baf5ea1eccfd8d9909e800821eca819df4f7f38d080383b4667d94f785564','stage 5.5 a11y bundle kept');
 assert.equal(sha('assets/shop-client.2026101801.js'),'dd379cc3cb432dcf7c6f88a41f68fee2805a3881358f86ef31c906e72b0ba5c2','stage 5.5 D-79 bundle kept');
 assert.equal(sha('assets/shop-client.2026101702.js'),'501e0a838e093cf4af277095a8148278125e12d836bc7935247f5e52aea44eef','stage 5.4.1 bundle kept');
 assert.equal(sha('assets/shop-client.2026101701.js'),'90da45ae05a094918a82cdb097ab8b3cc647411badd67c033f94a090dbb6c1c6','stage 5.4 bundle kept');
 assert.equal(sha('assets/shop-client.2026101602.js'),'e93d5fb4b9d609d2a548e3f0661923a1f50e8095e5c23bd191546321b77da940','stage 5.1 bundle kept');
 assert.equal(sha('assets/pim-v3-product.2026101101.js'),'82327510e67c480ebddbb367f4b632b9076e882341592ea2cb6b119e47c093e1','previous product view kept');
 // The product view never adds a QUOTE SKU to the cart.
 const view=readFileSync(path.join(root,html.match(/src="\/(assets\/pim-v3-product\.[^"?]+\.js)/)[1]),'utf8');assert.match(view,/const add=\(\)=>v&&\(state==='pay'\|\|state==='request'\)&&app\.add/);
});

test('5.4.1 (owner): a QUOTE model is in the sitemap while its data is fresh enough to be shown, and leaves it when the age rule hides it',{skip,timeout:300000},async()=>{
 const s=await startCrm();
 try{
  assert.equal((await republish(s,quoteAll)).status,200);const slug=(await product(s)).slug;
  assert.ok((await s.get('/sitemap.php')).text.includes('/product/'+slug+'<'),'a quote model is in the sitemap');
  // 9 days old: the age rule hides the model (as any other) — it is not in the sitemap.
  assert.equal((await republish(s,w=>{quoteAll(w);for(const m of w.products)if(m.id==='m-jacket')for(const v of m.variants)v.stock_observed_at=Date.now()-9*24*3600000;})).status,200);
  assert.ok(!(await s.get('/sitemap.php')).text.includes('/product/'+slug+'<'),'hidden by age → not in the sitemap');
 }finally{s.stop();}
});

// Stage 5.5 (S55-04, found building the staging catalogue): PIM sends an in-stock QUOTE SKU exactly as stage 5.4 decided —
// not orderable, not payable, confirmation required, price ready (the m² price is shown). The pinned schema said «in stock
// and price ready ⇒ orderable and payable», so SITE refused every such model (12 of the 370 staging models). A QUOTE SKU is
// outside that rule; SITE still forces its flags off whatever the batch says.
test('S55-04: an in-stock QUOTE SKU with the flags PIM really sends (not orderable, not payable) is accepted and shown',{skip,timeout:300000},async()=>{
 const s=await startCrm();
 try{
  const real=w=>{for(const m of w.products)if(m.id==='m-jacket')for(const v of m.variants){v.sale_mode='QUOTE';v.price_unit='m2';v.order_submission_allowed=false;v.payment_allowed=false;v.requires_order_confirmation=true;}
   const m=w.products.find(m=>m.id==='m-jacket');m.order_submission_allowed=false;m.payment_allowed=false;m.requires_order_confirmation=true;};
  const inStock=s.wire.products.find(m=>m.id==='m-jacket').variants.filter(v=>v.availability==='IN_STOCK'&&v.price_ready===true);assert.ok(inStock.length>0,'the fixture has an in-stock, price-ready SKU');
  const r=await republish(s,real);assert.equal(r.status,200,JSON.stringify(r.data).slice(0,400));
  const p=await product(s);assert.equal(p.sale_mode,'QUOTE');assert.ok(p.price_min>0,'the m² price is shown');
  for(const v of p.variants){assert.equal(v.order_submission_allowed,false);assert.equal(v.payment_allowed,false);}
 }finally{s.stop();}
});
