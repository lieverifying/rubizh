// Stage 5.6-3 (D-84): the live 1 UAH payment uses «ТЕСТ — оплата одразу». Its data time is the build of the launch
// database; after the owner's first PIM publication (PIM policy 72 h) it would be «через менеджера» and the live
// payment could not be made. `php dev/refresh-test-products.php` sets the data time of the two test products ONLY to now
// (no other product, no price), recomputes payment permission and refuses once they are taken off the site.
import {test} from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
test('5.6-3 refresh-test-products: an old test product becomes payable again; other products untouched',{skip,timeout:240000},async()=>{
 const {startSite,wire,PIM_KEY,phpArgs,runtime,phpEnv}=await import('./helpers/site-fixture.mjs');const {testProducts,testBatchId}=await import('../dev/test-products.mjs');
 const site=await startSite();
 try{
  const {products:_,...head}=wire;assert.equal((await site.post('/api/pim/sync',{...head,batch_id:testBatchId(),chunk_index:0,chunk_count:1,hide_ids:[],products:testProducts(wire.products)},{'Authorization':'Bearer '+PIM_KEY})).status,200);
  const old=Date.now()-10*86400000;site.sql(`UPDATE variants SET pim_stock_observed_at=${old}`);
  const cli=()=>spawnSync(runtime+'/bin/php8.4',[...phpArgs,'-d','display_errors=stderr',site.site+'/dev/refresh-test-products.php'],{env:phpEnv,encoding:'utf8'});
  // Stale (10 days, PIM policy 72 h / 8 days) → the sweep hides payment; the refresh restores it for the test product only.
  site.sql("INSERT INTO meta(k,v) VALUES('pim_freshness_policy','{\"version\":1,\"pay_fresh_hours\":72,\"sell_max_days\":8}') ON DUPLICATE KEY UPDATE v=VALUES(v)");
  const pay=id=>Number(site.sql(`SELECT MAX(pim_payment_allowed) p FROM variants WHERE product_id='${id}'`)[0].p);
  const others=site.sql("SELECT product_id,sku,pim_stock_observed_at t FROM variants WHERE product_id NOT LIKE 'rubizh-test-%' ORDER BY 1,2");
  const r=cli();assert.equal(r.status,0,r.stdout+r.stderr);assert.match(r.stdout,/оновлено: 2/);
  assert.equal(pay('rubizh-test-pay-now'),1,'«ТЕСТ — оплата одразу» payable');assert.equal(pay('rubizh-test-preorder'),0,'«під замовлення» stays manager-only');
  assert.ok(Math.abs(Number(site.sql("SELECT pim_stock_observed_at t FROM variants WHERE product_id='rubizh-test-pay-now'")[0].t)-Date.now())<120000);
  assert.deepEqual(site.sql("SELECT product_id,sku,pim_stock_observed_at t FROM variants WHERE product_id NOT LIKE 'rubizh-test-%' ORDER BY 1,2"),others,'no other product changes');
  // After «remove-test-products» (opening day) the refresh refuses: the test products never come back.
  assert.equal(spawnSync(runtime+'/bin/php8.4',[...phpArgs,site.site+'/dev/remove-test-products.php'],{env:phpEnv,encoding:'utf8'}).status,0);
  const after=cli();assert.equal(after.status,1);assert.match(after.stdout+after.stderr,/приховано/);
 }finally{site.stop();}
});
