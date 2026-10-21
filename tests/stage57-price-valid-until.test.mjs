// Stage 5.7 (owner ТЗ 2.2, SHOWER PACK — manual Excel price, no link): a manual price would lose direct payment after
// 72 h and disappear after 8 days. PIM now sends «Прайс актуальний до» of a manual-price supplier as stock_valid_until (ms)
// per variant: until that date the SKU is FRESH whatever the data age; after it the current freshness rule applies again.
// Suppliers with a link send no date — unchanged. A date more than 62 days ahead is ignored (no endless freshness).
import {test} from 'node:test';import assert from 'node:assert/strict';
import {startCrm} from './helpers/crm-fixture.mjs';import {chunksFor,php} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const H=3600000,D=24*H;
async function publish(s,{age,validUntil}){
 const w=structuredClone(s.wire),now=Date.now();
 for(const m of w.products)for(const v of m.variants)if(v.sku==='RUB-F0001'){v.stock_observed_at=null;v.stock_imported_at=now-age;if(validUntil===undefined)delete v.stock_valid_until;else v.stock_valid_until=now+validUntil;}
 let r;for(const body of chunksFor(w)){r=await s.post('/api/pim/sync',body,s.auth);assert.equal(r.status,200,JSON.stringify(r.data));}
 return (await s.get('/shop/catalog.php?action=product&id=m-jacket')).data.product?.variants?.find(v=>v.sku==='RUB-F0001')??null;
}
const swept=s=>{php(`require '${s.site}/api/lib.php';require_once '${s.site}/shop/stock-freshness.php';$db=db();$GLOBALS['rubizh_freshness_policy']=[];shopFreshnessSweep($db,true,null,true);`);return s.sql("SELECT pim_payment_allowed pay,pim_order_submission_allowed submit FROM variants WHERE sku='RUB-F0001'")[0];};

test('5.7 «Прайс актуальний до»: fresh until the date, the current rule after it, links and far dates unchanged',{skip,timeout:300000},async()=>{
 const s=await startCrm();
 try{
  // Imported 10 days ago, price valid 5 more days: direct payment.
  let v=await publish(s,{age:10*D,validUntil:5*D});
  assert.equal(v.stock_freshness,'FRESH');assert.equal(v.payment_allowed,true);assert.deepEqual(swept(s),{pay:1,submit:1},'the sweep agrees');
  // The date has passed: the current rule — 4 days → manager confirmation, 10 days → not orderable.
  v=await publish(s,{age:4*D,validUntil:-H});assert.equal(v.stock_freshness,'CONFIRM');assert.equal(v.payment_allowed,false);assert.equal(v.order_submission_allowed,true);
  v=await publish(s,{age:10*D,validUntil:-H});assert.ok(v===null||v.order_submission_allowed===false,'not orderable after 8 days');assert.equal(swept(s).submit,0);
  // A supplier with a link sends no date: exactly the stage 5.1 rule.
  v=await publish(s,{age:4*D});assert.equal(v.stock_freshness,'CONFIRM');
  v=await publish(s,{age:2*D});assert.equal(v.stock_freshness,'FRESH');
  // A date more than 62 days after the data time is not honoured — measured from the data, never from «now» (review):
  // a far date, and old data whose date is near, both stay under the current rule.
  v=await publish(s,{age:10*D,validUntil:100*D});assert.ok(v===null||v.order_submission_allowed===false,'far date ignored');assert.equal(swept(s).submit,0);
  v=await publish(s,{age:70*D,validUntil:10*D});assert.ok(v===null||v.order_submission_allowed===false,'old data does not become fresh');assert.equal(swept(s).submit,0);
 }finally{s.stop();}
});
