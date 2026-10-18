// Stage 5.5.3 (owner): two test products at 1 UAH for trying the purchase path on the owner preview and the closed staging —
// «ТЕСТ — оплата одразу» (in stock, direct card payment) and «ТЕСТ — під замовлення» (the order waits for the manager's
// confirmation, no payment before it). Prices are set here, not by PIM: no markup, no discounts (no floor, no kit price,
// no wholesale tiers). They must be deleted before the opening (docs/release/GO_LIVE_RC2.md). Built from a contract-v3
// product of the same batch, so every other field is what PIM sends.
import {randomBytes} from 'node:crypto';
export const TEST_PRODUCT_IDS=['rubizh-test-pay-now','rubizh-test-preorder'];
// A sync batch of their own (contract v3 batch id format).
export const testBatchId=()=>'PB-'+randomBytes(8).toString('hex')+'-'+randomBytes(8).toString('hex');
// models: contract-v3 models of the same batch; each test product copies a real SKU of the matching state (a payable in-stock
// SKU; a PREORDER SKU when there is one, else the in-stock one switched to PREORDER), so every other field is what PIM sends.
export function testProducts(models,nowMs=Date.now()){
 const all=models.flatMap(m=>m.variants.map(v=>({m,v}))).filter(x=>x.v.size_status==='NO_SIZE_REQUIRED'||!x.v.required);
 const payable=all.find(x=>x.v.availability==='IN_STOCK'&&x.v.payment_allowed===true&&x.v.price_ready===true);
 if(!payable)throw Error('test products: no in-stock payable SKU without a size in the batch');
 const preorder=all.find(x=>x.v.availability==='PREORDER'&&x.v.order_submission_allowed===true)||payable;
 const make=({m,v:v0},id,slug,name,sku,variant,text)=>{
  const p=structuredClone(m),v={...structuredClone(v0),...variant,sku,price:1,site_price:1,kit_price:null,wholesale:[],minimum_sale_price:null,discount_margin_floor_pct:null,fulfillment_supplier_sku:sku};
  for(const k of ['stock_observed_at','stock_imported_at'])if(v[k]!=null)v[k]=nowMs-6*3600000;if(v.stock_data_age_hours!=null)v.stock_data_age_hours=6;
  const color=(m.colors||[]).find(c=>c.id===v0.color_id);
  Object.assign(p,{id,product_id:id,model_id:id,slug,name,marketing_name_uk:name,model_name:name,source_product_ids:[id],brand:'РУБІЖ',description:'<p>'+text+'</p><p>Тестовий товар для перевірки оформлення замовлення. Перед відкриттям сайту його буде видалено.</p>',
   attributes:{},filter_attributes:{},variants:[v],links:[],relations:[],recommended_with:[],alternative_group:null,ads_allowed:false,kit_eligible:false,kit_component:null,kit_component_tags:[],
   colors:color?[{...structuredClone(color),variant_skus:[sku]}]:m.colors});
  if('site_price' in p)p.site_price=1;
  // The model-level state is the state of its only SKU (contract v3: a payable model has a payable SKU).
  for(const k of ['availability','order_submission_allowed','payment_allowed','requires_order_confirmation'])if(k in p)p[k]=v[k];
  if(Array.isArray(p.size_options))p.size_options=[];
  return p;
 };
 return [
  make(payable,TEST_PRODUCT_IDS[0],'test-oplata-odrazu','ТЕСТ — оплата одразу','RUB-TEST-PAY',{},'В наявності: оплата карткою одразу.'),
  make(preorder,TEST_PRODUCT_IDS[1],'test-pid-zamovlennia','ТЕСТ — під замовлення','RUB-TEST-ORDER',preorder===payable?{availability:'PREORDER',availability_status:'PREORDER',order_submission_allowed:true,payment_allowed:false,requires_order_confirmation:true,lead_time_days:3,delivery_lead_time_days:3}:{},'Під замовлення: менеджер підтвердить замовлення перед оплатою.'),
 ];
}
