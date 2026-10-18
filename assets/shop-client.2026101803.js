window.rubizhCreateComponent = function(t, e) {

function storeApplySettings(vm,settings){const seller=settings.seller||{},defaults={name:'ФОП Мєшалкін Андрій Леонідович',tax_id:'2837300592',iban:'UA943220010000026004380084907',bank:'УНІВЕРСАЛ БАНК',mfo:'322001',bank_tax_id:'21133352',address:'Україна, 18007, м. Черкаси, вул. Смілянська, 23/1',email:'info@rubizh.shop',phone:'+380976867892',phone_label:'+380 97 686 78 92'};const pairs=Object.entries(defaults).filter(([k,v])=>seller[k]&&seller[k]!==v).map(([k,v])=>[v,String(seller[k])]);const seen=new WeakMap();function replace(x){if(typeof x==='string'){for(const [a,b] of pairs)x=x.split(a).join(b);return x;}if(!x||typeof x!=='object'||e.isValidElement(x))return x;const proto=Object.getPrototypeOf(x);if(!Array.isArray(x)&&proto!==Object.prototype&&proto!==null)return x;if(seen.has(x))return seen.get(x);const out=Array.isArray(x)?[]:{};seen.set(x,out);for(const [k,v]of Object.entries(x))out[k]=replace(v);return out;}const d={enabled:false,percent:0,...(settings.donation||{})};vm.donationEnabled=d.enabled===true;vm.cartDonShow=d.enabled===true;vm.donationReportUrl=d.report_url||'';vm.hasDonationReport=!!d.report_url;vm.donationSchedule=d.enabled?(d.schedule||'Інформацію про підтримку та звіти уточнюйте у менеджера'):'';vm.donPct=d.enabled?d.percent:0;vm.donRuleText=d.enabled?d.percent+'% з коштів магазину':'';vm.itemDonText=d.enabled?'Підтримка війська з коштів магазину. Для вас ціна не змінюється.':'';vm.donWhereLabel=vm.itemDonText;vm.isReports=vm.isReports&&d.enabled===true;vm.donShow=vm.donationEnabled;if(d.enabled){vm.donationFmt=storeMoney(Math.round((vm.storeTotal||0)*Number(d.percent||0)/100));}
 // Footer social links (S-1): only https profile links on the exact platform host; anything else is not rendered.
 const social=settings.social||{},safe=(u,hosts)=>{try{const x=new URL(String(u||''));return x.protocol==='https:'&&hosts.includes(x.hostname)&&!x.username&&!x.password&&!x.port?String(u):'';}catch(err){return '';}};
 vm.socialInstagram=safe(social.instagram,['instagram.com','www.instagram.com']);vm.socialTiktok=safe(social.tiktok,['tiktok.com','www.tiktok.com']);vm.hasInstagram=!!vm.socialInstagram;vm.hasTiktok=!!vm.socialTiktok;vm.socialAny=vm.hasInstagram||vm.hasTiktok;
 return pairs.length?replace(vm):vm;}

// Effective checkout payment: only online card (when MonoPay is on) or a FOP invoice. Cash on delivery does not exist.
// Order idempotency (Q-7): one random key per checkout attempt. A double click or a network retry (also after a reload of
// the same tab) resends that attempt's key, so the server returns the same order; success ends the attempt, and a deliberate
// repeat purchase gets a new key. The cart instance id (random, new whenever goods go into an empty cart) lets a stale tab
// that still shows an already ordered cart resend the key of the order that consumed it instead of ordering twice (D-18).
// Only a short non-reversible digest of the checkout is kept (per tab), never the contact itself.
const STORE_ATTEMPT='rubizh.orderAttempt',STORE_CART_ID='rubizh.cartId',STORE_ORDERED='rubizh.orderedCart',STORE_ORDERED_TTL=15*60*1000;
function storeDigest(str){let h1=0xdeadbeef,h2=0x41c6ce57;for(let i=0;i<str.length;i++){const c=str.charCodeAt(i);h1=Math.imul(h1^c,2654435761);h2=Math.imul(h2^c,1597334677);}h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);return (4294967296*(2097151&h2)+(h1>>>0)).toString(36);}
function storeRandomKey(){return Array.from(crypto.getRandomValues(new Uint8Array(16)),t=>t.toString(16).padStart(2,'0')).join('');}
function storeOrdered(){try{const o=JSON.parse(localStorage.getItem(STORE_ORDERED)||'null');return o&&/^[a-f0-9]{32}$/.test(o.k)&&Date.now()-o.t>=0&&Date.now()-o.t<STORE_ORDERED_TTL?o:null;}catch(e){return null;}}
// The tab keeps its cart id while its cart has goods; an empty cart ends it. An id already consumed by an order is never reused,
// and a stale tab that edits an already ordered cart gets a new id (a new purchase, not a refused replay of the old key).
function storeCartLines(items){return storeDigest(JSON.stringify((items||[]).map(l=>[l.key??l.sku??l.id,l.sku,l.size,l.color,l.qty])));}
function storeCartId(items,current){try{if(!items.length){localStorage.removeItem(STORE_CART_ID);return '';}const o=storeOrdered();if(current&&o?.cart===current&&o.d!==storeCartLines(items))current='';if(current)return current;
 let id=localStorage.getItem(STORE_CART_ID);if(!/^[a-f0-9]{32}$/.test(id||'')||storeOrdered()?.cart===id){id=storeRandomKey();localStorage.setItem(STORE_CART_ID,id);}return id;}catch(e){return current||'';}}
function storeAttemptKey(cart,fingerprint){const h=storeDigest(fingerprint),o=storeOrdered();if(cart&&o&&o.cart===cart)return o.k;
 try{const a=JSON.parse(sessionStorage.getItem(STORE_ATTEMPT)||'null');if(a&&a.cart===cart&&a.h===h&&/^[a-f0-9]{32}$/.test(a.k))return a.k;}catch(e){}
 const k=storeRandomKey();try{sessionStorage.setItem(STORE_ATTEMPT,JSON.stringify({k,h,cart}));}catch(e){}return k;}
function storeAttemptDone(cart,k,items){try{sessionStorage.removeItem(STORE_ATTEMPT);if(cart)localStorage.setItem(STORE_ORDERED,JSON.stringify({cart,k,d:storeCartLines(items),t:Date.now()}));}catch(e){}}
// Kit builder guide (ADDENDUM K-1): shown on the first plain visit, once per guide version; storage errors only mean it may show again.
const STORE_KIT_INTRO_KEY='rubizh.kitIntro',STORE_KIT_INTRO_VERSION='1';
function storeKitIntroSeen(){try{return localStorage.getItem(STORE_KIT_INTRO_KEY)===STORE_KIT_INTRO_VERSION;}catch(e){return false;}}
function storeKitIntroRemember(){try{localStorage.setItem(STORE_KIT_INTRO_KEY,STORE_KIT_INTRO_VERSION);}catch(e){}}
// «1 товар», «2 товари», «5 товарів» (Ukrainian plural).
function storeGoodsCount(n){const t=n%10,h=n%100;return n+' '+(t===1&&h!==11?'товар':t>=2&&t<=4&&(h<12||h>14)?'товари':'товарів');}
/* Stage 5.5 (D-79): invoice payment only when the shop offers it (the owner's VAT status is filled). */function storeCheckoutPay(e){return (e.pay==='invoice'&&e.invoiceEnabled===true)||(e.pay==='card'&&e.monoEnabled)?e.pay:(e.monoEnabled?'card':(e.invoiceEnabled===true?'invoice':''));}
// Legacy product colour on the product page, and the gallery that belongs to it (server color_photos).
// A colour without confirmed photos gets [] → "Фото кольору готується"; never another colour's photos.
function storeLegacyColor(s,e,h){const all=Object.values(s.variants),confirmed=all.filter(v=>!v.size_unconfirmed),picked=e.productColor&&all.some(v=>v.color===e.productColor)?e.productColor:'';if(picked)return picked;if(h&&!h.size_unconfirmed&&h.color)return h.color;
 // Default: a buyable colour with its own photos, then any buyable colour, then the first one.
 const buyable=confirmed.filter(v=>v.availability!=='out_of_stock'),photo=v=>!s.colorPhotos||s.v3||(s.colorPhotos[v.color]||[]).length>0;
 return (buyable.find(photo)||buyable[0]||confirmed[0]||all[0])?.color||'';}
function storeGalleryPhotos(s,color){const m=s.colorPhotos;if(!m||s.v3)return s.photoData||[];return Array.isArray(m[color])?m[color]:[];}
// Card preview = the photo the product page opens with (D-21): v3 default colour (storeV3Map cardPhoto), legacy default colour's own photo.
// undefined = no colour ownership known (the model gallery may be used); '' = another colour owns the gallery photos, so none is borrowed.
function storeCardCover(p){if(p.v3)return p.cardPhoto||undefined;if(!p.colorPhotos)return undefined;const own=storeGalleryPhotos(p,storeLegacyColor(p,{},null))[0];if(own)return own.thumb||own.url||undefined;return Object.values(p.colorPhotos).some(l=>Array.isArray(l)&&l.length)?'':undefined;}
// A new colour starts its gallery at the first photo without animating through the old colour's slides.
// «Нещодавно переглянуті»: product ids, newest first, one entry per model (a product card holds all its colours),
// kept across browser restarts. Storage can be unavailable (private mode); the list then lives in memory only.
const STORE_SEEN_KEY='rubizh.seen',STORE_SEEN_MAX=12;
function storeSeenClean(ids){return [...new Set((Array.isArray(ids)?ids:[]).filter(x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,191}$/.test(x)))].slice(0,STORE_SEEN_MAX);}
function storeSeenLoad(){try{return storeSeenClean(JSON.parse(localStorage.getItem(STORE_SEEN_KEY)||'[]'));}catch{return [];}}
function storeSeenSave(ids){const clean=storeSeenClean(ids);try{localStorage.setItem(STORE_SEEN_KEY,JSON.stringify(clean));}catch{}return clean;}
function storeSeenList(products,seen,current){return seen.filter(id=>id!==current).map(id=>products.find(p=>p.id===id)).filter(p=>p&&p.storeReady).slice(0,8);}
function storeGalleryReset(){try{const track=document.querySelector('[data-gal-track]');track&&track.scrollTo({left:0,behavior:'instant'});}catch{}}

// Один список слотів конструктора: сервер передає його в RUBIZH_BOOT.kitSlots (shop/catalog-lib.php · shopKitSlotPatterns)
const STORE_SLOT_NAMES=(Array.isArray(window.RUBIZH_BOOT?.kitSlots)&&window.RUBIZH_BOOT.kitSlots.length?window.RUBIZH_BOOT.kitSlots:[['gear','^(?:підсум|чохол|сумк|футляр|холдер|тримач)|рюкзак|баул|розвантаж|рпс|гідратор|бойовий пояс'],['med','аптеч|турнікет|джгут|гемостат|бандаж|ifak'],['small','шкарпет|рукавич|рукавиц|наколін|налокіт'],['head','шолом|каск|шапк|кепк|панам|бейсбол|балаклав|навушник|баф|окуляр'],['boots','берц|черевик|кросів|взутт|бахіл'],['armor','плитоноск|бронежилет|бронеплит|бронепакет|балістичн.*пакет'],['legs','штани|штанів|брюки|джогер|шорти'],['small','пояс|ремінь'],['body','курт|убакс|ubacs|сороч|футбол|поло|термобілиз|термобель|фліс|флис|кофта|худі|софтшел|пончо|костюм']]).map(([s,p])=>[s,new RegExp(p,'i')]);
function storeSlot(p){if(p.v3)return p.kit_slot||'none';for(const [slot,re] of STORE_SLOT_NAMES)if(re.test(p.name||''))return slot;const path=(p.path||String(p.category||'').split(' / ')).join(' / ');for(const [slot,re] of [['med',/медицин|медицина/i],['head',/голов|шолом/i],['armor',/бронезахист/i],['boots',/взуття/i],['legs',/штани/i],['small',/рукавич|аксесуари одягу/i],['gear',/рюкзак|підсум|рпс|спорядження/i],['body',/одяг|форма/i]])if(re.test(path))return slot;return 'small';}
// D-65 (owner 2026-10-16): «Бронезахист» (the armor section, the category and its subcategories) never gets the kit price — the server's shopKitFixedPrice.
// Stage 5 (owner, D-62): home groups of several roots have indexable pages /rozdil/<slug> (server: shop/category-groups.json).
function storeGroups(){const boot=window.RUBIZH_BOOT?.groups;return Array.isArray(boot)&&boot.length?boot:STORE_GROUPS_FALLBACK;}
// Kept equal to shop/category-groups.json (slug, title, roots; test stage5-seo) for pages served without RUBIZH_BOOT.groups.
const STORE_GROUPS_FALLBACK=[{slug:'bronezakhyst',title:'Бронезахист',roots:['Бронезахист','Шоломи та захист голови'],description:'',intro:''},{slug:'sporiadzhennia',title:'Спорядження',roots:['Рюкзаки, сумки та баули','Підсумки','РПС та розвантаження'],description:'',intro:''}];
function storeGroupForRoots(roots){if(!Array.isArray(roots)||roots.length<2)return null;return storeGroups().find(g=>g.roots.length===roots.length&&g.roots.every(r=>roots.includes(r)))||null;}
function storeKitFixedPrice(p){if(storeSlot(p)==='armor')return true;const path=(p.path||String(p.category||'').split(' / ')).join(' / ');return path==='Бронезахист'||path.startsWith('Бронезахист / ');}
const STORE_KIT_FIXED_NOTE='Бронезахист продається за фіксованою ціною, ціна комплекту на нього не застосовується.';
function storeMoney(n){return new Intl.NumberFormat('uk-UA',{maximumFractionDigits:2}).format(Math.round(Number(n||0)*100)/100)+'\u00a0₴';}
function storeQty(n){return Math.round(Number(String(n).replace(',','.'))*100)/100;}
function storeAreaUnit(p){const a=p.attributes||p.attrs||Object.fromEntries(p.specs||[]);const u=p.sale_unit||a['Одиниця продажу']||a['Одиниця виміру']||p.unit||'';if(/^(?:м²|м2|m2|m²|sqm|кв\.?\s*м)$/i.test(String(u).trim()))return 'm2';return /(?:ціна|цена|вартість|оплата)\s*(?:вказана\s*)?(?:за|\/|per)\s*(?:1\s*)?(?:кв\.?\s*м|м²|м2|m²|m2)/i.test(p.name||'')?'m2':'piece';}
function storeSeasons(p){const a=p.attributes||p.attrs||Object.fromEntries(p.specs||[]),s=String(a['Сезон']||a['Сезонність']||a['Сезонность']||'').toLowerCase(),n=String(p.name||'').toLowerCase(),x=s||n;if(/всесезон|вс[еі] сезон|цілоріч|all.?season/.test(x))return ['Літо','Демісезон','Зима'];let o=[];if(/літн|летн|літо/.test(x))o.push('Літо');if(/демісез|демисез|весн|осін/.test(x))o.push('Демісезон');if(/зим|холодн/.test(x))o.push('Зима');if(!o.length&&!s&&/фліс|флис|термобілиз|утеплен|утеплю/.test(n))return ['Демісезон','Зима'];return o;}
function storeSeasonOK(p,s){const a=storeSeasons(p);return !a.length||a.includes(s);}
function storePalette(c){const n=String(c||'').trim().toLowerCase();if(/^(?:піксель(?: мм14)?|пиксель|мм14(?: піксель)?|mm14|pixel)$/.test(n))return 'Піксель';if(/^(?:multicam|мультикам|мультікам)$/.test(n))return 'Мультикам';if(/^(?:coyote|койот)$/.test(n))return 'Койот';if(/^(?:olive|олива|оливковий|оливковый|olive drab|od green)$/.test(n))return 'Олива';if(/^(?:black|чорний|черный|чёрный)$/.test(n))return 'Чорний';return null;}
function storeHasPlates(p){const a=p.attributes||p.attrs||Object.fromEntries(p.specs||[]),n=(p.name||'')+' '+(a['Комплектація']||a['Комплектация']||'');return !/без\s+(?:броне)?плит|плити.{0,30}не\s+вход|лише\s+плитоноск/i.test(n)&&/(?:з|із|зі|с)\s+(?:броне)?плит|плити\s+(?:в комплекті|входять)/i.test(n);}
function storeRole(p){const n=(p.name||'').toLowerCase();if(/^(підсум|чохол|футляр|сумк)/.test(n))return /підсум.*магазин/.test(n)?'magazine':'';if(/шапк|балаклав|кепк|баф|шолом|каск|термоковдр|балістичн.*пакет|ремінь.*плитоноск/.test(n))return '';if(/рукавич|рукавиц/.test(n))return 'gloves';if(/аптеч|ifak/.test(n))return /порожн|без наповнення|підсум|сумк|чохол/.test(n)?'':'ifak';for(const [r,re] of [['protection',/плитоноск|бронежилет/],['plate',/бронеплит/],['thermal',/термобілиз|термобель/]])if(re.test(n))return r;if(/убакс|ubacs|бойова сороч/.test(n))return /комплект|костюм/.test(n)?'':'ubacs';if(/штани|брюки/.test(n))return 'pants';if(/рюкзак/.test(n))return /дрон|бпла|гвинтів|рушниц|чохол/.test(n)?'':'backpack';if(/фліс|флис|флісов/.test(n)&&/фліс|флис|кофт|куртк|худі|джемпер/.test(n))return 'fleece';if(/курт|пончо/.test(n))return 'outer';return '';}
// PIM v3 availability for the buyer: the structured PIM status of the real SKU (never provenance wording).
// Stage 5.1: supplier data older than pay_fresh_hours — sold only after the manager confirms (server field stock_freshness).
const STORE_V3_LABEL={IN_STOCK:'В наявності',STOCK_CONFIRM:'Менеджер підтвердить наявність перед оплатою',PREORDER:'Під замовлення',ORDER_ON_REQUEST:'Під замовлення',SIZE_CONFIRMATION_REQUIRED:'Уточнимо розмір',UNKNOWN:'Уточнимо наявність',OUT_OF_STOCK:'Немає в наявності',QUOTE:'Ціна за розрахунком'};
// Stage 5.4: a model of QUOTE SKU (price per m²) is not sold through the cart: «Розрахувати вартість».
function storeV3Status(p){const all=Object.values(p&&p.variants||{}),has=x=>all.some(v=>v.availability_v3===x);return all.length&&all.every(v=>v.sale_mode==='QUOTE')?'QUOTE':all.some(v=>v.availability_v3==='IN_STOCK'&&v.payment_allowed)?'IN_STOCK':all.some(v=>v.availability_v3==='IN_STOCK'&&v.stock_freshness==='CONFIRM'&&v.order_submission_allowed)?'STOCK_CONFIRM':has('PREORDER')?'PREORDER':has('ORDER_ON_REQUEST')?'ORDER_ON_REQUEST':has('SIZE_CONFIRMATION_REQUIRED')?'SIZE_CONFIRMATION_REQUIRED':has('UNKNOWN')?'UNKNOWN':'OUT_OF_STOCK';}
function storeV3Tone(code){return code==='IN_STOCK'?'in':code==='OUT_OF_STOCK'?'out':'order';}
function storeSizeMissing(p){if(p&&p.v3)return false;return ['body','legs','boots'].includes(storeSlot(p))&&!/пончо|бахіл|костюм.*маскув/i.test(p.name||'')&&Object.values(p.variants||{}).every(v=>v.size_unconfirmed||/^(?:Один розмір|OS|універсальний|)$/i.test(v.size_display||v.size_native||''));}
function storeKitVariantOK(p,v){const size=v.size_display||v.size_native||'';return v.price>0&&!v.size_unconfirmed&&['in_stock','preorder'].includes(v.availability)&&(v.availability!=='in_stock'||v.stock==null||v.stock>0)&&(!['body','legs','boots'].includes(storeSlot(p))||/пончо|бахіл|костюм.*маскув/i.test(p.name||'')||! /^(?:Один розмір|OS|універсальний|)$/i.test(size));}
function storeKitEligible(p){return p.storeReady&&p.price>0&&p.photos?.length&&!storeSizeMissing(p)&&Object.values(p.variants||{}).some(v=>storeKitVariantOK(p,v))&&storeAreaUnit(p)!=='m2'&&!/патрон|боєприпас|глушник|реб|репліка|страйкбол/i.test(p.name||'');}
function storeSizeOrder(a,b){const raw=v=>(String(v.size_display||'').trim()||String(v.size_native||'').trim()).toUpperCase(),rank=v=>{const x=raw(v),letters=['XXS','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL','7XL','8XL'];const canonical=x.replace(/^XXL(?=$|[ (])/,'2XL').replace(/^XXXL(?=$|[ (])/,'3XL');const i=letters.findIndex(z=>new RegExp('^'+z+'($|[ (/-])').test(canonical));return i>=0?i:100;};return rank(a)-rank(b)||raw(a).localeCompare(raw(b),'uk',{numeric:true})||String(a.color||'').localeCompare(String(b.color||''),'uk');}
// Keep distinct SKU records in data/cart; collapse only the visible size
// buttons for the chosen colour, preferring a buyable offer when duplicated.
function storeProductSizeKeys(p,color,selected){const groups=new Map(),rank=v=>v.availability==='in_stock'&&(v.stock==null||v.stock>0)?0:v.availability==='preorder'?1:2;for(const [key,v] of Object.entries(p.variants||{})){if(v.size_unconfirmed||v.color!==color)continue;const label=String(v.size_display||v.size_native||'').trim().toUpperCase();if(!label)continue;const old=groups.get(label);if(!old||key===selected||old!==selected&&rank(v)<rank(p.variants[old]))groups.set(label,key);}return [...groups.values()].sort((a,b)=>storeSizeOrder(p.variants[a],p.variants[b]));}
function storeVariantChoice(p){const sizes=[...new Set(Object.values(p.variants||{}).map(v=>String(v.size_display||v.size_native||'').trim()).filter(Boolean))];if(sizes.length<=1)return {head:'Варіант',choose:'Оберіть варіант',cta:'Оберіть варіант'};if(['body','legs','boots'].includes(storeSlot(p))||/рукавич|рукавиц|шкарпет/i.test(p.name||'')||sizes.some(s=>/^(?:XXS|XS|S|M|L|XL|XXL|XXXL|[2-8]XL)$/i.test(s)))return {head:p.size_scale==='shoes'?'Розмір взуття':'Розмір',choose:'Оберіть розмір',cta:'Оберіть розмір'};if(sizes.some(s=>/\d\s*[×xх*]\s*\d|\d\s*(см|мм|cm|mm)/i.test(s)))return {head:'Габарити',choose:'Оберіть габарити',cta:'Оберіть габарити'};return {head:'Варіант',choose:'Оберіть варіант',cta:'Оберіть варіант'};}
function storeKitPrimary(p){const n=p.name||'',slot=storeSlot(p);if(storeAreaUnit(p)==='m2')return false;const patterns={head:/шолом|каск|шапк|балаклав|кепк|панам|бейсбол|навушник|окуляр/i,boots:/берц|черевик|кросів/i,armor:/плитоноск|бронежилет|бронеплит|бронепакет/i,med:/турнікет|джгут|гемостат|бандаж|аптечка|ifak/i,body:/курт|убакс|ubacs|сороч|фліс|флис|термобілиз|худі|костюм|пончо/i,legs:/штани|брюки|джогер|шорти/i,gear:/рюкзак|розвантаж|рпс|бойовий пояс|підсум/i,small:/рукавич|рукавиц|шкарпет|наколін|налокіт|пояс|ремінь/i};if(!patterns[slot]?.test(n))return false;if(['head','armor'].includes(slot)&&/болт|велкро|подуш|панел|наклад|адаптер|кронштейн|чохол|фастекс|ремін|тримач|кріплен|рейк|фартух|напашник/i.test(n))return false;if(slot==='head'&&/кавер|камера|camera|ліхтар|стробоскоп|маркер|обвіс|підвіс|рюкзак|сумк/i.test(n))return false;if(slot==='armor'&&/камербанд|сороч|ubacs|сидуш|каремат|рюкзак|кавер/i.test(n))return false;if(slot==='med'&&/тренув|тренир|навчал|учб|маркер|сумк|підсум|чохол|порожн|без наповнення/i.test(n))return false;return true;}
function storeKitPriority(p){const role=storeRole(p);return ({ubacs:0,outer:1,fleece:2,thermal:3,pants:0,backpack:0,protection:0,plate:1,ifak:0})[role]??(/шолом|каск/i.test(p.name)?0:10);}

    const i = t => ({
        track: {
            width: "44px",
            height: "22px",
            flex: "0 0 auto",
            position: "relative",
            cursor: "pointer",
            background: t ? "var(--legacy-f2a33c)" : "var(--legacy-2a322b)",
            border: "1px solid " + (t ? "var(--legacy-f2a33c)" : "var(--legacy-3a423b)")
        },
        knob: {
            position: "absolute",
            top: "3px",
            left: t ? "25px" : "3px",
            width: "14px",
            height: "14px",
            background: t ? "var(--legacy-0b0d0b)" : "var(--legacy-8a9487)",
            transition: "left .12s"
        }
    }), s = [], o = [], a = [], r = [], n = [], c = [], l = [], p = [], h = [], d = [], u = [], m = [], g = ["Не той розмір","Брак або дефект","Інше"], k = [], f = [], y = [], b = [ [ "47 ОМБр «Магура»", "" ], [ "3 ОШБр", "" ], [ "93 ОМБр «Холодний Яр»", "" ], [ "Інша бригада", "Вкажіть назву або номер підрозділу" ] ], S = {
        delivery: [ "Оплата і доставка", [ "Доставка по всій Україні Новою Поштою: відділення, поштомат або кур’єр до дверей. Строк відправки підтверджує менеджер після перевірки наявності.", "Доставка оплачується окремо за тарифами Нової пошти. За різних місць відправки можливі окремі посилки; додаткові витрати погоджує менеджер.", "Оплата карткою monobank або на рахунок ФОП: товар у наявності — одразу, під замовлення або великою кількістю — після підтвердження менеджера. Післяплати немає.", "Для товару під замовлення менеджер погоджує наявність, розмір і строк відправлення до оплати." ] ],
        returns: [ "Обмін та повернення", [ "Обмін розміру — протягом 14 днів з моменту отримання. Товар має зберегти товарний вигляд; сліди примірки на позиції не є підставою для відмови.", "Повернення коштів — протягом 14 днів згідно із Законом України «Про захист прав споживачів». Порядок і строки повернення визначаються законодавством та умовами оферти.", "Законодавчі винятки та права щодо товарів з недоліками наведені у публічній оферті. Автоматичної заборони на повернення всього бронезахисту немає.", "Для обміну або повернення зверніться до менеджера: +380 97 686 78 92." ] ],
        warranty: [ "Гарантія", [ "Гарантійний строк і умови визначаються виробником та документами конкретного товару. Уточніть їх у менеджера до оплати.", "Гарантія не поширюється на природний знос, механічні пошкодження та наслідки неправильного догляду.", "Для звернення надішліть менеджеру номер замовлення та опис дефекту. Строк розгляду повідомимо після перевірки." ] ],
        offer: [ "Публічна оферта", [ "Цей документ є офіційною пропозицією укласти договір купівлі-продажу товарів дистанційним способом. Оформлення замовлення означає повну згоду з умовами.", "Продавець: ФОП Мєшалкін Андрій Леонідович, РНОКПП 2837300592. Адреса: Україна, 18007, м. Черкаси, вул. Смілянська, 23/1. IBAN: UA943220010000026004380084907, АТ «УНІВЕРСАЛ БАНК», МФО 322001, ЄДРПОУ банку 21133352. Товари постачаються згідно з описом на сайті; зовнішній вигляд може незначно відрізнятися від фото.", "Ціна товару визначається на момент оформлення замовлення. Продавець має право змінити ціну до моменту підтвердження замовлення менеджером.", "Продавець не реалізує зброю, боєприпаси та товари, обіг яких обмежено законодавством України.", "Спори вирішуються шляхом переговорів, а в разі недосягнення згоди — у судовому порядку за законодавством України." ] ],
        privacy: [ "Політика конфіденційності", [ "Ми збираємо мінімум даних, потрібних для виконання замовлення: ім’я, номер телефону, адресу доставки, e-mail та збережені розміри.", "Дані використовуються для входу в особистий кабінет, оформлення, доставки та підтримки замовлення. Для цих дій використовуються сервіси підтвердження входу Google, надсилання SMS TurboSMS, служба доставки та платіжний провайдер — у межах відповідної функції.", "Службові повідомлення (підтвердження, ТТН, документи) надсилаються завжди. Маркетингові листи можна вимкнути в кабінеті або за посиланням у листі.", "Ви маєте право запросити копію своїх даних або їх видалення — напишіть на пошту магазину.", "Сайт використовує файли cookie для роботи кошика та аналітики.", "Якщо ви обираєте вхід через Google, ми отримуємо ідентифікатор вашого Google-акаунта, підтвердження email та, за наявності, ім’я. Пароль Google, листи, контакти й файли не отримуємо. Телефон підтверджується окремим кодом SMS. Прив’язані способи входу відкривають один особистий кабінет.", "Коди SMS та посилання для входу одноразові. Для захисту від зловживань зберігаються технічні дані спроб входу. З питань персональних даних звертайтеся до менеджера за номером +380 97 686 78 92." ] ],
        about: [ "Про нас", [ "«Рубіж» — магазин тактичного спорядження. Ми не виробник і не посередник наосліп: кожну позицію перед додаванням у каталог перевіряємо самі.", "Наша робота — щоб замовлення дійшло швидко, а розмір підійшов з першого разу. Тому підтверджуємо наявність до оплати, тримаємо розмірні сітки та міняємо розмір без суперечок.", "Плануємо спрямовувати частину прибутку на підтримку війська. Підтверджені перекази публікуватимемо у звітах після фактичної передачі коштів.", "Ми не продаємо зброю та боєприпаси." ] ],
        contacts: [ "Контакти", [ "Телефон: +380 97 686 78 92, щодня 10:00–20:00.", "Email: info@rubizh.shop", "Месенджери: Signal, Telegram, WhatsApp, Viber — на цей самий номер.", "Зв’язок із продавцем: +380 97 686 78 92", "Для підрозділів і фондів: рахунок на безготівкову оплату, документи в день заявки. Пишіть з позначкою «опт».", "ФОП Мєшалкін Андрій Леонідович Відправка по всій Україні Новою Поштою." ] ]
    }, v = {
        "а": "a",
        "б": "b",
        "в": "v",
        "г": "h",
        "ґ": "g",
        "д": "d",
        "е": "e",
        "є": "ie",
        "ж": "zh",
        "з": "z",
        "и": "y",
        "і": "i",
        "ї": "i",
        "й": "i",
        "к": "k",
        "л": "l",
        "м": "m",
        "н": "n",
        "о": "o",
        "п": "p",
        "р": "r",
        "с": "s",
        "т": "t",
        "у": "u",
        "ф": "f",
        "х": "kh",
        "ц": "ts",
        "ч": "ch",
        "ш": "sh",
        "щ": "shch",
        "ь": "",
        "ю": "iu",
        "я": "ia",
        "’": "",
        "'": "",
        "ʼ": ""
    }, w = t => t.toLowerCase().split("").map(t => void 0 !== v[t] ? v[t] : t).join("").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""), x = (t, e, i, s) => {
        const o = t % 10, a = t % 100;
        return t + " " + (1 === o && 11 !== a ? e : o >= 2 && o <= 4 && (a < 12 || a > 14) ? i : s);
    }, O = [ {
        desc: "Форма, яку не шкода носити щодня: ММ14 і мультикам, убакси під бронезахист, тактичні штани з наколінниками. Підбирайте за зростом і обхватом грудей — розмірна сітка є в кожній картці.",
        text: [ [ "Як обрати тактичну форму", "Головне — тканина та посадка. Ріп-стоп 65/35 тримає зношування і швидко сохне, а убакс з дихаючою спинкою краще працює під плитоноскою, ніж звичайний кітель." ], [ "ММ14 чи мультикам", "ММ14 — статутний камуфляж ЗСУ, його вимагають у більшості підрозділів. Мультикам універсальніший за сезонами, але перед покупкою уточніть вимоги вашої частини." ] ],
        guides: [ [ "Як підібрати розмір форми", "/porady/rozmir-formy" ], [ "Догляд за ріп-стопом", "/porady/dohliad-rip-stop" ] ]
    }, {
        desc: "Плитоноски, бронеплити та шоломи. Перед оплатою уточнюємо наявність і розмір плит під вашу плитоноску.",
        text: [ [ "Як підібрати плитоноску", "Спершу визначте розмір плит — найпоширеніший 250×300 мм. Плитоноска має сидіти так, щоб верхній край плити був на рівні яремної западини." ], [ "Вага і мобільність", "Керамічні плити легші за сталеві, але чутливіші до ударів. Для тривалих виходів вага комплекту важливіша за товщину." ] ],
        guides: [ [ "Як обрати плитоноску", "/porady/yak-obraty-plytonosku" ], [ "Розміри бронеплит", "/porady/rozmiry-bronepłyt" ] ]
    }, {
        desc: "Берці на всі сезони: демісезонні, літні з сіткою та зимові з утеплювачем. Беріть на піврозміру більше під теплу шкарпетку.",
        text: [ [ "Як обрати берці", "Дивіться на три речі: підошву, висоту та матеріал верху. Литий ТПУ тримає мороз до −20°, а кордура з натуральною шкірою сохне швидше за повністю шкіряні моделі." ], [ "Зимові чи демісезонні", "Зимові берці з утеплювачем потрібні при довгому перебуванні на місці. Для руху при нулі демісезонна пара з термошкарпеткою часто зручніша." ] ],
        guides: [ [ "Як підібрати розмір берців", "/porady/rozmir-bertsiv" ], [ "Зимові берці: на що дивитися", "/porady/zymovi-bertsi" ] ]
    }, {
        desc: "Рюкзаки, підсумки, РПС та аптечки IFAK — все, що кріпиться на MOLLE. Розкладку підкажемо, якщо напишете, під яке завдання збираєтесь.",
        text: [ [ "Як зібрати розвантаження", "Почніть з основи — плитоноски або РПС, потім додайте магазинні підсумки, аптечку на видноті й підсумок-скидач. Все, що потрібно дістати однією рукою, — спереду." ], [ "Яка аптечка потрібна", "Мінімум за протоколом TCCC: турнікет, гемостатичний бандаж, оклюзійна наліпка й ножиці. Турнікет має бути оригінальним — копії рвуться." ] ],
        guides: [ [ "Як зібрати розкладку", "/porady/rozkladka" ], [ "Що має бути в IFAK", "/porady/ifak" ] ]
    } ], C = [], _ = {}, z = [ "Одяг", "Бронезахист", "Взуття", "Спорядження", "Догляд" ], F = {
        g4: "/assets/guide-membrane-care.8edee557f949.webp",
        g1: "/assets/guide-boots-season.7ae0d9df414d.webp",
        g2: "/assets/guide-plate-carrier-size.e1b03ac29b2e.webp",
        g3: "/assets/guide-mm14-vs-multicam.72614bc77340.webp",
        g5: "/assets/guide-ifak.3df8d89d8c0e.webp",
        g6: "/assets/guide-uniform-size.1017957a91e4.webp"
    }, A = [ {
        key: "g1",
        topic: "Взуття",
        min: 6,
        upd: "18 вересня 2026",
        title: "Як вибрати берці за сезоном",
        desc: "Літо, демісезон і зима: яка підошва, висота і матеріал працюють у кожному сезоні.",
        secs: [ {
            h: "Одна пара на весь рік — не працює",
            p: "Берці, в яких комфортно при +25°, у мороз промокають і дубіють, а зимова пара влітку перетворює ногу на компрес. Мінімум для служби — дві пари: літня і демісезонна, а для довгого перебування на місці взимку — третя, утеплена."
        }, {
            h: "Що дивитися за сезоном",
            p: "Порівняйте три параметри: верх, підошву й утеплення.",
            table: [ [ "Сезон", "Температура", "Верх", "Підошва" ], [ "Літо", "від +10°", "замша + сітка", "ЕВА + гума" ], [ "Демісезон", "−5…+15°", "шкіра + кордура", "литий ТПУ" ], [ "Зима", "нижче −5°", "шкіра + мембрана", "ТПУ, мороз до −30°" ] ]
        }, {
            h: "Літо",
            p: "Сітчасті вставки сохнуть за годину, а не за добу. Беріть свій розмір — нога влітку набрякає менше, ніж здається.",
            prod: "p10"
        }, {
            h: "Демісезон",
            p: "Найуніверсальніша пара. Шкіра з кордурою тримає форму після намокання, литий ТПУ не тріскає на морозі.",
            prod: "p3"
        }, {
            h: "Як міряти стопу",
            p: "Увечері, стоячи, в тій шкарпетці, з якою будете носити. Поставте ногу на аркуш, обведіть і виміряйте від п’ятки до найдовшого пальця.",
            warn: "Зимові берці беріть на піврозміру більше: тепла шкарпетка й вільний простір для пальців гріють краще за будь-який утеплювач."
        } ]
    }, {
        key: "g2",
        topic: "Бронезахист",
        min: 7,
        upd: "12 вересня 2026",
        title: "Плитоноска під плити: як не помилитися з розміром",
        desc: "Спершу плита, потім плитоноска. Як обрати розмір плит під зріст і перевірити посадку.",
        secs: [ {
            h: "Спершу плити, потім плитоноска",
            p: "Плитоноску підбирають під плити, а не навпаки. Кишеня, у якій плита бовтається, так само погана, як і та, в яку вона не влазить."
        }, {
            h: "Розмір плити за зростом",
            p: "Орієнтовна таблиця. Остаточно перевіряйте по торсу — людина одного зросту може мати різну довжину тулуба.",
            table: [ [ "Плита, мм", "Зріст", "Розмір плитоноски" ], [ "230×290", "до 170 см", "S" ], [ "250×300", "170–185 см", "M / L" ], [ "275×350", "від 185 см", "XL" ] ]
        }, {
            h: "Як перевірити посадку",
            p: "Верхній край передньої плити — на рівні яремної западини, нижній — не нижче пупка. Задня плита стоїть на одній висоті з передньою.",
            warn: "Плита, що сидить низько, заважає сідати в транспорт і лишає відкритими серце та легені. Це найчастіша помилка.",
            prod: "p2"
        } ]
    }, {
        key: "g3",
        topic: "Одяг",
        min: 5,
        upd: "2 вересня 2026",
        title: "ММ14 чи мультикам: що брати",
        desc: "Статут, середовище і сезон. Коли брати піксель ЗСУ, а коли мультикам.",
        secs: [ {
            h: "Що каже статут",
            p: "ММ14 — статутний камуфляж Збройних сил. Більшість підрозділів вимагають саме його для строю та повсякденної служби."
        }, {
            h: "Порівняння",
            p: "Коротко — за трьома критеріями.",
            table: [ [ "Критерій", "ММ14", "Мультикам" ], [ "Статут ЗСУ", "так", "за рішенням підрозділу" ], [ "Ліс і поле", "добре", "добре" ], [ "Суха трава, осінь", "середньо", "краще" ] ]
        }, {
            h: "Коли брати ММ14",
            p: "Якщо підрозділ не дав інших вказівок — це безпечний вибір для першого комплекту.",
            prod: "p1",
            warn: "Перед покупкою уточніть вимоги вашої частини: у деяких підрозділах мультикам заборонений у строю."
        } ]
    }, {
        key: "g4",
        topic: "Догляд",
        min: 4,
        upd: "28 серпня 2026",
        title: "Догляд за мембраною після позиції",
        desc: "Чому мембрана перестає дихати і як повернути їй водовідштовхування за один вечір.",
        secs: [ {
            h: "Чому мембрана перестає дихати",
            p: "Пори забиваються брудом, потом і жиром. Тканина стає важкою і промокає, хоча мембрана ціла."
        }, {
            h: "Можна і не можна",
            p: "Мембрану вбиває не вода, а неправильне прання.",
            table: [ [ "Що", "Можна", "Не можна" ], [ "Засіб", "рідкий для мембран", "порошок, кондиціонер" ], [ "Температура", "до 30°", "гаряче прання" ], [ "Сушіння", "на вішаку", "батарея, барабан" ] ]
        }, {
            h: "Відновлення просочення",
            p: "Після прання нанесіть спрей-просочення на вологу тканину і висушіть. Раз на 5–6 прань цього достатньо.",
            warn: "Кондиціонер для білизни назавжди забиває пори мембрани. Одного прання досить, щоб куртка перестала дихати.",
            prod: "p14"
        } ]
    }, {
        key: "g5",
        topic: "Спорядження",
        min: 5,
        upd: "20 серпня 2026",
        title: "Що має бути в IFAK",
        desc: "Мінімальний склад аптечки за протоколом TCCC і де її носити.",
        secs: [ {
            h: "Мінімум за протоколом",
            p: "IFAK — індивідуальна аптечка на вас, а не на групу. Склад має закривати три головні причини смерті: кровотечу, пневмоторакс і непрохідність дихальних шляхів.",
            table: [ [ "Предмет", "Навіщо", "Кількість" ], [ "Турнікет", "кровотеча з кінцівки", "1–2" ], [ "Гемостатичний бандаж", "тампонада рани", "1" ], [ "Оклюзійна наліпка", "пневмоторакс", "2" ], [ "Назофарингеальна трубка", "дихальні шляхи", "1" ] ]
        }, {
            h: "Де носити",
            p: "На видноті й так, щоб дістати будь-якою рукою. Турнікет — окремо від аптечки, в швидкому доступі.",
            warn: "Турнікет лише оригінальний. Копії рвуться під навантаженням — перевірити це можна тільки тоді, коли вже пізно.",
            prod: "p5"
        } ]
    }, {
        key: "g6",
        topic: "Одяг",
        min: 4,
        upd: "14 серпня 2026",
        title: "Як підібрати розмір форми",
        desc: "Три мірки, одна таблиця і правило, коли ви між двома розмірами.",
        secs: [ {
            h: "Три мірки",
            p: "Зріст, обхват грудей по найширшому місцю і обхват пояса на рівні пупка. Міряйте поверх білизни, стрічку тримайте рівно, не затягуючи.",
            table: [ [ "Розмір", "Зріст", "Груди", "Пояс" ], [ "S", "164–170", "92–96", "76–80" ], [ "M", "170–176", "96–100", "80–86" ], [ "L", "176–182", "100–106", "86–92" ], [ "XL", "182–188", "106–112", "92–98" ] ]
        }, {
            h: "Між двома розмірами",
            p: "Беріть більший: під форму йде термобілизна й фліс, а під убакс — бронезахист.",
            prod: "p7"
        } ]
    } ], L = {
        form: {
            name: "Одяг",
            how: "Зріст — без взуття, спиною до стіни. Груди — по найширшому місцю під пахвами. Пояс — на рівні пупка, не затягуючи стрічку.",
            t: [ [ "Розмір", "Маркування виробника", "Зріст, см", "Груди, см", "Пояс, см" ], [ "XS", "44", "158–164", "86–92", "70–76" ], [ "S", "46", "164–170", "92–96", "76–80" ], [ "M", "48", "170–176", "96–100", "80–86" ], [ "L", "50", "176–182", "100–106", "86–92" ], [ "XL", "52", "182–188", "106–112", "92–98" ], [ "2XL", "54", "188–194", "112–120", "98–106" ], [ "3XL", "56", "194–200", "120–128", "106–114" ] ]
        },
        boots: {
            name: "Взуття",
            how: "Міряйте стопу ввечері, стоячи, у шкарпетці, з якою будете носити. Відстань від п’ятки до найдовшого пальця.",
            t: [ [ "UA", "EU", "Довжина стопи, см" ], [ "40", "41", "26,0" ], [ "41", "42", "26,7" ], [ "42", "43", "27,3" ], [ "43", "44", "28,0" ], [ "44", "45", "28,7" ], [ "45", "46", "29,3" ], [ "46", "47", "30,0" ] ]
        },
        socks: {
            name: "Шкарпетки",
            how: "Розмір шкарпеток обирайте за розміром взуття, яке носите з ними.",
            t: [ [ "Розмір", "Розмір взуття", "Довжина стопи, см" ], [ "39–42", "39–42", "25,3–27,3" ], [ "43–46", "43–46", "28,0–30,0" ], [ "M (40–43)", "40–43", "26,0–28,0" ], [ "L (44–46)", "44–46", "28,7–30,0" ] ]
        },
        gloves: {
            name: "Рукавиці",
            how: "Обхват долоні — по кісточках, без великого пальця. Довжина — від зап’ястя до кінчика середнього пальця.",
            t: [ [ "Розмір", "Обхват долоні, см", "Довжина, см" ], [ "S", "18–19", "17" ], [ "M", "20–21", "18" ], [ "L", "22–23", "19" ], [ "XL", "24–25", "20" ] ]
        },
        helmets: {
            name: "Головні убори",
            how: "Обхват голови — на 1–2 см вище брів і по найвиступнішій точці потилиці.",
            t: [ [ "Розмір", "Обхват голови, см" ], [ "S", "52–54" ], [ "M", "55–57" ], [ "L", "58–60" ], [ "XL", "61–63" ] ]
        }
    }, E = [], P = [ [ "Чесна наявність", "Товар у наявності оплачуєте одразу. Під замовлення менеджер перевірить наявність і розмір протягом 30 хвилин — якщо позиції немає, скажемо одразу." ], [ "Відправка після оплати", "ТТН з’явиться в кабінеті після оформлення посилки. Для товару під замовлення строк підтвердить менеджер." ], [ "Обмін розміру без суперечок", "14 днів. Радимо розмір за зростом і обхватом — щоб обмін взагалі не був потрібен." ], [ "Донат прозоро", "Плануємо підтримку війська з власного прибутку. Звіти додамо після фактичних переказів." ] ], M = [ [ "Чи можна замовити без реєстрації?", "Так. Достатньо імені, телефону та відділення. Email — за бажанням: на нього прийде лист із замовленням і посилання для входу в кабінет." ], [ "Як дізнатися свій розмір?", "Використовуйте підтверджені розміри у картці. Якщо сітки немає, менеджер уточнить виміри у постачальника." ], [ "Як оплатити замовлення?", "Карткою monobank або на рахунок ФОП. Товар у наявності — одразу; під замовлення або великою кількістю — після підтвердження менеджера. Післяплати немає." ], [ "Скільки йде доставка?", "Нова Пошта 1–2 дні по Україні. Відділення, поштомат або кур’єр — обираєте в кошику." ], [ "Чи продаєте зброю?", "Ні. Тільки одяг, спорядження, бронезахист і аптечки. Зброю та боєприпаси ми не продаємо." ] ], T = [], q = [ {
        key: "season",
        title: "Сезон",
        options: [ [ "Літо", "жара, ріп-стоп" ], [ "Демісезон", "фліс і дощовик" ], [ "Зима", "термо, утеплення" ] ]
    }, {
        key: "task",
        title: "Задача",
        options: [ [ "Перша лінія", "бронезахист, IFAK" ], [ "Друга лінія / тил", "форма, побут" ], [ "Цивільно, тактичний стиль", "без броні" ] ]
    }, {
        key: "size",
        title: "Розмір форми",
        options: [ [ "S–M", "зріст до 176" ], [ "L", "зріст 176–182" ], [ "XL–XXL", "зріст від 182" ] ]
    }, {
        key: "budget",
        title: "Бюджет",
        options: [ [ "До 8 000 ₴", "базове" ], [ "8–20 000 ₴", "повний комплект" ], [ "Без обмежень", "найкраще" ] ]
    } ], I = [], R = {_:[]}, B = t => storeMoney(t), D = {
        "Одяг та форма": {
            "Аксесуари одягу": [ "Головні убори", "Тактичні рукавички", "Шапки та балаклави", "Кепки, панами, бейсболки", "Тактичні ремені", "Баффи" ],
            "Жіночий одяг": [ "Куртки", "Тактичні штани", "Убакси та бойові сорочки" ],
            "Чоловічий одяг": [ "Куртки та вітровки", "Пончо та гамаші", "Тактичні шорти", "Тактичні штани", "Термобілизна", "Убакси та бойові сорочки", "Фліс, кофти та худі", "Формені комплекти та костюми", "Футболки та поло", "Зимові та утеплені куртки", "Зимові костюми", "Костюми Soft Shell" ]
        },
        "Взуття": {
            "Тактичне взуття": [ "Взуття", "Берці", "Берці зимові", "Берці демісезонні", "Тактичні кросівки", "Кросівки демісезонні", "Кросівки літні", "Черевики" ],
            "Шкарпетки та аксесуари": [ "Тактичні шкарпетки", "Термошкарпетки", "Бахіли" ]
        },
        "Бронезахист": {
            "Бронежилети": [ "Бронежилети" ],
            "Бронеплити": [ "Бронеплити" ],
            "Бронекомплекти": [ "1 клас захисту", "2 клас захисту" ],
            "М’які балістичні пакети": [ "1 клас захисту", "2 клас захисту" ],
            "Плитоноски": [ "Плитоноски", "Комплекти плитоносок" ]
        },
        "Шоломи та захист голови": {
            "Шоломи": [ "FAST", "MICH", "Комплекти шоломів" ],
            "Аксесуари": [ "Кавери на шоломи", "Підвісні системи та подушки", "Кріплення для навушників", "Інші аксесуари" ]
        },
        "Тактичний зв’язок та слух": {
            "Активні навушники": [ "EARMOR", "Walker's", "HD" ],
            "Радіозв’язок": [ "Аксесуари для рацій" ]
        },
        "Рюкзаки, сумки та баули": {
            "Рюкзаки": [ "Тактичні рюкзаки", "Штурмові рюкзаки", "Гідратори та рюкзаки-гідратори" ],
            "Сумки": [ "Баули та транспортні сумки", "Через плече та бананки", "Сумки для шоломів", "Поясні сумки та органайзери" ]
        },
        "Підсумки": {
            "Бойові підсумки": [ "Для магазинів", "Для гранат", "Скидання магазинів", "Нерозсипайки" ],
            "Медичні підсумки": [ "Для турнікету", "Аптечки IFAK" ],
            "Спеціальні підсумки": [ "Для рацій", "Для навушників" ],
            "Утилітарні": [ "Утилітарні підсумки" ],
            "Нагрудні та напашні": [ "Напашні сумки", "Для живота" ],
            "Панелі та платформи": [ "Панелі для плитоносок" ],
            "Комплекти": [ "Комплекти підсумків" ]
        },
        "РПС та розвантаження": {
            "Системи": [ "Ремінно-плечові системи" ],
            "Компоненти": [ "Пояси", "Лямки" ],
            "Комплекти": [ "Комплекти РПС" ]
        },
        "Захист колін та ліктів": {
            "Наколінники": [ "Наколінники" ],
            "Налокітники": [ "Налокітники" ],
            "Комплекти": [ "Наколінники + налокітники" ]
        },
        "Захист очей та обличчя": {
            "Окуляри": [ "Тактичні окуляри" ]
        },
        "Тактична медицина": {
            "Кровоспинні засоби": [ "Турнікети, джгути та гемостатики" ]
        },
        "Маскування": {
            "Антидронові сітки": [ "Для доріг і техніки" ],
            "Маскувальні сітки Militex": [ "Мультикам весна", "Очерет", "Камуфляж земля", "З основою піксель", "Дубове листя", "Мультикам бруд", "Хижак", "Мультикам", "Альпійська клякса", "Зимовий мультикам", "Хвойний ліс", "З основою темний мультикам", "Листя", "Камуфляж", "Степовий мультикам", "Темний мультикам", "З основою мультикам", "Листя осінь", "Піксель", "З основою зимовий мультикам", "З основою хвойний ліс" ],
            "Маскувальні костюми": [ "Маскувальні костюми" ],
            "Маскувальні шарфи": [ "Маскувальні шарфи" ]
        },
        "Туризм та польове спорядження": {
            "Каремати та сидушки": [ "Розкладні каремати", "Тактичні сидушки" ],
            "Сон": [ "Спальні мішки" ],
            "Інше": [ "Польове спорядження" ]
        },
        "Електроніка та спостереження": {
            "Кріплення": [ "Для ПНБ та тепловізорів" ],
            "Екшн-камери": [ "Екшн-камери" ],
            "РЕБ та РЕР": [ "Засоби РЕБ та РЕР" ]
        },
        "Освітлення": {
            "Ліхтарі та аксесуари": [ "Ліхтарі та аксесуари" ]
        },
        "Автономне живлення": {
            "Зарядні станції": [ "Портативні зарядні станції" ],
            "Сонячна енергія": [ "Сонячні панелі" ],
            "Аксесуари": [ "Аксесуари живлення" ]
        },
        "Збройові аксесуари": {
            "Магазини": [ "Для АК та AR-15" ],
            "Ремені": [ "Ремені для зброї" ],
            "Платформа AR": [ "Аксесуари" ],
            "Платформа АК": [ "Аксесуари" ],
            "Догляд": [ "Чищення та обслуговування" ],
            "Інше": [ "Глушники" ],
            "Боєприпаси": [ "Патрони" ]
        }
    }, j = {
        "Одяг та форма / Чоловічий одяг / Тактичні штани": 118,
        "Одяг та форма / Чоловічий одяг / Футболки та поло": 74,
        "Одяг та форма / Чоловічий одяг / Куртки та вітровки": 61,
        "Одяг та форма / Чоловічий одяг / Зимові та утеплені куртки": 52,
        "Одяг та форма / Чоловічий одяг / Фліс, кофти та худі": 48,
        "Одяг та форма / Чоловічий одяг / Убакси та бойові сорочки": 44,
        "Одяг та форма / Чоловічий одяг / Формені комплекти та костюми": 39,
        "Одяг та форма / Чоловічий одяг / Зимові костюми": 31,
        "Одяг та форма / Чоловічий одяг / Термобілизна": 29,
        "Одяг та форма / Чоловічий одяг / Тактичні шорти": 18,
        "Одяг та форма / Чоловічий одяг / Костюми Soft Shell": 14,
        "Одяг та форма / Чоловічий одяг / Пончо та гамаші": 6,
        "Одяг та форма / Жіночий одяг / Куртки": 7,
        "Одяг та форма / Жіночий одяг / Тактичні штани": 8,
        "Одяг та форма / Жіночий одяг / Убакси та бойові сорочки": 4,
        "Одяг та форма / Аксесуари одягу / Тактичні рукавички": 34,
        "Одяг та форма / Аксесуари одягу / Шапки та балаклави": 27,
        "Одяг та форма / Аксесуари одягу / Кепки, панами, бейсболки": 19,
        "Одяг та форма / Аксесуари одягу / Тактичні ремені": 14,
        "Одяг та форма / Аксесуари одягу / Баффи": 9,
        "Взуття / Тактичне взуття / Берці": 71,
        "Взуття / Тактичне взуття / Берці зимові": 42,
        "Взуття / Тактичне взуття / Берці демісезонні": 36,
        "Взуття / Тактичне взуття / Тактичні кросівки": 33,
        "Взуття / Тактичне взуття / Кросівки демісезонні": 21,
        "Взуття / Тактичне взуття / Кросівки літні": 17,
        "Взуття / Тактичне взуття / Черевики": 12,
        "Взуття / Шкарпетки та аксесуари / Тактичні шкарпетки": 9,
        "Взуття / Шкарпетки та аксесуари / Термошкарпетки": 4,
        "Взуття / Шкарпетки та аксесуари / Бахіли": 1,
        "Бронезахист / Бронеплити / Бронеплити": 88,
        "Бронезахист / Плитоноски / Плитоноски": 51,
        "Бронезахист / Плитоноски / Комплекти плитоносок": 32,
        "Бронезахист / Бронежилети / Бронежилети": 21,
        "Бронезахист / М’які балістичні пакети / 1 клас захисту": 12,
        "Бронезахист / М’які балістичні пакети / 2 клас захисту": 9,
        "Бронезахист / Бронекомплекти / 1 клас захисту": 6,
        "Бронезахист / Бронекомплекти / 2 клас захисту": 5,
        "Шоломи та захист голови / Шоломи / FAST": 44,
        "Шоломи та захист голови / Шоломи / MICH": 23,
        "Шоломи та захист голови / Шоломи / Комплекти шоломів": 11,
        "Шоломи та захист голови / Аксесуари / Кавери на шоломи": 17,
        "Шоломи та захист голови / Аксесуари / Підвісні системи та подушки": 9,
        "Шоломи та захист голови / Аксесуари / Кріплення для навушників": 8,
        "Шоломи та захист голови / Аксесуари / Інші аксесуари": 4,
        "Захист колін та ліктів / Наколінники / Наколінники": 9,
        "Захист колін та ліктів / Налокітники / Налокітники": 5,
        "Захист колін та ліктів / Комплекти / Наколінники + налокітники": 3,
        "Захист очей та обличчя / Окуляри / Тактичні окуляри": 4,
        "Підсумки / Бойові підсумки / Для магазинів": 12,
        "Підсумки / Бойові підсумки / Для гранат": 5,
        "Підсумки / Бойові підсумки / Скидання магазинів": 4,
        "Підсумки / Бойові підсумки / Нерозсипайки": 3,
        "Підсумки / Медичні підсумки / Для турнікету": 6,
        "Підсумки / Медичні підсумки / Аптечки IFAK": 7,
        "Підсумки / Спеціальні підсумки / Для рацій": 4,
        "Підсумки / Спеціальні підсумки / Для навушників": 2,
        "Підсумки / Нагрудні та напашні / Напашні сумки": 3,
        "Підсумки / Утилітарні / Утилітарні підсумки": 4,
        "Підсумки / Панелі та платформи / Панелі для плитоносок": 2,
        "РПС та розвантаження / Системи / Ремінно-плечові системи": 6,
        "РПС та розвантаження / Компоненти / Пояси": 4,
        "РПС та розвантаження / Компоненти / Лямки": 2,
        "РПС та розвантаження / Комплекти / Комплекти РПС": 2,
        "Рюкзаки, сумки та баули / Рюкзаки / Тактичні рюкзаки": 21,
        "Рюкзаки, сумки та баули / Рюкзаки / Штурмові рюкзаки": 14,
        "Рюкзаки, сумки та баули / Рюкзаки / Гідратори та рюкзаки-гідратори": 9,
        "Рюкзаки, сумки та баули / Сумки / Баули та транспортні сумки": 8,
        "Рюкзаки, сумки та баули / Сумки / Через плече та бананки": 6,
        "Рюкзаки, сумки та баули / Сумки / Поясні сумки та органайзери": 5,
        "Рюкзаки, сумки та баули / Сумки / Сумки для шоломів": 3,
        "Тактична медицина / Кровоспинні засоби / Турнікети, джгути та гемостатики": 5,
        "Маскування / Маскувальні сітки Militex / Мультикам весна": 48,
        "Маскування / Маскувальні сітки Militex / Очерет": 36,
        "Маскування / Маскувальні сітки Militex / Камуфляж земля": 31,
        "Маскування / Маскувальні сітки Militex / З основою піксель": 29,
        "Маскування / Маскувальні сітки Militex / Дубове листя": 27,
        "Маскування / Маскувальні сітки Militex / Мультикам бруд": 25,
        "Маскування / Маскувальні сітки Militex / Хижак": 24,
        "Маскування / Маскувальні сітки Militex / Мультикам": 23,
        "Маскування / Маскувальні сітки Militex / Альпійська клякса": 22,
        "Маскування / Маскувальні сітки Militex / Зимовий мультикам": 21,
        "Маскування / Маскувальні сітки Militex / Хвойний ліс": 20,
        "Маскування / Маскувальні сітки Militex / З основою темний мультикам": 19,
        "Маскування / Маскувальні сітки Militex / Листя": 18,
        "Маскування / Маскувальні сітки Militex / Камуфляж": 17,
        "Маскування / Маскувальні сітки Militex / Степовий мультикам": 16,
        "Маскування / Маскувальні сітки Militex / Темний мультикам": 14,
        "Маскування / Маскувальні сітки Militex / З основою мультикам": 13,
        "Маскування / Маскувальні сітки Militex / Листя осінь": 10,
        "Маскування / Маскувальні сітки Militex / Піксель": 8,
        "Маскування / Маскувальні сітки Militex / З основою зимовий мультикам": 6,
        "Маскування / Маскувальні сітки Militex / З основою хвойний ліс": 3,
        "Маскування / Антидронові сітки / Для доріг і техніки": 23,
        "Маскування / Маскувальні костюми / Маскувальні костюми": 15,
        "Маскування / Маскувальні шарфи / Маскувальні шарфи": 7,
        "Туризм та польове спорядження / Сон / Спальні мішки": 22,
        "Туризм та польове спорядження / Каремати та сидушки / Тактичні сидушки": 18,
        "Туризм та польове спорядження / Каремати та сидушки / Розкладні каремати": 14,
        "Туризм та польове спорядження / Інше / Польове спорядження": 10,
        "Тактичний зв’язок та слух / Активні навушники / EARMOR": 14,
        "Тактичний зв’язок та слух / Активні навушники / Walker's": 8,
        "Тактичний зв’язок та слух / Активні навушники / HD": 5,
        "Тактичний зв’язок та слух / Радіозв’язок / Аксесуари для рацій": 5,
        "Електроніка та спостереження / Кріплення / Для ПНБ та тепловізорів": 15,
        "Електроніка та спостереження / Екшн-камери / Екшн-камери": 11,
        "Електроніка та спостереження / РЕБ та РЕР / Засоби РЕБ та РЕР": 7,
        "Освітлення / Ліхтарі та аксесуари / Ліхтарі та аксесуари": 15,
        "Автономне живлення / Зарядні станції / Портативні зарядні станції": 6,
        "Автономне живлення / Сонячна енергія / Сонячні панелі": 5,
        "Автономне живлення / Аксесуари / Аксесуари живлення": 3,
        "Збройові аксесуари / Магазини / Для АК та AR-15": 27,
        "Збройові аксесуари / Ремені / Ремені для зброї": 17,
        "Збройові аксесуари / Платформа AR / Аксесуари": 14,
        "Збройові аксесуари / Платформа АК / Аксесуари": 12,
        "Збройові аксесуари / Догляд / Чищення та обслуговування": 9,
        "Збройові аксесуари / Інше / Глушники": 6,
        "Збройові аксесуари / Боєприпаси / Патрони": 0
    }, U = [ {
        title: "Одяг і взуття",
        blocks: [ {
            name: "Одяг та форма",
            path: [ "Одяг та форма" ],
            exclude: [ [ "Одяг та форма", "Аксесуари одягу" ] ],
            items: [ [ "Тактичні штани", [ "Одяг та форма / Чоловічий одяг / Тактичні штани", "Одяг та форма / Жіночий одяг / Тактичні штани" ] ], [ "Футболки та поло", [ "Одяг та форма / Чоловічий одяг / Футболки та поло" ] ], [ "Куртки та вітровки", [ "Одяг та форма / Чоловічий одяг / Куртки та вітровки", "Одяг та форма / Жіночий одяг / Куртки" ] ], [ "Зимові та утеплені куртки", [ "Одяг та форма / Чоловічий одяг / Зимові та утеплені куртки" ] ], [ "Фліс, кофти та худі", [ "Одяг та форма / Чоловічий одяг / Фліс, кофти та худі" ] ], [ "Убакси та бойові сорочки", [ "Одяг та форма / Чоловічий одяг / Убакси та бойові сорочки", "Одяг та форма / Жіночий одяг / Убакси та бойові сорочки" ] ], [ "Формені комплекти та костюми", [ "Одяг та форма / Чоловічий одяг / Формені комплекти та костюми" ] ], [ "Зимові костюми", [ "Одяг та форма / Чоловічий одяг / Зимові костюми" ] ], [ "Термобілизна", [ "Одяг та форма / Чоловічий одяг / Термобілизна" ] ], [ "Тактичні шорти", [ "Одяг та форма / Чоловічий одяг / Тактичні шорти" ] ], [ "Костюми Soft Shell", [ "Одяг та форма / Чоловічий одяг / Костюми Soft Shell" ] ] ]
        }, {
            name: "Аксесуари одягу",
            path: [ "Одяг та форма", "Аксесуари одягу" ],
            items: [ [ "Тактичні рукавички", [ "Одяг та форма / Аксесуари одягу / Тактичні рукавички" ] ], [ "Шапки та балаклави", [ "Одяг та форма / Аксесуари одягу / Шапки та балаклави" ] ], [ "Кепки, панами, бейсболки", [ "Одяг та форма / Аксесуари одягу / Кепки, панами, бейсболки" ] ], [ "Тактичні ремені", [ "Одяг та форма / Аксесуари одягу / Тактичні ремені" ] ], [ "Баффи", [ "Одяг та форма / Аксесуари одягу / Баффи" ] ] ]
        }, {
            name: "Взуття",
            path: [ "Взуття" ],
            items: [ [ "Берці", [ "Взуття / Тактичне взуття / Берці" ] ], [ "Берці зимові", [ "Взуття / Тактичне взуття / Берці зимові" ] ], [ "Берці демісезонні", [ "Взуття / Тактичне взуття / Берці демісезонні" ] ], [ "Тактичні кросівки", [ "Взуття / Тактичне взуття / Тактичні кросівки" ] ], [ "Кросівки демісезонні", [ "Взуття / Тактичне взуття / Кросівки демісезонні" ] ], [ "Кросівки літні", [ "Взуття / Тактичне взуття / Кросівки літні" ] ], [ "Черевики", [ "Взуття / Тактичне взуття / Черевики" ] ], [ "Тактичні шкарпетки", [ "Взуття / Шкарпетки та аксесуари / Тактичні шкарпетки" ] ], [ "Термошкарпетки", [ "Взуття / Шкарпетки та аксесуари / Термошкарпетки" ] ], [ "Бахіли", [ "Взуття / Шкарпетки та аксесуари / Бахіли" ] ] ]
        } ]
    }, {
        title: "Захист",
        blocks: [ {
            name: "Бронезахист",
            path: [ "Бронезахист" ],
            items: [ [ "Бронеплити", [ "Бронезахист / Бронеплити / Бронеплити" ] ], [ "Плитоноски", [ "Бронезахист / Плитоноски / Плитоноски" ] ], [ "Комплекти плитоносок", [ "Бронезахист / Плитоноски / Комплекти плитоносок" ] ], [ "Бронежилети", [ "Бронезахист / Бронежилети / Бронежилети" ] ], [ "М’які балістичні пакети 1 клас", [ "Бронезахист / М’які балістичні пакети / 1 клас захисту" ] ], [ "М’які балістичні пакети 2 клас", [ "Бронезахист / М’які балістичні пакети / 2 клас захисту" ] ], [ "Бронекомплекти 1 клас", [ "Бронезахист / Бронекомплекти / 1 клас захисту" ] ], [ "Бронекомплекти 2 клас", [ "Бронезахист / Бронекомплекти / 2 клас захисту" ] ] ]
        }, {
            name: "Шоломи та захист голови",
            path: [ "Шоломи та захист голови" ],
            items: [ [ "Шоломи FAST", [ "Шоломи та захист голови / Шоломи / FAST" ] ], [ "Шоломи MICH", [ "Шоломи та захист голови / Шоломи / MICH" ] ], [ "Комплекти шоломів", [ "Шоломи та захист голови / Шоломи / Комплекти шоломів" ] ], [ "Кавери", [ "Шоломи та захист голови / Аксесуари / Кавери на шоломи" ] ], [ "Підвісні системи та подушки", [ "Шоломи та захист голови / Аксесуари / Підвісні системи та подушки" ] ], [ "Кріплення для навушників", [ "Шоломи та захист голови / Аксесуари / Кріплення для навушників" ] ], [ "Інші аксесуари", [ "Шоломи та захист голови / Аксесуари / Інші аксесуари" ] ] ]
        }, {
            name: "Захист колін та ліктів",
            path: [ "Захист колін та ліктів" ],
            items: [ [ "Наколінники", [ "Захист колін та ліктів / Наколінники / Наколінники" ] ], [ "Налокітники", [ "Захист колін та ліктів / Налокітники / Налокітники" ] ], [ "Комплекти", [ "Захист колін та ліктів / Комплекти / Наколінники + налокітники" ] ] ]
        }, {
            name: "Захист очей та обличчя",
            path: [ "Захист очей та обличчя" ],
            items: [ [ "Тактичні окуляри", [ "Захист очей та обличчя / Окуляри / Тактичні окуляри" ] ] ]
        } ]
    }, {
        title: "Спорядження",
        blocks: [ {
            name: "Підсумки",
            path: [ "Підсумки" ],
            items: [ [ "Для магазинів", [ "Підсумки / Бойові підсумки / Для магазинів" ] ], [ "Для гранат", [ "Підсумки / Бойові підсумки / Для гранат" ] ], [ "Скидання магазинів", [ "Підсумки / Бойові підсумки / Скидання магазинів" ] ], [ "Нерозсипайки", [ "Підсумки / Бойові підсумки / Нерозсипайки" ] ], [ "Для турнікету", [ "Підсумки / Медичні підсумки / Для турнікету" ] ], [ "Аптечки IFAK", [ "Підсумки / Медичні підсумки / Аптечки IFAK" ] ], [ "Для рацій", [ "Підсумки / Спеціальні підсумки / Для рацій" ] ], [ "Для навушників", [ "Підсумки / Спеціальні підсумки / Для навушників" ] ], [ "Напашні сумки", [ "Підсумки / Нагрудні та напашні / Напашні сумки" ] ], [ "Утилітарні", [ "Підсумки / Утилітарні / Утилітарні підсумки" ] ], [ "Панелі для плитоносок", [ "Підсумки / Панелі та платформи / Панелі для плитоносок" ] ] ]
        }, {
            name: "РПС та розвантаження",
            path: [ "РПС та розвантаження" ],
            items: [ [ "Ремінно-плечові системи", [ "РПС та розвантаження / Системи / Ремінно-плечові системи" ] ], [ "Пояси", [ "РПС та розвантаження / Компоненти / Пояси" ] ], [ "Лямки", [ "РПС та розвантаження / Компоненти / Лямки" ] ], [ "Комплекти РПС", [ "РПС та розвантаження / Комплекти / Комплекти РПС" ] ] ]
        }, {
            name: "Рюкзаки, сумки та баули",
            path: [ "Рюкзаки, сумки та баули" ],
            items: [ [ "Тактичні рюкзаки", [ "Рюкзаки, сумки та баули / Рюкзаки / Тактичні рюкзаки" ] ], [ "Штурмові рюкзаки", [ "Рюкзаки, сумки та баули / Рюкзаки / Штурмові рюкзаки" ] ], [ "Гідратори", [ "Рюкзаки, сумки та баули / Рюкзаки / Гідратори та рюкзаки-гідратори" ] ], [ "Баули та транспортні сумки", [ "Рюкзаки, сумки та баули / Сумки / Баули та транспортні сумки" ] ], [ "Через плече та бананки", [ "Рюкзаки, сумки та баули / Сумки / Через плече та бананки" ] ], [ "Поясні сумки та органайзери", [ "Рюкзаки, сумки та баули / Сумки / Поясні сумки та органайзери" ] ], [ "Сумки для шоломів", [ "Рюкзаки, сумки та баули / Сумки / Сумки для шоломів" ] ] ]
        }, {
            name: "Тактична медицина",
            path: [ "Тактична медицина" ],
            items: [ [ "Турнікети, джгути та гемостатики", [ "Тактична медицина / Кровоспинні засоби / Турнікети, джгути та гемостатики" ] ] ]
        } ]
    }, {
        title: "Маскування та техніка",
        blocks: [ {
            name: "Маскування",
            path: [ "Маскування" ],
            items: [ [ "Маскувальні сітки Militex", [ "Маскування / Маскувальні сітки Militex" ] ], [ "Антидронові сітки", [ "Маскування / Антидронові сітки" ] ], [ "Маскувальні костюми", [ "Маскування / Маскувальні костюми" ] ], [ "Маскувальні шарфи", [ "Маскування / Маскувальні шарфи" ] ] ]
        }, {
            name: "Туризм та польове спорядження",
            path: [ "Туризм та польове спорядження" ],
            items: [ [ "Спальні мішки", [ "Туризм та польове спорядження / Сон / Спальні мішки" ] ], [ "Тактичні сидушки", [ "Туризм та польове спорядження / Каремати та сидушки / Тактичні сидушки" ] ], [ "Розкладні каремати", [ "Туризм та польове спорядження / Каремати та сидушки / Розкладні каремати" ] ], [ "Польове спорядження", [ "Туризм та польове спорядження / Інше / Польове спорядження" ] ] ]
        }, {
            name: "Тактичний зв’язок та слух",
            path: [ "Тактичний зв’язок та слух" ],
            items: [ [ "Активні навушники EARMOR", [ "Тактичний зв’язок та слух / Активні навушники / EARMOR" ] ], [ "Walker's", [ "Тактичний зв’язок та слух / Активні навушники / Walker's" ] ], [ "HD", [ "Тактичний зв’язок та слух / Активні навушники / HD" ] ], [ "Аксесуари для рацій", [ "Тактичний зв’язок та слух / Радіозв’язок / Аксесуари для рацій" ] ] ]
        }, {
            name: "Електроніка та спостереження",
            path: [ "Електроніка та спостереження" ],
            items: [ [ "Кріплення для ПНБ та тепловізорів", [ "Електроніка та спостереження / Кріплення / Для ПНБ та тепловізорів" ] ], [ "Екшн-камери", [ "Електроніка та спостереження / Екшн-камери / Екшн-камери" ] ], [ "РЕБ та РЕР", [ "Електроніка та спостереження / РЕБ та РЕР / Засоби РЕБ та РЕР" ] ] ]
        }, {
            name: "Освітлення",
            path: [ "Освітлення" ],
            compact: !0
        }, {
            name: "Автономне живлення",
            path: [ "Автономне живлення" ],
            compact: !0
        }, {
            name: "Збройові аксесуари",
            path: [ "Збройові аксесуари" ],
            compact: !0
        } ]
    } ], N = (() => {
        const t = "+380976867892".replace(/\D/g, "");
        return [ [ "Signal", "https://signal.me/#p/+" + t ], [ "WhatsApp", "https://wa.me/" + t ], [ "Telegram", "https://t.me/+" + t ], [ "Viber", "viber://chat?number=%2B" + t ] ];
    })(), K = Object.keys(D).map(t => ({
        name: t,
        path: [ t ],
        kids: Object.keys(D[t]).map(e => ({
            name: e,
            path: [ t, e ],
            kids: D[t][e].map(i => ({
                name: i,
                path: [ t, e, i ],
                kids: []
            }))
        }))
    })), H = t => {
        let e = K, i = null;
        for (const s of t) {
            if (i = e.find(t => t.name === s), !i) return null;
            e = i.kids;
        }
        return i;
    }, Q = [];
    K.forEach(t => t.kids.forEach(t => t.kids.forEach(t => Q.push(t))));
    const X = t => "/catalog" + (t.length ? "/" + (window.RUBIZH_CATEGORY_URLS?.[t.join(" / ")] || t.map(w).join("/")) : ""), V = (t, e) => e.every((e, i) => t.path[i] === e), W = {
        "Одяг та форма": 0,
        "Бронезахист": 1,
        "Взуття": 2,
        "Рюкзаки, сумки та баули": 3
    }, J = {
        form: [ [ "Одяг та форма" ], "Одяг та форма" ],
        armor: [ [ "Бронезахист" ], "Бронезахист" ],
        boots: [ [ "Взуття" ], "Взуття" ],
        load: [ [ "Рюкзаки, сумки та баули" ], "Рюкзаки, сумки та баули" ],
        med: [ [ "Тактична медицина" ], "Тактична медицина" ],
        thermo: [ [ "Одяг та форма", "Чоловічий одяг", "Термобілизна" ], "Термобілизна" ],
        small: [ [ "Одяг та форма", "Аксесуари одягу" ], "Аксесуари одягу" ],
        rain: [ [ "Туризм та польове спорядження" ], "Туризм та польове спорядження" ]
    }, G = [ {
        key: "form",
        name: "Форма та одяг",
        count: 312,
        from: "1 190 ₴",
        ph: "Фото: комплект ММ14"
    }, {
        key: "armor",
        name: "Бронезахист",
        count: 96,
        from: "6 400 ₴",
        ph: "Фото: плитоноска з плитами"
    }, {
        key: "boots",
        name: "Тактичне взуття",
        count: 148,
        from: "2 350 ₴",
        ph: "Фото: берці"
    }, {
        key: "load",
        name: "Розвантаження та рюкзаки",
        count: 271,
        from: "490 ₴",
        ph: "Фото: підсумки, рюкзак"
    }, {
        key: "med",
        name: "Аптечки та IFAK",
        count: 84,
        from: "780 ₴",
        ph: "Фото: IFAK розкладений"
    }, {
        key: "thermo",
        name: "Термобілизна та фліс",
        count: 126,
        from: "690 ₴",
        ph: "Фото: термобілизна і фліс"
    }, {
        key: "small",
        name: "Рукавички, шкарпетки, ремені",
        count: 194,
        from: "190 ₴",
        ph: "Фото: рукавички й шкарпетки"
    }, {
        key: "rain",
        name: "Дощовики та гермомішки",
        count: 78,
        from: "420 ₴",
        ph: "Фото: дощовик і гермомішок"
    } ], $ = [ "ММ14", "Мультикам", "Койот", "Чорний", "Олива" ], Z = [];
    void 0;
    const Y = {};
    (() => {
        const t = [ "Оплот", "Кордон", "Азимут", "Рейд", "Периметр", "Бастіон", "Сокіл", "Вартовий" ], e = [ "Тактичні штани", "Штани польові", "Штани софтшел утеплені з мембраною та наколінниками", "Штани бойові G3", "Штани літні ріп-стоп" ], i = [ "Рубіж", "Talan", "Кордон", "Сталь", "Вовк", "Азимут" ], s = [ "ММ14", "Мультикам", "Койот", "Олива", "Чорний" ], o = [ "XS", "S", "M", "L", "XL", "XXL", "3XL" ], a = [ "44", "46", "48", "50", "52", "54", "56", "58", "60", "62" ];
        for (let r = 0; r < 40; r++) {
            const n = "g" + (r + 1), c = r % 3 == 0 ? a : o, l = {}, p = [];
            c.forEach((t, e) => {
                const i = (7 * r + 5 * e) % 11;
                l[t] = i < 6 ? 1 + (r + e) % 9 : 0, 6 !== i && 7 !== i || p.push(t);
            }), r % 9 == 4 && c.forEach((t, e) => {
                l[t] = 3 === e ? 2 : 0, p.splice(0), 5 === e && p.push(t);
            }), void 0, Y[n] = "Одяг та форма / Чоловічий одяг / Тактичні штани";
        }
        C.push("g2", "g8", "g17", "g26");
    })(), void 0, Object.assign(Y, {
        p20: "Шоломи та захист голови / Шоломи / FAST",
        p21: "Одяг та форма / Аксесуари одягу / Головні убори",
        p22: "Одяг та форма / Чоловічий одяг / Куртки та вітровки",
        p23: "Тактична медицина / Кровоспинні засоби / Турнікети, джгути та гемостатики",
        p24: "Бронезахист / Бронеплити / Бронеплити",
        p25: "Бронезахист / Бронеплити / Бронеплити",
        p26: "Взуття / Тактичне взуття / Взуття"
    }), void 0, void 0, Y.p28 = "Взуття / Шкарпетки та аксесуари / Термошкарпетки", void 0, Object.assign(Y, {
        p5: "Підсумки / Медичні підсумки / Аптечки IFAK",
        p23: "Тактична медицина / Кровоспинні засоби / Турнікети, джгути та гемостатики",
        p29: "Тактична медицина / Кровоспинні засоби / Турнікети, джгути та гемостатики",
        p30: "Тактична медицина / Кровоспинні засоби / Турнікети, джгути та гемостатики"
    }), Object.assign(Y, {
        p3: "Взуття / Тактичне взуття / Берці",
        p10: "Взуття / Тактичне взуття / Черевики",
        p26: "Взуття / Тактичне взуття / Берці зимові",
        p21: "Одяг та форма / Аксесуари одягу / Кепки, панами, бейсболки",
        p27: "Взуття / Шкарпетки та аксесуари / Бахіли"
    }), void 0, Y.pm1 = "Маскування / Маскувальні сітки Militex / Мультикам", Z.forEach(t => {
        t.category = Y[t.id] || "", t.path = (t => {
            const e = String(t || "").split("/").map(t => t.trim()).filter(Boolean);
            if (e.length && H(e)) return e;
            const i = e[e.length - 1], s = Q.filter(t => t.name === i);
            return 1 === s.length ? s[0].path.slice() : [];
        })(t.category);
    });
    const tt = {};
    Z.forEach(t => {
        !t.brand && tt[t.id] && (t.brand = tt[t.id]);
    });
    const et = {};
    Z.forEach(t => {
        t.photos = et[t.id] || [];
    });
    const it = "1–3 дні", st = {
        in_stock: "В наявності",
        preorder: "Під замовлення",
        out_of_stock: "Немає в наявності"
    }, ot = {
        "ММ14": "MM14",
        "Мультикам": "MC",
        "Койот": "CY",
        "Чорний": "BK",
        "Олива": "OD"
    }, at = {};
    Z.forEach(t => {
        t.variants = {}, Object.keys(t.stock).forEach(e => {
            const i = (at[t.id] || {})[e] || {}, s = void 0 !== i.stock ? i.stock : t.stock[e], o = i.availability || (t.preorder || t.onOrder && t.onOrder.includes(e) ? "preorder" : s > 0 ? "in_stock" : "out_of_stock");
            t.stock[e] = s;
            const a = "Один розмір" === e ? "OS" : e.replace(/[^0-9A-Za-z]+/g, "") || "X";
            t.variants[e] = {
                variant_id: t.id + "-v-" + a.toLowerCase(),
                sku: t.sku + "-" + a + "-" + (ot[t.camo] || "X"),
                size: e,
                color: t.camo,
                stock: s,
                availability: o,
                availability_label: st[o],
                lead_time: "preorder" === o ? it : null,
                published: !0
            };
        });
    });
    for (let t = Z.length - 1; t >= 0; t--) Z[t].archived && Z.splice(t, 1);
    const rt = {
        clothing_letter: {
            label: "Розмір одягу",
            card: "Розмір одягу",
            chart: "form"
        },
        armor_letter: {
            label: "Розмір бронезахисту",
            card: "Розмір",
            chart: "form"
        },
        shoes: {
            label: "Розмір взуття",
            card: "Розмір взуття",
            chart: "boots"
        },
        socks: {
            label: "Розмір шкарпеток",
            card: "Розмір шкарпеток",
            chart: "socks"
        },
        gloves: {
            label: "Рукавиці",
            card: "Розмір рукавиць",
            chart: "gloves"
        },
        headwear: {
            label: "Головні убори",
            card: "Обхват голови",
            chart: "helmets"
        },
        plate: {
            label: "Розмір бронеплит",
            card: "Розмір плити",
            chart: null
        },
        other: {
            label: "Розмір",
            card: "Розмір",
            chart: null
        }
    }, nt = [ "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL" ], ct = {
        44: "XS",
        46: "S",
        48: "M",
        50: "L",
        52: "XL",
        54: "2XL",
        56: "3XL",
        58: "4XL",
        60: "5XL",
        62: "6XL"
    };
    Z.forEach(t => {
        const e = (t => {
            const [e, i, s] = t.path || [], o = Object.keys(t.variants);
            return 1 === o.length && /Один розмір/.test(o[0]) ? "other" : "Взуття" === e && "Тактичне взуття" === i ? "shoes" : "Взуття" === e ? "socks" : "Тактичні рукавички" === s ? "gloves" : "Шоломи та захист голови" === e || /Головні убори|Шапки|Кепки/.test(s || "") ? "headwear" : "Бронеплити" === i ? "plate" : "Бронезахист" === e ? "armor_letter" : "Одяг та форма" === e ? "clothing_letter" : "other";
        })(t);
        t.size_scale = e, t.size_scales = [ e ], Object.keys(t.variants).forEach(i => {
            const s = [ "clothing_letter", "armor_letter", "gloves" ].includes(e) ? (t => {
                const e = String(t).toUpperCase().replace(/^XXXL$/, "3XL").replace(/^XXL$/, "2XL");
                return nt.includes(e) ? e : /^\d{2}$/.test(String(t)) && ct[+t] ? ct[+t] : "";
            })(i) : "";
            Object.assign(t.variants[i], {
                size_native: i,
                size_letter: s,
                size_display: s || i,
                size_type: e
            });
        });
    });
    const lt = (t, e) => {
        const i = nt.indexOf(e);
        if (i > -1) return i;
        const s = parseFloat(String(e).replace(",", "."));
        return isNaN(s) ? 999 : s;
    }, pt = {};
    Z.forEach(t => {
        const e = 0;
        Object.values(t.variants).forEach(i => {
            i.price = t.price, i.kit_discount_pct = e, i.kit_price = null;
        });
    });
    const ht = G.reduce((t, e) => (t[e.key] = e.name, t), {}), dt = 3, ut = t => t > 0 ? Math.round(t * dt / 100) : 0, mt = {
        total: 0,
        orders: 0,
        brigades: 0,
        last: ""
    }, gt = mt, kt = {
        "Старт": {
            collected_total: 0,
            collected_month: 0,
            accrued_pending: 0,
            goal: 2e3,
            orders_with_donation: 0,
            brigades_count: 0,
            transfers: []
        }
    }, ft = [], bt = () => 0, St = (t, e, ready) => {
        // Q-8 (owner 2026-10-11, K1–K6) — the same rules as the server (shopPricingKitComposition): a custom kit needs models
        // from ≥2 main sections («Дрібниці» never qualify); the kit price applies to 1 unit of each model per kit (N for
        // «Для підрозділу»), extra units are retail. Ready kits keep their own composition (ready=true).
        const N=Math.max(1,Math.min(99,parseInt(e,10)||1)),main=['head','body','legs','boots','armor','gear','med'];
        const info=t.map(r=>{const pid=r.pid??r.p?.id??r.l?.id,p=r.p||(pid?Z.find(x=>x.id===pid):null),slot=p?storeSlot(p):(r.slot??r.l?.slot??'small');return {pid,slot,fixed:p?storeKitFixedPrice(p):slot==='armor'};});
        const qualifies=!!ready||new Set(info.filter(i=>main.includes(i.slot)).map(i=>i.slot)).size>=2,left={};
        const rows=t.map(({v,q,retailOnly},i)=>{q=q||1;const fixedArmor=qualifies&&info[i].fixed,ok=qualifies&&!fixedArmor&&!retailOnly&&v.pricing_policy_version===1&&Number.isFinite(v.kit_price)&&v.kit_price>0;let kq=0;
            if(ok){if(ready)kq=q;else{const id=info[i].pid;left[id]=left[id]??N;kq=Math.min(q,left[id]);left[id]-=kq;}}
            const retail=Math.round(v.price*100),fullC=retail*q,kitC=(ok?Math.round(v.kit_price*100):retail)*kq+retail*(q-kq);
            return {price:fullC/100,kit:kitC/100,unit:ok&&kq===q?v.kit_price:v.price,kitQty:kq,save:(fullC-kitC)/100,fixed:!kq,fixedArmor,capped:kq>0&&kq<q,extraUnits:ok&&kq<q};});
        const fullCents=rows.reduce((n,l)=>n+Math.round(l.price*100),0),kitCents=rows.reduce((n,l)=>n+Math.round(l.kit*100),0),full=fullCents/100,kit=kitCents/100,pct=fullCents?Math.floor((fullCents-kitCents)*1000/fullCents)/10:0;
        return {t:pct,rows,full,kit,save:Math.round((full-kit)*100)/100,pct,capped:0,allowed:rows.some(r=>r.kitQty>0),qualifies,needsSections:t.length>0&&!qualifies};
    }, vt = t => t.allowed ? 'Ціни обраних SKU з PIM · вигода '+t.pct+'%' : 'Без підтвердженої спеціальної ціни · роздріб',
    wt = [ [ "head", "Голова", "шолом, кепка, навушники", [ "p20", "p21", "p15" ] ], [ "body", "Тіло", "куртка, убакс, термобілизна", [ "p22", "p1", "p7", "p11", "p12", "p14" ] ], [ "legs", "Ноги", "тактичні штани", null ], [ "boots", "Взуття", "берці, черевики", [ "p26", "p3", "p10" ] ], [ "armor", "Бронезахист", "плитоноска, плити, пакети", [ "p2", "p19", "p9", "p24", "p25", "p17", "p18" ] ], [ "gear", "Спорядження", "рюкзак, підсумки", [ "p4", "p8" ] ], [ "med", "Медицина", "аптечка, турнікет", [ "p5", "p23" ] ], [ "small", "Дрібниці", "рукавички, шкарпетки", [ "p13", "p28", "p21" ] ] ], xt = t => Z.filter(e => e.storeReady && Ot(e.id) === t).map(t => t.id), Ot = t => {
        const e = Z.find(e => e.id === t);
        if (!e?.storeReady) return (wt.find(e => e[3] && e[3].includes(t)) || [ "small" ])[0];
        return storeSlot(e);
    }, Ct = {}, _t = {
        form: "M17 6l-9 5 3 9 4-2v24h18V18l4 2 3-9-9-5c-1 3-3.5 5-7 5s-6-2-7-5z",
        thermo: "M17 6l-9 5 3 9 4-2v24h18V18l4 2 3-9-9-5c-1 3-3.5 5-7 5s-6-2-7-5z",
        boots: "M14 6h10v18l12 6c3 1.5 4 4 4 7v5H10V30l4-4z",
        armor: "M15 6h5l2 5h4l2-5h5v10l4 4v22H11V20l4-4z",
        load: "M16 10a8 8 0 0116 0h4v32H12V10zM18 20h12v8H18z",
        med: "M9 14h30v26H9zM19 8h10v6H19zM22 21h4v5h5v4h-5v5h-4v-5h-5v-4h5z",
        small: "M10 14h28v26H10zM10 14l6-6h16l6 6",
        rain: "M24 6c-9 0-16 7-18 16h36C40 13 33 6 24 6zM24 22v18a4 4 0 01-8 0",
        boots2: ""
    }, zt = [ "season", "spec", "have", "sizes", "camo", "budget" ];
    function Ft(t) {
        const i = void 0 !== t.from ? t.from : t.value, [s, o] = e.useState(i), a = e.useRef(i);
        return e.useEffect(() => {
            const e = a.current, i = t.value;
            if (e === i) return;
            const s = performance.now();
            let r;
            const n = c => {
                const l = Math.min(1, (c - s) / (t.dur || 450)), p = 1 - Math.pow(1 - l, 3), h = l === 1 ? i : Math.round((e + (i - e) * p)*100)/100;
                a.current = h, o(h), l < 1 && (r = requestAnimationFrame(n));
            };
            return r = requestAnimationFrame(n), () => cancelAnimationFrame(r);
        }, [ t.value ]), e.createElement("span", null, B(s));
    }
    const At = [ "берці", "плитоноска", "штани", "аптечка", "рюкзак" ];
    Z.forEach((t, e) => {
        t.code = "RUB-" + String(e + 1).padStart(5, "0");
    });
    const Lt = {}, Et = {
        "фаст": "fast",
        "мич": "mich",
        "ермор": "earmor"
    }, Pt = t => String(t || "").toLowerCase().replace(/['’ʼ`]/g, "").replace(/[іїы]/g, "и").replace(/[єэ]/g, "е").replace(/ґ/g, "г").replace(/ё/g, "е"), Mt = t => Pt(t).split(/[^a-zа-я0-9]+/).filter(Boolean), Tt = t => t.length >= 7 ? t.slice(0, -2) : t.length >= 5 ? t.slice(0, -1) : t, qt = t => String(t || "").toUpperCase().replace(/[\s_-]/g, ""), It = t => {
        const e = Object.values(t.variants || {}), i = Mt(t.name);
        return {
            p: t,
            name: i,
            nameStr: " " + i.join(" ") + " ",
            brand: Mt(t.brand),
            cat: Mt((t.path || []).join(" ")),
            attr: Mt([ t.camo, Object.keys(t.variants || {}).join(" "), e.map(t => t.size_display).join(" "), (t.specs || []).map(t => t.join(" ")).join(" ") ].join(" ")),
            codes: [ t.sku, t.code ].concat(e.map(t => t.sku)).concat((t.suppliers || []).map(t => t.supplier_sku)).concat(Lt[t.id] || []).filter(Boolean).map(qt)
        };
    }, Rt = [], Bt = t => {
        const e = String(t || "").trim();
        if (e.length < 2) return {
            items: [],
            words: [],
            scores: new Map
        };
        const i = Mt(e).filter(t => t.length >= 2).slice(0, 8).map(t => Et[t] || t), s = qt(e), o = [];
        Rt.forEach(t => {
            let e = 0;
            s.length >= 3 && (t.codes.includes(s) ? e = 2 : t.codes.some(t => t.includes(s)) && (e = 1));
            const a = ((t, e) => {
                let i = 0, s = 0;
                return e.forEach(e => {
                    const o = Tt(e), a = t => t.some(t => t.startsWith(o));
                    let r = 0;
                    t.name.includes(e) ? r = 26 : a(t.name) ? r = 22 : t.brand.includes(e) || a(t.brand) ? r = 18 : t.cat.includes(e) || a(t.cat) ? r = 14 : (t.attr.includes(e) || a(t.attr)) && (r = 9),
                    r && (s++, i += r);
                }), {
                    total: i,
                    hit: s
                };
            })(t, i);
            if (!e && !a.hit) return;
            let r = 0;
            i.length > 1 && t.nameStr.includes(" " + i.join(" ")) && (r += 20), i[0] && t.name[0] && t.name[0].startsWith(Tt(i[0])) && (r += 6),
            t.p.photos && t.p.photos.length && (r += 2), o.push({
                p: t.p,
                c: e,
                hit: a.hit,
                sc: a.total + r
            });
        });
        const a = o.filter(t => t.c || t.hit === i.length), r = a.length ? a : o;
        return r.sort((t, e) => e.c - t.c || e.hit - t.hit || e.sc - t.sc), {
            items: r.map(t => t.p),
            words: i,
            scores: new Map(r.map((t, e) => [ t.p.id, e ]))
        };
    }, Dt = [ {
        title: "Бронезахист",
        slug: "bronezakhyst",
        roots: [ "Бронезахист", "Шоломи та захист голови" ],
        sub: "плити, плитоноски, шоломи, балістичні пакети",
        img: "/assets/category-armor.8d7b42242386.webp"
    }, {
        title: "Одяг та форма",
        roots: [ "Одяг та форма" ],
        sub: "штани, куртки, убакси, фліс, термобілизна",
        img: "/assets/category-clothing.b7a37481bb06.webp"
    }, {
        title: "Взуття",
        roots: [ "Взуття" ],
        sub: "берці, кросівки, черевики",
        img: "/assets/category-footwear.6a8bd09a2528.webp"
    }, {
        title: "Спорядження",
        slug: "sporiadzhennia",
        roots: [ "Рюкзаки, сумки та баули", "Підсумки", "РПС та розвантаження" ],
        sub: "рюкзаки, підсумки, РПС, сумки",
        img: "/assets/category-backpacks.3ab1ce8d263c.webp"
    }, {
        title: "Маскування",
        roots: [ "Маскування" ],
        sub: "сітки, антидронові, маскувальні костюми",
        img: "/assets/category-camouflage.bf6b4c5b3b74.webp"
    } ], jt = [ "orderNumber", "screen", "page", "current", "guide", "guideTopic", "acc", "cpath", "roots", "rootsTitle", "quick", "sq", "q", "qDeb", "sort", "catPg", "catMore", "camo", "sizes", "brands", "attrs", "priceFrom", "priceTo", "inStock", "withOrder", "size", "qty", "galIdx", "seoOpen", "sizeTab", "productColorId" ], Ut = [ "account", "allcats", "cart", "catalog", "compare", "done", "fav", "guide", "guides", "home", "kit", "login", "page", "picker", "product", "reports", "sizes", "track" ], Nt = t => {
        const e = String(t.category || "").split(" / ").filter(Boolean), i = e[0] || "", s = /брон|шолом/i.test(i) ? "armor" : /взут/i.test(i) ? "boots" : /мед/i.test(i) ? "med" : /одяг|форма/i.test(i) ? "form" : /рюк|розван|сумк/i.test(i) ? "load" : "small", o = (t.photos || []).filter(t => t && /^(https?:\/\/|\/)/.test(t.url || "")), a = {
            id: t.id,
            kit_slot: t.kit_slot,
            slug: t.slug,
            has_docs:!!t.has_docs,docs_note:t.docs_note||'',
            name: t.name,
            brand: t.brand || "",
            path: e,
            cat: s,
            price: t.price_min || 0,
            camo: t.variants?.[0]?.color || "",
            sku: t.variants?.[0]?.sku || t.id,
            desc: t.description || "",
            specs: Object.entries(t.attributes || {}).map(([t, e]) => [ t, String(e) ]),
            photos: o.map(t => t.url),
            photoData: o,
            colorPhotos: t.color_photos && typeof t.color_photos === "object" ? Object.fromEntries(Object.entries(t.color_photos).map(([c, l]) => [ c, (Array.isArray(l) ? l : []).filter(t => t && /^(https?:\/\/|\/)/.test(t.url || "")) ])) : null,
            ph: "Фото товару",
            storeReady: !0,
            sale_unit: storeAreaUnit(t),
            stock: {},
            variants: {},
            size_scale: "other"
        };
        for (const i of [...(t.variants || [])].sort(storeSizeOrder)) {
            const confirmedSize=String(i.size_display||'').trim()||String(i.size_native||'').trim(),displaySize=confirmedSize||"Один розмір",rawSizeMissing=!confirmedSize&&['body','legs','boots'].includes(storeSlot(a))&&!/пончо|бахіл|костюм.*маскув/i.test(a.name||'');
            let t = displaySize;
            a.variants[t] && (t += " · " + (i.color || i.sku)), a.variants[t] && (t += " " + i.sku);
            const s = Object.hasOwn(rt, i.size_type) ? i.size_type : "other", o = {
                in: "in_stock",
                order: "preorder",
                out: "out_of_stock"
            }[i.availability] || "out_of_stock";
            const r=i.pricing_policy_version===1?(i.kit_discount_pct||0):0,n=i.pricing_policy_version===1?i.kit_price:null;
            a.stock[t] = i.stock ?? null, a.variants[t] = {
                ...i,
                price: i.price ?? 0,
                stock: a.stock[t],
                stockKnown: null !== i.stock && void 0 !== i.stock,
                availability: o,
                published: !0,
                size_type: s,
                size_display: displaySize,
                size_native: i.size_native || displaySize,
                size_unconfirmed: !!i.size_unconfirmed || rawSizeMissing,
                kit_price: n,
                kit_discount_pct: r
            }, a.size_scale = s;
        }
        if(t.contract_version===3)return storeV3Map(t,a);
        return Object.keys(a.variants).length || (a.stock["Один розмір"] = 0, a.variants["Один розмір"] = {
            sku: a.sku,
            variant_id: a.sku,
            size_display: "Один розмір",
            size_native: "Один розмір",
            size_type: "other",
            stock: 0,
            price: a.price,
            availability: "out_of_stock",
            published: !1,
            kit_discount_pct: 0,
            kit_price: a.price
        }), a;
    }, EMPTY_PRODUCT={...Nt({id:'__loading__',slug:'',name:'',brand:'',category:'',description:'',price_min:null,availability:'out',photos:[],attributes:{},variants:[]}),storeReady:false}, Kt = t => {
        window.RUBIZH_CATEGORY_URLS=Object.fromEntries(t.map(c=>[c.path,c.url_path]));
        K.splice(0, K.length), Q.splice(0, Q.length);
        for (const e of t) {
            const t = e.path.split(" / ");
            let i = K;
            for (let e = 0; e < t.length; e++) {
                let s = i.find(i => i.name === t[e]);
                s || (s = {
                    name: t[e],
                    path: t.slice(0, e + 1),
                    kids: []
                }, i.push(s)), i = s.kids;
            }
        }
        const e = t => t.forEach(t => t.kids.length ? e(t.kids) : Q.push(t));
        e(K);
    };
    window.RUBIZH_BOOT?.categories && Kt(window.RUBIZH_BOOT.categories);
    for (const t of [ ...window.RUBIZH_BOOT?.catalog?.items || [], ...window.RUBIZH_BOOT?.product ? [ window.RUBIZH_BOOT.product ] : [] ]) {
        const e = Nt(t), i = Z.findIndex(t => t.id === e.id);
        i < 0 ? Z.push(e) : Z[i] = e;
    }
    Rt.push(...Z.filter(t => t.storeReady).map(It));
    return class extends t {
        mobileOverlay=() => {
            const t = this.state, mobile = window.matchMedia("(max-width:860px)").matches;
            const open = [ ["menu", mobile && t.burger], ["filters", mobile && t.sheet], ["sort", mobile && t.sortSheet], ["search", mobile && t.qOpen], ["kit", t.kitModal], ["size", t.sizeModal], ["qv", t.qv], ["preorder", t.preAsk], ["mini", t.miniCart], ["donation", mobile && t.donShot] ].filter(([, value]) => value).map(([key]) => key);
            this._mobileOverlayOrder = (this._mobileOverlayOrder || []).filter(key => open.includes(key));
            for (const key of open) if (!this._mobileOverlayOrder.includes(key)) this._mobileOverlayOrder.push(key);
            return this._mobileOverlayOrder.at(-1) || null;
        };
        mobileViewport=() => {
            const t = window.visualViewport, e = document.documentElement, i = (t, i) => {
                e.style.getPropertyValue(t) !== i && e.style.setProperty(t, i);
            };
            i("--rubizh-viewport-height", Math.round(t?.height || window.innerHeight) + "px"),
            i("--rubizh-viewport-top", Math.round(t?.offsetTop || 0) + "px");
        };
        mobileUnlock=() => {
            const t = this._mobileLock;
            if (t) {
                this._mobileLock = null;
                for (const [e, i] of Object.entries(t.styles)) document.body.style[e] = i;
                document.documentElement.style.overflow = t.overflow, window.scrollTo({
                    left: t.x,
                    top: t.y,
                    behavior: "instant"
                });
            }
        };
        mobileSync=() => {
            this.mobileViewport();
            const t = this.mobileOverlay(), e = this._mobileOverlayKey, mobile = window.matchMedia("(max-width:860px)").matches;
            if (t && mobile && !this._mobileLock) {
                const t = document.body, e = {};
                for (const i of [ "position", "top", "left", "width", "overflow" ]) e[i] = t.style[i];
                this._mobileLock = {
                    x: window.scrollX || 0,
                    y: window.scrollY || 0,
                    styles: e,
                    overflow: document.documentElement.style.overflow
                }, Object.assign(t.style, {
                    position: "fixed",
                    top: -this._mobileLock.y + "px",
                    left: "0",
                    width: "100%",
                    overflow: "hidden"
                }), document.documentElement.style.overflow = "hidden";
            } else if (!t || !mobile) this.mobileUnlock();
            this.mobileRestoreInert();
            const filters = document.querySelector('[data-mobile-dialog="filters"]');
            if (filters) {
                if (mobile && this.state.sheet) { filters.setAttribute("role", "dialog"); filters.setAttribute("aria-modal", "true"); }
                else { filters.removeAttribute("role"); filters.removeAttribute("aria-modal"); }
            }
            this._mobileOverlayKey = t;
            this._mobileDialog = "search" === t ? document.querySelector('[data-swrap][data-open="1"]') : t ? document.querySelector('[data-mobile-dialog="' + t + '"]') : null;
            const frames = this._mobileFocusStack ||= [];
            const closed = frames.filter(frame => !this._mobileOverlayOrder.includes(frame.key));
            this._mobileFocusStack = frames.filter(frame => this._mobileOverlayOrder.includes(frame.key));
            for (const frame of this._mobileFocusStack) if (!frame.opener?.isConnected && closed[0]?.opener) frame.opener = closed[0].opener;
            if (t && !this._mobileFocusStack.some(frame => frame.key === t)) {
                this._mobileFocusStack.push({key:t, opener:document.activeElement?.isConnected && document.activeElement !== document.body ? document.activeElement : closed[0]?.opener});
            }
            const dialog = this._mobileDialog;
            if (dialog) {
                if (!dialog.hasAttribute("tabindex")) dialog.setAttribute("tabindex", "-1");
                // Inert siblings along the ancestor path, never the active dialog's ancestors.
                this._mobileInert = new Map;
                for (let node = dialog; node && node !== document.body; node = node.parentElement) {
                    for (const sibling of node.parentElement?.children || []) {
                        if (sibling === node || sibling.getAttribute('data-modal-backdrop') === t) continue;
                        this._mobileInert.set(sibling, sibling.inert); sibling.inert = true;
                    }
                }
            }
            if (e !== t) {
                // Search cancellation intentionally blurs its field; refocusing would reopen it.
                const back = closed[0]?.key !== "search" ? closed[0]?.opener : null;
                if (back?.isConnected && (!dialog || dialog.contains(back))) back.focus({preventScroll:true});
                else if (dialog && t !== "search") (this.mobileFocusable(dialog)[0] || dialog).focus({preventScroll:true});
            }
            const i = [ document.querySelector("header"), ...document.querySelectorAll("[data-mob-buy],[data-mob-bar],[data-kit-bar]") ].filter(Boolean);
            if (window.ResizeObserver) {
                this._mobileResize ||= new ResizeObserver(() => this.mobileMeasure());
                for (const t of this._mobileWatched || []) i.includes(t) || this._mobileResize.unobserve(t);
                for (const t of i) (this._mobileWatched || []).includes(t) || this._mobileResize.observe(t);
                this._mobileWatched = i;
            }
            this.mobileMeasure();
        };
        mobileRestoreInert=() => {
            for (const [node, inert] of this._mobileInert || []) node.inert = inert;
            this._mobileInert = null;
        };
        mobileFocusable=dialog => [...dialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"],summary')].filter(node => !node.disabled && !node.closest('[inert]') && node.getBoundingClientRect().height > 0 && getComputedStyle(node).visibility !== "hidden");
        mobileMeasure=() => {
            const t = document.documentElement, e = document.querySelector("header"), i = e && "sticky" === getComputedStyle(e).position ? Math.ceil(e.getBoundingClientRect().height) : 0, s = [ ...document.querySelectorAll("[data-mob-buy],[data-mob-bar],[data-kit-bar]") ].filter(t => "none" !== getComputedStyle(t).display), o = s.length ? Math.ceil(Math.max(...s.map(t => t.getBoundingClientRect().height))) + 16 : 0;
            for (const [e, s] of [ [ "--rubizh-header-height", i + "px" ], [ "--rubizh-bottom-space", o + "px" ] ]) t.style.getPropertyValue(e) !== s && t.style.setProperty(e, s);
        };
        // Guide dialog: no scroll lock; focus on «Почати збір», Tab stays inside, Escape/«Пропустити» return focus to the opener.
        kitIntroCheck=()=>{if(this.state.screen!=='kit'||this._kitIntroChecked||this.state.kitFriend||this.state.kitFromPick)return;this._kitIntroChecked=true;if(!storeKitIntroSeen())this.setState({kitIntro:true});};
        kitIntroOpen=()=>{this._kitIntroReturn=document.activeElement;this.setState({kitIntro:true});};
        kitIntroClose=start=>{storeKitIntroRemember();const back=this._kitIntroReturn;this._kitIntroReturn=null;
            this.setState(start?{kitIntro:false,kitParOpen:true}:{kitIntro:false},()=>{if(start){const p=document.querySelector('.rz-kit-parameters');if(p){p.setAttribute('tabindex','-1');p.focus({preventScroll:true});p.scrollIntoView({block:'start'});}}else (back?.isConnected?back:document.querySelector('[data-kit-howto]'))?.focus({preventScroll:true});});};
        kitIntroKey=ev=>{if(!this.state.kitIntro)return;const d=document.querySelector('[data-kit-intro]');if(!d)return;
            if(ev.key==='Escape'){ev.preventDefault();this.kitIntroClose(false);return;}
            if(ev.key!=='Tab')return;const f=[...d.querySelectorAll('button,a[href],[tabindex="0"]')].filter(x=>!x.disabled&&x.getBoundingClientRect().height>0);if(!f.length)return;
            const first=f[0],last=f.at(-1),inside=d.contains(document.activeElement);
            if(ev.shiftKey&&(document.activeElement===first||!inside)){ev.preventDefault();last.focus();}else if(!ev.shiftKey&&(document.activeElement===last||!inside)){ev.preventDefault();first.focus();}};
        mobileKey=t => {
            const e = this._mobileOverlayKey, i = this._mobileDialog;
            if (e && i) {
                if ("Escape" === t.key) {
                    t.preventDefault();
                    if ("search" === e) return void this.renderVals().cancelSearch();
                    const field = {menu:"burger",filters:"sheet",sort:"sortSheet",kit:"kitModal",size:"sizeModal",qv:"qv",preorder:"preAsk",mini:"miniCart",donation:"donShot"}[e];
                    return void this.setState({[field]:null});
                }
                if ("Tab" === t.key) {
                    const e = this.mobileFocusable(i), s = e[0], o = e.at(-1);
                    if (!s) return;
                    !t.shiftKey || document.activeElement !== s && i.contains(document.activeElement) ? t.shiftKey || document.activeElement !== o && i.contains(document.activeElement) || (t.preventDefault(),
                    s.focus()) : (t.preventDefault(), o.focus());
                }
            }
        };
        rememberCatalog=() => {
            if (!this.state.storeCatalog) return;
            this._catalogViews ||= new Map;
            const t = this.storeQuery() + "|" + Number(this.state.catMore);
            for (this._catalogViews.delete(t), this._catalogViews.set(t, {
                at: Date.now(),
                ids: [ ...this.state.storePageItems ],
                catalog: {
                    ...this.state.storeCatalog,
                    facets: JSON.parse(JSON.stringify(this.state.storeCatalog.facets || {}))
                }
            }); this._catalogViews.size > 8; ) this._catalogViews.delete(this._catalogViews.keys().next().value);
        };
        state={
            kitPalettes:(()=>{try{return JSON.parse(localStorage.getItem('rubizh.kit.palettes')||'{}')}catch(e){return {}}})(),
            storeLoading: !1,
            storeLoaded: !1,
            storePageItems: [],
            storeCsrf: "",cartReminderAvailable:false,cartReminderActive:false,cartReminderNotice:"",
            storeError: "",
            checkoutName: "",
            checkoutPhone: "",
            checkoutEmail: "",
            checkoutRecipient: "",
            checkoutComment: "",
            payerName: "", payerCode: "", payerAddress: "",
            checkoutDirty: !1,
            orderSending: !1,
            checkoutError: "",
            storeQuote: null,
            screen: "home",
            qDeb: "",
            sugIdx: -1,
            sq: "",
            roots: [],
            rootsTitle: "",
            searchHist: (() => {
                try {
                    return JSON.parse(localStorage.getItem("rubizh_search_hist") || "[]").slice(0, 3);
                } catch (t) {
                    return [];
                }
            })(),
            cart: [],
            cats: [],
            camo: [],
            sizes: [],
            inStock: !1,
            sort: "pop",
            current: "p1",
            size: null,
            qty: 1,
            sizeGrid: !1,
            delivery: "np",
            pay: "",
            brigade: 0,
            brigadeOther: "",
            cityQ: "",
            city: "",
            cityOpen: !1,
            pointQ: "",
            point: "",
            pointOpen: !1,
            pick: {},
            promoInput: "",
            promo: null,
            faqOpen: 0,
            remind: !0,
            refCopied: !1,
            menuOpen: !1,
            authed: !1,
            authStep: "form",
            authEmail: "",
            cooldown: 0,
            linkedNotice: !1,
            sessions: [],
            emailNew: "",
            emailChangeSent: !1,
            trackNum: "",
            trackDigits: "",
            trackShown: !1,
            trackErr: !1,
            bigPref: null,
            packOpen: !1,
            b2bType: "ФОП",
            b2bSent: !1,
            trustOpen: !1,
            kitReturn: !1,
            bundleOpen: {
                b1: !0
            },
            donShot: null,
            kitPar: {
                cloth: null,
                shoe: null,
                camo: null
            },
            kitParOpen: window.innerWidth > 860,
            kitRestored: !1,
            kitResetAsk: !1,
            kitPriceSaved: null,
            kitLimit: !1,
            kit: [],
            kitMiss: {},
            kitModal: null,
            kitReplace: null,
            kmQ: "",
            kmCat: "",
            kmSize: "",
            kmColor: "",
            kmStock: !1,
            kitFriend: !1,
            kitFromPick: !1,
            kitIntro: !1,
            kitUnit: !1,
            kitN: 12,
            kitInvoice: !1,
            kitInvType: "ФОП",
            kitInvDone: !1,
            kitLink: "",
            kitCopied: "",
            kitTip: null,
            pk: {
                season: null,
                spec: null,
                have: [],
                plate: null,
                formSize: null,
                shoe: "43",
                camo: null,
                budget: 2e4
            },
            pkDone: [],
            pkStep: 0,
            added: null,
            addErr: "",
            brokenPhotos: [],
            cartIssues: {},
            priceNotices: [],
            preAsk: !1,
            lastOrder: null,
            galIdx: 0,
            specsOpen: !1,
            copied: !1,
            compare: (()=>{try{return JSON.parse(localStorage.getItem("rubizh.compare")||"[]").filter(x=>typeof x==="string").slice(0,4);}catch{return [];}})(),
            cmpDiff: !1,
            qv: null,
            qvSize: null,
            loading: !1,
            cpath: [],
            mCat: null,
            mobPath: [],
            mobSec: null,
            quick: null,
            catPg: 1,
            catMore: !1,
            seoOpen: !1,
            guideTopic: "all",
            guide: "g1",
            sizeTab: "form",
            sizeModal: null,
            brands: [],
            attrs: [],
            priceFrom: "",
            priceTo: "",
            withOrder: !0,
            fold: {},
            sheet: !1,
            sortSheet: !1,
            q: "",
            qOpen: !1,
            burger: !1,
            miniCart: null,
            fav: [],
            seen: storeSeenLoad(),
            notify: !1,
            page: "delivery",
            acc: "overview",
            ordFilter: "all",
            openOrder: "—",
            autoSizes: !0,
            privacy: !0,
            notif: [ !0, !0, !1 ],
            exOrder: "—",
            exReason: "Не той розмір",
            exSize: "XL"
        };
        historyRoute=(t = this.state) => {
            const e = {};
            return jt.forEach(i => {
                void 0 !== t[i] && (e[i] = t[i]);
            }), JSON.parse(JSON.stringify(e));
        };
        storeReceiptNumber=()=>{if(this.state.orderNumber)return this.state.orderNumber;const query=new URLSearchParams(window.location.hash.split('?')[1]||'');if(query.has('order'))return query.get('order');if(this.state.lastOrder?.number)return this.state.lastOrder.number;try{return sessionStorage.getItem('rubizh.lastOrderNumber')||'';}catch(e){return '';}};
        storeTrackPaid=o=>{if(o.payment_status==='paid')window.rubizhAnalytics?.track('purchase',{transaction_id:o.number,value:Number(o.total),items:(o.items||o.lines||[]).map(l=>({item_id:l.sku,item_name:l.name,price:l.price,quantity:l.qty}))});};
        historyUrl=t => {
            const e = new URLSearchParams;
            return "product" === t.screen && e.set("id", t.current), "guide" === t.screen && e.set("id", t.guide),
            "page" === t.screen && e.set("id", t.page), "catalog" === t.screen && (t.cpath && t.cpath.length && e.set("path", JSON.stringify(t.cpath)),
            t.sq && e.set("q", t.sq), t.quick && e.set("quick", t.quick), /* D-62: the multi-root filter has no address any more (groups live on /categories) */ !1), window.location.pathname + window.location.search + ("home" === t.screen ? "" : "#" + t.screen + (e.toString() ? "?" + e.toString() : ""));
        };
        historyReadLegacyUrl=() => {
            const t = window.location.hash.slice(1), e = t.indexOf("?"), i = e < 0 ? t : t.slice(0, e), s = new URLSearchParams(e < 0 ? "" : t.slice(e + 1));
            if(i==='cart')this._requestedRepeatId=s.get('repeat');
            if (!Ut.includes(i)) return this.historyRoute(Object.assign({}, this.state, {
                screen: "home"
            }));
            const o = this.historyRoute(Object.assign({}, this.state, {
                screen: i,orderNumber:i==='done'?(s.get('order')||this.state.orderNumber||''):''
            })), a = s.get("id");
            if ("product" === i && (Z.some(t => t.id === a) ? o.current = a : o.screen = "home"),
            "guide" === i && (A.some(t => t.key === a) ? o.guide = a : o.screen = "home"), "page" === i && (S[a] ? o.page = a : o.screen = "home"),
            "catalog" === i) {
                try {
                    const t = JSON.parse(s.get("path") || "[]");
                    o.cpath = !Array.isArray(t) || t.length && !H(t) ? [] : t;
                } catch (t) {
                    o.cpath = [];
                }
                try {
                    const t = JSON.parse(s.get("roots") || "[]");
                    o.roots = Array.isArray(t) ? t.filter(t => K.some(e => e.name === t)) : [];
                } catch (t) {
                    o.roots = [];
                }
                o.rootsTitle = s.get("title") || "", o.sq = s.get("q") || "", o.q = o.sq, o.qDeb = o.sq,
                o.quick = [ "new", "stock" ].includes(s.get("quick")) ? s.get("quick") : null;
            }
            return o;
        };
        historySave=() => {
            if (this._historyReady && !this._historyRestoring) try {
                window.history.replaceState({
                    rubizh: 1,
                    route: this.historyRoute(),
                    x: this._mobileLock?.x ?? (window.scrollX || 0),
                    y: this._mobileLock?.y ?? (window.scrollY || 0)
                }, "", this.historyUrl(this.state));
            } catch (t) {}
        };
        historyRestore=t => {
            this._histFrame && cancelAnimationFrame(this._histFrame), this._historyRestoring = !0,
            this._historyEntry = t, clearTimeout(this._lt), clearTimeout(this._histScrollT),
            clearTimeout(this._bt), clearTimeout(this._qt);
            const e = "catalog" === t.route.screen && this._catalogViews?.get(this.storeQuery({
                ...this.state,
                ...t.route
            }) + "|" + Number(t.route.catMore)), i = {};
            e && Date.now() - e.at < 6e4 && (this._catalogRequests?.abort(), this._catalogSeq++,
            this._storeQuery = this.storeQuery({
                ...this.state,
                ...t.route
            }), this._storeFacets = JSON.parse(JSON.stringify(e.catalog.facets)), this._facetsKey = JSON.stringify([ t.route.cpath, t.route.sq, t.route.roots ]),
            Object.assign(i, {
                storeCatalog: e.catalog,
                storePageItems: e.ids,
                storeLoading: !1
            })), this.setState(Object.assign({}, t.route, i, {
                loading: !1,
                burger: !1,
                menuOpen: !1,
                qOpen: !1,
                qv: null,
                miniCart: null,
                sheet: !1,
                sortSheet: !1,
                kitModal: null,
                donShot: null,
                sizeModal: null
            }), this.historyFinish);
        };
        historyFinish=() => {
            const t = () => "product" === this.state.screen ? this.state.storeProductLoading : [ "catalog", "home" ].includes(this.state.screen) && this.state.storeLoading;
            if (!this._historyRestoring || t()) return;
            this._histFrame && cancelAnimationFrame(this._histFrame);
            const e = this._historyEntry;
            this._histFrame = requestAnimationFrame(() => {
                this._histFrame = requestAnimationFrame(() => {
                    e !== this._historyEntry || t() || (window.scrollTo({
                        left: e.x || 0,
                        top: e.y || 0,
                        behavior: "instant"
                    }), this._historyRestoring = !1, this._historyEntry = null, this.historySave());
                });
            });
        };
        historyInit=() => {
            if (!window.history || !window.history.pushState) return;
            this._historyReady = !0, this._previousScrollRestoration = window.history.scrollRestoration,
            window.history.scrollRestoration = "manual";
            const t = window.history.state;
            if (t && 1 === t.rubizh && t.route) this.historyRestore(t); else {
                const t = this.historyReadUrl(), e = this.historyRoute(Object.assign({}, this.state, {
                    screen: "home"
                }));
                if (window.history.replaceState({
                    rubizh: 1,
                    route: e,
                    x: 0,
                    y: 0
                }, "", this.historyUrl(e)), "home" !== t.screen) {
                    const e = {
                        rubizh: 1,
                        route: t,
                        x: 0,
                        y: 0
                    };
                    window.history.pushState(e, "", this.historyUrl(t)), this.historyRestore(e);
                }
            }
            this._onHistoryPop = t => {
                t.state && 1 === t.state.rubizh && t.state.route ? this.historyRestore(t.state) : this.historyRestore({
                    route: this.historyReadUrl(),
                    x: 0,
                    y: 0
                });
            }, this._onHistoryScroll = () => {
                this._historyRestoring || (clearTimeout(this._histScrollT), this._histScrollT = setTimeout(() => this.historySave(), 100));
            }, this._onHistoryPageHide = () => this.historySave(), window.addEventListener("popstate", this._onHistoryPop),
            window.addEventListener("scroll", this._onHistoryScroll, {
                passive: !0
            }), window.addEventListener("pagehide", this._onHistoryPageHide);
        };
        accGo=t => window.location.assign("/auth/?tab=" + encodeURIComponent({
            orders: "orders",
            profile: "profile",
            fav: "favorites",
            pay: "orders"
        }[t] || "profile"));
        go=(t, e) => {
            if(t==='cart'&&this.state.screen!=='cart')window.rubizhAnalytics?.track('begin_checkout',{value:this.state.cart.reduce((n,l)=>n+(l.kitPrice??l.price??0)*l.qty,0),items:this.state.cart.map(l=>({item_id:l.sku,item_name:l.name,price:l.kitPrice??l.price,quantity:l.qty}))});
            if ([ "account", "login", "track" ].includes(t)) return void window.location.assign("/auth/" + ("track" === t ? "?tab=orders" : ""));
            const i = Object.assign({}, this.state, {
                screen: t
            }, e || {}), s = !1;
            if (clearTimeout(this._histScrollT), this._histFrame && cancelAnimationFrame(this._histFrame),
            this._historyRestoring = !1, this._historyReady) {
                this.historySave();
                const t = this.historyRoute(i);
                if (JSON.stringify(t) !== JSON.stringify(this.historyRoute())) try {
                    window.history.pushState({
                        rubizh: 1,
                        route: t,
                        x: 0,
                        y: 0
                    }, "", this.historyUrl(t));
                } catch (t) {}
            }
            this.setState(Object.assign({
                burger: !1,
                menuOpen: !1,
                qOpen: !1,
                sheet: !1,
                sortSheet: !1,
                qv: null,
                sizeModal: null,
                kitModal: null,
                miniCart: null,
                preAsk: !1,
                donShot: null,
                screen: t,
                loading: s
            }, e || {}), () => {
                window.scrollTo({
                    top: 0,
                    left: 0,
                    behavior: "instant"
                }), this.historySave();
            });
        };
        specsOf=t => t.specs.concat(_[t.id] || []);
        toggleCompare=t => this.setState(e=>{const compare=e.compare.includes(t)?e.compare.filter(x=>x!==t):e.compare.slice(-3).concat(t);try{localStorage.setItem('rubizh.compare',JSON.stringify(compare));}catch{}return {compare};});
        galTo=t => {
            const e = document.querySelector("[data-gal-track]");
            e && e.scrollTo({
                left: t * e.clientWidth,
                behavior: "smooth"
            }), this.setState({
                galIdx: t
            });
        };
        refreshCustomerSession=async () => {
            if ("rubizh.shop" === window.location.hostname || "www.rubizh.shop" === window.location.hostname) try {
                const e = await this.storeRequest("/auth/session.php");
                if (this.customerUnmounted || !e || !0 !== e.ok) return;
                this.setState({
                    authed: !0 === e.authed,
                    authEmail: !0 === e.authed ? e.email : ""
                });
            } catch (t) {}
        };
        componentDidMount() {
            this._previousState = this.state, this.mobileSync(), this._mobileViewportChange = () => {
                this.mobileSync();
                // 0 on phones = no paging: every section sits in the swipe carousel.
                const size=window.innerWidth>=1200?10:window.innerWidth>=1000?8:window.innerWidth>=700?6:0;
                if(size!==this.state.catalogSectionsPerPage)this.setState({catalogSectionsPerPage:size,catalogSectionsPage:0});
            },
            window.addEventListener("resize", this._mobileViewportChange, {
                passive: !0
            }), window.visualViewport?.addEventListener("resize", this._mobileViewportChange, {
                passive: !0
            }), window.visualViewport?.addEventListener("scroll", this.mobileViewport, {
                passive: !0
            }), document.addEventListener("keydown", this.mobileKey), document.addEventListener("keydown", this.kitIntroKey), this.kitIntroCheck(), this.storeInit(), this.customerUnmounted = !1,
            this.refreshCustomerSession(), this.refreshAccountFocus = () => {this.refreshCustomerSession();if(this.state.screen==='done')this.storeLoadReceipt();},
            window.addEventListener("focus", this.refreshAccountFocus), this.historyInit(), this._receiptTimer=setInterval(()=>{if(this.state.screen==='done'&&!this.state.receiptLoading)this.storeLoadReceipt();},30000),
            this.outside = t => {
                if (!this.state.menuOpen) return;
                const e = document.querySelector("header");
                e && !e.contains(t.target) && !t.target.closest?.("[data-cm-panel]") && this.cmClose(!1);
            }, document.addEventListener("pointerdown", this.outside, !0), this.keyAct = t => {
                if (t.defaultPrevented || t.repeat) return;
                if ("Escape" === t.key && this.state.menuOpen && !this._mobileOverlayKey) return t.preventDefault(), void this.cmClose(!0);
                const e = t.target;
                "Enter" !== t.key && " " !== t.key || !e || !e.getAttribute || "button" !== e.getAttribute("role") || /^(BUTTON|A|INPUT|TEXTAREA|SELECT)$/.test(e.tagName) || (t.preventDefault(),
                e.click());
            }, document.addEventListener("keydown", this.keyAct);
            try {
                const t = localStorage.getItem("rubizh.cart");
                if (t) {
                    const e = JSON.parse(t);
                    Array.isArray(e) && e.length && this.setState({
                        cart: this.saveCart(e)
                    });
                }
                const e = localStorage.getItem("rubizh.kit");
                if (e) {
                    const t = JSON.parse(e);
                    Array.isArray(t) && t.length && (this.kitUid = Math.max(0, ...t.map(t => parseInt(String(t.uid).slice(1), 10) || 0)),
                    this.setState({
                        kit: t,
                        kitRestored: !0
                    }));
                }
            } catch (t) {}
        }
        componentDidUpdate() {
            this.mobileSync();
            this.kitIntroCheck();
            if(this.state.kitIntro&&!this._kitIntroFocused){this._kitIntroFocused=true;document.querySelector('[data-kit-intro-start]')?.focus({preventScroll:true});}else if(!this.state.kitIntro)this._kitIntroFocused=false;
            // A product page counts as viewed however it was reached: card click, direct link, reload or back/forward.
            if(this.state.screen==='product'&&this.state.current&&this._seenTracked!==this.state.current&&Z.some(p=>p.id===this.state.current&&p.storeReady)){this._seenTracked=this.state.current;if((this.state.seen||[])[0]!==this.state.current)this.setState(s=>({seen:storeSeenSave([s.current].concat((s.seen||[]).filter(id=>id!==s.current)))}));}
            if(this.state.screen==='done'&&this._receiptKey!==this.storeReceiptNumber()){this._receiptKey=this.storeReceiptNumber();this.storeLoadReceipt();}
            const t = this._previousState || {};
            if (this._previousState = this.state, this.state.storeQuote && (t.cart !== this.state.cart || t.delivery !== this.state.delivery)) return void this.setState({
                storeQuote: null,
                checkoutError: ""
            });
            const e = (this.state.qDeb || "").trim();
            if (this._searchQuery !== e && (this._searchQuery = e, this.storeLoadSearch(e)),
            t.kit !== this.state.kit && this.state.kitLink && this._sharedKitFingerprint !== JSON.stringify(this.state.kit)) this.setState({
                kitLink: "",
                kitCopied: ""
            }); else {
                if (this.storeMeta(), "kit" === this.state.screen && !this._kitSlotsLoaded && (this._kitSlotsLoaded = !0, this.storePreloadKitSlots()), this.state.kitModal) {
                    const e = JSON.stringify([ this.state.kitModal, this.state.kmQ, this.state.kmCat, this.state.kmSize, this.state.kmColor, this.state.kmStock ]);
                    this._kitQueryKey !== e && (this._kitQueryKey = e, clearTimeout(this._kitSearchTimer),
                    this._kitRequests?.abort(), this.setState({
                        storeKitIds: this.storeKitInitialIds(),
                        kitCatalogError: "",
                        kitCatalogPage: 1,
                        kitCatalogPages: 1,
                        kitCatalogLoading: !0
                    }), this._kitSearchTimer = setTimeout(() => this.storeLoadKitProducts(1), t.kmQ !== this.state.kmQ ? 250 : 0));
                } else clearTimeout(this._kitSearchTimer), this._kitRequests?.abort(), this._kitQueryKey = null;
                if (!this._storeInitializing && this._storeQuery !== this.storeQuery() && [ "catalog", "home" ].includes(this.state.screen) && this.storeLoadCatalog(),
                this._storeInitializing || "product" !== this.state.screen || this._storeProduct === this.state.current || (this._storeProduct = this.state.current,
                this.storeLoadProduct(this.state.current)), "fav" === this.state.screen && this._favKey !== this.state.fav.join(",") && (this._favKey = this.state.fav.join(","),
                this.state.fav.length && this.storeRequest("/shop/catalog.php?action=ids&ids=" + encodeURIComponent(this._favKey)).then(t => {
                    this.storeCache(t.items), this.forceUpdate();
                }).catch(t => this.setState({
                    storeError: t.message
                }))), this.historyFinish(), this.historySave(), this._lastKit !== this.state.kit) {
                    this._lastKit = this.state.kit;
                    try {
                        localStorage.setItem("rubizh.kit", JSON.stringify(this.state.kit));
                    } catch (t) {}
                }
            }
        }
        componentWillUnmount() {
            clearInterval(this._receiptTimer);clearTimeout(this._cartReminderTimer);
            this.mobileRestoreInert(), this.mobileUnlock(), this._mobileResize?.disconnect(), window.removeEventListener("resize", this._mobileViewportChange),
            window.visualViewport?.removeEventListener("resize", this._mobileViewportChange),
            window.visualViewport?.removeEventListener("scroll", this.mobileViewport), document.removeEventListener("keydown", this.mobileKey), document.removeEventListener("keydown", this.kitIntroKey),
            clearTimeout(this._kitSearchTimer);
            for (const t of this._requestControllers || []) t.abort();
            this.customerUnmounted = !0, window.removeEventListener("focus", this.refreshAccountFocus),
            this._onHistoryPop && window.removeEventListener("popstate", this._onHistoryPop),
            this._onHistoryScroll && window.removeEventListener("scroll", this._onHistoryScroll),
            this._onHistoryPageHide && window.removeEventListener("pagehide", this._onHistoryPageHide),
            this._historyReady && (window.history.scrollRestoration = this._previousScrollRestoration || "auto"),
            this._histFrame && cancelAnimationFrame(this._histFrame), clearTimeout(this._histScrollT),
            clearTimeout(this._lt), this.outside && document.removeEventListener("pointerdown", this.outside, !0),
            this.keyAct && document.removeEventListener("keydown", this.keyAct), clearInterval(this.cdTimer),
            clearTimeout(this._addT), clearTimeout(this._qt), clearTimeout(this._bt);
        }
        startCooldown=() => {
            clearInterval(this.cdTimer), this.setState({
                cooldown: 60
            }), this.cdTimer = setInterval(() => this.setState(t => t.cooldown <= 1 ? (clearInterval(this.cdTimer),
            {
                cooldown: 0
            }) : {
                cooldown: t.cooldown - 1
            }), 1e3);
        };
        repriceCart=t => {
            const e = t.map(t => Object.assign({}, t)), i = {};
            return e.forEach((t, e) => {
                t.kit && t.kitId && (i[t.kitId] = i[t.kitId] || []).push(e);
            }), Object.values(i).forEach(t => {
                const i = t.filter(t => {
                    const i = Z.find(i => i.id === e[t].id);
                    return i && i.variants[e[t].size];
                }), s = St(i.map(t => {
                    const i = e[t], s = Z.find(t => t.id === i.id);
                    return {
                        v: Object.assign({}, s.variants[i.size], {
                            price: null != i.price ? i.price : s.variants[i.size].price
                        }),
                        q: i.qty, pid: i.id, slot: i.kitSlot, retailOnly:!!i.kitRetail
                    };
                }), i.length ? e[i[0]].kitUnits : 1, i.length && e[i[0]].kitReady);
                i.forEach((t, i) => {
                    e[t].kitPrice = s.rows[i].unit;e[t].kitQty = s.rows[i].kitQty;
                });
            }), e;
        };
        saveCart=t => {
            const e = this.repriceCart(t);
            try {
                localStorage.setItem("rubizh.cart", JSON.stringify(e));
            } catch (t) {}
            this._cartId=storeCartId(e,this._cartId);
            if(this.state?.cartReminderActive)this.storeCartReminderSchedule(e);
            return e;
        };
        openBundle=t => {
            this.setState({
                kit: this.kitFromIds(t.items),
                kitMiss: {},
                kitFriend: !1,
                kitFromPick: !1,
                kitUnit: !1,
                kitLink: "",
                kitCopied: "",
                kitPriceSaved: null,
                kitInvoice: !1,
                kitInvDone: !1,
                kitModal: null,
                kitReplace: null,
                kitLimit: !1
            }), this.go("kit");
        };
        open=t => {const p=Z.find(p=>p.id===t);if(p)window.rubizhAnalytics?.track('view_item',{value:p.price,items:[{item_id:Object.values(p.variants)[0]?.sku,item_name:p.name,price:p.price,quantity:1}]});
            this.setState(e => ({
                seen: storeSeenSave([ t ].concat(e.seen.filter(e => e !== t)))
            })), this.go("product", {
                current: t,
                size: null,
                qty: 1,
                sizeGrid: !1,
                notify: !1,
                qOpen: !1,
                burger: !1,
                galIdx: 0,
                specsOpen: !1,
                copied: !1,
                qv: null
            }), setTimeout(() => {
                const t = document.querySelector("[data-gal-track]");
                t && (t.scrollLeft = 0);
            }, 0);
        };
        kitUid=0;
        defSize=(t, e) => {
            const i = Object.keys(t.variants);
            for (const i of (e || []).concat([ "L", "M", "43", "50" ])) if (t.variants[i] && "out" !== this.avail(t, i)) return i;
            return i.find(e => "out" !== this.avail(t, e)) || null;
        };
        kitLine=(t, e, i) => ({
            uid: "k" + ++this.kitUid,
            slot: t,
            id: e,
            size: i,
            qty: 1
        });
        pickSize=t => {
            const e = Object.keys(t.variants).filter(k=>storeKitVariantOK(t,t.variants[k])), i = e.filter(e => "out" !== this.avail(t, e)), s = t.size_scale, o = this.state.kitPar || {};
            if (1 === e.length || !i.length) return {
                z: e[0],
                note: ""
            };
            const a = "clothing_letter" === s ? o.cloth : "shoes" === s ? o.shoe : null;
            if (!a) return {
                z: i.find(k=>k===this.defSize(t))||i[0],
                note: ""
            };
            const r = e => t.variants[e].size_display, n = e.find(t => r(t) === a);
            if (n && "out" !== this.avail(t, n)) return {
                z: n,
                note: ""
            };
            const c = lt(0, a), l = i.slice().sort((t, e) => Math.abs(lt(0, r(t)) - c) - Math.abs(lt(0, r(e)) - c) || lt(0, r(e)) - lt(0, r(t)))[0];
            return {
                z: l,
                note: "немає вашого розміру, обрано " + r(l)
            };
        };
        setPar=(t, e) => this.setState(i => {
            const s = i.kitPar.cloth && i.kitPar.shoe && i.kitPar.camo, o = Object.assign({}, i.kitPar, {
                [t]: e
            });
            return {
                kitPar: o,
                kitParOpen: s ? i.kitParOpen : !(o.cloth && o.shoe && o.camo)
            };
        });
        kitLines=t => (t || this.state.kit).map(t => {
            const e = Z.find(e => e.id === t.id);
            return e?.storeReady && e.variants[t.size] ? {
                l: t,
                p: e,
                v: e.variants[t.size], q:t.qty||1
            } : null;
        }).filter(Boolean);
        kitFromIds=t => t.map(t => {
            const e = Z.find(e => e.id === t), i = e && this.defSize(e);
            return i ? this.kitLine(Ot(t), t, i) : null;
        }).filter(Boolean);
        kitAdd=(t, e, i, s) => this.setState(o => {
            const a = o.kit.slice(), r = o.kitReplace ? a.findIndex(t => t.uid === o.kitReplace) : -1, n = a.findIndex(t => t.id === e && t.size === i && t.uid !== o.kitReplace), c = a.reduce((t, e) => t + (e.qty || 1), 0);
            if (r < 0 && c >= 20) return {
                kitLimit: !0,
                kitModal: null,
                kitReplace: null
            };
            if (n > -1 && r < 0) a[n] = Object.assign({}, a[n], {
                qty: (a[n].qty || 1) + 1
            }); else {
                const o = Object.assign(this.kitLine(t, e, i), s ? {
                    note: s
                } : {});
                r > -1 ? a[r] = o : a.push(o);
            }
            const l = Object.assign({}, o.kitMiss);
            return delete l[t], {
                kit: a,kitDefinition:null,
                kitMiss: l,
                kitModal: null,
                kitReplace: null,
                kitLimit: !1
            };
        });
        kitOpenModal=(t, e) => this.setState({
            kitModal: t,
            kitReplace: e || null,
            kmQ: "",
            kmCat: "",
            kmColor: "",
            kmStock: !1,
            kmSize: "",
            kitCatalogError: "",
            kitCatalogLoading: !0
        });
        kitToCart=() => {
            const t = this.kitLines();
            if (t.length < 2 || this.state.kit.some(l=>l.needsSize) || t.some(t => "out" === this.avail(t.p, t.l.size))) return;
            const i = this.state.kitUnit, s = i ? Math.max(1, parseInt(this.state.kitN, 10) || 1) : 1, o = this.state.kitDefinition || "kit-" + Date.now().toString(36), ready = !!this.state.kitDefinition, e = St(t.map(t => ({
                v: t.v,
                q: s * (t.l.qty || 1), pid: t.p.id, slot: t.l.slot
            })), s, ready);
            this.setState(a => {
                const r = a.cart.slice();
                return t.forEach((t, a) => {
                    const n = e.rows[a].unit;
                    r.push({
                        id: t.p.id,
                        size: t.l.size,
                        variant_id: t.v.variant_id,
                        sku: t.v.sku,
                        color: t.v.color,
                        name: t.p.name,
                        price: t.v.price,
                        availability: t.v.availability,
                        qty: s * (t.l.qty || 1),
                        kit: e.allowed,
                        kitId: e.allowed ? o : undefined,
                        unit: !!i, kitUnits: s, kitSlot: t.l.slot, kitQty: e.rows[a].kitQty, kitReady: ready,
                        kitPrice: n
                    });
                }), {
                    cart: this.saveCart(r),
                    cartIssues: {}
                };
            }), this.go("cart");
        };
        kitSaveLink=() => {
            const t = Math.random().toString(36).slice(2, 7);
            try {
                const e = JSON.parse(localStorage.getItem("rubizh-kits") || "{}");
                e[t] = {
                    lines: this.state.kit.map(t => [ t.slot, t.id, t.size, t.qty || 1 ]),
                    prices: this.state.kit.reduce((t, e) => {
                        const i = Z.find(t => t.id === e.id);
                        return i && (t[e.id] = i.price), t;
                    }, {})
                }, localStorage.setItem("rubizh-kits", JSON.stringify(e));
            } catch (t) {}
            return this.setState({
                kitLink: "rubizh.shop/k/" + t,
                kitCopied: "Посилання збережено"
            }), "rubizh.shop/k/" + t;
        };
        kitShare=() => {
            const t = this.state.kitLink || this.kitSaveLink();
            try {
                navigator.clipboard.writeText("Ось комплект, який я зібрав: https://" + t);
            } catch (t) {}
            this.setState({
                kitCopied: "Скопійовано: «Ось комплект, який я зібрав» + посилання"
            });
        };
        kitDemo=t => {
            const e = (t, e, i) => this.kitLine(t, e, i), i = [ e("body", "p7", "M"), e("med", "p5", "Один розмір") ], s = [ e("body", "p7", "M"), e("legs", "g2", "L"), e("boots", "p3", "43"), e("med", "p5", "Один розмір"), e("gear", "p8", "Один розмір") ], o = [ e("body", "p22", "L"), e("legs", "g2", "L"), e("boots", "p3", "43"), e("med", "p5", "Один розмір"), e("gear", "p4", "Один розмір"), e("head", "p15", "Один розмір"), e("small", "p28", "43–46") ], a = {
                kitMiss: {},
                kitFriend: !1,
                kitFromPick: !1,
                kitUnit: !1,
                kitInvoice: !1,
                kitInvDone: !1,
                kitModal: null,
                kitRestored: !1,
                kitResetAsk: !1,
                kitPriceSaved: null,
                kitLimit: !1
            }, r = t => this.setState(Object.assign(a, t));
            if ("empty" === t && r({
                kit: [],
                kitPar: {
                    cloth: null,
                    shoe: null,
                    camo: null
                },
                kitParOpen: !0
            }), "two" === t && r({
                kit: i
            }), "five" === t && r({
                kit: s
            }), "seven" === t && r({
                kit: o
            }), "par" === t && r({
                kitPar: {
                    cloth: "L",
                    shoe: "43",
                    camo: "ММ14 піксель"
                },
                kitParOpen: !1
            }), "plates" === t && r({
                kit: [ e("armor", "p19", "L"), e("body", "p7", "M"), e("med", "p5", "Один розмір") ]
            }), "out" === t && r({
                kit: [ e("body", "p1", "L"), e("legs", "g2", "L"), e("boots", "p3", "43"), e("med", "p5", "Один розмір"), e("gear", "p4", "Один розмір"), e("small", "p13", "L") ]
            }), "link" === t && r({
                kit: [ e("body", "p22", "L"), e("legs", "g2", "L"), e("boots", "p3", "43"), e("body", "p1", "L"), e("med", "p5", "Один розмір"), e("small", "p13", "L") ],
                kitFriend: !0,
                kitPriceSaved: {
                    p22: 3990,
                    p3: 3450
                }
            }), "unit" === t && r({
                kit: o,
                kitUnit: !0,
                kitN: 12
            }), "restored" === t && r({
                kit: s,
                kitRestored: !0
            }), "pick" === t) {
                const t = this.buildKit({
                    season: "Зима",
                    spec: "Штурм",
                    have: [],
                    plate: "p24",
                    formSize: "L",
                    shoe: "43",
                    camo: "Мультикам",
                    budget: 61e3
                });
                r({
                    kit: t.lines,
                    kitMiss: t.miss,
                    kitFromPick: !0
                });
            }
        };
        buildKit=t => {
            const e = t.have || [], i = t.spec || "Тил або навчання", s = t.season || "Демісезон", o = "S–M" === t.formSize ? "M" : "XL–XXL" === t.formSize ? "XL" : "L", a = {
                M: "48",
                L: "50",
                XL: "54"
            }[o], r = {
                "Мультикам": "Мультикам",
                "ММ14 піксель": "ММ14",
                "Олива": "Олива",
                "Койот": "Койот",
                "Чорний": "Чорний"
            }[t.camo] || null, n = [], c = (t, e, i, s) => n.push({
                slot: t,
                ids: e,
                prefs: i,
                strictCamo: s
            }), l = !e.includes("Плитоноска з плитами") && ("Штурм" === i || "Розвідка" === i), p = () => {
                e.includes("Форма") || ("Зима" === s ? (c("body", [ "p22" ], [ o ]), c("body", [ "p11" ], [ o ])) : c("body", "Літо" === s ? [ "p7" ] : [ "p1", "p7" ], [ o ]),
                "Оператор БпЛА" === i && c("body", [ "p12" ], [ o ]));
            }, h = () => {
                e.includes("Форма") || "Демісезон" === s || c("legs", xt("legs"), [ o, a ], !0);
            }, d = () => {
                e.includes("Берці") || c("boots", "Зима" === s ? [ "p26" ] : "Літо" === s ? [ "p10", "p3" ] : [ "p3" ], [ t.shoe || "43" ]);
            }, u = () => {
                l && (t.plate ? n.push({
                    slot: "armor",
                    pair: [ [ "p19", [ o ] ], [ t.plate, [ "250×300" ] ] ]
                }) : c("armor", [ "p2" ], [ o ]));
            }, m = () => {
                e.includes("Аптечка") || c("med", [ "p5" ], []), "Медик" === i && c("med", [ "p23" ], []);
            }, g = () => {
                e.includes("Рюкзак") || "Водій або екіпаж" === i || "Тил або навчання" === i || c("gear", [ "p4" ], []),
                "Штурм" === i && c("gear", [ "p8" ], []);
            }, k = () => {
                e.includes("Шолом") || ("Штурм" === i && c("head", [ "p20" ], [ "M/L" ]), "Розвідка" === i && c("head", [ "p21" ], []),
                "Оператор БпЛА" === i && c("head", [ "p15" ], []));
            }, f = () => {
                "Водій або екіпаж" !== i && "Штурм" !== i && "Тил або навчання" !== i || c("small", [ "p13" ], [ o ]);
            };
            ({
                "Штурм": [ u, p, h, d, m, g, k, f ],
                "Водій або екіпаж": [ p, h, d, m, f, g ],
                "Оператор БпЛА": [ p, h, d, g, m, k ],
                "Медик": [ m, p, h, d, g ],
                "Розвідка": [ p, h, d, m, u, g, k ],
                "Тил або навчання": [ p, h, d, f, m ]
            }[i] || [ p, h, d, m ]).forEach(t => t());
            const y = t.budget >= 61e3 ? 1 / 0 : t.budget || 1 / 0;
            let b = 0;
            const S = [], v = {}, w = [];
            return n.forEach(t => {
                if (t.pair) {
                    const e = t.pair.map(([t, e]) => {
                        const i = Z.find(e => e.id === t && e.storeReady);
                        if (!i) return null;
                        const s = Object.keys(i.variants), o = 1 === s.length ? "out" !== this.avail(i, s[0]) ? s[0] : null : e.find(t => i.variants[t] && "out" !== this.avail(i, t));
                        return o ? {
                            p: i,
                            z: o
                        } : null;
                    });
                    if (e.some(t => !t)) return void (v[t.slot] = !0);
                    const i = e.reduce((t, e) => t + e.p.price, 0);
                    return b + i > y ? void (v[t.slot] = !0) : (b += i, e.forEach(e => {
                        S.push(this.kitLine(t.slot, e.p.id, e.z)), w.push(Ct[e.p.id]);
                    }), void delete v[t.slot]);
                }
                let e = null;
                for (const i of Array.from(new Set(t.ids.concat("armor" === t.slot ? [] : xt(t.slot))))) {
                    const s = Z.find(t => t.id === i && t.storeReady);
                    if (!s) continue;
                    if (t.strictCamo && r && s.camo !== r) continue;
                    const o = Object.keys(s.variants), a = 1 === o.length ? "out" !== this.avail(s, o[0]) ? o[0] : null : t.prefs.find(t => s.variants[t] && "out" !== this.avail(s, t));
                    if (a) {
                        e = {
                            p: s,
                            z: a
                        };
                        break;
                    }
                }
                e ? b + e.p.price > y || (b += e.p.price, S.push(this.kitLine(t.slot, e.p.id, e.z)),
                w.push(Ct[e.p.id] || (/^g/.test(e.p.id) ? "штани" : e.p.name.toLowerCase())), delete v[t.slot]) : S.some(e => e.slot === t.slot) || (v[t.slot] = !0);
            }), {
                lines: S,
                miss: v,
                names: w.filter((t, e) => w.indexOf(t) === e),
                sum: b
            };
        };
        pkVisible=() => {
            const t = this.state.pk, e = ("Штурм" === t.spec || "Розвідка" === t.spec) && !(t.have || []).includes("Плитоноска з плитами");
            return [ "season", "spec", "have" ].concat(e ? [ "plate" ] : []).concat([ "sizes", "camo", "budget", "final" ]);
        };
        pkAdvance=t => {
            const e = this.pkVisible(), i = e.indexOf(t), s = e[Math.min(e.length - 1, i + 1)];
            this.setState(i => ({
                pkDone: i.pkDone.includes(t) ? i.pkDone : i.pkDone.concat([ t ]),
                pkStep: e.indexOf(s)
            })), setTimeout(() => {
                if (window.innerWidth > 860) {
                    const t = document.getElementById("pq-" + s);
                    t && window.scrollTo({
                        top: t.getBoundingClientRect().top + window.scrollY - 90,
                        behavior: "smooth"
                    });
                } else window.scrollTo(0, 0);
            }, 60);
        };
        pkSet=(t, e, i) => {
            this.setState(i => ({
                pk: Object.assign({}, i.pk, {
                    [t]: e
                })
            })), i && this.pkAdvance("formSize" === t ? "sizes" : t);
        };
        prefCard=t => ({
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            padding: "12px 14px",
            cursor: "pointer",
            minWidth: 0,
            border: "1px solid " + (t ? "var(--legacy-f2a33c)" : "var(--legacy-2a322b)"),
            background: t ? "var(--legacy-1b1a14)" : "var(--legacy-0f120f)"
        });
        prefStyle=t => ({
            padding: "11px 16px",
            fontFamily: "UAH, Oswald, sans-serif",
            fontSize: "13px",
            letterSpacing: ".09em",
            textTransform: "uppercase",
            cursor: "pointer",
            border: "1px solid var(--legacy-f2a33c)",
            background: t ? "var(--legacy-f2a33c)" : "transparent",
            color: t ? "var(--button-text)" : "var(--link)"
        });
        goB2BForm=() => {
            this.go("home"), setTimeout(() => {
                const t = document.getElementById("b2b");
                t && window.scrollTo({
                    top: t.getBoundingClientRect().top + window.scrollY - 80,
                    behavior: "smooth"
                });
            }, 80);
        };
        viewFromKit=t => e => {
            e && e.preventDefault && e.preventDefault(), this.setState({
                kitReturn: !0
            }), this.open(t);
        };
        mkCartLine=(t, e, i, s) => {
            const o = Z.find(e => e.id === t), a = o.variants[e];
            return Object.assign({
                id: t,
                size: e,
                variant_id: a.variant_id,
                sku: a.sku,
                color: a.color,
                name: o.name,
                price: a.price,
                availability: a.availability,
                qty: i
            }, s || {});
        };
        cartDemo=t => {
            let e = [];
            "small" === t && (e = [ this.mkCartLine("p7", "M", 1), this.mkCartLine("p8", "Один розмір", 2) ]),
            "big" === t && (e = [ this.mkCartLine("p2", "L", 1), this.mkCartLine("p5", "Один розмір", 1) ]),
            "wh" === t && (e = [ [ "p7", "M" ], [ "p8", "Один розмір" ], [ "p5", "Один розмір" ] ].map(([t, e]) => {
                const i = Z.find(e => e.id === t);
                return this.mkCartLine(t, e, 12, {
                    kit: !0,
                    wh: !0,
                    kitPrice: i.price
                });
            })), this.setState({
                cart: this.saveCart(e),
                cartIssues: {},
                priceNotices: [],
                promo: null
            });
        };
        kitVm=t => {
            const i = this.kitLines(), s = i.filter(t => "out" !== this.avail(t.p, t.l.size)), o = t => t.map(t => ({
                v: t.v,
                q: t.l.qty || 1, pid: t.p.id, slot: t.l.slot
            })), a = St(o(s), 1, !!this.state.kitDefinition), r = s.length, n = 2, c = 2, l = t => ({
                padding: "6px 10px",
                fontSize: "12.5px",
                cursor: "pointer",
                border: "1px solid " + (t ? "var(--legacy-f2a33c)" : "var(--legacy-2a322b)"),
                color: t ? "var(--link)" : "var(--legacy-c7cec3)",
                whiteSpace: "nowrap"
            }), p = t.kitPar || {}, h = t => "XXL" === t ? "2XL" : t, d = {
                "Мультикам": "Мультикам",
                "ММ14 піксель": "ММ14",
                "Олива": "Олива",
                "Койот": "Койот",
                "Чорний": "Чорний"
            }[p.camo] || null, u = [], m = new Map(s.map((t, e) => [ t.l.uid, e ])), g = t => i.some(e => e.p.id === t), k = wt.map(([e, s, o]) => {
                const r = i.filter(t => t.l.slot === e).map(i => {
                    const s = "out" === this.avail(i.p, i.l.size), o = i.l.qty || 1, r = 1 === Object.keys(i.p.variants).length, n = s ? {
                        price: i.v.price * o,
                        kit: 0,
                        save: 0,
                        fixed: !1,
                        capped: !1
                    } : a.rows[m.get(i.l.uid)];
                    return {
                        uid: i.l.uid,
                        name: i.p.name,
                        photo: "img-" + i.p.id,
                        sizeLabel: (r ? i.v.color : "Розмір " + this.sd(i.p, i.l.size) + " · " + i.v.color) + (o > 1 ? " · × " + o : ""),
                        // Preferences never rewrite a chosen SKU; a mismatch is only flagged so the buyer can replace it (K-2).
                        note: [i.l.note || "", (() => { if (r) return ""; const z = String(this.sd(i.p, i.l.size)), want = [ "body", "legs" ].includes(e) && p.cloth && h(z) !== h(p.cloth) ? p.cloth : "boots" === e && p.shoe && z !== String(p.shoe) ? p.shoe : null; return want ? "Розмір відрізняється від ваших параметрів (" + want + "). Можна замінити позицію." : ""; })()].filter(Boolean).join(" "),
                        capped: !s && n.capped,
                        rowStyle: {
                            display: "flex",
                            gap: "10px",
                            padding: "10px 12px",
                            borderBottom: "1px solid var(--legacy-1e241f)",
                            minWidth: 0,
                            opacity: s ? .6 : 1
                        },
                        fixed: n.fixed && !s,
                        discounted: !n.fixed && n.save > 0 && !s,
                        plain: !n.fixed && 0 === n.save && !s,
                        isOut: s,
                        priceFmt: B(n.price),
                        kitFmt: B(n.kit),
                        saveFmt: "−" + B(n.save),
                        tipOpen: t.kitTip === i.l.uid,
                        toggleTip: () => this.setState(t => ({
                            kitTip: t.kitTip === i.l.uid ? null : i.l.uid
                        })),
                        href: "/product/" + (i.p.slug || w(i.p.name)),
                        view: this.viewFromKit(i.p.id),
                        replace: () => this.kitOpenModal(e, i.l.uid),
                        remove: () => this.setState(t => ({
                            kit: t.kit.filter(t => t.uid !== i.l.uid),
                            kitLimit: !1
                        }))
                    };
                }), n = r.length ? [] : xt(e).map(t => Z.find(e => e.id === t)).filter(p => p && !g(p.id) && storeKitEligible(p) && storeKitPrimary(p) && storeSeasonOK(p,t.kitSeason||t.pk?.season||t.pick?.season||'Демісезон')).sort((a,b) => storeKitPriority(a)-storeKitPriority(b)||(d?(b.camo===d)-(a.camo===d):0)||a.price-b.price).slice(0, 3).map(t => {
                    const i = this.pickSize(t), s = 1 === Object.keys(t.variants).length;
                    return {
                        name: t.name,
                        photo: "img-" + t.id,
                        meta: B(t.price) + (s ? "" : " · " + h(i.z)) + " · " + t.camo,
                        note: i.note,
                        add: () => this.kitAdd(e, t.id, i.z, i.note)
                    };
                });
                return {
                    key: e,
                    name: s,
                    hint: o,
                    items: r,
                    recs: n,
                    noRecs: !r.length && !n.length,
                    filled: r.length > 0,
                    empty: 0 === r.length,
                    miss: 0 === r.length && !!t.kitMiss[e],
                    open: () => this.kitOpenModal(e)
                };
            });
            let f = "", y = null, b = [];
            g("p19") && ![ "p9", "p24", "p25" ].some(g) ? (f = "Плитоноска без плит не захищає — додайте плити",
            y = [ "armor", "", "Бронеплити" ]) : g("p22") && !g("p11") ? (f = "Взимку без термобілизни куртка не рятує",
            y = [ "body", "термо", "" ]) : r > 0 && !i.some(t => "med" === t.l.slot) ? (f = "Додайте аптечку — її забувають найчастіше",
            y = [ "med", "", "" ]) : i.some(t => "boots" === t.l.slot) && !g("p28") ? (f = "До берців варто взяти термошкарпетки",
            y = [ "small", "шкарпет", "" ]) : r > 0 && (f = "Часто беруть разом", b = [ "p5", "p8", "p13", "p11", "p23", "p4", "p28" ].filter(t => !g(t) && Z.some(e => e.id === t && e.storeReady)).slice(0, 4).map(t => {
                const e = Z.find(e => e.id === t);
                return {
                    name: e.name,
                    priceFmt: B(e.price),
                    photo: "img-" + t,
                    add: () => {
                        const i = this.pickSize(e);
                        i.z && this.kitAdd(Ot(t), t, i.z, i.note);
                    }
                };
            }));
            const v = a.allowed ? "Сума підтверджених цін обраних розмірів × кількість." : "Без дозволених спеціальних цін комплект коштує як товари окремо.", O = "", C = s.map(t => {
                const e = (t => {
                    const e = (t.specs || []).find(([t]) => /^Вага/.test(t));
                    if (!e) return null;
                    const i = String(e[1]).replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(кг|г)/);
                    return i ? "г" === i[2] ? +i[1] / 1e3 : +i[1] : null;
                })(t.p);
                return null == e ? null : e * (t.l.qty || 1);
            }), _ = C.filter(t => null != t), z = _.reduce((t, e) => t + e, 0), F = _.length ? (_.length === C.length ? "Вага комплекту: " : "Вага: від ") + z.toFixed(1).replace(".", ",") + " кг" + (_.length === C.length ? "" : " (не всі позиції мають дані)") : "", A = t.kitPriceSaved ? i.filter(e => null != t.kitPriceSaved[e.p.id] && t.kitPriceSaved[e.p.id] !== e.v.price).map(e => ({
                t: e.p.name + ": було " + B(t.kitPriceSaved[e.p.id]) + ", стало " + B(e.v.price)
            })) : [], L = t => ({
                minWidth: "44px",
                minHeight: "40px",
                padding: "0 12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontSize: "13.5px",
                border: "1px solid " + (t ? "var(--legacy-f2a33c)" : "var(--legacy-2a322b)"),
                color: t ? "var(--link)" : "var(--legacy-c7cec3)",
                background: t ? "var(--legacy-1b1a14)" : "transparent"
            }), P = {
                parOpen: !!t.kitParOpen,
                parCollapsed: !t.kitParOpen,
                parLine: [ p.cloth ? "Одяг " + h(p.cloth) : "", p.shoe ? "Взуття " + p.shoe : "", p.camo || "" ].filter(Boolean).join(" · ") || "не задані",
                parCloth: [ "XS", "S", "M", "L", "XL", "2XL", "3XL" ].map(t => ({
                    t: t,
                    pick: () => this.setPar("cloth", p.cloth === t ? null : t),
                    style: L(p.cloth === t)
                })),
                parCamo: [ "Мультикам", "ММ14 піксель", "Олива", "Койот", "Чорний", "Не принципово" ].map(t => ({
                    t: t,
                    pick: () => this.setPar("camo", p.camo === t ? null : t),
                    style: L(p.camo === t)
                })),
                parShoe: p.shoe || "",
                onParShoe: t => this.setPar("shoe", t.target.value || null),
                parShoeOpts: [ {
                    v: "",
                    t: "Оберіть розмір"
                } ].concat(Array.from({
                    length: 12
                }, (t, e) => ({
                    v: String(36 + e),
                    t: String(36 + e)
                }))),
                parClose: () => this.setState({
                    kitParOpen: !1
                }),
                parOpenFn: () => this.setState({
                    kitParOpen: !0
                }),
                kitStatus: O,
                hasKitStatus: !!O,
                kitWeight: F,
                hasKitWeight: !!F,
                hasHintAct: !!y,
                hintPick: () => {
                    y && this.setState({
                        kitModal: y[0],
                        kitReplace: null,
                        kmQ: y[1],
                        kmCat: y[2],
                        kmColor: "",
                        kmStock: !1
                    });
                },
                kitRestoredShow: !!t.kitRestored && i.length > 0 && !t.kitFriend,
                kitResetAsk: !!t.kitResetAsk,
                kitHasAny: i.length > 0,
                askReset: () => this.setState({
                    kitResetAsk: !0
                }),
                cancelReset: () => this.setState({
                    kitResetAsk: !1
                }),
                doReset: () => this.setState({
                    kit: [],
                    kitResetAsk: !1,
                    kitRestored: !1,
                    kitMiss: {},
                    kitFriend: !1,
                    kitFromPick: !1,
                    kitPriceSaved: null,
                    kitLimit: !1
                }),
                kitPriceUpd: A.length > 0,
                kitPriceNotes: A,
                kitLimit: !!t.kitLimit,
                kitLimitText: "Максимум 20 позицій у комплекті",
                kitPriceHint: [a.needsSections ? "Додайте річ ще з одного розділу, щоб отримати ціну комплекту" : a.rows.some(r => r.extraUnits) ? "Ціна комплекту діє на одну одиницю кожної речі (або на кількість комплектів для підрозділу); решта — за звичайною ціною." : "", a.rows.some(r => r.fixedArmor) ? STORE_KIT_FIXED_NOTE : ""].filter(Boolean).join(" ")
            }, M = i.some(t => "out" === this.avail(t.p, t.l.size)), T = Math.max(1, parseInt(t.kitN, 10) || 1), q = a.kit;
            let I = null;
            if (t.kitModal) {
                const e = xt(t.kitModal), i = wt.find(e => e[0] === t.kitModal)[1], s = e.filter(e => !t.storeKitIds || t.storeKitIds.includes(e)).map(t => Z.find(e => e.id === t)).filter(Boolean), o = this._kitFacets?.leaves || [ ...new Set(s.map(t => t.path[t.path.length - 1]).filter(Boolean)) ], a = this._kitFacets?.sizes || [ ...new Set(s.flatMap(t => Object.values(t.variants).map(t => t.size_display)).filter(t => "Один розмір" !== t)) ], n = this._kitFacets?.camo || [ ...new Set(s.flatMap(t => Object.values(t.variants).map(t => t.color)).filter(Boolean)) ], c = bt(t.kitReplace ? r : r + 1), p = s.filter(product => !t.kmColor || Object.values(product.variants).some(variant => variant.color === t.kmColor)), h = (t, e, i) => ({
                    label: t,
                    on: i,
                    style: l(e)
                });
                I = {
                    title: "Додати в слот «" + i + "»",
                    q: t.kmQ,
                    onQ: t => this.setState({
                        kmQ: t.target.value
                    }),
                    close: () => this.setState({
                        kitModal: null,
                        kitReplace: null
                    }),
                    cats: [ h("Усі", !t.kmCat, () => this.setState({
                        kmCat: ""
                    })) ].concat(o.map(e => h(e, t.kmCat === e, () => this.setState({
                        kmCat: e
                    })))),
                    sizes: [ h("Будь-який", !t.kmSize, () => this.setState({
                        kmSize: ""
                    })) ].concat(a.slice(0, 14).map(e => h(e, t.kmSize === e, () => this.setState({
                        kmSize: e
                    })))),
                    colors: [ h("Усі", !t.kmColor, () => this.setState({
                        kmColor: ""
                    })) ].concat(n.map(e => h(e, t.kmColor === e, () => this.setState({
                        kmColor: e
                    })))),
                    stockLabel: (t.kmStock ? "☑" : "☐") + " Лише в наявності",
                    toggleStock: () => this.setState(t => ({
                        kmStock: !t.kmStock
                    })),
                    empty: !t.kitCatalogLoading && !t.kitCatalogError && 0 === p.length,
                    loading: !!t.kitCatalogLoading,
                    hasError: !!t.kitCatalogError,
                    error: t.kitCatalogError || "",
                    retry: () => this.storeLoadKitProducts(1),
                    reset: () => this.setState({kmQ:"",kmCat:"",kmSize:"",kmColor:"",kmStock:false}),
                    cards: p.slice(0, this._kitModalLimit || 24).map(e => {
                        const i = Object.keys(e.variants).filter(i => !t.kmColor || e.variants[i].color === t.kmColor), s = 1 === i.length, o = e.variants[i[0]], a = !(!t.kmSize || s || i.some(i => e.variants[i].size_display === t.kmSize && "out" !== this.avail(e, i))), r = i.every(t => "out" === this.avail(e, t)), n = o.kit_discount_pct ? Math.min(c, o.kit_discount_pct) : 0;
                        return {
                            name: e.name,
                            photo: "img-" + e.id,
                            priceFmt: B(e.price),
                            camo: e.camo,
                            href: "/product/" + (e.slug || w(e.name)),
                            thumb: e.photoData?.[0]?.thumb || e.photos?.[0] || "",
                            hasPhoto: !!e.photos?.length,
                            view: t => {
                                this.setState({
                                    kitModal: null
                                }), this.viewFromKit(e.id)(t);
                            },
                            kitNote: o.pricing_policy_version===1&&o.kit_price!==null ? "у комплекті "+storeMoney(o.kit_price) : "роздріб · спеціальна ціна не підтверджена",
                            kitNoteStyle: {
                                fontSize: "12px",
                                color: o.kit_discount_pct ? "var(--legacy-7eb356)" : "var(--legacy-8a9487)"
                            },
                            muted: a || r,
                            mutedNote: r ? "немає в наявності" : "немає вашого розміру",
                            cardStyle: {
                                border: "1px solid var(--legacy-2a322b)",
                                background: "var(--legacy-141815)",
                                display: "flex",
                                flexDirection: "column",
                                minWidth: 0,
                                opacity: a || r ? .5 : 1
                            },
                            one: s,
                            addOne: () => {
                                r || this.kitAdd(t.kitModal, e.id, i[0]);
                            },
                            sizes: s ? [] : i.map(i => {
                                const s = this.avail(e, i), o = t.kmSize === e.variants[i].size_display;
                                return {
                                    z: i,
                                    pick: () => {
                                        "out" !== s && this.kitAdd(t.kitModal, e.id, i);
                                    },
                                    style: {
                                        minWidth: "38px",
                                        minHeight: "34px",
                                        display: "grid",
                                        placeItems: "center",
                                        padding: "0 6px",
                                        fontFamily: "UAH, Oswald, sans-serif",
                                        fontSize: "12.5px",
                                        cursor: "out" === s ? "not-allowed" : "pointer",
                                        border: "1px " + ("on_order" === s ? "dashed var(--legacy-4e4524)" : "solid " + (o ? "var(--legacy-f2a33c)" : "var(--legacy-3a423b)")),
                                        color: "out" === s ? "var(--legacy-7f887d)" : "on_order" === s ? "var(--legacy-d8be62)" : "var(--legacy-edefea)",
                                        textDecoration: "out" === s ? "line-through" : "none"
                                    }
                                };
                            })
                        };
                    })
                };
            }
            return {
                ...P,
                kitDemos: [ [ "empty", "Порожній" ], [ "two", "2 позиції" ], [ "five", "5 позицій" ], [ "seven", "7 · 2 обмежені" ], [ "par", "Параметри згорнуті" ], [ "plates", "Підказка про плити" ], [ "out", "Позиція закінчилась" ], [ "link", "За посиланням" ], [ "unit", "Підрозділ ×12" ], [ "restored", "Відновлена збірка" ], [ "pick", "Результат підбору" ] ].map(([t, e]) => ({
                    name: e,
                    pick: () => this.kitDemo(t),
                    style: l(!1)
                })),
                kitFriend: t.kitFriend,
                cloneFriend: () => this.setState({
                    kitFriend: !1,
                    kitLink: ""
                }),
                kitFromPick: t.kitFromPick,
                restartPick: () => {
                    this.setState({
                        pk: {
                            season: null,
                            spec: null,
                            have: [],
                            plate: null,
                            formSize: null,
                            shoe: "43",
                            camo: null,
                            budget: 2e4
                        },
                        pkDone: [],
                        pkStep: 0,
                        kitFromPick: !1
                    }), this.go("picker");
                },
                kitLadder: u,
                kitSlots: k,
                kitLadderHome: u.map((t, e) => Object.assign({}, t, {
                    pct: (e === u.length - 1 ? "до " : "") + t.pct,
                    barStyle: {
                        height: "4px",
                        background: "linear-gradient(90deg,var(--legacy-35502f),var(--legacy-7eb356))",
                        opacity: .35 + .16 * e
                    },
                    labelStyle: {
                        fontFamily: "UAH, Oswald, sans-serif",
                        fontSize: "15px",
                        color: "var(--legacy-edefea)"
                    }
                })),
                kitHint: f,
                hasKitHint: !!f,
                kitTogether: b,
                hasTogether: b.length > 0,
                kitCount: "Зібрано позицій: " + i.length,
                kitFullFmt: B(a.full),
                kitHasSave: a.save > 0,
                kitNoSave: 0 === a.save,
                kitKitFmt: B(a.kit),
                kitSaveFmt: B(a.save),
                kitSaveEl: e.createElement(Ft, {
                    value: a.save
                }),
                kitPct: vt(a) ? "· " + vt(a) : "",
                kitNext: v,
                kitDonText: "Донат бригаді: " + B(ut(q * (t.kitUnit ? T : 1))),
                kitProg: {
                    height: "100%",
                    width: Math.min(100, r / n * 100) + "%",
                    background: "var(--legacy-7eb356)",
                    transition: "width .25s"
                },
                kitCanCart: i.length >= c && !M,
                kitCantCart: i.length < c || M,
                kitCantLabel: M ? "Замініть позиції, яких немає" : i.length ? "Додайте щонайменше " + c + " позиції для комплекту" : "Спочатку додайте хоча б один товар",
                kitToCart: this.kitToCart,
                kitBarTotal: B(a.kit),
                kitBarSave: a.save > 0 ? "вигода " + B(a.save) : a.needsSections && r ? "Додайте річ з іншого розділу" : r ? storeGoodsCount(r) : "Спочатку додайте товар",
                kitSave: () => this.kitSaveLink(),
                kitShare: this.kitShare,
                kitLink: t.kitLink,
                hasKitLink: !!t.kitLink,
                kitCopied: t.kitCopied,
                openFriendLink: () => this.setState({
                    kitFriend: !0
                }),
                kitUnit: t.kitUnit,
                toggleKitUnit: () => this.setState(t => ({
                    kitUnit: !t.kitUnit,
                    kitInvoice: !1,
                    kitInvDone: !1
                })),
                kitSW: (R = t.kitUnit, {
                    track: {
                        display: "inline-block",
                        width: "40px",
                        height: "22px",
                        borderRadius: "11px",
                        background: R ? "var(--legacy-f2a33c)" : "var(--legacy-2a322b)",
                        position: "relative",
                        flex: "0 0 auto",
                        transition: "background .15s"
                    },
                    knob: {
                        position: "absolute",
                        top: "3px",
                        left: R ? "21px" : "3px",
                        width: "16px",
                        height: "16px",
                        borderRadius: "50%",
                        background: R ? "var(--legacy-0b0d0b)" : "var(--legacy-8a9487)",
                        transition: "left .15s"
                    }
                }),
                kitN: t.kitN,
                onKitN: t => this.setState({
                    kitN: t.target.value.replace(/\D/g, "").slice(0, 4)
                }),
                unitPerFmt: B(q),
                unitTotalFmt: B(q * T),
                unitNLabel: "× " + T + " " + (T % 10 == 1 && T % 100 != 11 ? "комплект" : "комплектів"),
                kitInvLines: i.map(t => ({
                    t: t.p.name + (Object.keys(t.p.variants).length > 1 ? " · " + t.l.size : "")
                })),
                kitInvSummary: T + " " + (T % 10 == 1 && T % 100 != 11 ? "комплект" : "комплектів") + " · " + B(q * T) + " за прайсом",
                openInvoice: () => this.setState({
                    kitInvoice: !0
                }),
                kitInvoice: t.kitInvoice && !t.kitInvDone,
                kitInvDone: t.kitInvDone,
                invTypes: [ "ФОП", "ТОВ" ].map(e => ({
                    t: e,
                    pick: () => this.setState({
                        kitInvType: e
                    }),
                    style: l(t.kitInvType === e)
                })),
                sendInvoice: async () => {
                    const e = (t.invoiceTax || "").trim(), s = (t.invoiceEmail || "").trim();
                    if (!/^\d{8,10}$/.test(e) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return void this.setState({
                        storeError: "Вкажіть коректний ЄДРПОУ/ІПН та email для рахунку."
                    });
                    const o = await this.kitSaveLink();
                    if (!o) return;
                    const a = [ "Прошу прорахунок комплекту для підрозділу.", t.kitInvType + ": " + e, "Email: " + s, "Кількість комплектів: " + T, o, ...i.map(t => t.p.name + " · " + t.l.size + " × " + (t.l.qty || 1)) ].join("\n");
                    window.location.assign("mailto:info@rubizh.shop?subject=" + encodeURIComponent("Прорахунок комплекту РУБІЖ") + "&body=" + encodeURIComponent(a)),
                    this.setState({
                        kitInvDone: !0,
                        storeError: ""
                    });
                },
                kitInvDoneText: "Підготували лист у вашій поштовій програмі. Натисніть у ній «Надіслати», щоб менеджер отримав запит.",
                invoiceTax: t.invoiceTax || "",
                invoiceEmail: t.invoiceEmail || "",
                onInvoiceTax: t => this.setState({
                    invoiceTax: t.target.value
                }),
                onInvoiceEmail: t => this.setState({
                    invoiceEmail: t.target.value
                }),
                kmOpen: !!I,
                km: I || {
                    title: "",
                    cats: [],
                    sizes: [],
                    colors: [],
                    cards: [],
                    empty: !1,
                    q: "",
                    stockLabel: ""
                },
                homeKits: E.map(t => {
                    const e = this.kitLines(this.kitFromIds(t.items)), i = St(e, 1, !0);
                    return {
                        name: t.name,
                        note: t.note,
                        count: e.length + " позиції",
                        fullFmt: B(i.full),
                        kitFmt: B(i.kit),
                        saveFmt: "вигода " + B(i.save) + (vt(i) ? " · " + vt(i) : ""),
                        slot: "bundle-" + t.key,
                        open: () => this.openBundle(t)
                    };
                })
            };
            var R;
        };
        pkVm=t => {
            const e = t.pk, i = this.pkVisible(), s = i[Math.min(t.pkStep, i.length - 1)], o = (t, i, s) => i.map(([i, o]) => {
                const a = s ? (e[t] || []).includes(i) : e[t] === i;
                return {
                    name: i,
                    note: o || "",
                    pick: () => s ? this.pkSet(t, a ? e[t].filter(t => t !== i) : (e[t] || []).concat([ i ])) : this.pkSet(t, i, !0),
                    style: {
                        display: "flex",
                        flexDirection: "column",
                        gap: "3px",
                        padding: "14px",
                        cursor: "pointer",
                        minWidth: 0,
                        border: "1px solid " + (a ? "var(--legacy-f2a33c)" : "var(--legacy-2a322b)"),
                        background: a ? "var(--legacy-1b1a14)" : "var(--legacy-0f120f)"
                    },
                    nameStyle: {
                        fontFamily: "UAH, Oswald, sans-serif",
                        fontSize: "16px",
                        textTransform: "uppercase",
                        color: a ? "var(--link)" : "var(--legacy-edefea)"
                    }
                };
            }), a = t => {
                const e = i.indexOf(t), o = zt.indexOf(t);
                return {
                    active: s === t ? "1" : "0",
                    num: o > -1 ? o + 1 + " / 6" : "Додатково",
                    boxStyle: {
                        border: "1px solid " + (s === t ? "var(--legacy-4c5a36)" : "var(--legacy-2a322b)"),
                        background: "var(--legacy-141815)",
                        padding: "clamp(16px,2vw,22px)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "14px",
                        scrollMarginTop: "90px"
                    },
                    skip: () => this.pkAdvance(t),
                    back: () => this.setState({
                        pkStep: Math.max(0, e - 1)
                    }),
                    hasBack: e > 0,
                    next: () => this.pkAdvance(t)
                };
            }, l = Z.filter(p=>p.storeReady&&storeRole(p)==='plate'&&p.price>0&&Object.values(p.variants).some(v=>v.availability!=='out_of_stock')).map(p=>[p.id,p.name,storeMoney(p.price)]).map(([t, i, s]) => {
                const o = e.plate === t;
                return {
                    name: i,
                    note: s,
                    pick: () => this.pkSet("plate", t, !0),
                    style: {
                        display: "flex",
                        flexDirection: "column",
                        gap: "3px",
                        padding: "14px",
                        cursor: "pointer",
                        minWidth: 0,
                        border: "1px solid " + (o ? "var(--legacy-f2a33c)" : "var(--legacy-2a322b)"),
                        background: o ? "var(--legacy-1b1a14)" : "var(--legacy-0f120f)"
                    },
                    nameStyle: {
                        fontFamily: "UAH, Oswald, sans-serif",
                        fontSize: "16px",
                        textTransform: "uppercase",
                        color: o ? "var(--link)" : "var(--legacy-edefea)"
                    }
                };
            }), p = this.buildKit(e), h = e.budget >= 61e3, d = zt.filter(e => t.pkDone.includes(e)).length;
            return {
                pq: {
                    season: Object.assign(a("season"), {
                        options: o("season", [ [ "Літо", "спека, ріп-стоп" ], [ "Демісезон", "фліс і дощовик" ], [ "Зима", "термо, утеплення" ] ])
                    }),
                    spec: Object.assign(a("spec"), {
                        options: o("spec", [ [ "Штурм", "бронезахист, підсумки" ], [ "Водій або екіпаж", "компактно, вогнестійке" ], [ "Оператор БпЛА", "довго на позиції, живлення" ], [ "Медик", "розширена аптечка" ], [ "Розвідка", "маскування, легкість" ], [ "Тил або навчання", "форма, побут" ] ])
                    }),
                    have: Object.assign(a("have"), {
                        options: o("have", [ [ "Шолом" ], [ "Плитоноска з плитами" ], [ "Берці" ], [ "Форма" ], [ "Аптечка" ], [ "Рюкзак" ] ], !0)
                    }),
                    plate: Object.assign(a("plate"), {
                        show: i.includes("plate"),
                        options: l
                    }),
                    sizes: Object.assign(a("sizes"), {
                        options: o("formSize", [ [ "S–M", "зріст до 176" ], [ "L", "176–182" ], [ "XL–XXL", "від 182" ] ]).map(t => Object.assign(t, {
                            pick: () => this.pkSet("formSize", t.name)
                        })),
                        showShoe: !(e.have || []).includes("Берці"),
                        shoe: e.shoe,
                        onShoe: t => this.pkSet("shoe", t.target.value),
                        shoeOpts: [ "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46", "47" ].map(t => ({
                            v: t
                        }))
                    }),
                    camo: Object.assign(a("camo"), {
                        options: o("camo", [ [ "Мультикам" ], [ "ММ14 піксель" ], [ "Олива" ], [ "Койот" ], [ "Чорний" ], [ "Не принципово" ] ])
                    }),
                    budget: Object.assign(a("budget"), {
                        value: e.budget,
                        onInput: t => this.pkSet("budget", +t.target.value),
                        label: h ? "Без обмежень" : B(e.budget),
                        caption: p.names.length ? "У цей бюджет зберемо: " + p.names.join(", ") : "У цей бюджет поки нічого не вміщається — збільште суму"
                    }),
                    final: {
                        active: "final" === s ? "1" : "0"
                    }
                },
                pkCountLabel: d + " з 6",
                pkProg: {
                    height: "100%",
                    background: "var(--legacy-f2a33c)",
                    width: Math.round(d / 6 * 100) + "%",
                    transition: "width .2s"
                },
                pkBuild: () => {
                    const t = this.buildKit(this.state.pk);
                    this.setState({
                        kit: t.lines,
                        kitMiss: t.miss,
                        kitFromPick: !0,
                        kitFriend: !1
                    }), this.go("kit"), window.scrollTo(0, 0);
                },
                pkReset: () => this.setState({
                    pk: {
                        season: null,
                        spec: null,
                        have: [],
                        plate: null,
                        formSize: null,
                        shoe: "43",
                        camo: null,
                        budget: 2e4
                    },
                    pkDone: [],
                    pkStep: 0
                })
            };
        };
        serverFetch=(t, e) => {
            const i = Z.find(e => e.id === t);
            if (!i || i.archived) return {
                product: null,
                variant: null
            };
            const s = i.variants[e];
            if (!s) return {
                product: i,
                variant: null
            };
            const o = Object.assign({}, s, {
                price: i.price,
                name: i.name,
                product_id: i.id
            }), a = this.state.cart[0], r = this.props.simScenario ?? "Немає";
            return a && a.id === t && a.size === e && ("Змінилась ціна" === r && (o.price = i.price + 250),
            "Варіант знято з публікації" === r && (o.published = !1), "Варіант закінчився" === r && (o.availability = "out_of_stock"),
            "Варіант став під замовлення" === r && (o.availability = "preorder", o.lead_time = it)),
            {
                product: i,
                variant: o
            };
        };
        add=(t, e, i) => {
            if (this._addLock && Date.now() < this._addLock) return !1;
            const s = Z.find(e => e.id === t);
            if (!s) return !1;
            const o = Object.keys(s.variants), a = e || (1 === o.length ? o[0] : null);
            if (!a) return this.setState({
                addErr: "Оберіть розмір"
            }), !1;
            const {variant: r0} = this.serverFetch(t, a), r = r0&&r0.option_id?{...r0,variant_id:r0.variant_id+':'+(this._v3Color||''),color_id:r0.color_id||this._v3Color||null}:r0;
            if (!r || !r.published || !(r.price>0||r.option_id) || r.size_unconfirmed) return this.setState({
                addErr: "Цей варіант недоступний. Оберіть інший розмір."
            }), !1;
            if ("out_of_stock" === r.availability) return this.setState({
                addErr: "Немає в наявності — цей розмір купити не можна."
            }), !1;
            const n = s.sale_unit==='m2' ? storeQty(i||1) : Math.max(1, Math.floor(Number(i) || 1)), c = this.state.cart.filter(e => e.variant_id ? e.variant_id === r.variant_id : e.id === t && e.size === a).reduce((t, e) => t + e.qty, 0);
            if(storeSizeMissing(s))return this.setState({addErr:"Розмір не підтверджено — напишіть менеджеру"}),false;
            return r.stockKnown && "in_stock" === r.availability && c + n > r.stock ? (this.setState({
                addErr: "На складі " + r.stock + " шт — це максимум для замовлення."
            }), !1) : (window.rubizhAnalytics?.track('add_to_cart',{value:r.price*n,items:[{item_id:r.sku,item_name:s.name,price:r.price,quantity:n}]}),this.flashAdded(), this.setState(e => {
                const i = e.cart.slice(), s = i.findIndex(e => !e.kit && (e.variant_id ? e.variant_id === r.variant_id : e.id === t && e.size === a)), o = {
                    id: t,
                    size: a,
                    variant_id: r.variant_id,
                    sku: r.sku,
                    color: r.color, colorId: r.color_id||null, optionId: r.option_id||null,
                    name: Z.find(p=>p.id===t)?.name, sale_unit:Z.find(p=>p.id===t)?.sale_unit,
                    price: r.price,
                    availability: r.availability
                };
                return s > -1 ? i[s] = Object.assign({}, i[s], o, {
                    qty: i[s].qty + n
                }) : i.push(Object.assign(o, {
                    qty: n
                })), {
                    cart: this.saveCart(i),
                    miniCart: {
                        id: t,
                        size: a, qty:n
                    },
                    addErr: "",
                    cartIssues: {},
                    preAsk: !1,
                    added: t + "|" + a
                };
            }), !0);
        };
        flashAdded=() => {
            this._addLock = Date.now() + 1500, clearTimeout(this._addT), this._addT = setTimeout(() => {
                this._addLock = 0, this.setState({
                    added: null
                });
            }, 1500);
        };
        tileAdd=t => {
            const e = Object.keys(t.variants);
            e.length > 1 ? this.setState({
                qv: t.id,
                qvSize: null,
                addErr: ""
            }) : "out" !== this.avail(t, e[0]) ? this.add(t.id, e[0], 1) : this.open(t.id);
        };
        placeOrder=() => {
            const t = this.state.cart;
            if (!t.length) return void this.go("catalog");
            const e = {}, i = [], s = [];
            t.forEach((t, o) => {
                const {product: a, variant: r} = this.serverFetch(t.id, t.size), n = a ? a.name : t.name || "Товар";
                return a ? !r || !r.published || t.variant_id && t.variant_id !== r.variant_id ? (e[o] = "Розмір " + this.sd(a, t.size) + " більше недоступний. Оберіть інший розмір вручну.",
                void s.push(t)) : "out_of_stock" === r.availability ? (e[o] = "Розмір " + this.sd(a, t.size) + " закінчився. Оберіть інший розмір або видаліть позицію.",
                void s.push(t)) : (null != t.price && t.price !== r.price && i.push({
                    t: n + ", " + this.sd(a, t.size) + " — ціна товару змінилася: було " + B(t.price) + ", стало " + B(r.price)
                }), void s.push(Object.assign({}, t, {
                    variant_id: r.variant_id,
                    sku: r.sku,
                    color: r.color,
                    name: n,
                    price: r.price,
                    availability: r.availability
                }))) : (e[o] = "Товар знято з продажу. Видаліть його з кошика.", void s.push(t));
            });
            const o = {};
            s.forEach((t, i) => {
                t.kit && t.kitId && !e[i] && (o[t.kitId] = o[t.kitId] || []).push(i);
            });
            let a = !1;
            Object.values(o).forEach(t => {
                const e = St(t.map(t => {
                    const e = Z.find(e => e.id === s[t].id);
                    return {
                        v: Object.assign({}, e.variants[s[t].size], {
                            price: s[t].price
                        }), q: s[t].qty, pid: s[t].id, slot: s[t].kitSlot, retailOnly:!!s[t].kitRetail
                    };
                }), s[t[0]].kitUnits, s[t[0]].kitReady).rows;
                t.forEach((t, i) => {
                    (s[t].kitPrice !== e[i].unit || s[t].kitQty !== e[i].kitQty) && (a = !0, s[t] = Object.assign({}, s[t], {
                        kitPrice: e[i].unit, kitQty: e[i].kitQty
                    }));
                });
            }), a && i.push({
                t: "Ціни оновлено · суму комплекту перераховано"
            }), this.setState({
                cart: this.saveCart(s),
                cartIssues: e,
                priceNotices: i
            }), Object.keys(e).length || i.length ? window.scrollTo(0, 0) : s.some(t => "preorder" === t.availability) ? this.setState({
                preAsk: !0
            }) : this.submitOrder(s);
        };
        isMed=t => !!t && "med" === t.cat;
        medInStock=() => Z.filter(t => t.storeReady && this.isMed(t) && Object.keys(t.variants).some(e => "in_stock" === this.avail(t, e))).sort((t, e) => [ "p23", "p29", "p30", "p5" ].indexOf(t.id) - [ "p23", "p29", "p30", "p5" ].indexOf(e.id));
        medAdd=t => {
            const e = Object.keys(t.variants)[0];
            this.add(t.id, e, 1), this.setState({
                miniCart: null
            });
        };
        addToPlaced=t => this.setState(e => {
            if (!e.lastOrder) return null;
            const i = Object.keys(t.variants)[0], s = t.variants[i], o = {
                product_id: t.id,
                variant_id: s.variant_id,
                sku: s.sku,
                size: i,
                color: s.color,
                name: t.name,
                price: t.price,
                qty: 1,
                availability: s.availability,
                addedAfter: !0
            }, a = e.lastOrder.lines.concat([ o ]);
            return {
                lastOrder: Object.assign({}, e.lastOrder, {
                    lines: a,
                    total: a.reduce((t, e) => t + e.price * e.qty, 0)
                })
            };
        });
        jarVm=() => {
            const t = kt[this.props.jarData ?? "Старт"] || kt["Старт"], e = dt, i = t.transfers || [], s = i.length || t.collected_total > 0 ? "live" : t.accrued_pending >= t.goal ? "goal" : t.accrued_pending > 0 ? "filling" : "empty", o = "live" === s ? t.collected_month : t.accrued_pending, a = "live" === s ? Math.min(1, o / (t.month_goal || o || 1)) : Math.min(1, o / t.goal), r = (t, e, i, s) => {
                const o = t % 10, a = t % 100;
                return 1 === o && 11 !== a ? e : o >= 2 && o <= 4 && (a < 12 || a > 14) ? i : s;
            }, n = {
                v: String(t.orders_with_donation),
                l: r(t.orders_with_donation, "замовлення", "замовлення", "замовлень") + " з донатом"
            }, c = {
                level: a,
                inside: B(o),
                coinsOnTop: o > 0 ? a > .5 ? 4 : 3 : 0,
                bar: a,
                top: "empty" === s ? "Переказів ще не було" : "live" === s ? "Передано " + B(t.collected_total) : B(t.accrued_pending) + " нараховано",
                goalText: "live" === s ? "Цього місяця: " + B(t.collected_month) : ("goal" === s ? "Ціль досягнута: " : "До першого переказу: ") + B(o).replace(/\s*₴$/, "") + " / " + B(t.goal),
                hint: "кажуть, іноді з банки випадає гривня",
                label: "Зібрано " + B(o).replace(/\s*₴$/, "") + " з " + B("live" === s ? t.month_goal || o : t.goal).replace(/\s*₴$/, "") + " гривень",
                reduceMotion: !!this.props.jarNoMotion,
                mockResponse: this.props.jarMockWin ? {
                    win: !0,
                    code: "GRYVNIA-X0KW",
                    amount: 100,
                    min_order: 1500,
                    expires_at: "2026-10-05"
                } : null
            }, l = {
                empty: {
                    head: "Поки що тут порожньо",
                    lede: "Саме ваше замовлення може стати першим. З кожного замовлення " + e + "% йде бригаді, яку ви обираєте самі. Переказуємо протягом трьох робочих днів і показуємо тут скрін.",
                    stats: []
                },
                filling: {
                    head: "Нараховуємо на перший переказ",
                    sum: B(t.accrued_pending),
                    sumSub: "нараховано за замовленнями",
                    lede: "Переказ і скрін — протягом трьох робочих днів після того, як зберемо " + B(t.goal) + ".",
                    stats: [ n ]
                },
                goal: {
                    head: "Ціль досягнута, переказ у роботі",
                    sum: B(t.accrued_pending),
                    sumSub: "нараховано за замовленнями",
                    lede: "Переказ і скрін — протягом трьох робочих днів. Скрін платіжки з’явиться тут і в розділі «Звітність».",
                    stats: [ n ]
                },
                live: {
                    head: "Передали бригадам разом з покупцями",
                    sum: B(t.collected_total),
                    sumSub: "за весь час · " + B(t.collected_month) + " цього місяця",
                    lede: "Показуємо фактично переказані кошти. Кожен рядок — платіжка, яку можна відкрити.",
                    stats: [ n, {
                        v: String(t.brigades_count),
                        l: r(t.brigades_count, "бригада отримала", "бригади отримали", "бригад отримали") + " кошти"
                    }, {
                        v: i.length ? i[0].date : "—",
                        l: "останній переказ"
                    } ]
                }
            }[s];
            return {
                jarJson: JSON.stringify(c),
                jar: {
                    head: l.head,
                    hasSum: !!l.sum,
                    sum: l.sum || "",
                    sumSub: l.sumSub || "",
                    lede: l.lede,
                    stats: l.stats,
                    hasStats: l.stats.length > 0,
                    live: "live" === s,
                    notLive: "live" !== s,
                    transfers: i.slice(0, 4).map((t, e) => ({
                        brigade: t.brigade,
                        sumFmt: B(t.amount),
                        date: t.date,
                        receipt: t.receipt_url,
                        open: () => this.setState({
                            donShot: e
                        })
                    })),
                    note: "live" === s ? "Нараховане за свіжими замовленнями ще в дорозі: " + B(t.accrued_pending) : e + "% — це частина нашої націнки, а не додаткова плата. Ціна для вас не змінюється."
                }
            };
        };
        medVm=t => {
            const e = this.medInStock(), i = t => ({
                name: t.name,
                priceFmt: B(t.price),
                photo: "img-" + t.id,
                ph: t.ph,
                open: e => {
                    e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button > 0) || (e?.preventDefault?.(),
                    this.open(t.id));
                },
                add: () => this.medAdd(t),
                addPlaced: () => this.addToPlaced(t)
            }), s = t.cart.some(t => this.isMed(Z.find(e => e.id === t.id))), o = t.lastOrder, a = !!o && o.lines.some(t => this.isMed(Z.find(e => e.id === t.product_id))), r = this.props.orderShipped ?? !1;
            return {
                medHome: e.length >= 4,
                medHomeItems: e.slice(0, 4).map(i),
                goMed: () => this.goPath([ "Тактична медицина" ]),
                medCart: !s && e.length > 0 && t.cart.length > 0,
                medCartItems: e.filter(e => !t.cart.some(t => t.id === e.id)).slice(0, 3).map(i),
                medDone: !!o && !a && !r && e.length >= 2,
                medDoneItems: e.filter(t => "p5" === t.id || "p23" === t.id).slice(0, 2).map(i)
            };
        };
        submitOrder=t => {
            const e = t.map(t => {
                const {product: e, variant: i} = this.serverFetch(t.id, t.size);
                return {
                    product_id: e.id,
                    variant_id: i.variant_id,
                    sku: i.sku,
                    size: i.size_display,
                    size_native: i.size_native,
                    size_type: i.size_type,
                    manager_size: i.size_display + (i.size_native !== i.size_display ? " (виробник: " + i.size_native + ")" : ""),
                    color: i.color,
                    name: e.name,
                    price: null != t.kitPrice ? t.kitPrice : i.price,
                    kit: !!t.kit,
                    qty: t.qty,
                    availability: i.availability
                };
            }), i = {
                lines: e,
                total: e.reduce((t, e) => t + e.price * e.qty, 0)
            };
            try {
                console.info("[order payload]", JSON.stringify(i));
            } catch (t) {}
            this.setState({
                lastOrder: i,
                preAsk: !1
            }), this.go("done");if(t.payment?.url&&/^(?:https:\/\/(?:pay\.mbnk\.biz|pay\.monobank\.ua)\/|\/shop\/mono-mock-pay\.php\?invoice=mock[0-9a-f]{20}$)/.test(t.payment.url))window.location.assign(t.payment.url);
        };
        bumpQty=(t, e) => this.setState(i => {
            const s = i.cart.slice(), o = s[t], a = Z.find(t => t.id === o.id), r = a && a.variants[o.size], n = s.filter(t => t.id === o.id && t.size === o.size).reduce((t, e) => t + e.qty, 0);
            if (e > 0 && r && "in_stock" === r.availability && n >= r.stock) return null;
            const c = o.qty + e;
            return c < 1 ? s.splice(t, 1) : s[t] = Object.assign({}, o, {
                qty: c
            }), {
                cart: this.saveCart(s),
                cartIssues: {}
            };
        });
        toggleIn=(t, e) => this.setState(i => {
            const s = i[t].includes(e) ? i[t].filter(t => t !== e) : i[t].concat([ e ]);
            return Object.assign({
                [t]: s
            }, [ "camo", "brands", "sizes", "attrs" ].includes(t) ? {
                catPg: 1,
                catMore: !1
            } : {});
        });
        stockOf=t => Object.keys(t.variants || {}).filter(e => "in_stock" === this.avail(t, e)).reduce((e, i) => e + (t.variants[i].stock || 0), 0);
        avail=(t, e) => {
            const i = t.variants && t.variants[e];
            return i && i.published ? "in_stock" === i.availability ? "in_stock" : "preorder" === i.availability ? "on_order" : "out" : "out";
        };
        allPre=t => Object.keys(t.variants || {}).every(e => "on_order" === this.avail(t, e));
        allOut=t => Object.keys(t.stock).every(e => "out" === this.avail(t, e));
        sd=(t, e) => t && t.variants && t.variants[e] ? t.variants[e].size_display : e;
        sizeRowOf=t => {
            const e = new Map, i = {
                in_stock: 3,
                on_order: 2,
                out: 1
            };
            for (const s of Object.keys(t.variants || t.stock)) {
                const o = this.sd(t, s), a = e.get(o);
                (!a || i[this.avail(t, s)] > i[this.avail(t, a)]) && e.set(o, s);
            }
            const s = [ ...e.values() ].filter(e => !/^Один розмір$/i.test(this.sd(t, e)));
            return {
                sizeRow: s.slice(0, 6).map(e => {
                    const i = this.avail(t, e);
                    return {
                        z: this.sd(t, e),
                        title: this.sd(t, e) + " · " + ("in_stock" === i ? "в наявності" : "on_order" === i ? "під замовлення" : "немає"),
                        style: {
                            fontSize: "11.5px",
                            lineHeight: "1.3",
                            fontFamily: "Oswald, sans-serif",
                            letterSpacing: ".04em",
                            padding: "2px 6px",
                            borderRadius: "2px",
                            border: "1px " + ("on_order" === i ? "dashed var(--legacy-4e4524)" : "solid " + ("out" === i ? "var(--legacy-1e241f)" : "var(--legacy-3a423b)")),
                            color: "in_stock" === i ? "var(--legacy-d3d9cf)" : "on_order" === i ? "var(--legacy-b3a270)" : "var(--legacy-7f887d)",
                            textDecoration: "out" === i ? "line-through" : "none",
                            cursor: "out" === i ? "not-allowed" : "default",
                            pointerEvents: "out" === i ? "none" : "auto"
                        }
                    };
                }),
                moreSizes: s.length > 6 ? "+" + (s.length - 6) : ""
            };
        };
        sizeChipsOf=t => Object.keys(t.stock).length > 1 ? Object.keys(t.stock).map(e => {
            const i = this.avail(t, e);
            return {
                z: this.sd(t, e),
                style: {
                    fontSize: "11.5px",
                    fontFamily: "UAH, Oswald, sans-serif",
                    letterSpacing: ".04em",
                    padding: "2px 6px",
                    border: "1px " + ("on_order" === i ? "dashed var(--legacy-4e4524)" : "solid " + ("out" === i ? "var(--legacy-1e241f)" : "var(--legacy-3a423b)")),
                    color: "in_stock" === i ? "var(--legacy-d3d9cf)" : "on_order" === i ? "var(--legacy-d8be62)" : "var(--legacy-4a524a)",
                    textDecoration: "out" === i ? "line-through" : "none"
                }
            };
        }) : [];
        stockVm=t => {
            const e = (t, e, i) => ({
                fontFamily: "UAH, Oswald, sans-serif",
                fontSize: "11px",
                letterSpacing: ".1em",
                padding: "3px 7px",
                textTransform: "uppercase",
                background: t,
                border: "1px solid " + e,
                color: i
            }), i = Object.keys(t.variants || {});
            // PIM v3: the buyer sees the structured PIM status (never provenance wording, never UNKNOWN as in stock).
            if (t.v3) {
                const code = storeV3Status(t), tone = storeV3Tone(code);
                return {stockLabel: STORE_V3_LABEL[code], stockBadgeStyle: tone === "in" ? e("var(--legacy-17241a)", "var(--legacy-35502f)", "var(--legacy-7eb356)") : tone === "order" ? e("var(--legacy-211e14)", "var(--legacy-4e4524)", "var(--legacy-d8be62)") : e("var(--legacy-1a1e1b)", "var(--legacy-3a423b)", "var(--legacy-a3ab9f)")};
            }
            if (i.some(e => "in_stock" === this.avail(t, e))) {
                const i = this.stockOf(t);
                return i > 0 && i <= 8 && Object.values(t.variants).filter(v=>v.availability==="in_stock").every(v=>v.stockKnown) ? {
                    stockLabel: "Мало залишилось · " + i,
                    stockBadgeStyle: e("var(--legacy-17241a)", "var(--legacy-35502f)", "var(--legacy-7eb356)")
                } : {
                    stockLabel: "В наявності",
                    stockBadgeStyle: e("var(--legacy-17241a)", "var(--legacy-35502f)", "var(--legacy-7eb356)")
                };
            }
            return i.some(e => "on_order" === this.avail(t, e)) ? {
                stockLabel: "Під замовлення · " + it,
                stockBadgeStyle: e("var(--legacy-211e14)", "var(--legacy-4e4524)", "var(--legacy-d8be62)")
            } : {
                stockLabel: "Немає в наявності",
                stockBadgeStyle: e("var(--legacy-1a1e1b)", "var(--legacy-3a423b)", "var(--legacy-a3ab9f)")
            };
        };
        opt=(t, e, i, s) => ({
            name: t,
            count: e,
            mark: i ? "✓" : "",
            boxStyle: this.box(i),
            toggle: () => {
                (e > 0 || i) && s();
            },
            rowStyle: {
                display: "flex",
                alignItems: "center",
                gap: "10px",
                fontSize: "13.5px",
                color: "var(--legacy-d3d9cf)",
                cursor: e > 0 || i ? "pointer" : "default",
                opacity: e > 0 || i ? 1 : .35
            }
        });
        chipC=(t, e, i, s) => ({
            name: t,
            count: e,
            toggle: () => {
                (e > 0 || i) && s();
            },
            chipStyle: {
                display: "flex",
                gap: "6px",
                alignItems: "baseline",
                padding: "7px 10px",
                fontSize: "13px",
                fontFamily: "UAH, Oswald, sans-serif",
                letterSpacing: ".05em",
                cursor: e > 0 || i ? "pointer" : "default",
                opacity: e > 0 || i ? 1 : .35,
                border: "1px solid " + (i ? "var(--legacy-f2a33c)" : "var(--legacy-2a322b)"),
                background: i ? "var(--legacy-f2a33c)" : "var(--legacy-0f120f)",
                color: i ? "var(--button-text)" : "var(--legacy-d3d9cf)"
            },
            countStyle: {
                fontSize: "10.5px",
                fontFamily: "IBM Plex Sans, sans-serif",
                color: i ? "var(--legacy-4a3a18)" : "var(--legacy-8a9487)"
            }
        });
        tableVm=t => {
            const e = t[0], i = t.slice(1);
            return {
                gridStyle: {
                    display: "grid",
                    gridTemplateColumns: "repeat(" + e.length + ", minmax(96px, 1fr))",
                    minWidth: 96 * e.length + "px"
                },
                head: e.map(t => ({
                    t: t
                })),
                cells: i.flatMap((t, e) => t.map((t, s) => ({
                    t: t,
                    style: {
                        padding: "10px 12px",
                        borderBottom: e < i.length - 1 ? "1px solid var(--legacy-1e241f)" : "none",
                        color: 0 === s ? "var(--legacy-edefea)" : "var(--legacy-a9b3a6)",
                        fontFamily: 0 === s ? "Oswald, sans-serif" : "IBM Plex Sans, sans-serif",
                        fontSize: "13.5px"
                    }
                })))
            };
        };
        guideCard=t => ({
            key: t.key,
            title: t.title,
            desc: t.desc,
            topic: t.topic,
            min: t.min + " хв читання",
            slot: "guide-" + t.key,
            src: F[t.key] || "",
            ph: "Обкладинка: " + t.title.toLowerCase(),
            href: "/porady/" + w(t.title),
            open: e => {
                e && e.preventDefault && e.preventDefault(), this.go("guide", {
                    guide: t.key,
                    burger: !1
                });
            }
        });
        sizeTabsFor=(t, e) => Object.keys(L).map(i => ({
            name: L[i].name,
            pick: () => this.setState({
                [e]: i
            }),
            style: {
                padding: "9px 14px",
                whiteSpace: "nowrap",
                cursor: "pointer",
                fontFamily: "UAH, Oswald, sans-serif",
                fontSize: "14px",
                letterSpacing: ".06em",
                textTransform: "uppercase",
                border: "1px solid " + (t === i ? "var(--legacy-f2a33c)" : "var(--legacy-2a322b)"),
                background: t === i ? "var(--legacy-f2a33c)" : "var(--legacy-141815)",
                color: t === i ? "var(--button-text)" : "var(--legacy-d3d9cf)"
            }
        }));
        goPath=(t, e) => this.go("catalog", Object.assign({
            cpath: (t || []).slice(),
            catPg: 1,
            catMore: !1,
            seoOpen: !1,
            attrs: [],
            burger: !1,
            menuOpen: !1,
            mobPath: [],
            mobSec: null,
            quick: null,
            sq: "",
            roots: [],
            sort: "rel" === this.state.sort ? "pop" : this.state.sort
        }, e || {}));
        goQuick=t => this.go("catalog", {
            cpath: [],
            quick: t,
            catPg: 1,
            catMore: !1,
            attrs: [],
            burger: !1,
            menuOpen: !1,
            mobSec: null,
            sq: "",
            roots: [],
            sort: "rel" === this.state.sort ? "pop" : this.state.sort
        });
        goRoots=t => {
            const g=storeGroupForRoots(t.roots);
            1 === t.roots.length ? this.goPath([ t.roots[0] ], {
                sort: "stock"
            }) : g ? this.goPath([], {roots:g.roots.slice(),rootsTitle:g.title}) : this.goAllCats(t.roots[0]), window.scrollTo(0, 0);/* Stage 5 (D-62): a group opens its own page /rozdil/<slug> */
        };
        top5Vm=() => {
            const t = t => Z.filter(e => e.storeReady && t.includes(e.path[0]) && Object.keys(e.variants).some(t => "in_stock" === this.avail(e, t))).length, e = t => Z.filter(e => e.storeReady && t.includes(e.path[0])).length, i = new Set(Dt.flatMap(t => t.roots)), s = K.filter(e => !i.has(e.name) && t([ e.name ]) > 0).sort((t, i) => e([ i.name ]) - e([ t.name ])).map(t => ({
                title: t.name,
                roots: [ t.name ],
                sub: t.kids.slice(0, 4).map(t => t.name.toLowerCase()).join(", "),
                img: ""
            })), o = [];
            return Dt.forEach(e => {
                t(e.roots) > 0 ? o.push(e) : s.length && o.push(s.shift());
            }), o.slice(0, 5).map(t => {
                const i = e(t.roots);
                return {
                    title: t.title,
                    sub: t.sub,
                    count: x(i, "товар", "товари", "товарів"),
                    aria: t.title,
                    href: "/catalog/" + w(t.title) + "?sort=stock",
                    hasImg: !!t.img,
                    imgStyle: {
                        position: "absolute",
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundImage: "url('" + t.img + "')",
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        transition: "transform .45s ease"
                    },
                    open: e => {
                        e && e.preventDefault && e.preventDefault(), this.goRoots(t);
                    }
                };
            });
        };
        onSearch=t => {
            const e = t.target.value;
            this.setState({
                q: e,
                qOpen: !0,
                sugIdx: -1
            }), clearTimeout(this._qt), this._qt = setTimeout(() => this.setState({
                qDeb: e
            }), 250);
        };
        pushHist=t => {
            if ((t = String(t || "").trim()).length < 2) return;
            const e = [ t ].concat((this.state.searchHist || []).filter(e => e.toLowerCase() !== t.toLowerCase())).slice(0, 3);
            try {
                localStorage.setItem("rubizh_search_hist", JSON.stringify(e));
            } catch (t) {}
            this.setState({
                searchHist: e
            });
        };
        doSearch=t => {
            // An empty or one-letter query is not ignored silently: the cursor goes to the search field (D-34).
            if((t = String(t || "").trim()).length < 2){const field=[...document.querySelectorAll('input[name="q"][type="search"]')].find(i=>i.offsetParent);field?.focus();return;}
            (clearTimeout(this._qt), this.pushHist(t),
            document.activeElement && document.activeElement.blur && document.activeElement.blur(),
            this.go("catalog", {
                q: t,
                qDeb: t,
                qOpen: !1,
                sugIdx: -1,
                burger: !1,
                menuOpen: !1,
                cpath: [],
                quick: null,
                roots: [],
                sq: t,
                sort: "rel",
                catPg: 1,
                catMore: !1,
                attrs: []
            }), window.scrollTo(0, 0));
        };
        pickSug=t => {
            this.pushHist(this.state.q), this.setState({
                qOpen: !1,
                sugIdx: -1
            }), document.activeElement && document.activeElement.blur && document.activeElement.blur(),
            this.open(t.id);
        };
        onSearchKey=t => {
            const e = this.storeSearchItems(this.state).slice(0, 8);
            "ArrowDown" === t.key ? (t.preventDefault(), this.setState(t => ({
                qOpen: !0,
                sugIdx: Math.min(e.length - 1, t.sugIdx + 1)
            }))) : "ArrowUp" === t.key ? (t.preventDefault(), this.setState(t => ({
                sugIdx: Math.max(-1, t.sugIdx - 1)
            }))) : "Enter" === t.key && this.state.sugIdx >= 0 && e[this.state.sugIdx] ? (t.preventDefault(),
            this.pickSug(e[this.state.sugIdx])) : "Escape" === t.key && (this.setState({
                qOpen: !1,
                sugIdx: -1
            }), t.target.blur());
        };
        searchVm=t => {
            const e = (t.qDeb || "").trim(), i = Bt(e), s = this.storeSearchItems(t).slice(0, 8), o = t.q.trim().length >= 2, a = i.words.map(Tt).filter(t => t.length >= 2), r = t => {
                const e = Object.keys(t.variants);
                if (t.v3) { const c = storeV3Status(t), tone = storeV3Tone(c); return [ STORE_V3_LABEL[c], tone === "in" ? "var(--legacy-7eb356)" : tone === "order" ? "var(--legacy-d8be62)" : "var(--legacy-a3ab9f)" ]; }
                return e.some(e => "in_stock" === this.avail(t, e)) ? [ "В наявності", "var(--legacy-7eb356)" ] : e.some(e => "on_order" === this.avail(t, e)) ? [ "Під замовлення", "var(--legacy-d8be62)" ] : [ "Немає", "var(--legacy-a3ab9f)" ];
            }, n = (t.searchHist || []).slice(0, 3);
            return {
                q: t.q,
                qOpen: !!t.qOpen,
                qOpenAttr: t.qOpen ? "1" : "0",
                onSearch: this.onSearch,
                onSearchKey: this.onSearchKey,
                onSearchFocus: () => {
                    clearTimeout(this._bt), this.setState({
                        qOpen: !0
                    });
                },
                onSearchBlur: () => {
                    this._bt = setTimeout(() => this.setState({
                        qOpen: !1,
                        sugIdx: -1
                    }), 150);
                },
                keepFocus: t => {
                    "INPUT" !== t.target.tagName && t.preventDefault();
                },
                onSearchSubmit: t => {
                    t.preventDefault(), this.doSearch(this.state.q);
                },
                submitSearch: () => this.doSearch(this.state.q),
                clearSearch: () => {
                    clearTimeout(this._qt), this.setState({
                        q: "",
                        qDeb: "",
                        sugIdx: -1
                    });
                },
                cancelSearch: () => {
                    this.setState({
                        qOpen: !1,
                        sugIdx: -1
                    }), document.activeElement && document.activeElement.blur && document.activeElement.blur();
                },
                sEmptyField: !o,
                hasHist: n.length > 0,
                searchHist: n.map(t => ({
                    t: t,
                    go: () => this.doSearch(t)
                })),
                clearHist: () => {
                    try {
                        localStorage.removeItem("rubizh_search_hist");
                    } catch (t) {}
                    this.setState({
                        searchHist: []
                    });
                },
                popular: At.map(t => ({
                    t: t,
                    go: () => this.doSearch(t)
                })),
                sHasSug: o && s.length > 0,
                sNone: o && e.length >= 2 && !t.storeSearchLoading && !s.length,
                sNoneText: "Нічого не знайшли за запитом «" + e + "»",
                sAllLabel: "Показати всі результати (" + (t.storeSearchTotal || 0) + ") →",
                goCatalogAll: () => {
                    this.setState({
                        qOpen: !1
                    }), this.goPath([]);
                },
                suggestions: s.map((e, i) => {
                    const s = this.cardVm(e), o = r(e), n = i === t.sugIdx;
                    return {
                        segs: (c = e.name, c.split(/(\s+)/).filter(t => "" !== t).map(t => {
                            const e = Pt(t).replace(/[^a-zа-я0-9]/g, "");
                            return {
                                t: t,
                                style: e && a.some(t => e.startsWith(t)) ? {
                                    color: "var(--legacy-ffffff)",
                                    fontWeight: 600,
                                    background: "rgba(242,163,60,.22)"
                                } : {}
                            };
                        })),
                        catName: e.path.length ? e.path[e.path.length - 1] : ht[e.cat] || "",
                        priceFmt: s.priceFmt,
                        avLabel: o[0],
                        avStyle: {
                            fontSize: "11.5px",
                            color: o[1],
                            whiteSpace: "nowrap"
                        },
                        hasPhoto: s.hasPhoto,
                        noPhoto: s.noPhoto,
                        silPath: s.silPath,
                        thumbStyle: {
                            position: "absolute",
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            backgroundColor: "var(--legacy-ecedea)",
                            backgroundImage: s.photo ? "url('" + s.photo + "')" : "none",
                            backgroundSize: "contain",
                            backgroundPosition: "center",
                            backgroundRepeat: "no-repeat"
                        },
                        go: () => this.pickSug(e),
                        hover: () => {
                            this.state.sugIdx !== i && this.setState({
                                sugIdx: i
                            });
                        },
                        rowStyle: {
                            display: "flex",
                            gap: "10px",
                            alignItems: "center",
                            padding: "8px 12px",
                            cursor: "pointer",
                            borderBottom: "1px solid var(--legacy-1e241f)",
                            background: n ? "var(--legacy-1e2618)" : "transparent",
                            outline: n ? "2px solid var(--legacy-f2a33c)" : "none",
                            outlineOffset: "-2px"
                        }
                    };
                    var c;
                })
            };
        };
        goAllCats=t => {
            this.go("allcats", {
                menuOpen: !1,
                burger: !1,
                mobSec: null
            }), setTimeout(() => {
                const e = t && document.getElementById("ac-" + w(t));
                window.scrollTo({
                    top: e ? e.getBoundingClientRect().top + window.scrollY - 80 : 0,
                    behavior: e ? "smooth" : "auto"
                });
            }, 90);
        };
        nodeCount=t => {
            this._cnt || (this._cnt = new Map);
            const e = t.join(" / ");
            if (this._cnt.has(e)) return this._cnt.get(e);
            let i;
            if (t.length) {
                const s = H(t);
                i = s ? s.kids.length ? s.kids.reduce((t, e) => t + this.nodeCount(e.path), 0) : Math.max(j[e] || 0, Z.filter(e => e.storeReady && e.path.length === t.length && V(e, t)).length) : 0;
            } else i = K.reduce((t, e) => t + this.nodeCount(e.path), 0);
            return this._cnt.set(e, i), i;
        };
        visibleNodes=t => t.filter(t => this.nodeCount(t.path) > 0);
        blockCount=t => this.nodeCount(t.path) - (t.exclude || []).reduce((t, e) => t + this.nodeCount(e), 0);
        blockItems=t => t.items ? t.items.map(([t, e]) => {
            const i = e.map(t => t.split(" / "));
            return {
                label: t,
                paths: i,
                n: i.reduce((t, e) => t + this.nodeCount(e), 0)
            };
        }) : this.leafItems(t.path);
        leafItems=t => {
            const e = H(t);
            if (!e) return [];
            const i = [];
            e.kids.forEach(t => t.kids.forEach(e => i.push({
                l: e,
                sub: t
            })));
            const s = {};
            return i.forEach(t => {
                s[t.l.name] = (s[t.l.name] || 0) + 1;
            }), i.map(({l: t, sub: e}) => ({
                label: s[t.name] > 1 || /^Жіночий/.test(e.name) ? t.name + " · " + e.name : t.name,
                paths: [ t.path ],
                n: this.nodeCount(t.path)
            })).filter(t => t.n > 0).sort((t, e) => e.n - t.n);
        };
        menuVm=t => {
            const e = t => {
                t && t.preventDefault && t.preventDefault();
            }, i = (t, e, i, s) => {
                const o = t % 10, a = t % 100;
                return 1 === o && 11 !== a ? e : o >= 2 && o <= 4 && (a < 12 || a > 14) ? i : s;
            }, s = t => ({
                name: t.label,
                count: t.n >= 3 ? t.n : "",
                href: X(t.paths[0]),
                open: i => {
                    e(i), this.goPath(t.paths[0]);
                },
                style: {
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "10px",
                    padding: "5px 0",
                    fontSize: "13.5px",
                    lineHeight: "1.35",
                    textDecoration: "none",
                    color: t.n < 3 ? "var(--legacy-8a9487)" : "var(--legacy-c7cec3)"
                }
            }), o = U.map(t => ({
                title: t.title,
                blocks: t.blocks.map(t => {
                    const i = this.blockCount(t), o = this.blockItems(t).filter(t => t.n > 0).sort((t, e) => e.n - t.n);
                    return {
                        n: i,
                        name: t.name,
                        count: i,
                        href: X(t.path),
                        open: i => {
                            e(i), this.goPath(t.path);
                        },
                        full: !t.compact,
                        items: o.slice(0, 11).map(s),
                        all: i => {
                            e(i), this.goAllCats(t.path[0]);
                        }
                    };
                }).filter(t => t.n > 0)
            })).filter(t => t.blocks.length), a = t => ({
                display: "flex",
                alignItems: "center",
                gap: "10px",
                minHeight: "48px",
                padding: "0 14px",
                borderBottom: "1px solid var(--legacy-1e241f)",
                cursor: "pointer",
                fontFamily: "IBM Plex Sans, sans-serif",
                textTransform: "none",
                letterSpacing: "0",
                fontSize: "15px",
                color: t ? "var(--legacy-8a9487)" : "var(--legacy-d3d9cf)"
            }), r = this.visibleNodes(K), n = t.mobSec ? H([ t.mobSec ]) : null, c = this.nodeCount([]), l = (this._storeCategories||[]).filter(c=>c.path.includes(' / ')).length||K.reduce((t,e)=>t+e.kids.length,0);
            return {
                megaCols: o,
                goNew: () => this.goQuick("new"),
                goInStock: () => this.goQuick("stock"),
                goAllCats: () => this.goAllCats(),
                mobTitle: n ? n.name : "Каталог",
                mobDeep: !!n,
                mobTop: !n,
                mobBack: () => this.setState({
                    mobSec: null
                }),
                mobAll: () => this.goPath([ t.mobSec ]),
                mobAllLabel: n ? "Усі товари розділу · " + this.nodeCount(n.path) : "",
                mobList: n ? this.leafItems(n.path).map(t => ({
                    name: t.label,
                    count: t.n >= 3 ? t.n : "",
                    arrow: "",
                    tap: () => this.goPath(t.paths[0]),
                    style: a(t.n < 3)
                })) : r.map(t => ({
                    name: t.name,
                    count: this.nodeCount(t.path),
                    arrow: "›",
                    tap: () => this.setState({
                        mobSec: t.name
                    }),
                    style: a(!1)
                })),
                isAllCats: "allcats" === t.screen,
                acSummary: r.length + " " + i(r.length, "розділ", "розділи", "розділів") + " · " + l + " " + i(l, "категорія", "категорії", "категорій") + " · " + c.toLocaleString("uk-UA") + " " + i(c, "товар", "товари", "товарів"),
                acJump: r.map(t => ({
                    name: t.name,
                    go: () => {
                        const e = document.getElementById("ac-" + w(t.name));
                        e && window.scrollTo({
                            top: e.getBoundingClientRect().top + window.scrollY - 80,
                            behavior: "smooth"
                        });
                    }
                })),
                acSecs: r.map(t => ({
                    path: t.path,
                    id: "ac-" + w(t.name),
                    name: t.name,
                    count: this.nodeCount(t.path),
                    href: X(t.path),
                    open: i => {
                        e(i), this.goPath(t.path);
                    },
                    subs: this.visibleNodes(t.kids).map(t => {
                        const i = 1 === t.kids.length && t.kids[0].name === t.name;
                        return {
                            name: t.name,
                            count: this.nodeCount(t.path),
                            href: X(t.path),
                            open: i => {
                                e(i), this.goPath(t.path);
                            },
                            leaves: i ? [] : this.visibleNodes(t.kids).map(t => s({
                                label: t.name,
                                n: this.nodeCount(t.path),
                                paths: [ t.path ]
                            }))
                        };
                    })
                })),
                mgrLinks: N.map(([t, e]) => ({
                    name: t,
                    href: e,
                    iconStyle: {
                        display: "block",
                        width: "15px",
                        height: "15px",
                        background: "url('https://cdn.simpleicons.org/" + t.toLowerCase() + "/white') center/contain no-repeat"
                    },
                    dot: {
                        width: "26px",
                        height: "26px",
                        borderRadius: "50%",
                        flex: "0 0 auto",
                        display: "grid",
                        placeItems: "center",
                        background: {
                            Signal: "var(--legacy-3a76f0)",
                            WhatsApp: "var(--legacy-25d366)",
                            Telegram: "var(--legacy-2aabee)",
                            Viber: "var(--legacy-7360f2)"
                        }[t]
                    }
                }))
            };
        };
        toggleFav=t => this.setState(e => ({
            fav: e.fav.includes(t) ? e.fav.filter(e => e !== t) : e.fav.concat([ t ])
        }));
        cardVm=t => Object.assign({
            badges: (() => {
                const e = [], i = (t, e, i, s) => ({
                    t: t,
                    style: {
                        fontFamily: "UAH, Oswald, sans-serif",
                        fontSize: "11px",
                        letterSpacing: ".1em",
                        padding: "3px 7px",
                        textTransform: "uppercase",
                        color: e,
                        background: i,
                        border: "1px solid " + s
                    }
                });
                C.includes(t.id) && e.push(i("Новинка", "var(--legacy-0b0d0b)", "var(--legacy-f2a33c)", "var(--legacy-f2a33c)"));
                const s = Object.keys(t.stock), o = s.filter(e => "out" !== this.avail(t, e)).length;
                return s.length >= 3 && o > 0 && o <= 2 && e.push(i("Останні розміри", "var(--legacy-e0b9a8)", "rgba(35,26,23,.92)", "var(--legacy-4a2c21)")),
                e;
            })(),
            quick: e => {
                e && e.stopPropagation && e.stopPropagation(), this.setState({
                    qv: t.id,
                    qvSize: null
                });
            },
            badge: (() => {
                const e = Object.keys(t.stock), i = e.filter(e => "out" !== this.avail(t, e)).length, s = (t, e) => ({
                    position: "absolute",
                    top: "8px",
                    left: "8px",
                    zIndex: 2,
                    pointerEvents: "none",
                    fontFamily: "UAH, Oswald, sans-serif",
                    fontSize: "11px",
                    letterSpacing: ".1em",
                    padding: "3px 7px",
                    textTransform: "uppercase",
                    borderRadius: "2px",
                    color: t,
                    background: e
                });
                return e.length >= 3 && i > 0 && i <= 2 ? {
                    t: "Останні розміри",
                    style: s("var(--legacy-edefea)", "var(--legacy-3a2a22)")
                } : C.includes(t.id) ? {
                    t: "Новинка",
                    style: s("var(--legacy-edefea)", "var(--legacy-0b0d0b)")
                } : null;
            })(),
            photo: (c => c === "" ? "" : c || t.photoData?.[0]?.thumb || t.photos[0] || "")(storeCardCover(t)),
            href: "/product/" + encodeURIComponent(t.slug || t.id),
            hasPhoto: !!t.photos[0] && storeCardCover(t) !== "" && !this.state.brokenPhotos.includes(t.id),
            noPhoto: !t.photos[0] || storeCardCover(t) === "" || this.state.brokenPhotos.includes(t.id),
            photoErr: () => this.setState(e => e.brokenPhotos.includes(t.id) ? null : {
                brokenPhotos: e.brokenPhotos.concat([ t.id ])
            }),
            silPath: _t[t.cat] || _t.small,
            hasReviews: !1,
            rating: "",
            reviewsCount: "",
            brand: t.brand || "",
            favAttr: this.state.fav.includes(t.id) ? "on" : "off",
            favPressed: this.state.fav.includes(t.id) ? "true" : "false",
            favLabel: (this.state.fav.includes(t.id) ? "Прибрати з обраного: " : "Додати в обране: ") + t.name,
            inCompare: this.state.compare.includes(t.id),
            favMark: this.state.fav.includes(t.id) ? "♥" : "♡",
            favStyle: {
                position: "absolute",
                top: "6px",
                right: "6px",
                zIndex: 2,
                width: "34px",
                height: "34px",
                border: "0",
                padding: "0",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
                fontSize: "17px",
                borderRadius: "50%",
                background: "rgba(255,255,255,.7)",
                color: this.state.fav.includes(t.id) ? "var(--legacy-c4561f)" : "var(--legacy-2a322b)"
            },
            toggleFav: () => this.toggleFav(t.id),
            id: t.id,
            name: t.name,
            camo: t.camo,
            cert: "",
            price: t.price,
            priceFmt: t.quote ? "від " + B(t.price) + (t.quoteM2 ? " / м²" : "") : (new Set(Object.values(t.variants).filter(t => t.published).map(t => t.price)).size > 1 ? "від " : "") + B(t.price),
            cardAvailability: t.v3 ? STORE_V3_LABEL[storeV3Status(t)] : Object.keys(t.variants).some(e => "in_stock" === this.avail(t, e)) ? "В наявності" : Object.keys(t.variants).some(e => "on_order" === this.avail(t, e)) ? "Під замовлення" : "Немає в наявності",
            cardAvailabilityTone: t.v3 ? storeV3Tone(storeV3Status(t)) : Object.keys(t.variants).some(e => "in_stock" === this.avail(t, e)) ? "in" : Object.keys(t.variants).some(e => "on_order" === this.avail(t, e)) ? "order" : "out",
            slot: "img-" + t.id,
            ph: t.ph,
            sizeRange: Object.keys(t.stock).length > 1 ? Object.keys(t.stock)[0] + "–" + Object.keys(t.stock).slice(-1)[0] : Object.keys(t.stock)[0],
            sizeChips: this.sizeChipsOf(t),
            hasSizeChips: Object.keys(t.stock).length > 1,
            ...this.sizeRowOf(t),
            open: e => {
                e && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button > 0) || (e?.preventDefault?.(),
                this.open(t.id));
            },
            add: () => this.tileAdd(t)
        }, this.stockVm(t));
        chip=(t, e, i) => ({
            name: t,
            toggle: i,
            chipStyle: {
                padding: "7px 11px",
                cursor: "pointer",
                fontSize: "13px",
                fontFamily: "UAH, Oswald, sans-serif",
                letterSpacing: ".06em",
                border: "1px solid " + (e ? "var(--legacy-f2a33c)" : "var(--legacy-2a322b)"),
                background: e ? "var(--legacy-f2a33c)" : "var(--legacy-0f120f)",
                color: e ? "var(--button-text)" : "var(--legacy-d3d9cf)"
            }
        });
        box=t => ({
            width: "17px",
            height: "17px",
            flex: "0 0 auto",
            display: "grid",
            placeItems: "center",
            fontSize: "11px",
            border: "1px solid " + (t ? "var(--legacy-f2a33c)" : "var(--legacy-3a423b)"),
            background: t ? "var(--legacy-f2a33c)" : "transparent",
            color: "var(--button-text)"
        });
        radio=(t, e) => ({
            display: "flex",
            gap: "12px",
            alignItems: "center",
            cursor: "pointer",
            padding: "13px",
            border: "1px solid " + (t ? "var(--legacy-f2a33c)" : "var(--legacy-2a322b)"),
            background: t ? "var(--legacy-1b1a14)" : "var(--legacy-0f120f)"
        });
        dot=t => ({
            width: "14px",
            height: "14px",
            borderRadius: "50%",
            flex: "0 0 auto",
            border: "4px solid " + (t ? "var(--legacy-f2a33c)" : "var(--legacy-3a423b)"),
            background: "var(--legacy-0b0d0b)"
        });
        renderBaseVals() {
            const t = this.state, v = dt, _ = this.props.freeShipFrom ?? 3e3, F = t => t.brand || "Не вказано", D = t => Object.keys(t.stock).some(e => "in_stock" === this.avail(t, e)), j = t => Object.keys(t.stock).some(e => "on_order" === this.avail(t, e)), U = parseInt(t.priceFrom, 10), N = parseInt(t.priceTo, 10), Q = Z.filter(e => e.storeReady && V(e, t.cpath)), Y = {};
            Q.forEach(t => t.specs.forEach(([t, e]) => {
                (Y[t] = Y[t] || {})[e] = !0;
            }));
            const tt = t.cpath.length ? Object.keys(Y).filter(t => Q.filter(e => e.specs.some(e => e[0] === t)).length >= 2).slice(0, 3) : [], et = t.sq ? Bt(t.sq) : null, st = et ? new Set(et.items.map(t => t.id)) : null, ot = (e, i) => {
                if ("cat" !== i && t.cpath.length && !V(e, t.cpath)) return !1;
                if (st && !st.has(e.id)) return !1;
                if (t.roots && t.roots.length && !t.roots.includes(e.path[0])) return !1;
                if ("new" === t.quick && !C.includes(e.id)) return !1;
                if ("stock" === t.quick && !Object.keys(e.variants).some(t => "in_stock" === this.avail(e, t))) return !1;
                if ("price" !== i && !isNaN(U) && e.price < U) return !1;
                if ("price" !== i && !isNaN(N) && e.price > N) return !1;
                if ("camo" !== i && t.camo.length && !t.camo.includes(e.camo)) return !1;
                if ("brand" !== i && t.brands.length && !t.brands.includes(F(e))) return !1;
                if ("size" !== i && t.sizes.length && !t.sizes.some(i => {
                    const [s, o] = i.split("|");
                    return Object.keys(e.variants).some(i => {
                        const a = e.variants[i];
                        return a.size_type === s && a.size_display === o && "out" !== this.avail(e, i) && (!t.inStock && t.withOrder || "in_stock" === this.avail(e, i));
                    });
                })) return !1;
                if ("avail" !== i && t.inStock && !D(e)) return !1;
                if ("avail" !== i && !t.withOrder && !D(e) && j(e)) return !1;
                for (const s of tt) {
                    if (i === "attr:" + s) continue;
                    const o = t.attrs.filter(t => t.startsWith(s + "")).map(t => t.split("")[1]);
                    if (o.length && !e.specs.some(([t, e]) => t === s && o.includes(e))) return !1;
                }
                return !0;
            };
            let at = Z.filter(t => t.storeReady && ot(t));
            "cheap" === t.sort && (at = at.slice().sort((t, e) => t.price - e.price)), "exp" === t.sort && (at = at.slice().sort((t, e) => e.price - t.price)),
            "new" === t.sort && (at = at.slice().sort((t, e) => Z.indexOf(e) - Z.indexOf(t))),
            "stock" === t.sort && (at = at.slice().sort((t, e) => (D(e) ? 1 : 0) - (D(t) ? 1 : 0))),
            "rel" === t.sort && et && (at = at.slice().sort((t, e) => et.scores.get(t.id) - et.scores.get(e.id)));
            const nt = (t, e) => Z.filter(i => i.storeReady && ot(i, t) && e(i)).length, ct = [];
            Z.forEach(t => Object.keys(t.stock).forEach(t => {
                "Один розмір" === t || ct.includes(t) || ct.push(t);
            }));
            const pt = (() => {
                const e = {};
                Z.filter(t => t.storeReady && ot(t, "size")).forEach(t => Object.keys(t.variants).forEach(i => {
                    const s = t.variants[i];
                    if ("other" === s.size_type) return;
                    const o = e[s.size_type] = e[s.size_type] || {}, a = o[s.size_display] = o[s.size_display] || {
                        ids: new Set,
                        avail: !1
                    };
                    a.ids.add(t.id), "out" !== this.avail(t, i) && (a.avail = !0);
                }));
                const i = Object.keys(rt).filter(t => e[t]);
                return i.map(s => {
                    const o = Object.keys(e[s]).sort((t, e) => lt(0, t) - lt(0, e) || String(t).localeCompare(String(e), "uk", {
                        numeric: !0
                    })), a = !!(t.sizeAll || {})[s], r = a ? o : o.slice(0, 12);
                    return {
                        label: 1 === i.length ? "" : rt[s].label,
                        more: o.length > 12 && !a,
                        moreLabel: "Показати всі · " + o.length,
                        showMore: () => this.setState(t => ({
                            sizeAll: Object.assign({}, t.sizeAll, {
                                [s]: !0
                            })
                        })),
                        chips: r.map(i => {
                            const o = s + "|" + i, a = e[s][i], r = t.sizes.includes(o), n = this.chipC(i, a.ids.size, r, () => this.toggleIn("sizes", o));
                            return a.avail || r || (n.chipStyle = Object.assign({}, n.chipStyle, {
                                opacity: .45
                            })), n;
                        })
                    };
                });
            })(), kt = [];
            Z.forEach(t => {
                kt.includes(F(t)) || kt.push(F(t));
            });
            const yt = [];
            t.quick && yt.push({
                name: "new" === t.quick ? "Новинки" : "В наявності сьогодні",
                remove: () => this.setState({
                    quick: null,
                    catPg: 1,
                    catMore: !1
                })
            }), /* D-61: the current category is the page itself (breadcrumbs, heading), not a removable filter. */ (t.priceFrom || t.priceTo) && yt.push({
                name: (t.priceFrom ? "від " + t.priceFrom : "") + (t.priceTo ? " до " + t.priceTo : "") + " ₴",
                remove: () => this.setState({
                    priceFrom: "",
                    priceTo: "",
                    catPg: 1,
                    catMore: !1
                })
            }), t.sizes.forEach(t => yt.push({
                name: "Розмір " + String(t).split("|").pop(),
                remove: () => this.toggleIn("sizes", t)
            })), t.camo.forEach(t => yt.push({
                name: t,
                remove: () => this.toggleIn("camo", t)
            })), t.brands.forEach(t => yt.push({
                name: t,
                remove: () => this.toggleIn("brands", t)
            })), t.attrs.forEach(t => yt.push({
                name: t.split("")[1],
                remove: () => this.toggleIn("attrs", t)
            })), t.inStock && yt.push({
                name: "Лише в наявності",
                remove: () => this.setState({
                    inStock: !1,
                    catPg: 1,
                    catMore: !1
                })
            }), t.withOrder || yt.push({
                name: "Без позицій під замовлення",
                remove: () => this.setState({
                    withOrder: !0,
                    catPg: 1,
                    catMore: !1
                })
            });
            const bt = Z.find(e => e.id === t.current) || Z[0] || EMPTY_PRODUCT, wt = Object.keys(bt.stock), xt = t.size && bt.variants[t.size] ? t.size : 1 === wt.length ? wt[0] : null, Ot = xt ? this.avail(bt, xt) : null, Ct = t.cart.map((e, i) => {
                const s = Z.find(t => t.id === e.id), o = s && s.variants[e.size], a = e.availability || (o ? o.availability : "out_of_stock"), r = null != e.kitPrice ? e.kitPrice : null != e.price ? e.price : s ? s.price : 0, n = (t.cartIssues || {})[i] || "", c = !!o && !1 !== o.stockKnown && "in_stock" === a && e.qty >= o.stock;
                return {
                    photo: s?.photoData?.[0]?.thumb || s?.photos?.[0] || "",
                    hasPhoto: !!s?.photos?.length,
                    name: s ? s.name : e.name || "Товар",
                    size: this.sd(s, e.size),
                    camo: e.color || (s ? s.camo : ""),
                    qty: e.qty,
                    slot: "img-" + e.id,
                    sku: e.sku || (o ? o.sku : ""),
                    sumFmt: B(r * e.qty),
                    stockNote: (e.kit ? "У комплекті · " : "") + (s && s.v3 && o && o.availability_v3 ? (o.availability_v3 === "IN_STOCK" && o.payment_allowed ? "В наявності · строк відправки уточнимо" : o.stock_freshness === "CONFIRM" ? STORE_V3_LABEL.STOCK_CONFIRM : STORE_V3_LABEL[o.availability_v3] || "Немає в наявності") : "preorder" === a ? "Під замовлення · " + it : "in_stock" === a ? "В наявності · строк відправки уточнимо" : "Немає в наявності"),
                    stockNoteStyle: {
                        fontSize: "12.5px",
                        marginTop: "4px",
                        color: "preorder" === a ? "var(--legacy-d8be62)" : "in_stock" === a ? "var(--legacy-7eb356)" : "var(--legacy-a3ab9f)"
                    },
                    hasIssue: !!n,
                    issue: n,
                    fix: () => this.open(e.id),
                    capNote: c ? "На складі " + o.stock + " шт — це максимум для замовлення" : "",
                    inc: () => this.bumpQty(i, 1),
                    dec: () => this.bumpQty(i, -1),
                    remove: () => this.setState(t => ({
                        cart: this.saveCart(t.cart.filter((t, e) => e !== i)),
                        cartIssues: {}
                    }))
                };
            }), _t = t.cart.reduce((t, e) => {
                const i = Z.find(t => t.id === e.id);
                return t + (null != e.kitPrice ? e.kitPrice : null != e.price ? e.price : i ? i.price : 0) * e.qty;
            }, 0), zt = "РУБІЖ10" === t.promo ? Math.round(.1 * _t) : 0, At = 0, Lt = (t.cart.some(t => t.wh || t.kit && t.qty >= 5),
            ut(_t - zt)), Et = t.cityQ.trim().toLowerCase(), Pt = Et && t.cityQ !== t.city ? I.filter(([t]) => t.toLowerCase().startsWith(Et)).concat(I.filter(([t]) => !t.toLowerCase().startsWith(Et) && t.toLowerCase().includes(Et))).slice(0, 6) : t.cityQ ? [] : I.slice(0, 5), Mt = R[t.city] || R._, Tt = t.pointQ.trim().toLowerCase(), qt = Tt && t.pointQ !== t.point ? Mt.filter(([t, e]) => (t + " " + e).toLowerCase().includes(Tt)).slice(0, 6) : t.pointQ ? [] : Mt.slice(0, 6), It = /^\S+@\S+\.\S+$/.test(t.authEmail.trim()), Rt = t.cpath.length ? H(t.cpath) : null, Dt = t.sq ? "Результати за запитом «" + t.sq + "»" + (t.storeLoading ? "" : " — " + x(Number(t.storeCatalog?.total ?? at.length), "товар", "товари", "товарів")) : t.roots && t.roots.length ? t.rootsTitle : "new" === t.quick ? "Новинки" : "stock" === t.quick ? "В наявності сьогодні" : Rt ? Rt.name : "Каталог спорядження", jt = t => {
                t && t.preventDefault && t.preventDefault();
            }, Ut = [ {
                name: "Головна",
                href: "/",
                open: t => {
                    jt(t), this.go("home");
                }
            }, {
                name: "Каталог",
                href: "/catalog",
                open: t => {
                    jt(t), this.goPath([]);
                }
            } ];
            t.cpath.forEach((e, i) => {
                const s = t.cpath.slice(0, i + 1);
                Ut.push({
                    name: e,
                    href: X(s),
                    open: t => {
                        jt(t), this.goPath(s);
                    }
                });
            }), !t.cpath.length && storeGroupForRoots(t.roots) && Ut.push({
                name: t.rootsTitle || storeGroupForRoots(t.roots).title,
                href: "/rozdil/" + storeGroupForRoots(t.roots).slug,
                open: t => jt(t)
            }), t.quick && Ut.push({
                name: Dt,
                href: "new" === t.quick ? "/novynky" : "/v-naiavnosti",
                open: t => jt(t)
            }), Ut.forEach((t, e) => {
                t.sep = e > 0 ? "/" : "", t.style = {
                    color: e === Ut.length - 1 ? "var(--legacy-c7cec3)" : "var(--legacy-8a9487)",
                    textDecoration: "none",
                    textTransform: "uppercase",
                    cursor: e === Ut.length - 1 ? "default" : "pointer"
                };
            });
            const Nt = "rubizh.shop" + Ut[Ut.length - 1].href + (t.catPg > 1 ? "?page=" + t.catPg : ""), Kt = this.visibleNodes(Rt ? Rt.kids : !t.cpath.length && storeGroupForRoots(t.roots) ? K.filter(n => storeGroupForRoots(t.roots).roots.includes(n.name)).flatMap(n => n.kids?.length ? n.kids : [ n ]) : K), Ht = Rt ? this.visibleNodes(1 === t.cpath.length ? K : H(t.cpath.slice(0, -1)).kids).filter(t => t.name !== Rt.name) : [], Qt = t => ({
                path: t.path,
                name: t.name,
                n: this.nodeCount(t.path),
                count: x(this.nodeCount(t.path), "товар", "товари", "товарів"),
                href: X(t.path),
                slot: "cat-" + t.path.map(w).join("--"),
                open: e => {
                    jt(e), this.goPath(t.path);
                }
            }), Xt = Ht.slice(0, 12).map(t => Object.assign(Qt(t), {
                count: this.nodeCount(t.path)
            })), Vt = t.cpath.length ? W[t.cpath[0]] : void 0, Wt = Math.max(1, Math.ceil(at.length / 24)), Jt = Math.min(Wt, Math.max(1, t.catPg)), Gt = [];
            for (let t = 1; t <= Wt; t++) {
                const e = t === Jt;
                Gt.push({
                    label: String(t),
                    href: "?page=" + t,
                    go: e => {
                        e && e.preventDefault && e.preventDefault(), this.setState({
                            catPg: t,
                            catMore: !1
                        }), window.scrollTo(0, 0);
                    },
                    style: {
                        minWidth: "40px",
                        padding: "9px 10px",
                        textAlign: "center",
                        textDecoration: "none",
                        fontFamily: "UAH, Oswald, sans-serif",
                        fontSize: "14px",
                        border: "1px solid " + (e ? "var(--legacy-f2a33c)" : "var(--legacy-2a322b)"),
                        background: e ? "var(--legacy-f2a33c)" : "transparent",
                        color: e ? "var(--button-text)" : "var(--legacy-d3d9cf)"
                    }
                });
            }
            const $t = t.q.trim().toLowerCase(), Zt = $t ? Z.filter(t => t.storeReady && (t.name + " " + t.camo + " " + t.sku + " " + t.path.join(" ") + " " + t.desc).toLowerCase().includes($t)) : [], Yt = s.map(e => ({
                raw: e,
                id: e.id,
                date: e.date,
                items: e.items,
                ttn: e.ttn,
                status: e.status,
                total: B(e.total),
                isActive: !!this.props.packPhotos && e.step > 0 && e.step < 4 && !e.kind,
                delivery: e.delivery,
                pay: e.pay,
                open: t.openOrder === e.id,
                detailsLabel: t.openOrder === e.id ? "Згорнути" : "Деталі",
                toggle: () => this.setState(t => ({
                    openOrder: t.openOrder === e.id ? null : e.id
                })),
                repeat: () => this.setState({
                    cart: this.saveCart(e.lines.map(([t, e, i]) => ({
                        id: (Z.find(e => e.name === t) || Z[0] || EMPTY_PRODUCT).id,
                        size: e,
                        qty: i
                    })))
                }, () => this.go("cart")),
                lines: e.lines.map(([t, e, i, s]) => ({
                    name: t,
                    size: e,
                    qty: i + " шт",
                    sum: B(s)
                })),
                docs: e.docs.map(([t, e]) => ({
                    name: t,
                    meta: e
                })),
                isCancel: "cancel" === e.kind,
                isReturn: "return" === e.kind,
                offNote: "cancel" === e.kind ? "Замовлення скасовано. Стан оплати та повернення коштів уточнюйте в кабінеті." : "return" === e.kind ? "Замовлення повернено. Деталі та стан оплати уточнюйте в кабінеті." : "",
                badgeStyle: {
                    fontFamily: "UAH, Oswald, sans-serif",
                    fontSize: "12px",
                    letterSpacing: ".12em",
                    textTransform: "uppercase",
                    padding: "5px 9px",
                    whiteSpace: "nowrap",
                    flex: "0 0 auto",
                    border: "1px solid " + (e.kind ? "var(--legacy-4a2c21)" : 4 === e.step ? "var(--legacy-35502f)" : "var(--legacy-5c4a1f)"),
                    color: e.kind ? "var(--legacy-d9542b)" : 4 === e.step ? "var(--legacy-7eb356)" : "var(--legacy-d8be62)",
                    background: e.kind ? "var(--legacy-231a17)" : 4 === e.step ? "var(--legacy-17241a)" : "var(--legacy-2a2317)"
                },
                steps: e.kind ? [] : [ "Прийнято", "Комплектується", "В дорозі", "Доставлено" ].map((t, i) => ({
                    name: t,
                    barStyle: {
                        height: "4px",
                        background: i < e.step ? "var(--legacy-f2a33c)" : "var(--legacy-2a322b)"
                    },
                    labelStyle: {
                        fontSize: "11.5px",
                        marginTop: "6px",
                        color: i < e.step ? "var(--legacy-d3d9cf)" : "var(--legacy-5c6659)",
                        letterSpacing: ".02em"
                    }
                }))
            }));
            return {
                donationPercent: v,
                freeShipFmt: B(_),
                isHome: "home" === t.screen,
                isCatalog: "catalog" === t.screen,
                isProduct: "product" === t.screen,
                isCart: "cart" === t.screen,
                isAccount: "account" === t.screen,
                ...this.searchVm(t),
                top5: this.top5Vm(),
                openAllCategories: t => {
                    t && t.preventDefault && t.preventDefault(), this.goAllCats();
                },
                isSearch: "search" === t.screen,
                searchQ: t.q,
                searchResults: Zt.map(this.cardVm),
                searchCount: Zt.length,
                burger: t.burger,
                toggleBurger: () => this.setState(t => ({
                    burger: !t.burger,
                    menuOpen: !1,
                    mobSec: null
                })),
                closeBurger: () => this.setState({
                    burger: !1
                }),
                miniOpen: !!t.miniCart,
                mini: t.miniCart ? (() => {
                    const e = Z.find(e => e.id === t.miniCart.id);
                    return {
                        name: e.name,
                        // The line key is the SKU for PIM v3 models: show the size (and colour), never the key.
                        size: (v => v ? [v.size_display || (v.option_id ? "" : "Без розміру"), e.v3 && v.color].filter(Boolean).join(" · ") : t.miniCart.size)(e.variants[t.miniCart.size]),
                        priceFmt: B(e.variants[t.miniCart.size]?.price ?? e.price),
                        slot: "img-" + e.id,
                        ph: e.ph
                    };
                })() : {
                    name: "",
                    size: "",
                    priceFmt: "",
                    slot: "mini",
                    ph: ""
                },
                closeMini: () => this.setState({
                    miniCart: null
                }),
                miniToCart: () => {
                    this.setState({
                        miniCart: null
                    }), this.go("cart");
                },
                favCount: t.fav.length,
                favIds: t.fav,
                goFav: () => this.go("fav", {
                    burger: !1
                }),
                isFav: "fav" === t.screen,
                favItems: Z.filter(e => e.storeReady && t.fav.includes(e.id)).map(this.cardVm),
                favEmpty: 0 === t.fav.length,
                seenItems: storeSeenList(Z, t.seen, t.current).map(this.cardVm),
                hasSeen: storeSeenList(Z, t.seen, t.current).length > 0,
                isTrack: "track" === t.screen,
                goTrack: () => this.go("track", {
                    burger: !1
                }),
                itemReviews: T.slice(0, 2).map(([t, e, , i, s], o) => ({
                    name: t,
                    role: e,
                    text: i,
                    date: s,
                    slot: "rev-" + o
                })),
                notifyOpen: t.notify,
                notifySent: "sent" === t.notify,
                openNotify: () => this.setState({
                    notify: !0
                }),
                sendNotify: () => this.setState({
                    notify: "sent"
                }),
                isGuides: "guides" === t.screen,
                isGuide: "guide" === t.screen,
                isSizes: "sizes" === t.screen,
                goGuides: () => this.go("guides", {
                    burger: !1
                }),
                goSizes: () => this.go("sizes", {
                    burger: !1
                }),
                homeGuides: A.slice(0, 3).map(this.guideCard),
                guideTopics: [ this.chipC("Усі", A.length, "all" === t.guideTopic, () => this.setState({
                    guideTopic: "all"
                })) ].concat(z.map(e => this.chipC(e, A.filter(t => t.topic === e).length, t.guideTopic === e, () => this.setState({
                    guideTopic: e
                })))),
                guideList: A.filter(e => "all" === t.guideTopic || e.topic === t.guideTopic).map(this.guideCard),
                guidesEmpty: !A.some(e => "all" === t.guideTopic || e.topic === t.guideTopic),
                showAllGuides: () => this.setState({
                    guideTopic: "all"
                }),
                guide: (() => {
                    const e = A.find(e => e.key === t.guide) || A[0];
                    return Object.assign(this.guideCard(e), {
                        upd: "Оновлено " + e.upd,
                        url: "rubizh.shop/porady/" + w(e.title),
                        toc: e.secs.map((t, e) => ({
                            name: t.h,
                            go: () => {
                                const t = document.getElementById("gs-" + e);
                                t && window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY - 100);
                            }
                        })),
                        secs: e.secs.map((t, e) => {
                            const i = t.prod ? Z.find(e => e.id === t.prod) : null;
                            return {
                                anchor: "gs-" + e,
                                h: t.h,
                                p: t.p,
                                hasTable: !!t.table,
                                table: t.table ? this.tableVm(t.table) : this.tableVm([ [ "" ] ]),
                                hasWarn: !!t.warn,
                                warn: t.warn || "",
                                hasProd: !!i,
                                prod: i ? this.cardVm(i) : {
                                    name: "",
                                    priceFmt: "",
                                    slot: "none",
                                    ph: ""
                                }
                            };
                        }),
                        similar: A.filter(t => t.key !== e.key).sort((t, i) => (i.topic === e.topic ? 1 : 0) - (t.topic === e.topic ? 1 : 0)).slice(0, 3).map(this.guideCard)
                    });
                })(),
                sizeTabs: this.sizeTabsFor(t.sizeTab, "sizeTab"),
                sizeT: Object.assign({
                    name: L[t.sizeTab].name,
                    how: L[t.sizeTab].how
                }, this.tableVm(L[t.sizeTab].t)),
                sizeModalOpen: !!t.sizeModal,
                modalTabs: this.sizeTabsFor(t.sizeModal || "form", "sizeModal"),
                modalT: Object.assign({
                    name: L[t.sizeModal || "form"].name,
                    how: L[t.sizeModal || "form"].how
                }, this.tableVm(L[t.sizeModal || "form"].t)),
                closeSizeModal: () => this.setState({
                    sizeModal: null
                }),
                modalToSizes: () => {
                    const e = t.sizeModal || "form";
                    this.setState({
                        sizeModal: null
                    }), this.go("sizes", {
                        sizeTab: e
                    });
                },
                goDelivery: () => {
                    this.go("page", {
                        page: "delivery",
                        burger: !1
                    }), window.scrollTo(0, 0);
                },
                showDevUrl: !!this.props.showDevUrl,
                isPage: "page" === t.screen,
                pageTitle: S[t.page][0],
                pageBody: S[t.page][1].map(t => ({
                    t: t.split("{pct}").join(String(dt))
                })),
                pages: Object.keys(S).map(t => ({
                    name: S[t][0],
                    open: () => this.storeGoPage(t),
                    href: [ "offer", "privacy" ].includes(t) ? "/" + t : this.historyUrl({
                        ...this.state,
                        screen: "page",
                        page: t
                    })
                })),
                menuOpen: t.menuOpen,
                openMenu: () => {
                    this.touch || this.setState({
                        menuOpen: !0
                    });
                },
                closeMenu: () => {
                    this.touch || this.setState({
                        menuOpen: !1
                    });
                },
                onCatalogPointer: t => {
                    t && t.pointerType && "mouse" !== t.pointerType && (this.touch = !0, this.setState(t => ({
                        menuOpen: !t.menuOpen
                    })));
                },
                onCatalogClick: () => {
                    this.touch || this.setState(t => ({
                        menuOpen: !t.menuOpen
                    }));
                },
                hardCloseMenu: () => this.setState({
                    menuOpen: !1
                }),
                menuCaret: t.menuOpen ? "▴" : "▾",
                catalogNavStyle: {
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "9px 12px",
                    cursor: "pointer",
                    color: t.menuOpen ? "var(--link)" : "var(--legacy-edefea)",
                    background: t.menuOpen ? "var(--legacy-141815)" : "transparent"
                },
                goHome: () => this.go("home"),
                goCatalog: () => this.goPath([]),
                goArmor: () => this.goPath([ "Бронезахист" ]),
                catH1: Dt,
                hasCatDesc: !!t.quick || void 0 !== Vt || !t.cpath.length && !!storeGroupForRoots(t.roots)?.intro,
                catDesc: !t.cpath.length && storeGroupForRoots(t.roots)?.intro && !t.quick ? storeGroupForRoots(t.roots).intro : "new" === t.quick ? "Товари, додані за останні 14 днів." : "stock" === t.quick ? "Лише те, що є на складі зараз. Відправимо сьогодні, якщо замовите до 17:00." : void 0 !== Vt ? O[Vt].desc : "",
                catCrumbs: Ut,
                pageUrl: Nt,
                hasSubTiles: Kt.length > 0,
                subTiles: Kt.map(Qt),
                pagesList: Gt,
                pageInfo: "Сторінка " + Jt + " з " + Wt,
                hasPages: Wt > 1,
                prevPg: t => {
                    t && t.preventDefault && t.preventDefault(), Jt > 1 && (this.setState({
                        catPg: Jt - 1,
                        catMore: !1
                    }), window.scrollTo(0, 0));
                },
                nextPg: t => {
                    t && t.preventDefault && t.preventDefault(), Jt < Wt && (this.setState({
                        catPg: Jt + 1,
                        catMore: !1
                    }), window.scrollTo(0, 0));
                },
                prevHref: "?page=" + Math.max(1, Jt - 1),
                nextHref: "?page=" + Math.min(Wt, Jt + 1),
                moreLabel: "Показати ще 24",
                showMore: t => {
                    t && t.preventDefault && t.preventDefault(), Jt < Wt && this.setState({
                        catPg: Jt + 1,
                        catMore: !0
                    });
                },
                hasSeo: void 0 !== Vt,
                seoBlocks: void 0 !== Vt ? O[Vt].text.map(([t, e]) => ({
                    h: t,
                    p: e
                })) : [],
                seoGuides: void 0 !== Vt ? O[Vt].guides.map(([t, e]) => ({
                    name: t,
                    href: e,
                    open: t => {
                        t && t.preventDefault && t.preventDefault(), this.go("guides");
                    }
                })) : [],
                seoOpen: t.seoOpen,
                seoLabel: t.seoOpen ? "Згорнути" : "Читати далі",
                toggleSeo: () => this.setState(t => ({
                    seoOpen: !t.seoOpen
                })),
                seoTitle: Rt ? Rt.name + ": як обрати" : "",
                similar: Xt,
                hasSimilar: Xt.length > 0,
                goCart: () => this.go("cart"),
                goAccount: () => window.location.assign("/auth/"),
                isLogin: "login" === t.screen,
                authed: t.authed,
                guest: !t.authed,
                authForm: "form" === t.authStep,
                authSent: "sent" === t.authStep,
                authConfirm: "confirm" === t.authStep,
                authExpired: "expired" === t.authStep,
                authError: "error" === t.authStep,
                authEmail: t.authEmail,
                authEmailShown: t.authEmail.trim() || "",
                onAuthEmail: t => this.setState({
                    authEmail: t.target.value
                }),
                authEmailOk: It,
                requestLink: () => window.location.assign("/auth/"),
                requestStyle: {
                    padding: "15px",
                    textAlign: "center",
                    fontFamily: "UAH, Oswald, sans-serif",
                    fontSize: "15px",
                    letterSpacing: ".1em",
                    textTransform: "uppercase",
                    fontWeight: 600,
                    cursor: It ? "pointer" : "default",
                    background: It ? "var(--legacy-f2a33c)" : "var(--legacy-2a322b)",
                    color: It ? "var(--button-text)" : "var(--legacy-8a9487)"
                },
                googleLogin: () => window.location.assign("/auth/"),
                resendLink: () => window.location.assign("/auth/"),
                resendLabel: t.cooldown > 0 ? "Надіслати нове посилання · 0:" + String(t.cooldown).padStart(2, "0") : "Надіслати нове посилання",
                resendStyle: {
                    padding: "14px",
                    textAlign: "center",
                    fontFamily: "UAH, Oswald, sans-serif",
                    fontSize: "14px",
                    letterSpacing: ".1em",
                    textTransform: "uppercase",
                    cursor: t.cooldown > 0 ? "default" : "pointer",
                    border: "1px solid " + (t.cooldown > 0 ? "var(--legacy-2a322b)" : "var(--legacy-f2a33c)"),
                    color: t.cooldown > 0 ? "var(--legacy-8a9487)" : "var(--link)"
                },
                openMail: () => this.setState({
                    authStep: "confirm"
                }),
                confirmLogin: () => window.location.assign("/auth/"),
                backToForm: () => this.setState({
                    authStep: "form"
                }),
                newLinkFromExpired: () => {
                    this.setState({
                        authStep: "form"
                    });
                },
                authDemo: [ [ "form", "Вхід" ], [ "sent", "Лист надіслано" ], [ "confirm", "Підтвердження" ], [ "expired", "Посилання недійсне" ], [ "error", "Помилка відправки" ] ].map(([e, i]) => ({
                    name: i,
                    pick: () => {
                        this.setState({
                            authStep: e
                        }), "sent" === e && this.startCooldown();
                    },
                    style: {
                        padding: "7px 11px",
                        cursor: "pointer",
                        fontSize: "12.5px",
                        fontFamily: "UAH, Oswald, sans-serif",
                        letterSpacing: ".06em",
                        border: "1px solid " + (t.authStep === e ? "var(--legacy-f2a33c)" : "var(--legacy-2a322b)"),
                        color: t.authStep === e ? "var(--link)" : "var(--legacy-99a398)"
                    }
                })),
                openOffer: () => this.go("page", {
                    page: "offer"
                }),
                openPrivacy: () => this.go("page", {
                    page: "privacy"
                }),
                linkedNotice: t.linkedNotice,
                closeLinked: () => this.setState({
                    linkedNotice: !1
                }),
                sessionsList: m.map((t, e) => ({
                    i: e,
                    dev: t[0],
                    city: t[1],
                    last: t[2],
                    current: t[3]
                })).filter(e => t.sessions.includes(e.i)).map(t => ({
                    dev: t.dev,
                    city: t.city,
                    last: t.last,
                    current: t.current,
                    other: !t.current,
                    end: () => this.setState(e => ({
                        sessions: e.sessions.filter(e => e !== t.i)
                    }))
                })),
                hasOtherSessions: t.sessions.length > 1,
                sessionsCount: t.sessions.length,
                endOthers: () => this.setState({
                    sessions: [ 0 ]
                }),
                emailNew: t.emailNew,
                onEmailNew: t => this.setState({
                    emailNew: t.target.value,
                    emailChangeSent: !1
                }),
                emailChangeSent: t.emailChangeSent,
                confirmEmailChange: () => {
                    /^\S+@\S+\.\S+$/.test(t.emailNew.trim()) && this.setState({
                        emailChangeSent: !0
                    });
                },
                trackNum: t.trackNum,
                trackDigits: t.trackDigits,
                onTrackNum: t => this.setState({
                    trackNum: t.target.value,
                    trackShown: !1,
                    trackErr: !1
                }),
                onTrackDigits: t => this.setState({
                    trackDigits: t.target.value.replace(/\D/g, "").slice(0, 4),
                    trackShown: !1,
                    trackErr: !1
                }),
                trackCheck: () => {
                    window.location.assign("/auth/?tab=orders");return;
                    t.trackNum.trim() && 4 === t.trackDigits.length && this.setState({
                        trackShown: "4182" === t.trackDigits,
                        trackErr: "4182" !== t.trackDigits
                    });
                },
                trackShown: t.trackShown,
                trackErr: t.trackErr,
                activeLines: (s.find(t => 3 === t.step) || s[0] || {lines:[]}).lines.map(([t, e, i]) => ({
                    name: t,
                    size: e,
                    qty: i + " шт"
                })),
                logout: () => window.location.assign("/auth/"),
                accLabel: t.authed ? "Кабінет" : "Увійти",
                goB2B: () => {
                    this.go("home"), setTimeout(() => {
                        const t = document.getElementById("b2b");
                        t && window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY - 90);
                    }, 60);
                },
                categories: G.map(t => Object.assign({}, t, {
                    name: J[t.key][1],
                    slot: "cat-" + t.key,
                    open: () => this.goPath(J[t.key][0])
                })),
                topProducts: Z.filter(t => t.storeReady && t.top).map(this.cardVm),
                products: at.slice(t.catMore ? 0 : 24 * (Jt - 1), 24 * Jt).map(this.cardVm),
                resultCount: at.length,
                noResults: 0 === at.length && !(et && !et.items.length),
                notSq: !t.sq,
                ...(() => {
                    if (!et) return {
                        sqZero: !1,
                        sqSimilarShow: !1,
                        sqSimilar: [],
                        hasSqTry: !1,
                        sqTry: "",
                        sqTryGo: null,
                        sqZeroText: ""
                    };
                    const e = 0 === et.items.length;
                    let i = null;
                    e && et.words.length > 1 && et.words.forEach(t => {
                        const e = Bt(t).items.length;
                        e && (!i || e > i.n) && (i = {
                            w: t,
                            n: e
                        });
                    });
                    const s = [];
                    return at.length > 0 && at.length < 5 && et.words.forEach(t => Bt(t).items.forEach(t => {
                        st.has(t.id) || s.includes(t) || s.push(t);
                    })), {
                        sqZero: e,
                        sqZeroText: "Нічого не знайшли за запитом «" + t.sq + "»",
                        hasSqTry: !!i,
                        sqTry: i ? "Спробуйте «" + i.w + "» замість «" + t.sq + "»" : "",
                        sqTryGo: () => {
                            i && this.doSearch(i.w);
                        },
                        sqSimilarShow: s.length > 0,
                        sqSimilar: s.slice(0, 8).map(this.cardVm)
                    };
                })(),
                catFilters: (t.cpath.length ? [ this.opt("← " + (t.cpath.length > 1 ? t.cpath[t.cpath.length - 2] : "Усі розділи"), "", !1, () => this.setState(t => ({
                    cpath: t.cpath.slice(0, -1),
                    attrs: [],
                    catPg: 1,
                    catMore: !1
                }))) ] : []).concat(Kt.map(t => this.opt(t.name, nt("cat", e => V(e, t.path)), !1, () => this.setState({
                    cpath: t.path.slice(),
                    attrs: [],
                    catPg: 1,
                    catMore: !1
                })))),
                camoFilters: $.map(e => this.chipC(e, nt("camo", t => t.camo === e), t.camo.includes(e), () => this.toggleIn("camo", e))),
                sizeGroups: pt,
                hasSizeFilters: pt.length > 0,
                brandFilters: kt.map(e => this.opt(e, nt("brand", t => F(t) === e), t.brands.includes(e), () => this.toggleIn("brands", e))),
                priceFrom: t.priceFrom,
                priceTo: t.priceTo,
                onPriceFrom: t => this.setState({
                    priceFrom: t.target.value.replace(/\D/g, ""),
                    catPg: 1,
                    catMore: !1
                }),
                onPriceTo: t => this.setState({
                    priceTo: t.target.value.replace(/\D/g, ""),
                    catPg: 1,
                    catMore: !1
                }),
                hasPriceFilter: !0,
                pricePhFrom: "від",
                pricePhTo: "до",
                hasPriceSlider: !1,
                priceRanges: [ [ "до 1 000", "", "1000" ], [ "1 000–3 000", "1000", "3000" ], [ "3 000–6 000", "3000", "6000" ], [ "понад 6 000", "6000", "" ] ].map(([e, i, s]) => this.chipC(e, nt("price", t => (!i || t.price >= +i) && (!s || t.price <= +s)), t.priceFrom === i && t.priceTo === s, () => this.setState(t => t.priceFrom === i && t.priceTo === s ? {
                    priceFrom: "",
                    priceTo: "",
                    catPg: 1,
                    catMore: !1
                } : {
                    priceFrom: i,
                    priceTo: s,
                    catPg: 1,
                    catMore: !1
                }))),
                attrGroups: tt.map(e => ({
                    title: e,
                    options: Object.keys(Y[e]).slice(0, 6).map(i => this.opt(i, nt("attr:" + e, t => t.specs.some(t => t[0] === e && t[1] === i)), t.attrs.includes(e + "" + i), () => this.toggleIn("attrs", e + "" + i)))
                })),
                hasAttrGroups: tt.length > 0,
                availFilters: [ this.opt("Лише в наявності", nt("avail", D), t.inStock, () => this.setState(t => ({
                    inStock: !t.inStock,
                    catPg: 1,
                    catMore: !1
                }))), this.opt("Включно з позиціями під замовлення", nt("avail", t => !0), t.withOrder, () => this.setState(t => ({
                    withOrder: !t.withOrder,
                    catPg: 1,
                    catMore: !1
                }))) ],
                moreFiltersOpen: !!t.fold.more || t.camo.length > 0 || t.attrs.length > 0,
                moreFiltersLabel: t.fold.more || t.camo.length > 0 || t.attrs.length > 0 ? "Згорнути характеристики" : "Інші характеристики",
                toggleMoreFilters: () => this.setState(t => ({
                    fold: Object.assign({}, t.fold, {
                        more: !(t.fold.more || t.camo.length > 0 || t.attrs.length > 0)
                    })
                })),
                fold: [ "cat", "price", "size", "camo", "brand", "attr", "avail" ].reduce((e, i) => {
                    const s = !t.fold[i];
                    return e[i] = {
                        open: s,
                        mark: s ? "−" : "+",
                        toggle: () => this.setState(t => ({
                            fold: Object.assign({}, t.fold, {
                                [i]: !t.fold[i]
                            })
                        }))
                    }, e;
                }, {}),
                activeChips: yt,
                hasActive: yt.length > 0,
                activeCount: yt.length,
                filtersLabel: yt.length ? "Фільтри (" + yt.length + ")" : "Фільтри",
                sheetOpen: t.sheet ? "1" : "0",
                sheetShown: t.sheet,
                openSheet: () => this.setState({
                    sheet: !0,
                    sortSheet: !1,
                    fold: {
                        price: !0,
                        size: !0,
                        camo: !0,
                        brand: !0,
                        attr: !0,
                        avail: !0
                    }
                }),
                closeSheet: () => this.setState({
                    sheet: !1,
                    fold: {}
                }),
                sortSheet: t.sortSheet,
                toggleSortSheet: () => this.setState(t => ({
                    sortSheet: !t.sortSheet,
                    sheet: !1
                })),
                showLabel: "Показати " + x(at.length, "товар", "товари", "товарів"),
                resetFilters: () => this.setState({
                    cats: [],
                    camo: [],
                    sizes: [],
                    brands: [],
                    attrs: [],
                    priceFrom: "",
                    priceTo: "",
                    inStock: !1,
                    withOrder: !0,
                    catPg: 1,
                    catMore: !1
                }),
                sorts: (t.sq ? [ [ "rel", "За релевантністю" ] ] : []).concat([ [ "pop", "Популярні" ], [ "cheap", "Дешевші спочатку" ], [ "exp", "Дорожчі спочатку" ], [ "new", "Новинки" ], [ "stock", "Спочатку в наявності" ] ]).map(([e, i]) => ({
                    name: i,
                    pick: () => this.setState({
                        sort: e,
                        sortSheet: !1,
                        catPg: 1,
                        catMore: !1
                    }),
                    style: {
                        whiteSpace: "nowrap",
                        padding: "7px 11px",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontFamily: "UAH, Oswald, sans-serif",
                        letterSpacing: ".06em",
                        border: "1px solid " + (t.sort === e ? "var(--legacy-f2a33c)" : "var(--legacy-2a322b)"),
                        color: t.sort === e ? "var(--link)" : "var(--legacy-d3d9cf)"
                    }
                })),
                item: Object.assign({}, this.cardVm(bt), {
                    crumbs: bt.path.map((t, e) => ({
                        name: t,
                        sep: "/",
                        href: X(bt.path.slice(0, e + 1)),
                        open: t => {
                            t && t.preventDefault && t.preventDefault(), this.goPath(bt.path.slice(0, e + 1));
                        }
                    })),
                    catUp: (bt.path.length ? bt.path[bt.path.length - 1] : ht[bt.cat]).toUpperCase(),
                    nameUp: bt.name.toUpperCase(),
                    sku: xt ? bt.variants[xt].sku : Object.keys(bt.variants || {}).length === 1 ? Object.values(bt.variants)[0].sku : bt.sku,
                    skuTitle: xt || Object.keys(bt.variants || {}).length === 1 ? "Артикул" : "Код моделі",
                    skuShort: xt || Object.keys(bt.variants || {}).length === 1 ? "Арт." : "Код моделі",
                    desc: bt.desc,
                    installment: B(bt.price / 4),
                    slot2: "img-" + bt.id + "-b",
                    slot3: "img-" + bt.id + "-c",
                    slot4: "img-" + bt.id + "-d",
                    slot5: "img-" + bt.id + "-e",
                    specs: bt.specs.map(([t, e]) => ({
                        k: t,
                        v: e
                    })),
                    brand: bt.brand || "Не вказано",
                    made: bt.made || "Україна",
                    shipDate: xt && "on_order" === this.avail(bt, xt) ? "орієнтовно " + it : xt && "out" === this.avail(bt, xt) ? "немає в наявності" : bt.ship || "сьогодні до 17:00",
                    warranty: bt.warranty || "12 міс",
                    related: (() => {
                        const t = Z.filter(t => t.storeReady && t.cat === bt.cat && t.id !== bt.id), e = Z.filter(t => t.storeReady && t.cat !== bt.cat && t.id !== bt.id && !t.preorder);
                        if ("Бронезахист" === bt.path[0] || "Шоломи та захист голови" === bt.path[0]) {
                            const i = this.medInStock().filter(t => "p5" === t.id || "p23" === t.id).sort((t, e) => "p5" === t.id ? -1 : 1)[0];
                            if (i) return [ i ].concat(t.concat(e).filter(t => t.id !== i.id)).slice(0, 3).map(this.cardVm);
                        }
                        return t.concat(e).slice(0, 3).map(this.cardVm);
                    })(),
                    preorder: !!bt.preorder,
                    medNote: "Бронезахист" !== bt.path[0] && "Шоломи та захист голови" !== bt.path[0] || !this.medInStock().some(t => "p5" === t.id || "p23" === t.id) ? "" : /Шоломи/.test(bt.path[0]) ? "До шолома варто взяти аптечку зі швидким скидом: вона кріпиться на MOLLE плитоноски чи пояса" : "До плитоноски варто взяти аптечку зі швидким скидом: вона кріпиться на той самий MOLLE",
                    url: "rubizh.shop/p/" + bt.sku.toLowerCase() + "-" + w(bt.name),
                    soldOut: this.allOut(bt) || !!xt && "out" === this.avail(bt, xt),
                    canBuy: !(this.allOut(bt) || xt && "out" === this.avail(bt, xt)),
                    favMark: t.fav.includes(bt.id) ? "♥ В обраному" : "♡ В обране",
                    toggleFav: () => this.toggleFav(bt.id),
                    sizes: wt.map(t => {
                        const e = bt.stock[t] || 0, i = this.avail(bt, t), s = "out" === i, o = "on_order" === i, a = xt === t;
                        return {
                            variantKey: t,
                            label: this.sd(bt, t),
                            pressed: String(a),
                            qtyLabel: o ? it : s ? "немає" : e <= 3 ? e + " шт" : "",
                            pick: () => this.setState({
                                size: t,
                                notify: !1,
                                addErr: ""
                            }),
                            style: {
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "2px",
                                padding: "9px 14px",
                                minWidth: "64px",
                                minHeight: "48px",
                                cursor: "pointer",
                                fontFamily: "UAH, Oswald, sans-serif",
                                fontSize: "16px",
                                border: "1px " + (o && !a ? "dashed var(--legacy-4e4524)" : "solid " + (a ? "var(--legacy-f2a33c)" : "var(--legacy-2a322b)")),
                                background: a ? s ? "var(--legacy-231a17)" : "var(--legacy-f2a33c)" : "var(--legacy-0f120f)",
                                color: s ? "var(--legacy-5c6659)" : a ? "var(--button-text)" : o ? "var(--legacy-d8be62)" : "var(--legacy-edefea)",
                                textDecoration: s ? "line-through" : "none"
                            },
                            qtyStyle: {
                                fontFamily: "IBM Plex Sans, sans-serif",
                                fontSize: "10.5px",
                                color: a ? "var(--legacy-4a3a18)" : o ? "var(--legacy-d8be62)" : s ? "var(--legacy-8a9487)" : "var(--legacy-7eb356)",
                                letterSpacing: ".02em",
                                textDecoration: "none"
                            }
                        };
                    })
                }),
                qty: t.qty,
                incQty: () => this.setState(t => ({
                    qty: t.qty + 1
                })),
                decQty: () => this.setState(t => ({
                    qty: Math.max(1, t.qty - 1)
                })),
                addLabel: t.added && xt && t.added === bt.id + "|" + xt ? "✓ Додано" : xt ? "on_order" === Ot ? "Замовити · 1–3 дні · " + B(bt.price * t.qty) : "out" === Ot ? "Немає в наявності" : "Додати в кошик · " + B(bt.price * t.qty) : "Оберіть розмір",
                buyOn: "out" !== Ot && !this.allOut(bt),
                buyOff: "out" === Ot || this.allOut(bt),
                showPreWarn: xt ? "on_order" === Ot : this.allPre(bt),
                preWarnText: "Товар доступний під замовлення. Перед оформленням рекомендуємо уточнити актуальну наявність та термін відправки у менеджера.",
                sizeNote: t.addErr ? t.addErr : xt ? {
                    in_stock: "Наявність за даними постачальника · підтвердить менеджер",
                    on_order: "Під замовлення · Орієнтовна відправка протягом 1–3 днів",
                    out: "Немає в наявності"
                }[Ot] : "",
                sizeNoteStyle: {
                    fontSize: "13px",
                    marginBottom: "14px",
                    color: t.addErr ? "var(--legacy-d9542b)" : xt ? {
                        in_stock: "var(--legacy-7eb356)",
                        on_order: "var(--legacy-d8be62)",
                        out: "var(--legacy-a3ab9f)"
                    }[Ot] : "var(--legacy-99a398)"
                },
                gal: {
                    counter: t.galIdx + 1 + " / 8",
                    dots: [ 0, 1, 2, 3, 4, 5, 6, 7 ].map(e => ({
                        style: {
                            width: e === t.galIdx ? "18px" : "6px",
                            height: "6px",
                            borderRadius: "3px",
                            background: e === t.galIdx ? "var(--legacy-edefea)" : "rgba(237,239,234,.45)",
                            transition: "width .15s"
                        }
                    })),
                    onScroll: t => {
                        const e = t.currentTarget, i = Math.round(e.scrollLeft / Math.max(1, e.clientWidth));
                        i !== this.state.galIdx && this.setState({
                            galIdx: i
                        });
                    },
                    prev: () => this.galTo(Math.max(0, t.galIdx - 1)),
                    next: () => this.galTo(Math.min(7, t.galIdx + 1)),
                    slides: [ "", "-b", "-c", "-d", "-e", "-f", "-g", "-h" ].map((t, e) => ({
                        slot: "img-" + bt.id + t,
                        ph: 0 === e ? bt.ph : 4 === e ? "На бійці" : "Деталь " + (e + 1)
                    })),
                    thumbs: [ "", "-b", "-c", "-d", "-e", "-f", "-g", "-h" ].map((e, i) => ({
                        slot: "img-" + bt.id + e,
                        pick: () => this.galTo(i),
                        style: {
                            position: "relative",
                            width: "72px",
                            height: "72px",
                            flex: "0 0 auto",
                            overflow: "hidden",
                            cursor: "pointer",
                            background: "var(--legacy-0f120f)",
                            border: "1px solid " + (t.galIdx === i ? "var(--legacy-f2a33c)" : "var(--legacy-2a322b)")
                        }
                    }))
                },
                zoomMove: t => {
                    if (!window.matchMedia("(hover: hover)").matches) return;
                    const e = t.currentTarget, i = e.firstElementChild, s = e.getBoundingClientRect();
                    i.style.transformOrigin = (t.clientX - s.left) / s.width * 100 + "% " + (t.clientY - s.top) / s.height * 100 + "%",
                    i.style.transform = "scale(1.8)";
                },
                zoomOut: t => {
                    t.currentTarget.firstElementChild.style.transform = "";
                },
                specsShown: this.specsOf(bt).slice(0, t.specsOpen ? 99 : 8).map(([t, e]) => ({
                    k: t,
                    v: e
                })),
                specsMore: this.specsOf(bt).length > 8,
                specsLabel: t.specsOpen ? "Згорнути" : "Показати всі · " + this.specsOf(bt).length,
                toggleSpecs: () => this.setState(t => ({
                    specsOpen: !t.specsOpen
                })),
                itemWeight: (this.specsOf(bt).find(([t]) => t.startsWith("Вага")) || [ null, "" ])[1],
                hasWeight: this.specsOf(bt).some(([t]) => t.startsWith("Вага")),
                copyLabel: t.copied ? "✓ Скопійовано" : "⧉ Копіювати",
                copySku: () => {
                    try {
                        navigator.clipboard.writeText(xt ? bt.variants[xt].sku : bt.sku);
                    } catch (t) {}
                    this.setState({
                        copied: !0
                    }), clearTimeout(this._ct), this._ct = setTimeout(() => this.setState({
                        copied: !1
                    }), 1600);
                },
                cmpLabel: t.compare.includes(bt.id) ? "✓ У порівнянні" : "⇄ Порівняти",
                toggleCmpItem: () => this.toggleCompare(bt.id),
                mobSizeLabel: xt ? "Розмір " + this.sd(bt, xt) + " · " + {
                    in_stock: "в наявності",
                    on_order: "під замовлення " + it,
                    out: "немає"
                }[Ot] : "Оберіть розмір",
                mobBuyLabel: t.added && xt && t.added === bt.id + "|" + xt ? "✓ Додано" : xt ? "out" === Ot ? "Немає в наявності" : "В кошик" : "Оберіть розмір",
                mobBuy: () => {
                    if (xt && "out" !== Ot) this.add(bt.id, xt, t.qty); else {
                        xt || this.setState({
                            addErr: "Оберіть розмір"
                        });
                        const t = document.querySelector("[data-size-row]");
                        t && window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY - (parseFloat(document.documentElement.style.getPropertyValue("--rubizh-header-height")) || 110) - 16);
                    }
                },
                loading: t.loading,
                loadingAttr: t.loading ? "1" : "0",
                cmpCount: t.compare.length,
                hasCmp: t.compare.length > 0 && "compare" !== t.screen,
                cmpPillLabel: "Порівняння · " + t.compare.length + " →",
                goCompare: () => this.go("compare"),
                isCompare: "compare" === t.screen,
                cmpEmpty: 0 === t.compare.length,
                cmpDiffLabel: t.cmpDiff ? "✓ Лише відмінності" : "Лише відмінності",
                toggleCmpDiff: () => this.setState(t => ({
                    cmpDiff: !t.cmpDiff
                })),
                clearCompare: () => this.setState({
                    compare: (localStorage.removeItem('rubizh.compare'),[])
                }),
                cmp: (() => {
                    const e = t.compare.map(t => Z.find(e => e.id === t)).filter(Boolean), i = e.length, s = [ "Ціна", "Наявність", "Камуфляж" ];
                    e.forEach(t => this.specsOf(t).forEach(([t]) => {
                        s.includes(t) || s.push(t);
                    }));
                    const o = (t, e) => "Ціна" === e ? B(t.price) : "Наявність" === e ? this.stockVm(t).stockLabel : "Камуфляж" === e ? t.camo : (this.specsOf(t).find(t => t[0] === e) || [ 0, "—" ])[1], a = [];
                    return s.forEach(i => {
                        const s = e.map(t => o(t, i)), r = new Set(s).size > 1;
                        t.cmpDiff && !r || (a.push({
                            t: i,
                            style: {
                                padding: "11px 12px",
                                borderTop: "1px solid var(--legacy-1e241f)",
                                color: r ? "var(--link)" : "var(--legacy-99a398)",
                                fontSize: "13px",
                                background: r ? "var(--legacy-1b1a14)" : "transparent",
                                position: "sticky",
                                left: 0,
                                zIndex: 1,
                                backgroundColor: r ? "var(--legacy-1b1a14)" : "var(--legacy-141815)"
                            }
                        }), s.forEach(t => a.push({
                            t: t,
                            style: {
                                padding: "11px 12px",
                                borderTop: "1px solid var(--legacy-1e241f)",
                                color: "var(--legacy-edefea)",
                                fontSize: "13.5px",
                                background: r ? "var(--legacy-1b1a14)" : "transparent"
                            }
                        })));
                    }), {
                        gridStyle: {
                            display: "grid",
                            gridTemplateColumns: "150px repeat(" + Math.max(1, i) + ", minmax(170px, 1fr))",
                            minWidth: 150 + 170 * Math.max(1, i) + "px"
                        },
                        heads: e.map(t => Object.assign(this.cardVm(t), {
                            remove: () => this.toggleCompare(t.id)
                        })),
                        cells: a
                    };
                })(),
                qvOpen: !!t.qv,
                qvP: (() => {
                    const e = Z.find(e => e.id === t.qv) || Z[0] || EMPTY_PRODUCT, i = Object.keys(e.stock), s = t.qvSize && "out" !== this.avail(e, t.qvSize) ? t.qvSize : 1 === i.length && "out" !== this.avail(e, i[0]) ? i[0] : null, o = s ? this.avail(e, s) : null;
                    return Object.assign(this.cardVm(e), {
                        desc: e.desc,
                        sizes: i.map(t => {
                            const i = this.avail(e, t), o = s === t;
                            return {
                                z: this.sd(e, t),
                                pick: () => {
                                    "out" !== i && this.setState({
                                        qvSize: t,
                                        addErr: ""
                                    });
                                },
                                style: {
                                    minWidth: "52px",
                                    padding: "9px 10px",
                                    textAlign: "center",
                                    fontFamily: "UAH, Oswald, sans-serif",
                                    fontSize: "14.5px",
                                    cursor: "out" === i ? "not-allowed" : "pointer",
                                    opacity: "out" === i ? .4 : 1,
                                    textDecoration: "out" === i ? "line-through" : "none",
                                    border: "1px solid " + (o ? "var(--legacy-f2a33c)" : "on_order" === i ? "var(--legacy-4e4524)" : "var(--legacy-2a322b)"),
                                    background: o ? "var(--legacy-f2a33c)" : "var(--legacy-0f120f)",
                                    color: o ? "var(--button-text)" : "var(--legacy-edefea)"
                                }
                            };
                        }),
                        addLabel: s ? "on_order" === o ? "Замовити · 1–3 дні · розмір " + this.sd(e, s) : "В кошик · розмір " + this.sd(e, s) : "Оберіть розмір",
                        note: t.addErr ? t.addErr : s ? "on_order" === o ? "Під замовлення · 1–3 дні. Перед оформленням рекомендуємо уточнити наявність у менеджера." : "В наявності · строк відправки уточнимо" : "Оберіть розмір, щоб додати в кошик",
                        noteStyle: {
                            fontSize: "13px",
                            lineHeight: "1.5",
                            color: t.addErr ? "var(--legacy-d9542b)" : "on_order" === o ? "var(--legacy-d8be62)" : "in_stock" === o ? "var(--legacy-7eb356)" : "var(--legacy-99a398)"
                        },
                        addQ: () => {
                            s ? this.add(e.id, s, 1) && this.setState({
                                qv: null
                            }) : this.setState({
                                addErr: "Оберіть розмір"
                            });
                        },
                        more: () => {
                            this.setState({
                                qv: null
                            }), this.open(e.id);
                        }
                    });
                })(),
                closeQv: () => this.setState({
                    qv: null
                }),
                addCurrent: () => {
                    if (!xt) {
                        this.setState({
                            addErr: "Оберіть розмір"
                        });
                        const t = document.querySelector("[data-size-row]");
                        return void (t && window.scrollTo(0, t.getBoundingClientRect().top + window.scrollY - 110));
                    }
                    "out" !== Ot && this.add(bt.id, xt, t.qty);
                },
                oneClick: () => {
                    xt ? "out" !== Ot && this.add(bt.id, xt, t.qty) && this.go("cart") : this.setState({
                        addErr: "Оберіть розмір"
                    });
                },
                preorderNote: !1,
                sizeGridOpen: t.sizeGrid,
                toggleSizeGrid: () => this.setState({
                    sizeModal: rt[bt.size_scale].chart || "form"
                }),
                sizeHead: rt[bt.size_scale].card,
                hasChart: !!rt[bt.size_scale].chart,
                sizeButtons: wt.length > 1,
                sizeOneRow: 1 === wt.length,
                sizeOneText: 1 === wt.length ? /Один розмір/.test(wt[0]) ? "Один розмір" : rt[bt.size_scale].card + ": " + this.sd(bt, wt[0]) : "",
                nativeHint: xt && bt.variants[xt] && [ "clothing_letter", "armor_letter" ].includes(bt.size_scale) && bt.variants[xt].size_native !== bt.variants[xt].size_display ? "виробник маркує як " + bt.variants[xt].size_native : "",
                sizeGrid: [ [ "S", "164–170", "92–96", "76–80" ], [ "M", "170–176", "96–100", "80–86" ], [ "L", "176–182", "100–106", "86–92" ], [ "XL", "182–188", "106–112", "92–98" ], [ "XXL", "188–194", "112–120", "98–106" ] ].map(([t, e, i, s]) => ({
                    s: t,
                    h: e,
                    c: i,
                    w: s
                })),
                cartLines: Ct,
                cartEmpty: 0 === Ct.length,
                hasOnOrder: t.cart.some(t => {
                    const e = Z.find(e => e.id === t.id);
                    return e && "on_order" === this.avail(e, t.size);
                }),
                cartCount: t.cart.reduce((t, e) => t + e.qty, 0),
                subtotalFmt: B(_t),
                shippingFmt: 0 === At ? "Безкоштовно" : B(At),
                donationFmt: B(Lt),
                totalFmt: B(_t - zt + At),
                needsBranch: !0,
                cityQ: t.cityQ,
                cityOpen: t.cityOpen && Pt.length > 0,
                onCityInput: t => this.setState({
                    cityQ: t.target.value,
                    cityOpen: !0,
                    city: "",
                    point: "",
                    pointQ: ""
                }),
                onCityFocus: () => this.setState({
                    cityOpen: !0
                }),
                cityMatches: Pt.map(([e, i]) => ({
                    name: e,
                    note: i,
                    hl: t.cityQ.slice(0, e.length).toLowerCase() === e.slice(0, t.cityQ.length).toLowerCase() ? e.slice(0, t.cityQ.length) : "",
                    rest: e.slice(t.cityQ.length),
                    pick: () => this.setState({
                        city: e,
                        cityQ: e,
                        cityOpen: !1,
                        pointOpen: !0,
                        point: "",
                        pointQ: ""
                    })
                })),
                cityChosen: !!t.city,
                clearCity: () => this.setState({
                    city: "",
                    cityQ: "",
                    point: "",
                    pointQ: "",
                    cityOpen: !1,
                    pointOpen: !1
                }),
                pointQ: t.pointQ,
                pointOpen: t.pointOpen && !!t.city && qt.length > 0,
                pointPlaceholder: t.city ? "Відділення або поштомат у " + t.city : "Спочатку виберіть місто",
                pointDisabled: !t.city,
                pointStyle: {
                    width: "100%",
                    background: t.city ? "var(--legacy-0f120f)" : "var(--legacy-0c0e0c)",
                    border: "1px solid var(--legacy-2a322b)",
                    padding: "13px",
                    color: t.city ? "var(--legacy-edefea)" : "var(--legacy-5c6659)",
                    outline: "none",
                    fontSize: "14px",
                    fontFamily: "IBM Plex Sans, sans-serif"
                },
                onPointInput: t => this.setState({
                    pointQ: t.target.value,
                    pointOpen: !0,
                    point: ""
                }),
                onPointFocus: () => {
                    t.city && this.setState({
                        pointOpen: !0
                    });
                },
                pointMatches: qt.map(([t, e]) => ({
                    name: t,
                    note: e,
                    pick: () => this.setState({
                        point: t,
                        pointQ: t,
                        pointOpen: !1
                    })
                })),
                deliverySummary: t.city && t.point ? t.point + " · " + t.city : "",
                deliveryOptions: [ {
                    k: "np",
                    name: "Нова Пошта — відділення",
                    note: "1–2 дні, будь-яке місто",
                    price: "За тарифом НП"
                }, {
                    k: "courier",
                    name: "Кур’єр Нової Пошти",
                    note: "До дверей, 1–2 дні",
                    price: "За тарифом НП"
                }, {
                    k: "box",
                    name: "Поштомат Нової Пошти",
                    note: "Забрати будь-коли, 24/7",
                    price: "За тарифом НП"
                } ].map(e => ({
                    name: e.name,
                    note: e.note,
                    price: e.price,
                    pick: () => this.setState({
                        delivery: e.k,
                        storeQuote: null,
                        checkoutError: "",
                        checkoutDirty: !0
                    }),
                    style: this.radio(t.delivery === e.k),
                    dotStyle: this.dot(t.delivery === e.k)
                })),
                payOptions: [ {
                    k: "card",
                    name: "Карта онлайн",
                    note: "Visa / Mastercard, Apple Pay"
                }, {
                    k: "invoice",
                    name: "Рахунок на підрозділ",
                    note: "Безготівкова оплата, документи в день заявки"
                } ].map(e => ({
                    name: e.name,
                    note: e.note,
                    pick: () => this.setState({
                        pay: e.k
                    }),
                    style: this.radio(t.pay === e.k),
                    dotStyle: this.dot(t.pay === e.k)
                })),
                isDone: "done" === t.screen,
                isPicker: "picker" === t.screen,
                isKit: "kit" === t.screen,
                kitIntro: "kit" === t.screen && !!t.kitIntro,
                kitIntroOpen: this.kitIntroOpen,
                kitIntroStart: () => this.kitIntroClose(!0),
                kitIntroSkip: () => this.kitIntroClose(!1),
                isReports: "reports" === t.screen,
                donTotalFmt: B(mt.total),
                donLast: mt.last,
                donPct: dt,
                donRuleText: dt + "% з кожного замовлення",
                cartWholesale: !1,
                cartDonShow: !0,
                donWhereLabel: "Донат · " + (3 === t.brigade ? t.brigadeOther.trim() || "обрана бригада" : b[t.brigade][0]) + " — " + B(Lt),
                donPending: B(0),
                wantDiscount: () => {
                    this.setState({
                        bigPref: "discount",
                        kitInvoice: "kit" === t.screen || t.kitInvoice
                    }), "kit" !== t.screen && this.goB2BForm();
                },
                wantDonation: () => {
                    this.setState({
                        bigPref: "donation",
                        kitInvoice: "kit" === t.screen || t.kitInvoice
                    }), "kit" !== t.screen && this.goB2BForm();
                },
                bigPrefDiscount: this.prefStyle("discount" === t.bigPref),
                bigPrefDonation: this.prefStyle("donation" === t.bigPref),
                prefCards: [ [ "discount", "Хочу нижчу ціну", "Менеджер порахує максимальну знижку під ваш склад" ], [ "donation", "Хочу більший донат бригаді", "Замість знижки збільшуємо переказ" ] ].map(([e, i, s]) => ({
                    title: i,
                    note: s,
                    pressed: String(t.bigPref === e),
                    pick: () => this.setState({
                        bigPref: e
                    }),
                    style: this.prefCard(t.bigPref === e),
                    titleStyle: {
                        fontFamily: "UAH, Oswald, sans-serif",
                        fontSize: "15px",
                        textTransform: "uppercase",
                        color: t.bigPref === e ? "var(--link)" : "var(--legacy-edefea)"
                    }
                })),
                b2bTypes: [ "Фізособа", "ФОП", "ТОВ", "Благодійний фонд", "Військова частина" ].map(e => ({
                    t: e,
                    pressed: String((t.b2bType || "ФОП") === e),
                    pick: () => this.setState({
                        b2bType: e
                    }),
                    style: {
                        padding: "8px 14px",
                        fontSize: "13px",
                        cursor: "pointer",
                        border: "1px solid " + ((t.b2bType || "ФОП") === e ? "var(--legacy-f2a33c)" : "var(--legacy-2a322b)"),
                        color: (t.b2bType || "ФОП") === e ? "var(--link)" : "var(--legacy-c7cec3)"
                    }
                })),
                b2bSent: !!t.b2bSent,
                b2bNotSent: !t.b2bSent,
                sendB2B: () => this.setState({
                    b2bSent: !0
                }),
                b2bSentText: "Заявку отримали" + ("donation" === t.bigPref ? " · обрано більший донат бригаді" : "discount" === t.bigPref ? " · обрано нижчу ціну" : "") + ". Менеджер напише протягом робочого дня.",
                scrollB2BForm: () => {
                    const t = document.getElementById("b2b-form");
                    t && window.scrollTo({
                        top: t.getBoundingClientRect().top + window.scrollY - 80,
                        behavior: "smooth"
                    });
                },
                goB2BCalc: () => {
                    this.setState({
                        b2bSent: !1
                    }), this.goB2BForm(), setTimeout(() => document.querySelector("#b2b-form input:not([name=rz_check])")?.focus(), 120);
                },
                calcHistory: [ [ "12 комплектів «Зима / Штурм»", "19.09.2026", 438e3, "Погоджено" ], [ "40 × бойова сорочка UBACS", "02.09.2026", 94e3, "Оплачено" ], [ "6 комплектів «Базовий літній»", "24.09.2026", 58300, "У роботі" ] ].map(([t, e, i, s]) => ({
                    title: t,
                    date: e,
                    sum: B(i),
                    status: s,
                    statusStyle: {
                        fontSize: "12px",
                        padding: "3px 8px",
                        border: "1px solid " + ("У роботі" === s ? "var(--legacy-4e4524)" : "var(--legacy-35502f)"),
                        color: "У роботі" === s ? "var(--legacy-d8be62)" : "var(--legacy-7eb356)"
                    }
                })),
                hasBigPref: !!t.bigPref,
                bigPrefLabel: "discount" === t.bigPref ? "У заявці: хочу знижку" : "У заявці: хочу більший донат бригаді",
                doneDonTitle: "З цього замовлення плануємо спрямувати " + B(Lt) + " на " + (3 === t.brigade ? t.brigadeOther.trim() || "обрану бригаду" : b[t.brigade][0]),
                cartDemos: [ [ "small", "Невеликий кошик" ], [ "big", "Кошик на 16 000 ₴" ], [ "wh", "Велике замовлення" ] ].map(([t, e]) => ({
                    name: e,
                    pick: () => this.cartDemo(t)
                })),
                isArmorItem: (() => {
                    const e = Z.find(e => e.id === t.current);
                    return !!e && ("armor" === e.cat || "Бронезахист" === (e.path || [])[0]);
                })(),
                isUi: "ui" === t.screen,
                goUi: () => {
                    this.go("ui"), window.scrollTo(0, 0);
                },
                packShow: !!this.props.packPhotos,
                packOpen: !!t.packOpen,
                packLabel: "Як виглядає посилка " + (t.packOpen ? "▴" : "▾"),
                togglePack: () => this.setState(t => ({
                    packOpen: !t.packOpen
                })),
                trustOpen: !!t.trustOpen,
                toggleTrust: () => this.setState(t => ({
                    trustOpen: !t.trustOpen
                })),
                itemDonText: (() => {
                    const e = Z.find(e => e.id === t.current);
                    return e ? "З цієї покупки бригаді піде " + B(ut(e.price * (t.qty || 1))) : "";
                })(),
                kitReturnShow: "product" === t.screen && t.kitReturn && t.kit.length > 0,
                kitReturnLabel: "Ваш комплект збережено · " + x(t.kit.length, "позиція", "позиції", "позицій"),
                backToKit: () => {
                    this.setState({
                        kitReturn: !1
                    }), this.go("kit"), window.scrollTo(0, 0);
                },
                ...(() => {
                    const i = !!this.props.donFewData, s = i ? gt : mt, o = (i ? ft.slice(0, 1) : ft).map((t, e) => ({
                        brigade: t[0],
                        sumFmt: B(t[1]),
                        date: t[2],
                        open: () => this.setState({
                            donShot: e
                        })
                    })), a = null !== t.donShot ? ft[t.donShot] : null;
                    return {
                        donCountEl: e.createElement(Ft, {
                            value: s.total,
                            from: 0,
                            dur: 1400,
                            key: i ? "few" : "full"
                        }),
                        donStats: [],
                        donTransfers: o.slice(0, 4),
                        donAllTransfers: o,
                        donFew: o.length < 4,
                        donFewNote: "Після першого переказу тут з’явиться звіт із підтвердженням.",
                        donShotOpen: !!a,
                        donShot: a ? {
                            title: a[0],
                            meta: B(a[1]) + " · " + a[2] + " 2026",
                            slot: "don-shot-" + t.donShot
                        } : {
                            title: "",
                            meta: "",
                            slot: "don-shot-x"
                        },
                        closeDonShot: () => this.setState({
                            donShot: null
                        }),
                        goReports: () => {
                            this.go("reports"), window.scrollTo(0, 0);
                        }
                    };
                })(),
                goPicker: () => this.go("picker"),
                goKit: () => {
                    this.setState({
                        kitFriend: !1,
                        kitFromPick: !1,
                        burger: !1
                    }), this.go("kit");
                },
                ...this.kitVm(t),
                ...this.menuVm(t),
                ...this.medVm(t),
                ...this.jarVm(),
                ...this.pkVm(t),
                bundles: E.map(e => {
                    const i = St(this.kitLines(this.kitFromIds(e.items)), 1, !0);
                    return {
                        name: e.name,
                        note: e.note,
                        slot: "bundle-" + e.key,
                        ph: e.ph,
                        compOpen: !!t.bundleOpen[e.key],
                        toggleComp: () => this.setState(t => ({
                            bundleOpen: Object.assign({}, t.bundleOpen, {
                                [e.key]: !t.bundleOpen[e.key]
                            })
                        })),
                        compLabel: "Що входить (" + x(e.items.length, "позиція", "позиції", "позицій") + ") " + (t.bundleOpen[e.key] ? "▴" : "▾"),
                        comp: e.items.map(t => {
                            const e = Z.find(e => e.id === t);
                            return {
                                name: e.name,
                                priceFmt: B(e.price),
                                href: "/product/" + (e.slug || w(e.name)),
                                thumb: e.photoData?.[0]?.thumb || e.photos?.[0] || "",
                                hasPhoto: !!e.photos?.length,
                                view: e => {
                                    e && e.preventDefault && e.preventDefault(), this.open(t);
                                }
                            };
                        }),
                        fullFmt: B(i.full),
                        priceFmt: B(i.kit),
                        saveFmt: "−" + B(i.save) + (vt(i) ? " · " + vt(i) : ""),
                        add: () => this.openBundle(e)
                    };
                }),
                advantages: P.map(([t, e]) => ({
                    title: t,
                    note: e
                })),
                faq: M.map(([e, i], s) => ({
                    q: e,
                    a: i,
                    open: t.faqOpen === s,
                    mark: t.faqOpen === s ? "−" : "+",
                    toggle: () => this.setState(t => ({
                        faqOpen: t.faqOpen === s ? -1 : s
                    }))
                })),
                reviews: T.map(([t, e, i, s, o], a) => ({
                    name: t,
                    role: e,
                    item: i,
                    text: s,
                    date: o,
                    slot: "rev-" + a
                })),
                pickerSteps: q.map(e => ({
                    title: e.title,
                    options: e.options.map(([i, s]) => ({
                        name: i,
                        note: s,
                        pick: () => this.setState(t => ({
                            pick: Object.assign({}, t.pick, {
                                [e.key]: i
                            })
                        })),
                        style: {
                            display: "flex",
                            flexDirection: "column",
                            gap: "3px",
                            padding: "14px",
                            cursor: "pointer",
                            minWidth: 0,
                            border: "1px solid " + (t.pick[e.key] === i ? "var(--legacy-f2a33c)" : "var(--legacy-2a322b)"),
                            background: t.pick[e.key] === i ? "var(--legacy-1b1a14)" : "var(--legacy-0f120f)"
                        },
                        nameStyle: {
                            fontFamily: "UAH, Oswald, sans-serif",
                            fontSize: "16px",
                            textTransform: "uppercase",
                            color: t.pick[e.key] === i ? "var(--link)" : "var(--legacy-edefea)"
                        }
                    }))
                })),
                pickerReady: Object.keys(t.pick).length === q.length,
                pickerProgress: {
                    height: "100%",
                    background: "var(--legacy-f2a33c)",
                    width: Math.round(Object.keys(t.pick).length / q.length * 100) + "%"
                },
                pickerCountLabel: Object.keys(t.pick).length + " з " + q.length,
                pickerResult: (() => {const r=this.buildKit({season:t.pick.season||'Демісезон',formSize:t.pick.size||'L',spec:t.pick.task==='Перша лінія'?'Штурм':'Тил або навчання',budget:t.pick.budget==='До 8 000 ₴'?8000:t.pick.budget==='8–20 000 ₴'?20000:61000}),c=St(this.kitLines(r.lines));return {items:r.lines.map(l=>{const p=Z.find(p=>p.id===l.id),v=p.variants[l.size];return {name:p.name,priceFmt:storeMoney(v.price),note:v.size_display+' · '+v.color};}),sumFmt:storeMoney(c.kit),add:()=>{this.setState({kit:r.lines,kitMiss:r.miss,kitSeason:t.pick.season||'Демісезон'});this.go('kit');}};})(),
                resetPicker: () => this.setState({
                    pick: {}
                }),
                remind: t.remind,
                remindTrack: i(t.remind).track,
                remindKnob: i(t.remind).knob,
                toggleRemind: () => this.setState(t => ({
                    remind: !t.remind
                })),
                reminders: d.map(([t, e]) => ({
                    title: t,
                    note: e
                })),
                refCopied: t.refCopied,
                refLabel: t.refCopied ? "Скопійовано" : "Скопіювати",
                copyRef: () => {
                    try {
                        navigator.clipboard.writeText("rubizh.shop/r/HRANIT");
                    } catch (t) {}
                    this.setState({
                        refCopied: !0
                    }), setTimeout(() => this.setState({
                        refCopied: !1
                    }), 1800);
                },
                promoInput: t.promoInput,
                onPromo: t => this.setState({
                    promoInput: t.target.value
                }),
                applyPromo: () => this.setState(t => ({
                    promo: "РУБІЖ10" === t.promoInput.trim().toUpperCase() ? "РУБІЖ10" : "bad"
                })),
                promoOk: "РУБІЖ10" === t.promo,
                promoBad: "bad" === t.promo,
                discountFmt: "−" + B(zt),
                placeOrder: () => this.placeOrder(),
                priceNotices: t.priceNotices || [],
                hasPriceNotices: (t.priceNotices || []).length > 0,
                hasIssues: Object.keys(t.cartIssues || {}).length > 0,
                preAsk: t.preAsk,
                closePreAsk: () => this.setState({
                    preAsk: !1
                }),
                continueOrder: () => this.submitOrder(this.state.cart),
                preWarnText: "Товар доступний під замовлення. Перед оформленням рекомендуємо уточнити актуальну наявність та термін відправки у менеджера.",
                orderLines: (t.lastOrder ? t.lastOrder.lines : []).map(t => ({
                    name: t.name,
                    meta: "Розмір " + t.size + " · " + t.color,
                    sku: t.sku,
                    qtyPrice: t.qty + " × " + B(t.price),
                    status: "preorder" === t.availability ? "Під замовлення · " + it : "В наявності",
                    statusStyle: {
                        fontSize: "12px",
                        color: "preorder" === t.availability ? "var(--legacy-d8be62)" : "var(--legacy-7eb356)"
                    }
                })),
                hasOrderLines: !(!t.lastOrder || !t.lastOrder.lines.length),
                doneTotal: B(_t - zt + At),
                doneDonation: B(Lt),
                doneItems: t.cart.reduce((t, e) => t + e.qty, 0) + " поз.",
                doneDelivery: "courier" === t.delivery ? "Кур’єр Нової Пошти · 1–2 дні" : "box" === t.delivery ? "Поштомат Нової Пошти · 1–2 дні" : "Нова Пошта, відділення · 1–2 дні",
                doneSteps: [ [ "Підтвердження зв’язку", "До 30 хвилин: менеджер підтвердить наявність розмірів у зручному вам месенджері." ], [ "ТТН Нової Пошти", "Прийде в SMS і з’явиться в кабінеті одразу після відправки." ], [ "Скрін підтвердження донату", "Коли бригада отримає ваш донат — надішлемо скрін переказу в месенджер і додамо його в кабінет." ] ].map(([t, e]) => ({
                    title: t,
                    note: e
                })),
                brigadeName: 3 === t.brigade ? t.brigadeOther.trim() || "Інша бригада" : b[t.brigade][0],
                brigadeOtherOpen: 3 === t.brigade,
                brigadeOther: t.brigadeOther,
                onBrigadeOther: t => this.setState({
                    brigadeOther: t.target.value
                }),
                brigadeOptions: b.map(([e, i], s) => ({
                    name: e,
                    note: i,
                    pick: () => this.setState({
                        brigade: s
                    }),
                    style: this.radio(t.brigade === s),
                    dotStyle: this.dot(t.brigade === s)
                })),
                accOverview: "overview" === t.acc,
                accOrders: "orders" === t.acc,
                accSizes: "sizes" === t.acc,
                accKit: "kit" === t.acc,
                accB2B: "b2b" === t.acc,
                accDonations: "don" === t.acc,
                accAddresses: "addr" === t.acc,
                accPayments: "pay" === t.acc,
                accExchange: "exch" === t.acc,
                accSettings: "set" === t.acc,
                accRef: "ref" === t.acc,
                accNav: [ [ "overview", "Огляд", "" ], [ "orders", "Замовлення", "3" ], [ "sizes", "Мої розміри", "" ], [ "kit", "Моє спорядження", "4" ], [ "b2b", "Підрозділ і опт", "1" ], [ "don", "Внесок на ЗСУ", "" ], [ "ref", "Запросити побратима", "" ], [ "addr", "Адреси доставки", "3" ], [ "pay", "Оплата", "" ], [ "exch", "Обмін і повернення", "1" ], [ "set", "Налаштування", "" ] ].map(([e, i, s]) => {
                    const o = t.acc === e;
                    return {
                        name: i,
                        count: s,
                        pick: () => this.accGo(e),
                        style: {
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "11px 13px",
                            cursor: "pointer",
                            fontFamily: "UAH, Oswald, sans-serif",
                            fontSize: "14.5px",
                            letterSpacing: ".06em",
                            textTransform: "uppercase",
                            background: o ? "var(--legacy-f2a33c)" : "transparent",
                            color: o ? "var(--button-text)" : "var(--legacy-c7cec3)",
                            borderLeft: "2px solid " + (o ? "var(--legacy-f2a33c)" : "transparent")
                        },
                        countStyle: {
                            fontFamily: "IBM Plex Sans, sans-serif",
                            fontSize: "11.5px",
                            color: o ? "var(--button-text)" : "var(--legacy-8a9487)"
                        }
                    };
                }),
                activeOrder: Yt.find(t => 3 === t.raw.step && !t.raw.kind) || Yt[0],
                orderFilters: [ [ "all", "Усі · 5" ], [ "work", "В роботі · 2" ], [ "done", "Доставлені · 1" ], [ "off", "Скасовані й повернення · 2" ] ].map(([e, i]) => ({
                    name: i,
                    pick: () => this.setState({
                        ordFilter: e
                    }),
                    style: {
                        padding: "7px 11px",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontFamily: "UAH, Oswald, sans-serif",
                        letterSpacing: ".06em",
                        border: "1px solid " + (t.ordFilter === e ? "var(--legacy-f2a33c)" : "var(--legacy-2a322b)"),
                        color: t.ordFilter === e ? "var(--link)" : "var(--legacy-d3d9cf)"
                    }
                })),
                orders: Yt.filter(e => "all" === t.ordFilter || ("off" === t.ordFilter ? !!e.raw.kind : "done" === t.ordFilter ? 4 === e.raw.step && !e.raw.kind : e.raw.step < 4 && !e.raw.kind)),
                quickActions: [],
                attention: [],
                wishlist: n.map(([t, e, i]) => {
                    const s = Z.find(e => e.id === t);
                    return {
                        name: s.name,
                        size: e,
                        note: i,
                        priceFmt: B(s.price),
                        add: () => {
                            this.add(t, "Розмір L" === e ? "L" : void 0, 1), this.go("cart");
                        }
                    };
                }),
                sizeCards: h.map(([t, e, i]) => ({
                    title: t,
                    note: i,
                    rows: e.map(([t, e]) => ({
                        k: t,
                        v: e
                    }))
                })),
                autoSizes: t.autoSizes,
                autoTrack: i(t.autoSizes).track,
                autoKnob: i(t.autoSizes).knob,
                toggleAuto: () => this.setState(t => ({
                    autoSizes: !t.autoSizes
                })),
                kit: o.map(([t, e, i, s]) => ({
                    name: t,
                    bought: e,
                    label: i,
                    pctText: s + "%",
                    barStyle: {
                        width: s + "%",
                        height: "100%",
                        background: s < 20 ? "var(--legacy-d9542b)" : s < 70 ? "var(--legacy-f2a33c)" : "var(--legacy-7eb356)"
                    }
                })),
                b2bFields: y.map(([t, e]) => ({
                    k: t,
                    v: e
                })),
                invoices: a.map(([t, e, i, s]) => ({
                    num: t,
                    date: e,
                    sum: B(i),
                    status: s,
                    badgeStyle: {
                        fontFamily: "UAH, Oswald, sans-serif",
                        fontSize: "11.5px",
                        letterSpacing: ".1em",
                        textTransform: "uppercase",
                        padding: "4px 8px",
                        whiteSpace: "nowrap",
                        flex: "0 0 auto",
                        border: "1px solid " + ("Оплачено" === s ? "var(--legacy-35502f)" : "var(--legacy-4e4524)"),
                        color: "Оплачено" === s ? "var(--legacy-7eb356)" : "var(--legacy-d8be62)",
                        background: "Оплачено" === s ? "var(--legacy-17241a)" : "var(--legacy-2a2317)"
                    }
                })),
                donTotal: B(0),
                donMonths: c.map(([t, e]) => ({
                    m: t,
                    sum: B(e),
                    barStyle: {
                        height: Math.round(e / 2100 * 100) + "%",
                        background: "var(--legacy-f2a33c)",
                        width: "100%"
                    }
                })),
                donUses: l.map(([t, e, i]) => ({
                    name: t,
                    when: e,
                    sum: i
                })),
                reports: p.map(([t, e]) => ({
                    name: t,
                    meta: e
                })),
                addresses: r.map(([t, e, i]) => ({
                    title: t,
                    note: e,
                    isDefault: i,
                    cardStyle: {
                        border: "1px solid " + (i ? "var(--legacy-4c5a36)" : "var(--legacy-2a322b)"),
                        background: "var(--legacy-141815)",
                        padding: "16px",
                        display: "flex",
                        gap: "12px",
                        flexWrap: "wrap",
                        alignItems: "center"
                    }
                })),
                payCards: k.map(([t, e]) => ({
                    name: t,
                    meta: e
                })),
                installments: f.map(([t, e, i]) => ({
                    name: t,
                    meta: e,
                    style: {
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        padding: "12px 14px",
                        border: "1px solid " + (i ? "var(--legacy-35502f)" : "var(--legacy-2a322b)"),
                        background: i ? "var(--legacy-17241a)" : "var(--legacy-0f120f)",
                        fontSize: "13.5px",
                        color: i ? "var(--legacy-c6d3a8)" : "var(--legacy-d3d9cf)"
                    }
                })),
                exOrders: s.map(e => ({
                    name: e.id + " · " + e.items,
                    pick: () => this.setState({
                        exOrder: e.id
                    }),
                    style: {
                        padding: "11px 13px",
                        cursor: "pointer",
                        fontSize: "13.5px",
                        border: "1px solid " + (t.exOrder === e.id ? "var(--legacy-f2a33c)" : "var(--legacy-2a322b)"),
                        background: t.exOrder === e.id ? "var(--legacy-1b1a14)" : "var(--legacy-0f120f)",
                        color: "var(--legacy-d3d9cf)"
                    }
                })),
                exReasons: g.map(e => this.chip(e, t.exReason === e, () => this.setState({
                    exReason: e
                }))),
                exSizes: [ "L", "XL", "XXL" ].map(e => this.chip(e, t.exSize === e, () => this.setState({
                    exSize: e
                }))),
                notifSwitches: u.map(([e, s], o) => {
                    const a = t.notif[o];
                    return {
                        name: e,
                        note: s,
                        track: i(a).track,
                        knob: i(a).knob,
                        toggle: () => this.setState(t => {
                            const e = t.notif.slice();
                            return e[o] = !e[o], {
                                notif: e
                            };
                        })
                    };
                }),
                privacy: t.privacy,
                privacyTrack: i(t.privacy).track,
                privacyKnob: i(t.privacy).knob,
                togglePrivacy: () => this.setState(t => ({
                    privacy: !t.privacy
                }))
            };
        }
        nodeCount=t => {
            // Inside a search the counts are the result's own (server facet), never the whole catalogue's.
            const sc = (this.state.sq || "").trim() && !this.state.storeLoading && this.state.storeCatalog?.facets?.category_counts;
            if (sc) { const key = t.join(" / "); return Object.entries(sc).reduce((n, [path, c]) => n + (!t.length || path === key || path.startsWith(key + " / ") ? Number(c) : 0), 0); }
            const e = this._storeCategories || window.RUBIZH_BOOT?.categories || [];
            return t.length ? Number(e.find(e => e.path === t.join(" / "))?.product_count || 0) : e.filter(t => !t.path.includes(" / ")).reduce((t, e) => t + Number(e.product_count || 0), 0);
        };
        leafItems=t => {
            const e = H(t)?.kids || [], i = [], s = t => t.kids.length ? t.kids.forEach(s) : i.push({
                label: t.name,
                paths: [ t.path ],
                n: this.nodeCount(t.path)
            });
            return e.forEach(s), i.filter(t => t.n > 0).sort((t, e) => e.n - t.n);
        };
        storePricingLines=cart=>cart.map(l=>{const p=Z.find(p=>p.id===l.id),v=p?.variants[l.size],v3=storeV3PricingLine(l,p,v);if(v3)return v3;const kit=!!(l.kit&&!l.kitRetail&&v?.pricing_policy_version===1&&v.kit_price!==null);return {product_id:l.id,sku:l.sku||v?.sku,qty:l.qty,color:v?.color,price_mode:l.wh?'wholesale':kit?'kit':'retail',kit_group:l.kit?l.kitId||'kit':'',...(l.kit?{kit_units:l.kitUnits||1}:{})};});
        applyPromo=async()=>{
            const seq=this._promoSeq=(this._promoSeq||0)+1,code=this.state.promoInput.trim().toUpperCase();
            if(!code){this.setState({promo:null,promoPct:0,promoBad:false,storeQuote:null,checkoutError:''});return;}
            const current=()=>!this.customerUnmounted&&seq===this._promoSeq&&code===this.state.promoInput.trim().toUpperCase();
            try{
                const lines=this.storePricingLines(this.state.cart),fingerprint=JSON.stringify(lines);
                const result=await this.storeRequest('/shop/checkout-quote.php',{lines,promo:code});
                if(!current())return;
                if(fingerprint!==JSON.stringify(this.storePricingLines(this.state.cart)))throw new Error('Кошик змінився. Перевірте промокод ще раз.');
                this.setState({promo:code,promoPct:0,promoBad:false,storeQuote:result.quote,checkoutError:''});
            }catch(error){if(current())this.setState({promo:null,promoPct:0,promoBad:true,storeQuote:null,checkoutError:error.message});}
        };
        storeSeoProduct=(p,url,description) => {
            const variants=Object.values(p.variants||{}).sort((a,b)=>String(a.sku)<String(b.sku)?-1:String(a.sku)>String(b.sku)?1:0);
            const v=variants.find(v=>v.availability!=='out_of_stock'&&Number(v.price)===Number(p.price))||variants.find(v=>Number(v.price)===Number(p.price));
            const schema={"@context":"https://schema.org","@type":"Product",name:p.name,description,sku:v?.sku||p.sku||p.id,url};
            // Stage 5.4: a QUOTE model (manager calculates the price, often per m²) publishes no Offer: no item price, no availability.
            if(v&&v.price>0&&!p.quote&&v.sale_mode!=='QUOTE'){
                const offer={"@type":"Offer",url,priceCurrency:"UAH",price:String(v.price),seller:{"@type":"Organization",name:(this.state.storeSettings||window.RUBIZH_BOOT?.settings)?.seller?.name||"ФОП Мєшалкін Андрій Леонідович"}};
                if(v.availability==='out_of_stock'||v.availability==='in_stock'&&v.stock!=null&&v.stock<=0)offer.availability='https://schema.org/OutOfStock';
                else if(v.availability==='preorder')offer.availability='https://schema.org/PreOrder';
                else if(v.availability==='in_stock'&&v.stock!=null&&v.stock>0)offer.availability='https://schema.org/InStock';
                schema.offers=offer;
            }
            if(p.brand)schema.brand={"@type":"Brand",name:p.brand};
            if(p.photos?.length)schema.image=p.photos;
            return schema;
        };
        storeSeoBreadcrumb=(path,leaf) => {
            const categories=this._storeCategories||window.RUBIZH_BOOT?.categories||[],urls=new Map(categories.map(c=>[c.path,c.url_path]));
            const items=[['РУБІЖ','https://rubizh.shop/'],['Каталог','https://rubizh.shop/catalog']];
            (path||[]).forEach((name,i)=>{const url=urls.get(path.slice(0,i+1).join(' / '));if(url)items.push([name,'https://rubizh.shop/catalog/'+url]);});
            if(leaf!=null)items.push([leaf,null]);else items[items.length-1][1]=null;
            return {"@context":"https://schema.org","@type":"BreadcrumbList",itemListElement:items.map(([name,item],i)=>({"@type":"ListItem",position:i+1,name,...(item==null?{}:{item})}))};
        };
        storeMeta=() => {
            const t = this.state, e = Z.find(e => e.id === t.current && e.storeReady);
            if ("product" === t.screen && !e) return;
            // Compact catalog DTOs can refresh this model without its public description.
            // Retain the full product description obtained from SSR or the product endpoint.
            this._seoDescriptions ||= new Map();
            if(e?.desc)this._seoDescriptions.set(e.id,e.desc);
            const description=e?.desc||this._seoDescriptions.get(e?.id)||(e&&window.RUBIZH_BOOT?.product?.id===e.id?window.RUBIZH_BOOT.product.description:'');
            const route=this.historyUrl(t),query=new URLSearchParams(route.split('?')[1]||'');
            const page=t.screen==='catalog'&&!t.storeLoading&&this._storeQuery===this.storeQuery(t)?t.storeCatalog?.page||t.catPg:t.catPg;
            const noindex=t.screen==='catalog'&&[...query.keys()].some(k=>k!=='page'&&(k!=='sort'||query.get(k)!=='pop'))||t.screen==='kit'&&/^\/kit\/[a-f0-9]{32}/.test(route)||!['home','catalog','product','allcats','guides','guide','kit','page'].includes(t.screen);
            const i = JSON.stringify([ route, t.screen, t.cpath, t.current, page, noindex, t.guide, t.storeSettings?.seller?.name, e?.name, description, e?.price, e?.photos, e?.brand, e?.variants ]);
            if (this._metaKey === i) return;
            this._metaKey = i;
            const s = "https://rubizh.shop" + this.historyUrl(t).split("?")[0].split("#")[0], group = "catalog" === t.screen && !t.cpath.length ? storeGroupForRoots(t.roots) : null, o = "product" === t.screen ? e.name + " — РУБІЖ" : "catalog" === t.screen ? t.cpath.at(-1) ? t.cpath.at(-1) + " — купити в РУБІЖ" : group ? group.seo_title || group.title + " — купити в РУБІЖ" : "Каталог тактичного спорядження — РУБІЖ" : "allcats" === t.screen ? "Усі категорії — РУБІЖ" : "guides" === t.screen ? "Поради — РУБІЖ" : "guide" === t.screen ? ((A.find(g => g.key === t.guide) || {}).title || "Поради") + " — Поради РУБІЖ" : "kit" === t.screen ? "Зібрати комплект — РУБІЖ" : "РУБІЖ — тактичний одяг та спорядження";
            document.title = o;
            const a = (t, e, i) => {
                const nodes=document.head.querySelectorAll(t);let s = nodes[0];
                for(const extra of Array.from(nodes).slice(1))extra.remove();
                s || (s = document.createElement(e), document.head.appendChild(s));
                for (const [t, e] of Object.entries(i)) s.setAttribute(t, e);
            };
            a('link[rel="canonical"]', "link", {
                rel: "canonical",
                href: s + ("catalog" === t.screen && page > 1 ? "?page=" + page : "")
            }), a('meta[name="description"]', "meta", {
                name: "description",
                // 5-5: the same individual description as the server page (category seo_description, group description).
                content: Array.from("product" === t.screen ? description || "Замовити "+e.name+" у РУБІЖ. Розміри, ціна та доставка по Україні." : group?.description || ("catalog" === t.screen && t.cpath.length ? (this._storeCategories || window.RUBIZH_BOOT?.categories || []).find(c => c.path === t.cpath.join(" / "))?.seo_description : "") || o + " — ціни, розміри та доставка по Україні.").slice(0,160).join('')
            }), a('meta[property="og:title"]', "meta", {
                property: "og:title",
                content: o
            }), a('meta[property="og:url"]', "meta", {
                property: "og:url",
                content: s
            }), a('meta[property="og:type"]', "meta", {
                property: "og:type",
                content: "product" === t.screen ? "product" : "website"
            }), a('meta[property="og:description"]', "meta", {
                property: "og:description",
                content: document.head.querySelector('meta[name="description"]').content
            });
            const r = "product" === t.screen ? e.photos?.[0] : null, n = document.head.querySelector('meta[property="og:image"]');
            r ? a('meta[property="og:image"]', "meta", {
                property: "og:image",
                content: new URL(r, 'https://rubizh.shop').href
            }) : n?.remove();
            if(noindex)a('meta[name="robots"]','meta',{name:'robots',content:'noindex,follow'});
            else document.head.querySelectorAll('meta[name="robots"]').forEach(el=>el.remove());
            const c = document.getElementById("rubizh-product-schema");
            if ("product" !== t.screen) c?.remove(); else {
                const node=c||document.createElement('script');node.id='rubizh-product-schema';node.type='application/ld+json';
                const json=JSON.stringify(this.storeSeoProduct(e,s,document.head.querySelector('meta[name="description"]').content));
                if(node.textContent!==json)node.textContent=json;
                if(!c)document.head.appendChild(node);
            }
            // Replace only route breadcrumbs; other structured data belongs to its own publisher.
            document.head.querySelectorAll('script[type="application/ld+json"]').forEach(node=>{try{if(JSON.parse(node.textContent)['@type']==='BreadcrumbList')node.remove();}catch(error){}});
            if(t.screen==='product'||t.screen==='catalog'){
                const node=document.createElement('script');node.id='rubizh-breadcrumb-schema';node.type='application/ld+json';
                node.textContent=JSON.stringify(this.storeSeoBreadcrumb(t.screen==='product'?e.path:t.cpath,t.screen==='product'?e.name:group?group.title:null));document.head.appendChild(node);
            }
        };
        storeKitQuery=(page=1) => {
            const s=new URLSearchParams({slot:this.state.kitModal,page:String(page),q:this.state.kmQ||""});
            if(this.state.kmCat)s.set("leaf",this.state.kmCat);
            if(this.state.kmSize)s.set("sizes",this.state.kmSize);
            if(this.state.kmColor)s.set("camo",this.state.kmColor);
            if(this.state.kmStock)s.set("availability","in");
            return s.toString();
        };
        storeKitInitialIds=() => {
            const cached=this._kitResponses?.get(this.storeKitQuery());
            if(cached&&Date.now()-cached.at<30000)return this.storeCache(cached.data.items).map(p=>p.id);
            const s=this.state;
            if(s.kmQ||s.kmCat||s.kmSize||s.kmColor||s.kmStock)return [];
            return Z.filter(p=>p.storeReady&&storeSlot(p)===s.kitModal&&storeKitEligible(p)).slice(0,24).map(p=>p.id);
        };
        storeApplyKitResponse=(o,page,slot) => {
            if(this._kitFacetsSlot!==slot){this._kitFacetsSlot=slot;this._kitFacets={leaves:[],sizes:[],camo:[]};}
            for(const key of ["leaves","sizes","camo"])this._kitFacets[key]=Array.from(new Set(this._kitFacets[key].concat(o.facets?.[key]||[])));
            const ids=this.storeCache(o.items).map(p=>p.id);
            this._kitModalLimit=24*page;
            this.setState({storeKitIds:page===1?ids:Array.from(new Set((this.state.storeKitIds||[]).concat(ids))),kitCatalogPage:page,kitCatalogPages:o.pages,kitCatalogLoading:false,kitCatalogError:""});
        };
        storeLoadKitProducts=async page => {
            const key=this._kitQueryKey,slot=this.state.kitModal;
            if(!slot)return;
            const query=this.storeKitQuery(page),cached=this._kitResponses?.get(query);
            if(cached&&Date.now()-cached.at<30000){this.storeApplyKitResponse(cached.data,page,slot);return;}
            this.setState({kitCatalogLoading:true,kitCatalogError:""});
            try {
                const data=await this.storeRequest("/shop/catalog.php?"+query,null,"_kitRequests");
                if(key!==this._kitQueryKey||slot!==this.state.kitModal||this.customerUnmounted)return;
                (this._kitResponses ||= new Map).set(query,{at:Date.now(),data});
                if(this._kitResponses.size>32)this._kitResponses.delete(this._kitResponses.keys().next().value);
                this.storeApplyKitResponse(data,page,slot);
            } catch(error) {
                if(key!==this._kitQueryKey||this.customerUnmounted||error.name==="AbortError")return;
                this.setState({kitCatalogLoading:false,kitCatalogError:"Не вдалося завантажити список спорядження. Спробуйте ще раз."});
            }
        };
        _catalogSeq=0;
        _productSeq=0;
        storeRequest=async (t, e, i, proofState={}) => {
            const rateProof=proofState.account;
            const s = new AbortController;
            this._requestControllers = this._requestControllers || new Set, this._requestControllers.add(s),
            i && (this[i]?.abort(), this[i] = s);
            let o = !1;
            const a = setTimeout(() => {
                o = !0, s.abort();
            }, 3e4);
            try {
                const i = await fetch(t, {
                    credentials: "same-origin",
                    headers: rateProof?{"X-Rubizh-Rate-Proof":rateProof}:{},
                    cache: !e && t.startsWith("/shop/catalog.php") ? "default" : "no-store",
                    signal: s.signal,
                    ...e ? {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",...(rateProof?{"X-Rubizh-Rate-Proof":rateProof}:{})
                        },
                        body: JSON.stringify({
                            ...e,
                            csrf: this.state.storeCsrf
                        })
                    } : {}
                });
                let o;
                try {
                    o = await i.json();
                } catch (t) {
                    throw new Error("Сервер тимчасово недоступний. Спробуйте ще раз.");
                }
                if(i.status===428&&o.challenge&&!proofState[o.challenge.purpose]&&['account','checkout'].includes(o.challenge.purpose)&&window.crypto?.subtle){
                    this.setState({checkoutError:'Перевіряємо запит. Зачекайте кілька секунд…'});
                    const {nonce,bits}=o.challenge;
                    if(!/^[a-f0-9]{32}$/.test(nonce)||!Number.isInteger(bits)||bits<8||bits>20)throw new Error('Не вдалося перевірити запит. Зверніться до менеджера.');
                    let n=0,zero=0;const encoder=new TextEncoder();
                    do{const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(nonce+':'+n)));zero=0;for(const byte of hash){if(byte===0){zero+=8;continue;}zero+=Math.clz32(byte)-24;break;}if(zero<bits)n++;}while(zero<bits&&!s.signal.aborted);
                    if(s.signal.aborted)throw new Error('Перевірка триває довше. Повторіть запит або зверніться до менеджера.');
                    const nextProof={...proofState,[o.challenge.purpose]:String(n)};return await this.storeRequest(t,o.challenge.purpose==='checkout'?{...e,rate_proof:String(n)}:e,undefined,nextProof);
                }
                if (!i.ok || !o.ok) {
                    const t = new Error(o.error || "Спробуйте ще раз.");
                    throw t.status = i.status, t.data = o, t;
                }
                return o;
            } catch (t) {
                if (o) throw new Error("Сервер довго не відповідає. Спробуйте ще раз.");
                if (t.name !== "AbortError" && t instanceof TypeError) throw new Error("Не вдалося з’єднатися з сервером. Перевірте підключення до інтернету. Спробуйте ще раз.", {cause:t});
                throw t;
            } finally {
                clearTimeout(a), this._requestControllers.delete(s), i && this[i] === s && (this[i] = null);
            }
        };
        storeSearchItems=t => t.storeSearchQuery === (t.qDeb || "").trim() ? (t.storeSearchIds || []).map(t => Z.find(e => e.id === t && e.storeReady)).filter(Boolean) : [];
        storeLoadSearch=async t => {
            if (t.length < 2) return this._searchRequests?.abort(), void this.setState({
                storeSearchIds: [],
                storeSearchTotal: 0,
                storeSearchQuery: t,
                storeSearchLoading: !1
            });
            this.setState({
                storeSearchLoading: !0
            });
            try {
                const e = await this.storeRequest("/shop/catalog.php?q=" + encodeURIComponent(t), null, "_searchRequests");
                if (t !== this._searchQuery || this.customerUnmounted) return;
                const i = this.storeCache(e.items);
                this.setState({
                    storeSearchIds: i.map(t => t.id),
                    storeSearchTotal: e.total,
                    storeSearchQuery: t,
                    storeSearchLoading: !1
                });
            } catch (e) {
                t !== this._searchQuery || this.customerUnmounted || "AbortError" === e.name || this.setState({
                    storeSearchIds: [],
                    storeSearchTotal: 0,
                    storeSearchQuery: t,
                    storeSearchLoading: !1,
                    storeError: e.message
                });
            }
        };
        storeCache=t => {
            const e = [];
            for (const i of t || []) {
                const t = Nt(i), s = Z.findIndex(e => e.id === t.id);
                s < 0 ? Z.push(t) : Z[s] = t;
                const o = Rt.findIndex(e => e.p.id === t.id), a = It(t);
                o < 0 ? Rt.push(a) : Rt[o] = a, e.push(t);
            }
            return e;
        };
        storeQuery=(t = this.state) => {
            const e = new URLSearchParams({
                page: String(t.catPg || 1),
                sort: t.sort || "pop"
            }), i = window.RUBIZH_CATEGORY_URLS?.[t.cpath.join(" / ")] || t.cpath.map(w).join("/");
            return i && e.set("category", i), t.sq && e.set("q", t.sq), t.priceFrom && e.set("price_from", t.priceFrom),
            t.priceTo && e.set("price_to", t.priceTo), t.brands.length && e.set("brands", t.brands.join("|")),
            t.camo.length && e.set("camo", t.camo.join("|")), t.sizes.length && e.set("sizes", t.sizes.map(t => t.replace("|",":")).join("|")),
            t.attrs.length && e.set("attrs", JSON.stringify(t.attrs)), t.roots.length && e.set("roots", JSON.stringify(t.roots)),
            t.inStock || "stock" === t.quick ? e.set("availability", "in") : t.withOrder || e.set("availability", "available"),
            "new" === t.quick && e.set("sort", "new"), e.toString();
        };
        storeLoadCatalog=async () => {
            const t = this.storeQuery(), e = ++this._catalogSeq;
            this._storeQuery = t, this.setState({
                storeLoading: !0,
                storeError: ""
            });
            try {
                const i = await this.storeRequest("/shop/catalog.php?" + t, null, "_catalogRequests");
                if (e !== this._catalogSeq || this.customerUnmounted) return;
                const s = JSON.stringify([ this.state.cpath, this.state.sq, this.state.roots ]);
                this._facetsKey !== s && (this._facetsKey = s, this._storeFacets = {
                    brands: [],
                    sizes: [],
                    camo: [],
                    attrs: {}
                });
                for (const t of [ "brands", "sizes", "camo" ]) this._storeFacets[t] = Array.from(new Set(this._storeFacets[t].concat(i.facets?.[t] || [])));
                for (const [t, e] of Object.entries(i.facets?.attrs || {})) (this._storeFacets.attrs ||= {})[t] = Array.from(new Set(((this._storeFacets.attrs ||= {})[t] || []).concat(e)));
                this._storeFacets = i.facets || {};
                const o = this.storeCache(i.items), a = this.state.storePageItems || [], r = this.state.catMore ? Array.from(new Set(a.concat(o.map(t => t.id)))) : o.map(t => t.id);
                this._storeQuery = new URLSearchParams(t).toString().replace(/(^|&)page=\d+/, "$1page=" + i.page),
                this.setState({
                    catPg: i.page,
                    storeLoading: !1,
                    storePageItems: r,
                    storeCatalog: i,
                    storeLoaded: !0,
                    current: Z.some(t => t.id === this.state.current && t.storeReady) ? this.state.current : o[0]?.id || this.state.current
                }, this.rememberCatalog);
            } catch (t) {
                e !== this._catalogSeq || this.customerUnmounted || "AbortError" === t.name || this.setState({
                    storeLoading: !1,
                    storeError: t.message,
                    storePageItems: []
                });
            }
        };
        top5Vm=()=>Dt.map(c=>{const count=c.roots.reduce((n,r)=>n+Number(this._storeCategories?.find(x=>x.path===r)?.product_count||0),0);/* D-62: a group of several roots opens its section on /categories (clean address, no ?roots=). */const href=c.roots.length===1?'/catalog/'+(this._storeCategories?.find(x=>x.path===c.roots[0])?.url_path||w(c.roots[0])):'/rozdil/'+c.slug;return {title:c.title,sub:'',count:x(count,'товар','товари','товарів'),aria:c.title,href,hasImg:!!c.img,imgStyle:{position:'absolute',inset:0,backgroundImage:`url('${c.img}')`,backgroundSize:'cover',backgroundPosition:'center'},open:ev=>{if(ev?.metaKey||ev?.ctrlKey||ev?.shiftKey||ev?.button>0)return;ev?.preventDefault?.();this.goRoots(c);}};});
        storeLoadRecommendations=async()=>{if(this._recommendations)return;this._recommendations=true;try{const j=await this.storeRequest('/shop/catalog.php?action=storefront');this.storeCache(j.products||[]);this.setState({storePreparedKits:j.kits||[],storeKitsReady:true});}catch(e){this._recommendations=false;this.setState({storeKitsReady:true});}};
        buildKit=cfg=>{const season=cfg.season||'Демісезон',have=cfg.have||[],size=cfg.formSize==='S–M'?'M':cfg.formSize==='XL–XXL'?'XL':'L',num={M:'48',L:'50',XL:'54'}[size],used=new Set(),lines=[],miss={},names=[],budget=cfg.budget>=61000?Infinity:(Number(cfg.budget)||Infinity);let sum=0;const add=(slot,test,prefs=[])=>{const candidates=Z.filter(p=>storeKitEligible(p)&&storeKitPrimary(p)&&!used.has(p.id)&&storeSlot(p)===slot&&storeSeasonOK(p,season)&&(!test||test(p))).sort((a,b)=>(storePalette(b.camo)===storePalette(cfg.camo)?1:0)-(storePalette(a.camo)===storePalette(cfg.camo)?1:0)||a.price-b.price);for(const p of candidates){const keys=Object.keys(p.variants).filter(k=>this.avail(p,k)!=='out'&&!p.variants[k].size_unconfirmed),k=prefs.length?keys.find(k=>prefs.includes(p.variants[k].size_display)||prefs.includes(p.variants[k].size_native)):keys.find(k=>/Один розмір|універс/i.test(p.variants[k].size_display))||keys[0];if(!k||sum+p.variants[k].price>budget)continue;used.add(p.id);sum+=p.variants[k].price;lines.push(this.kitLine(slot,p.id,k));names.push(p.name);delete miss[slot];return p;}miss[slot]=true;return null;};if(!have.includes('Форма')){if(season==='Зима'){add('body',p=>storeRole(p)==='thermal',[size,num]);add('body',p=>['fleece','outer'].includes(storeRole(p)),[size,num]);}else add('body',p=>storeRole(p)==='ubacs'||/сороч|костюм/i.test(p.name),[size,num]);add('legs',p=>storeRole(p)==='pants',[size,num]);}if(!have.includes('Берці'))add('boots',null,[cfg.shoe||'43']);if(!have.includes('Аптечка'))add('med',p=>storeRole(p)==='ifak'||/турнікет|джгут/i.test(p.name));if(!have.includes('Плитоноска з плитами')&&['Штурм','Розвідка'].includes(cfg.spec))add('armor',p=>storeRole(p)==='protection'&&storeHasPlates(p));if(!have.includes('Шолом')&&['Штурм','Розвідка','Оператор БпЛА'].includes(cfg.spec))add('head',p=>/шолом|каск/i.test(p.name));else add('head',p=>season==='Зима'?/шапк|балаклав/i.test(p.name):/кепк|панам|бейсбол/i.test(p.name));add('small',p=>storeRole(p)==='gloves',[size,num]);if(!have.includes('Рюкзак')&&['Штурм','Розвідка','Медик','Оператор БпЛА'].includes(cfg.spec))add('gear',p=>storeRole(p)==='backpack');return {lines,miss,names,sum};};
        storeImage=(row,p)=>{row.photoLoading='lazy';row.photoPriority='auto';if(!p)return;const cover=storeCardCover(p),urls=cover===''?[]:[...new Set([cover].concat((p.photoData||[]).flatMap(x=>[x.thumb,x.url]),p.photos||[]).filter(Boolean))];row.thumb=urls[0]||'';row.photo=urls[0]||'';row.hasThumb=row.hasPhoto=!!urls.length;row.noPhoto=!urls.length;row.photoErr=ev=>{const img=ev.currentTarget,idx=Number(img.dataset.tryIndex||0)+1;img.dataset.tryIndex=idx;if(urls[idx])img.src=urls[idx];else img.style.visibility='hidden';};};
        storeBundleLines=b=>(b.items||[]).map((it,i)=>{const id=typeof it==='string'?it:it.product_id,p=Z.find(p=>p.id===id&&p.storeReady);if(!p||!storeKitEligible(p))return null;const palette=this.state.kitPalettes?.[b.id],wanted=palette||it.color||'',keys=Object.keys(p.variants).filter(k=>this.avail(p,k)!=='out'),colors=[...new Set(keys.map(k=>p.variants[k].color))],neutral=colors.length===1&&['Койот','Олива','Чорний'].includes(storePalette(colors[0]));const exact=keys.filter(k=>!wanted||neutral||p.variants[k].color===wanted||(storePalette(wanted)&&storePalette(p.variants[k].color)===storePalette(wanted))),k=exact.find(k=>['L','50','43','Один розмір'].includes(p.variants[k].size_display))||exact[0]||keys[0];return k?Object.assign(this.kitLine(storeSlot(p),id,k),{qty:it.qty||1,color_fallback:!!wanted&&!neutral&&!exact.length}):null;}).filter(Boolean);
        storeBundleVm=b=>{const lines=this.storeBundleLines(b),c=St(this.kitLines(lines),1,!0),ps=lines.map(l=>Z.find(p=>p.id===l.id)),sets=ps.map(p=>[...new Set(Object.values(p.variants).filter(v=>v.availability!=='out_of_stock').map(v=>storePalette(v.color)).filter(Boolean))]).filter(s=>s.length>1||!['Койот','Олива','Чорний'].includes(s[0])),palettes=sets.length?sets.reduce((a,s)=>a.filter(c=>s.includes(c))):[];const row={...b,tag:b.tag||'Готовий комплект',sub:b.note||'',count:lines.length,name:b.name,comp:lines.map(l=>{const p=Z.find(p=>p.id===l.id);return {name:p.name+' · '+p.variants[l.size].color,href:'/product/'+p.slug,priceFmt:storeMoney(p.variants[l.size].price),view:()=>this.open(p.id)};}),compLabel:'Переглянути склад ('+lines.length+')',compOpen:!!this.state.bundleComp?.[b.id],toggleComp:()=>this.setState(s=>({bundleComp:{...(s.bundleComp||{}),[b.id]:!s.bundleComp?.[b.id]}})),fullFmt:storeMoney(c.full),priceFmt:storeMoney(c.kit),saveFmt:'вигода '+storeMoney(c.save)+(vt(c)?' · '+vt(c):''),open:()=>{this.setState({kit:lines,kitDefinition:b.id,kitFromPick:false,kitMiss:{},kitSeason:b.id==='b1'?'Літо':b.id==='b3'?'Зима':'Демісезон'});this.go('kit');},go:()=>{this.setState({kit:lines,kitDefinition:b.id,kitFromPick:false,kitMiss:{},kitSeason:b.id==='b1'?'Літо':b.id==='b3'?'Зима':'Демісезон'});this.go('kit');},hasPalettes:palettes.length>=2,palettes:palettes.map(color=>({name:color,pick:ev=>{ev?.stopPropagation?.();const ps={...(this.state.kitPalettes||{}),[b.id]:color};try{localStorage.setItem('rubizh.kit.palettes',JSON.stringify(ps))}catch(e){}this.setState({kitPalettes:ps});},style:{border:'1px solid '+(this.state.kitPalettes?.[b.id]===color?'var(--legacy-f2a33c)':'var(--legacy-3a423b)'),background:'transparent',color:'var(--legacy-edefea)',padding:'7px 9px',cursor:'pointer'}})),colorFallback:lines.some(l=>l.color_fallback)};row.add=row.open;this.storeImage(row,ps[0]);return row;};
        storeChangeKitColor=(uid,color)=>this.setState(s=>{const kit=s.kit.map(l=>{if(l.uid!==uid)return l;const p=Z.find(p=>p.id===l.id),old=p?.variants[l.size],keys=Object.keys(p?.variants||{}).filter(k=>p.variants[k].color===color&&this.avail(p,k)!=='out'),k=keys.find(k=>p.variants[k].size_native===old?.size_native||p.variants[k].size_display===old?.size_display);return {...l,color,size:k||l.size,needsSize:!k,previousSize:old?.size_display};});return {kit};});
        storeSelectKitSize=(uid,size)=>this.setState(s=>({kit:s.kit.map(l=>l.uid===uid?{...l,size,needsSize:false}:l)}));
        bumpQty=(idx,delta)=>this.setState(s=>{const cart=s.cart.slice(),l=cart[idx];if(!l)return {};const p=Z.find(p=>p.id===l.id),v=p?.variants[l.size],isArea=(l.sale_unit||p?.sale_unit)==='m2',qty=storeQty(Number(l.qty)+delta);if(delta>0&&v?.stockKnown&&v.availability==='in_stock'&&cart.filter(x=>x.sku===l.sku).reduce((n,x)=>n+Number(x.qty),0)+delta>v.stock)return {};if(qty<(isArea?.01:1))cart.splice(idx,1);else cart[idx]={...l,qty};return {cart:this.saveCart(cart),cartIssues:{},storeQuote:null};});
        storeAreaCartQty=(idx,raw)=>{const qty=storeQty(raw);if(!(qty>0&&qty<=10000))return;this.setState(s=>({cart:this.saveCart(s.cart.map((l,i)=>i===idx?{...l,qty}:l)),storeQuote:null}));};

        storeInit=async () => {
            this._storeInitializing = !0;
            try {
                const t = window.RUBIZH_BOOT?.categories ? {
                    categories: window.RUBIZH_BOOT.categories
                } : await this.storeRequest("/shop/catalog.php?action=categories");
                this._storeCategories = t.categories || [], Kt(this._storeCategories), await new Promise(t => this.setState({
                    storeCategories: this._storeCategories
                }, t));
            } catch (t) {
                this.setState({
                    storeError: t.message
                });
            }
            const t = window.RUBIZH_BOOT || {};
            if(t.settings)this.setState({storeSettings:t.settings});else this.storeRequest('/shop/analytics.php').then(j=>this.setState({storeSettings:j.settings||{}})).catch(()=>{});
            if(["home","kit","picker"].includes(this.state.screen))this.storeLoadRecommendations();
            t.product && (this.storeRelated(t.product), this.storeCache([ t.product ]), this.setState({
                current: t.product.id
            })), t.catalog && (this._storeFacets = t.catalog.facets, this._facetsKey = JSON.stringify([ this.state.cpath, this.state.sq, this.state.roots ]),
            this.storeCache(t.catalog.items), this.setState({
                storeCatalog: t.catalog,
                storePageItems: t.catalog.items.map(t => t.id),
                storeLoaded: !0
            }, this.rememberCatalog), this._storeQuery = this.storeQuery()), this._storeInitializing = !1,
            "product" === this.state.screen ? t.product && this.state.current === t.product.id ? this._storeProduct = t.product.id : await this.storeLoadProduct(this.state.current, t.slug) : ["home","catalog"].includes(this.state.screen) && !t.catalog && await this.storeLoadCatalog(),
            t.kitCode && await this.storeOpenKit(t.kitCode);
            try {
                const t = Array.from(new Set([ ...this.state.cart || [], ...this.state.kit || [], ...(this.state.seen||[]).map(id=>({id})),...(this.state.compare||[]).map(id=>({id})) ].map(t => t.id)));
                if (t.length) {
                    const e = await this.storeRequest("/shop/catalog.php?action=ids&ids=" + encodeURIComponent(t.join(",")));
                    this.storeCache(e.items);
                    const i = t.filter(t => !e.items.some(e => e.id === t));
                    for (const t of i) {
                        const e = Z.find(e => e.id === t);
                        e && (e.storeReady = !1);
                    }
                    // Removed or archived products leave the viewed history quietly; only cart/kit losses need the shopper.
                    if (i.length) {
                        const kept = [ ...this.state.cart || [], ...this.state.kit || [] ].some(l => i.includes(l.id));
                        this.setState(s => ({
                            seen: storeSeenSave((s.seen || []).filter(id => !i.includes(id))),
                            ...kept ? { storeError: "Деякі збережені товари більше недоступні. Перевірте кошик і комплект." } : {}
                        }));
                    }
                }
            } catch (t) {
                this.setState({
                    storeError: t.message
                });
            }
            this.setState(s=>({kit:s.kit.map(l=>({...l,slot:Ot(l.id)}))}));
            this.storeLoadRecommendations();
            const repeatId=this._requestedRepeatId||new URLSearchParams(window.location.hash.split('?')[1]||'').get('repeat');if(repeatId)this.storeRepeatOrder(repeatId);
            this.forceUpdate();
        };
        storeRelated=t => {
            if (!t || !Array.isArray(t.related)) return;
            (this._related ||= {})[t.id] = this.storeCache(t.related).map(t => t.id);
        };
        storePreloadKitSlots=async () => {
            // One lightweight response for all slots; full facets load only when a slot is opened.
            await this.storeLoadRecommendations();
            this.customerUnmounted || this.forceUpdate();
        };
        storeLoadProduct=async (t, e) => {
            const i = e || (Z.find(e => e.id === t && e.storeReady) || {}).slug || (window.location.pathname.startsWith("/product/") ? decodeURIComponent(window.location.pathname.slice(9)) : null);
            this._storeProduct = t;
            const s = ++this._productSeq;
            this.setState({
                storeProductLoading: !0,
                storeProductMissing: !1,
                storeError: ""
            });
            try {
                const e = await this.storeRequest("/shop/catalog.php?action=product&" + (i ? "slug=" + encodeURIComponent(i) : "id=" + encodeURIComponent(t)), null, "_productRequests");
                if (s !== this._productSeq || this.customerUnmounted) return;
                this.storeRelated(e.product);
                const o = this.storeCache([ e.product ])[0];
                this._storeProduct = o.id;
                this.setState({
                    current: o.id,
                    storeProductLoading: !1
                });
            } catch (t) {
                s !== this._productSeq || this.customerUnmounted || "AbortError" === t.name || this.setState({
                    storeProductLoading: !1,
                    storeProductMissing: !0,
                    storeError: t.message
                });
            }
        };
        refreshCustomerSession=async () => {
            try {
                const t = await this.storeRequest("/shop/customer.php");
                if (this.customerUnmounted) return;
                const e = this._storeCustomer === t.customer_id;
                this._storeCustomer = t.customer_id, this.storeCache(t.items);
                const i = {
                    monoEnabled:t.mono_enabled===true,invoiceEnabled:t.invoice_enabled===true,npEnabled:t.np_enabled===true,
                    donationChannel:t.preferences?.donation_channel||this.state.donationChannel||'viber',donationPhone:t.preferences?.donation_phone||this.state.donationPhone||'',
                    cartReminderAvailable:t.cart_reminders_enabled===true,cartReminderActive:t.cart_reminder?.active===true,
                    storeCsrf: t.csrf,
                    authed: t.authed,
                    authEmail: t.profile?.email || "",
                    storeProfile: t.profile
                };
                if (t.authed) {
                    if (i.fav = t.favorites || [], !e && !this.state.checkoutDirty) {
                        const e = t.profile;
                        Object.assign(i, {
                            checkoutName: [ e.first_name, e.last_name ].filter(Boolean).join(" "),
                            checkoutPhone: e.phone || "",
                            checkoutEmail: e.email || "",
                            cityQ: e.city || "",
                            city: e.city || "",
                            pointQ: e.delivery_address || "",
                            point: e.delivery_address || "",
                            delivery: {
                                branch: "np",
                                postomat: "box",
                                courier: "courier"
                            }[e.delivery_type] || "np"
                        });
                    }
                } else {
                    e || this.state.checkoutDirty || Object.assign(i, {
                        checkoutName: "",
                        checkoutPhone: "",
                        checkoutEmail: "",
                        cityQ: "",
                        city: "",
                        pointQ: "",
                        point: ""
                    });
                    try {
                        i.fav = JSON.parse(localStorage.getItem("rubizh.guestFavorites") || "[]").filter(t => "string" == typeof t).slice(0, 200);
                    } catch (t) {
                        i.fav = [];
                    }
                }
                if(!i.checkoutEmail&&!this.state.checkoutEmail&&t.cart_reminder?.email)i.checkoutEmail=t.cart_reminder.email;
                await new Promise(resolve=>this.setState(i,resolve));if(t.cart_restore_pending&&!this._cartRestorePending){this._cartRestorePending=true;await this.storeRestoreCart();this._cartRestorePending=false;}
                if (t.authed && !e) {
                    let t = [];
                    try {
                        t = JSON.parse(localStorage.getItem("rubizh.guestFavorites") || "[]");
                    } catch (t) {}
                    if (t.length) {
                        const e = await this.storeRequest("/shop/customer.php", {
                            action: "import",
                            ids: t
                        });
                        localStorage.removeItem("rubizh.guestFavorites"), this.storeCache(e.items), this.setState({
                            fav: e.favorites
                        });
                    }
                }
            } catch (t) {
                this.customerUnmounted || this.setState({
                    storeError: t.message
                });
            }
        };
        toggleFav=t => {
            if (this._favPending?.has(t)) return;
            const e = !this.state.fav.includes(t), i = this.state.fav, s = e ? i.concat(t) : i.filter(e => e !== t);
            if (this.setState({
                fav: s,
                storeError: ""
            }), this.state.authed) this._favPending = this._favPending || new Set, this._favPending.add(t),
            this.storeRequest("/shop/customer.php", {
                action: "favorite",
                product_id: t,
                enabled: e
            }).catch(i => this.setState(s => ({
                fav: e ? s.fav.filter(e => e !== t) : Array.from(new Set(s.fav.concat(t))),
                storeError: i.message
            }))).finally(() => this._favPending.delete(t)); else try {
                localStorage.setItem("rubizh.guestFavorites", JSON.stringify(s));
            } catch (t) {}
        };
        serverFetch=(t, e) => {
            const i = Z.find(e => e.id === t && e.storeReady), s = i?.variants[e];
            return {
                product: i || null,
                variant: s ? {
                    ...s,
                    price: s.price ?? i.price,
                    name: i.name,
                    product_id: i.id
                } : null
            };
        };
        npSearch=(kind,q='')=>{
            clearTimeout(this._npTimer);
            const city=this.state.npCityRef||'',delivery=this.state.delivery,seq=(this._npSeq||0)+1;this._npSeq=seq;
            this._npTimer=setTimeout(async()=>{
                const current=()=>!this.customerUnmounted&&seq===this._npSeq;
                const sameDirectory=()=>city===(this.state.npCityRef||'')&&delivery===this.state.delivery;
                if(!current())return;
                if(!this.state.npEnabled||!sameDirectory()){this.setState({npLoading:false});return;}
                this.setState({npLoading:true,npError:''});
                try{const type=delivery==='box'?'postomat':'branch';const r=await this.storeRequest('/shop/np-directory.php?kind='+kind+'&q='+encodeURIComponent(q)+'&city_ref='+encodeURIComponent(city)+'&type='+type);
                    if(!current())return;
                    if(!sameDirectory()){this.setState({npLoading:false});return;}
                    this.setState({npLoading:false,npManual:false,npEnabled:r.enabled!==false,...(kind==='cities'?{npCities:r.items||[]}:{npPoints:r.items||[]})});
                }catch(err){if(current())this.setState({npLoading:false,...(sameDirectory()?(err.status===503?{npManual:true,city:this.state.cityQ||'',point:this.state.pointQ||'',npCities:[],npPoints:[],cityOpen:false,pointOpen:false,npError:'Довідник НП тимчасово недоступний. Введіть місто та адресу — менеджер перевірить їх перед відправленням.'}:{npManual:false,npError:'Не вдалося завантажити довідник НП. Спробуйте ще раз.'}):{})});}
            },280);
        };
        npCityInput=ev=>{const value=ev.target.value;this.setState({cityQ:value,city:this.state.npEnabled&&!this.state.npManual?'':value,cityOpen:true,point:'',pointQ:'',npCityRef:'',npWarehouseRef:'',npStreetRef:'',npCities:[],npPoints:[],npBuilding:'',npFlat:'',checkoutDirty:true,storeQuote:null});if(this.state.npEnabled&&!this.state.npManual&&value.trim().length>=2)this.npSearch('cities',value);else{clearTimeout(this._npTimer);this._npSeq=(this._npSeq||0)+1;this.setState({npLoading:false});}};
        npPointInput=ev=>{const value=ev.target.value;this.setState({pointQ:value,point:this.state.npEnabled&&!this.state.npManual?'':value,pointOpen:true,npWarehouseRef:'',npStreetRef:'',npPoints:[],checkoutDirty:true,storeQuote:null});if(this.state.npEnabled&&!this.state.npManual)this.npSearch(this.state.delivery==='courier'?'streets':'warehouses',value);};
        npClear=()=>{clearTimeout(this._npTimer);this._npSeq=(this._npSeq||0)+1;this.setState({city:'',cityQ:'',point:'',pointQ:'',npCityRef:'',npWarehouseRef:'',npStreetRef:'',npCities:[],npPoints:[],npBuilding:'',npFlat:'',npError:'',npLoading:false,cityOpen:false,pointOpen:false,checkoutDirty:true,storeQuote:null});};

        storeCheckoutField=(t, e) => this.setState({
            [t]: e.target.value,
            checkoutDirty: !0,
            checkoutError: "",
            storeQuote: null
        },()=>{if(t==="checkoutEmail"&&this.state.cartReminderActive)this.storeCartReminderSchedule();});
        storeReminderLines=cart=>cart.map(l=>{const p=Z.find(p=>p.id===l.id),v3=storeV3PricingLine(l,p,p?.variants[l.size]);if(v3)return v3;return {product_id:l.id,sku:l.sku||p?.variants[l.size]?.sku,qty:l.qty,price_mode:l.kit&&!l.kitRetail?'kit':'retail',kit_group:l.kit?l.kitId||'kit':'',...(l.kit?{kit_units:l.kitUnits||1}:{})};});
        storeCartReminderQueue=(action,cart=this.state.cart)=>{
            const generation=this._cartReminderGeneration=(this._cartReminderGeneration||0)+1;const payload=action==='save'?{action,consent:true,email:(this.state.checkoutEmail||'').trim(),lines:this.storeReminderLines(cart)}:{action};
            this._cartReminderTail=(this._cartReminderTail||Promise.resolve()).catch(()=>{}).then(async()=>{
                if(this.customerUnmounted||generation!==this._cartReminderGeneration)return;if(action==='save'&&this.state.orderSending)return;
                try{const result=await this.storeRequest('/shop/cart-reminder.php',payload);if(!this.customerUnmounted&&generation===this._cartReminderGeneration)this.setState({cartReminderActive:result.active===true,cartReminderNotice:result.active?'Нагадування збережено. Один лист через 24 години, якщо замовлення не буде оформлено.':'Нагадування вимкнено.'});}
                catch(error){if(!this.customerUnmounted&&generation===this._cartReminderGeneration)this.setState({cartReminderActive:false,cartReminderNotice:error.message});}
            });return this._cartReminderTail;
        };
        storeCartReminderSchedule=(cart=this.state.cart)=>{clearTimeout(this._cartReminderTimer);if(!this.state.cartReminderActive)return;this._cartReminderTimer=setTimeout(()=>{
            const valid=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((this.state.checkoutEmail||'').trim());
            if(!cart.length||!valid){this.setState({cartReminderActive:false});this.storeCartReminderQueue('cancel');}
            else this.storeCartReminderQueue('save',cart);
        },600);};
        storeCartReminderToggle=event=>{clearTimeout(this._cartReminderTimer);if(!event.target.checked){this.setState({cartReminderActive:false});this.storeCartReminderQueue('cancel');return;}
            if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((this.state.checkoutEmail||'').trim())){this.setState({cartReminderActive:false,cartReminderNotice:'Спочатку вкажіть коректний email.'});document.querySelector('input[name="email"]')?.focus();return;}
            this.setState({cartReminderActive:true,cartReminderNotice:'Зберігаємо нагадування…'});this.storeCartReminderQueue('save');
        };
        storeRestoreCart=async()=>{try{const result=await this.storeRequest('/shop/cart-reminder.php',{action:'restore'});this.storeCache(result.products);const restored=[];
            for(const line of result.items||[]){const p=Z.find(p=>p.id===line.product_id),key=Object.keys(p?.variants||{}).find(k=>p.variants[k].sku===line.sku&&!p.variants[k].size_unconfirmed&&this.avail(p,k)!=='out');if(!key)continue;const v=p.variants[key],item={id:p.id,name:p.name,size:key,sku:v.sku,qty:Number(line.qty),price:v.price,sale_unit:p.sale_unit,color:v.color,colorId:v.color_id,optionId:v.option_id,kit:!!line.kit_group,kitRetail:!!line.kit_group&&line.price_mode==='retail',kitId:line.kit_group||undefined,kitUnits:line.kit_units||1,kitSlot:storeSlot(p)};
                // Older reminder snapshots may contain kit/retail fragments. Sum them before merging a local copy.
                const same=restored.find(l=>l.sku===item.sku&&(l.kitId||'')===(item.kitId||'')&&!!l.kitRetail===!!item.kitRetail);if(same)same.qty=storeQty(same.qty+item.qty);else restored.push(item);}
            const merged=this.state.cart.slice();for(const line of restored){const index=merged.findIndex(l=>l.sku===line.sku&&(l.kitId||'')===(line.kitId||'')&&!!l.kitRetail===!!line.kitRetail);if(index<0)merged.push(line);else merged[index]={...line,qty:Math.max(Number(line.qty),Number(merged[index].qty))};}
            const cart=this.saveCart(merged),notice=result.omitted?'Кошик відновлено. Недоступні товари пропущено.':'Кошик відновлено. Перевірте товари перед оформленням.',kitIds=new Set(restored.filter(l=>l.kit).map(l=>l.kitId));
            const kitNotice=!kitIds.size?'':cart.some(l=>kitIds.has(l.kitId)&&l.kitQty>0)?' Ціни комплекту перераховано за актуальними правилами: спеціальна ціна діє на одну одиницю кожної речі на комплект; решта — за звичайною ціною.':' Ціни комплекту перераховано за актуальними правилами: для поточного складу застосовано звичайні ціни.';
            this.setState({cart,cartReminderNotice:notice+kitNotice,storeQuote:null});this.go('cart');
        }catch(error){this.setState({cartReminderNotice:error.message});}};
        submitOrder=async t => {
            const c=this.state,checks=[['name',(c.checkoutName||'').trim().split(/\s+/).length>=2,'Вкажіть ім’я та прізвище отримувача'],['phone',/^380\d{9}$/.test((c.checkoutPhone||'').replace(/\D/g,'').replace(/^0/,'380')),'Вкажіть номер телефону'],['email',!(c.checkoutEmail||'').trim()||/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((c.checkoutEmail||'').trim()),'Перевірте email або залиште поле порожнім'],['city',(c.cityQ||'').trim().length>=2,'Вкажіть місто'],['address',(c.pointQ||'').trim().length>=2,'Вкажіть відділення або адресу']];
            let first=null;for(const [name,ok,note] of checks){const el=document.querySelector('input[name="'+name+'"]');el?.setAttribute('aria-invalid',ok?'false':'true');if(!ok&&!first)first={el,note};}if(first){this.setState({checkoutError:first.note});first.el?.scrollIntoView({block:'center',behavior:'smooth'});first.el?.focus({preventScroll:true});return;}

            if(c.npEnabled && !c.npManual && (!c.npCityRef || (c.delivery==='courier'?(!c.npStreetRef||!c.npBuilding):!c.npWarehouseRef))){this.setState({checkoutError:'Оберіть місто й місце отримання у довіднику НП; для кур’єра вкажіть будинок.'});document.querySelector('input[name="'+(!c.npCityRef?'city':c.delivery==='courier'&&!c.npBuilding?'building':'address')+'"]')?.focus();return;}
            if (this.state.orderSending) return;
            const e = this.state, i = {
                lines: this.storePricingLines(t),
                contact: {
                    name: e.checkoutName,
                    phone: e.checkoutPhone,
                    email: e.checkoutEmail,
                    recipient: e.checkoutRecipient || "",
                    city: e.cityQ,
                    address: e.pointQ+(e.delivery==='courier'&&e.npBuilding?', '+e.npBuilding+(e.npFlat?', кв. '+e.npFlat:''):''),
                    np_delivery:{city_ref:e.npCityRef||'',warehouse_ref:e.npWarehouseRef||'',street_ref:e.npStreetRef||'',building:e.npBuilding||'',flat:e.npFlat||''},
                    delivery_type: {
                        np: "branch",
                        box: "postomat",
                        courier: "courier"
                    }[e.delivery] || "branch",
                    comment: e.checkoutComment || "",
                    brigade:(e.donationBrigade||'').trim(),donation_channel:e.donationChannel||'viber',donation_phone:e.donationPhone||e.checkoutPhone,
                    ...(storeCheckoutPay(e)==='invoice'?{payer_name:(e.payerName||'').trim(),payer_code:(e.payerCode||'').trim(),payer_address:(e.payerAddress||'').trim()}:{})
                },
                payment: storeCheckoutPay(e),
                promo: e.promo || ""
            }, s = JSON.stringify(i);
            const orderCart=this._cartId||'',orderItems=t;this._orderFingerprint !== s && (this._orderFingerprint = s, this._orderKey = storeAttemptKey(orderCart, s));
            const o = this.renderVals(), a = e.storeQuote?.total ?? o.storeTotal;
            clearTimeout(this._cartReminderTimer);this._cartReminderGeneration=(this._cartReminderGeneration||0)+1;this.setState({
                orderSending: !0,
                checkoutError: ""
            });
            try {
                const t = await this.storeRequest("/shop/order.php", {
                    ...i,
                    request_id: this._orderKey,
                    expected_total: a,
                    ...(this.state.storeQuote?.catalog_version?{catalog_version:this.state.storeQuote.catalog_version}:{})
                }), e = t.order, s = {
                    ...e,
                    lines: e.items || this.state.cart.map(t => ({
                        ...t,
                        name: t.name,
                        price: t.kitPrice ?? t.price
                    }))
                };
                try{sessionStorage.setItem('rubizh.lastOrderNumber',e.number);}catch(err){}
                this._receiptKey=e.number;
                this.setState({
                    orderSending: !1,
                    receiptError:'',receiptLoading:false,
                    lastOrder: s,orderNumber:e.number,
                    storeQuote: null,
                    cart: this.saveCart([]),
                    cartReminderActive:false,
                    orderEmailStatus: t.email_status || "pending",
                    checkoutDirty: !1
                }), storeAttemptDone(orderCart, this._orderKey, orderItems), this._orderFingerprint = null, this._orderKey = null, this.go("done");if(e.payment_status==='paid')this.storeTrackPaid(e);if(t.payment?.url&&/^(?:https:\/\/(?:pay\.mbnk\.biz|pay\.monobank\.ua)\/|\/shop\/mono-mock-pay\.php\?invoice=mock[0-9a-f]{20}$)/.test(t.payment.url))window.location.assign(t.payment.url);
                // Q-7: an order the server already confirmed (confirmed stock, card) goes straight to MonoPay through the same
                // validated payment start as the receipt button; a refusal leaves the receipt with its «Сплатити» button.
                else if(e.payment_ready&&e.payment_method==='card'&&e.payment_status!=='paid'){try{const pay=await this.storeRequest('/shop/payment-start.php',{order_id:e.id});if(/^(?:https:\/\/(?:pay\.mbnk\.biz|pay\.monobank\.ua)\/|\/shop\/mono-mock-pay\.php\?invoice=mock[0-9a-f]{20}$)/.test(pay.url||''))window.location.assign(pay.url);}catch(err){this.setState({receiptActionError:err.message});}}
            } catch (t) {
                this.setState({
                    orderSending: !1,
                    checkoutError: t.message,
                    ...t.data?.quote ? {
                        storeQuote: t.data.quote
                    } : {}
                });
            }
        };
        kitSaveLink=async () => {
            if(this.state.kit.some(l=>l.needsSize)){this.setState({storeError:"Спочатку оберіть розміри у вибраних кольорах."});return null;}
            if (this.state.kitSaving) return null;
            if (this._sharedKitFingerprint === JSON.stringify(this.state.kit) && this.state.kitLink) return this.state.kitLink;
            this.setState({
                kitSaving: !0,
                kitCopied: "Зберігаємо комплект…"
            });
            const t = JSON.stringify(this.state.kit);
            try {
                const e = this.kitLines().map(t => ({
                    product_id: t.p.id,
                    sku: t.v.sku,
                    qty: t.l.qty || 1,
                    slot: t.l.slot
                })), i = await this.storeRequest("/shop/kits.php", {
                    lines: e
                });
                return this._sharedKitFingerprint = t, t !== JSON.stringify(this.state.kit) ? (this.setState({
                    kitSaving: !1,
                    kitLink: "",
                    kitCopied: "Комплект змінено. Збережіть посилання ще раз."
                }), null) : (this.setState({
                    kitSaving: !1,
                    kitLink: i.url,
                    kitCopied: "Посилання збережено"
                }), i.url);
            } catch (t) {
                return this.setState({
                    kitSaving: !1,
                    kitCopied: t.message
                }), null;
            }
        };
        kitShare=async () => {
            if(this.state.kit.some(l=>l.needsSize)){this.setState({storeError:"Спочатку оберіть розміри у вибраних кольорах."});return;}
            const t = this._sharedKitFingerprint === JSON.stringify(this.state.kit) ? this.state.kitLink : await this.kitSaveLink();
            if (t) try {
                await navigator.clipboard.writeText("Ось комплект, який я зібрав: " + t), this.setState({
                    kitCopied: "Посилання скопійовано"
                });
            } catch (t) {
                this.setState({
                    kitCopied: "Скопіюйте посилання вище"
                });
            }
        };
        storeOpenKit=async t => {
            try {
                const e = await this.storeRequest("/shop/kits.php?code=" + encodeURIComponent(t));
                this.storeCache(e.items);
                const i = [], s = [];
                for (const t of e.lines) {
                    const e = Z.find(e => e.id === t.product_id && e.storeReady), o = e && Object.entries(e.variants).find(([, e]) => e.sku === t.sku);
                    e && o ? i.push({
                        ...this.kitLine(wt.some(e => e[0] === t.slot) ? t.slot : Ot(e.id), e.id, o[0]),
                        qty: t.qty
                    }) : s.push(t.sku);
                }
                this._sharedKitFingerprint = JSON.stringify(i), this.setState({
                    kit: i,
                    kitFriend: !0,
                    kitLink: "https://rubizh.shop/kit/" + t,
                    storeError: s.length ? "Деякі товари з комплекту вже недоступні. Перевірте склад перед покупкою." : ""
                }), this.go("kit");
            } catch (t) {
                this.setState({
                    storeError: t.message
                }), this.go("kit");
            }
        };
        storeReceiptNumber=()=>{if(this.state.orderNumber)return this.state.orderNumber;const query=new URLSearchParams(window.location.hash.split('?')[1]||'');if(query.has('order'))return query.get('order');if(this.state.lastOrder?.number)return this.state.lastOrder.number;try{return sessionStorage.getItem('rubizh.lastOrderNumber')||'';}catch(e){return '';}};
        storeTrackPaid=o=>{if(o.payment_status==='paid')window.rubizhAnalytics?.track('purchase',{transaction_id:o.number,value:Number(o.total),items:(o.items||o.lines||[]).map(l=>({item_id:l.sku,item_name:l.name,price:l.price,quantity:l.qty}))});};
        storeLoadReceipt=async()=>{
            const number=this.storeReceiptNumber();
            if(this._receiptPending===number&&number)return;
            const seq=this._receiptSeq=(this._receiptSeq||0)+1;
            if(!number){this._receiptPending=null;this.setState({lastOrder:null,receiptLoading:false,receiptError:'Номер замовлення відсутній. Відкрийте замовлення у своєму кабінеті.'});return;}
            this._receiptPending=number;
            const previous=this.state.lastOrder?.number===number?this.state.lastOrder:null;
            this.setState({lastOrder:previous,receiptLoading:!previous,receiptError:''});
            const current=()=>!this.customerUnmounted&&seq===this._receiptSeq&&number===this.storeReceiptNumber();
            try{
                const result=await this.storeRequest('/shop/order-status.php?number='+encodeURIComponent(number));
                if(!current())return;
                if(result.order?.number!==number||!result.order?.items?.length)throw new Error('Сервер не повернув дані замовлення. Спробуйте ще раз.');
                const order={...result.order,lines:result.order.items};
                this.setState({lastOrder:order,receiptLoading:false,receiptError:'',orderEmailStatus:result.email_status});this.storeTrackPaid(order);
            }catch(error){if(current())this.setState({receiptLoading:false,receiptError:error.message});}
            finally{if(seq===this._receiptSeq)this._receiptPending=null;}
        };
        historyUrl=t => {
            const e = new URLSearchParams;
            if(t.screen==='done')return '/#done?order='+encodeURIComponent(t.orderNumber||t.lastOrder?.number||this.storeReceiptNumber());
            if ("home" === t.screen) return "/";
            if ("product" === t.screen) {
                const e = Z.find(e => e.id === t.current);
                return "/product/" + encodeURIComponent(e?.slug || t.current) + (e?.v3 && t.productColorId ? "?color=" + encodeURIComponent(t.productColorId) : "");
            }
            if ("catalog" === t.screen) {
                t.sq && e.set("q", t.sq), t.catPg > 1 && e.set("page", t.catPg);
                for (const i of [ "sort", "quick", "priceFrom", "priceTo" ]) t[i] && e.set(i, t[i]);
                const group=!(t.cpath||[]).length&&storeGroupForRoots(t.roots);
                for (const i of [ "camo", "sizes", "brands", "attrs", "roots" ]) t[i]?.length && !(group&&i==="roots") && e.set(i, JSON.stringify(t[i]));
                t.inStock && e.set("inStock", "1"), !1 === t.withOrder && e.set("withOrder", "0");
                return (group ? "/rozdil/" + group.slug : X(t.cpath||[])) + (e.size ? "?" + e : "");
            }
            if(t.screen==='allcats')return '/categories';if(t.screen==='guides')return '/porady';if(t.screen==='guide')return '/porady/'+w((A.find(g=>g.key===t.guide)||A[0]).title);
            return "kit" === t.screen && /^https:\/\/rubizh\.shop\/kit\/[a-f0-9]{32}$/.test(this.state.kitLink || "") ? new URL(this.state.kitLink).pathname : "kit" === t.screen ? "/kit/" : "page" === t.screen && [ "offer", "privacy" ].includes(t.page) ? "/" + t.page : ("page" === t.screen && e.set("id", t.page),
            "guide" === t.screen && e.set("id", t.guide), "/#" + t.screen + (e.size ? "?" + e : ""));
        };
        historyReadUrl=() => {
            const t = window.RUBIZH_BOOT || {}, e = window.location.pathname, i = new URLSearchParams(window.location.search), s = window.location.hash;
            let o = /^#(?:account|login|track)(?:\?|$)/.test(s) ? "/auth/" + (s.startsWith("#track") ? "?tab=orders" : "") : null;
            if (s.startsWith("#page?")) {
                const t = new URLSearchParams(s.split("?")[1]).get("id");
                [ "offer", "privacy" ].includes(t) && (o = "/" + t);
            }
            if (o) return window.location.assign(o), this.historyRoute({
                ...this.state,
                screen: "home"
            });
            if (e.startsWith("/product/")) {
                const i = decodeURIComponent(e.slice(9)), s = Z.find(t => t.slug === i);
                return this.historyRoute({
                    ...this.state,
                    screen: "product",
                    current: s?.id || t.product?.id || i,
                    productColorId: new URLSearchParams(window.location.search).get("color") || void 0
                });
            }
            if(e==='/porady'||e==='/porady/')return this.historyRoute({...this.state,screen:'guides'});if(e.startsWith('/porady/')){const key=t.guideKey||A.find(g=>w(g.title)===decodeURIComponent(e.slice(8)))?.key;if(key)return this.historyRoute({...this.state,screen:'guide',guide:key});}
            if(e.startsWith('/rozdil/')){const g=storeGroups().find(g=>g.slug===e.slice(8).replace(/\/$/,''));if(g){const r={...this.state,screen:'catalog',cpath:[],roots:g.roots.slice(),rootsTitle:g.title,sq:(i.get('q')||'').trim(),catPg:Math.max(1,Number(i.get('page'))||1),sort:i.get('sort')||'pop',quick:i.get('quick')||null,priceFrom:i.get('priceFrom')||'',priceTo:i.get('priceTo')||''};/* every filter follows the address (back/forward never keeps the previous page's filters) */for(const k of ['camo','sizes','brands','attrs'])try{const v=JSON.parse(i.get(k)||'[]');Array.isArray(v)&&(r[k]=v.filter(x=>typeof x==='string'));}catch(x){}r.inStock=i.get('inStock')==='1';r.withOrder=i.get('withOrder')!=='0';return this.historyRoute(r);}}
            // Stage 5 (D-62): the old group sections /categories#ac-<first root> now live on the group page.
            if(e==='/categories'){const old=storeGroups().find(g=>location.hash==='#ac-'+w(g.roots[0]));if(old){try{history.replaceState(null,'','/rozdil/'+old.slug);}catch(x){}return this.historyRoute({...this.state,screen:'catalog',cpath:[],roots:old.roots.slice(),rootsTitle:old.title,sq:'',catPg:1,sort:'pop',quick:null,priceFrom:'',priceTo:''});}}
            if(e==='/categories'){/* D-62: /categories#ac-<section> scrolls to that section once the directory is rendered and the first-load scroll restore is done (5.4.1: on a slow CPU that restore came later and put the page back to the top). */const anchor=/^#ac-[a-z0-9-]+$/.test(location.hash)?location.hash.slice(1):'';if(anchor){let tries=0;const seek=()=>{const el=document.getElementById(anchor);const go=()=>window.scrollTo({top:el.getBoundingClientRect().top+window.scrollY-80});if(el&&!this._historyRestoring)go();else if(++tries<60)setTimeout(seek,75);else if(el)go();};setTimeout(seek,90);}return this.historyRoute({...this.state,screen:'allcats'});}
            if(e==='/kit'||e==='/kit/')return this.historyRoute({...this.state,screen:'kit'});
            if ("/catalog" === e || e.startsWith("/catalog/")) {
                const s = e.slice(9).replace(/^\//, ""), o = (this._storeCategories || t.categories || []).find(t => t.url_path === s), a = o?.path.split(" / ") || t.categoryPath || [], r = {
                    ...this.state,
                    screen: "catalog",
                    cpath: a,
                    sq: (i.get("q") || "").trim(),
                    catPg: Math.max(1, Number(i.get("page")) || 1)
                };
                for (const t of [ "sort", "quick", "priceFrom", "priceTo" ]) i.has(t) && (r[t] = i.get(t));
                for (const t of [ "camo", "sizes", "brands", "attrs", "roots" ]) try {
                    const e = JSON.parse(i.get(t) || "[]");
                    Array.isArray(e) && (r[t] = e.filter(t => "string" == typeof t));
                } catch (t) {}
                return r.inStock = "1" === i.get("inStock"), r.withOrder = "0" !== i.get("withOrder"),
                this.historyRoute(r);
            }
            return e.startsWith("/kit/") ? this.historyRoute({
                ...this.state,
                screen: "kit"
            }) : this.historyReadLegacyUrl();
        };
        storeRepeatOrder=async id=>{try{const result=await this.storeRequest('/shop/repeat-order.php?order='+encodeURIComponent(id));this.storeCache(result.products);const added=[],missing=[];for(const line of result.items){const product=Z.find(p=>p.id===line.product_id&&p.storeReady),key=Object.keys(product?.variants||{}).find(k=>product.variants[k].sku===line.sku&&this.avail(product,k)!=='out');if(!key){missing.push(line.name);continue;}const variant=product.variants[key];added.push({id:product.id,name:product.name,size:key,sku:variant.sku,qty:line.qty,price:variant.price,sale_unit:product.sale_unit,color:variant.color});}// An SKU already in the cart (outside a kit) gets its quantity raised instead of a second line (ADDENDUM P-6).
this.setState(s=>{const cart=s.cart.map(l=>({...l}));for(const a of added){const same=cart.find(l=>!l.kit&&l.id===a.id&&l.size===a.size&&l.sku===a.sku);if(same)same.qty=(same.qty||1)+a.qty;else cart.push(a);}return {cart:this.saveCart(cart),storeError:missing.length?'Не додано, бо немає в наявності або варіант змінився: '+missing.join(', ')+'. Відкрийте товар у каталозі, щоб обрати інший розмір чи колір.':''};});this.go('cart');}catch(error){this.setState({storeError:error.message});}};
        storeGoPage=t => {
            [ "offer", "privacy" ].includes(t) ? window.location.assign("/" + t) : this.go("page", {
                page: t
            });
        };
        // Меню «Каталог» (ТЗ «меню Каталог», 05.10.2026). Дерево — живе K з catalog.php?action=categories.
        // Конфігурацію можна перевизначити через window.RUBIZH_CATALOG_MENU = {roots:[{icon,paths}], quick:[{name,paths}], quickTitle}.
        cmIcons={
            uniform: "M9 3.5 5 5.5 3.5 19.5h3M15 3.5l4 2 1.5 14h-3M6.5 10v10.5h11V10M9 3.5 12 7l3-3.5M12 7v13.5M8.5 14h2M13.5 14h2",
            boots: "M6 3h6v9l5.6 2.2c1.9.8 3.4 2 3.4 3.8v1H6V3ZM6 21h15M6 6.5h3M6 9.5h3M14.5 13.4l-1.2 2.4M17.6 14.8l-1.2 2.4",
            armor: "M8.5 3v2.5c0 1.2 1.6 2.2 3.5 2.2s3.5-1 3.5-2.2V3M8.5 3h-2v4.5l-2 2.5v10.5h15V10l-2-2.5V3h-2M4.5 14h15M4.5 17.5h15M10 11h4",
            helmet: "M3.5 16a8.5 8.5 0 0 1 17-2.5V16H12l-2 3H5.5a2 2 0 0 1-2-2ZM20.5 13.5H14M9 19l-1.2 2.5",
            bag: "M9 5.5v-1a3 3 0 0 1 6 0v1M7.5 5.5h9a2 2 0 0 1 2 2V20a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V7.5a2 2 0 0 1 2-2ZM8.5 13h7v5h-7ZM8.5 15.5h7M10 9h4",
            comms: "M9.5 2.5V8M8 8h8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1ZM9.5 11h5v3h-5ZM10 16.5h4M10 18.5h4",
            gear: "M4 7h16v13H4ZM9 7V5h6v2M4 12h16"
        };
        cmCfg=() => {
            const c = window.RUBIZH_CATALOG_MENU || {};
            return {
                roots: c.roots || [
                    { icon: "uniform", paths: [ [ "Одяг та форма" ] ] },
                    { icon: "boots", paths: [ [ "Взуття" ] ] },
                    { icon: "armor", paths: [ [ "Бронезахист" ] ] },
                    { icon: "helmet", paths: [ [ "Шоломи та захист голови" ] ] },
                    { icon: "bag", paths: [ [ "Рюкзаки, сумки та баули" ] ] },
                    { icon: "comms", paths: [ [ "Тактичний зв’язок та слух" ] ] }
                ],
                quick: c.quick || [
                    { name: "Штани", paths: [ ["Одяг та форма", "Штани"], [ "Одяг та форма", "Чоловічий одяг", "Тактичні штани" ], [ "Одяг та форма", "Жіночий одяг", "Тактичні штани" ] ] },
                    { name: "Плитоноски", paths: [ [ "Бронезахист", "Плитоноски" ] ] },
                    { name: "Балістичні шоломи", paths: [ ["Шоломи та захист голови", "Балістичні шоломи"], [ "Шоломи та захист голови", "Шоломи", "FAST" ] ] },
                    { name: "Аптечки IFAK", paths: [ ["Підсумки", "Медичні / IFAK"], [ "Підсумки", "Медичні підсумки", "Аптечки IFAK" ], [ "Тактична медицина" ] ] }
                ],
                quickTitle: c.quickTitle || "Швидкий перехід"
            };
        };
        cmNorm=s => String(s || "").toLowerCase().replace(/[\u2019'\u02bc`]/g, "").replace(/\s+/g, " ").trim();
        cmNode=p => {
            let l = K, n = null;
            for (const s of p || []) {
                if (n = l.find(x => this.cmNorm(x.name) === this.cmNorm(s)), !n) return null;
                l = n.kids;
            }
            return n;
        };
        cmLive=n => {
            if (!n) return !1;
            const c = this._storeCategories || window.RUBIZH_BOOT?.categories || [];
            return !c.length || this.nodeCount(n.path) > 0;
        };
        cmPick=ps => {
            for (const p of ps || []) {
                const n = this.cmNode(p);
                if (this.cmLive(n)) return n;
            }
            return null;
        };
        cmSearch=(q, scope) => {
            const n = this.cmNorm(q);
            if (!n) return [];
            const k = n.split(" "), out = [], walk = (l, par) => l.forEach(x => {
                const nm = this.cmNorm(x.name), hay = this.cmNorm(x.path.join(" "));
                const dup = par && !x.kids.length && this.cmNorm(par.name) === nm;
                !dup && k.every(t => hay.includes(t)) && k.some(t => nm.includes(t)) && this.cmLive(x) && out.push({ x, s: (nm.startsWith(n) ? 0 : 10) + x.path.length });
                walk(x.kids, x);
            });
            return walk(scope ? scope.kids : K, scope || null), out.sort((a, b) => a.s - b.s).slice(0, 8).map(o => o.x);
        };
        cmPos=() => {
            const h = document.querySelector("header");
            h && document.documentElement.style.setProperty("--cm-top", Math.max(0, Math.round(h.getBoundingClientRect().bottom)) + "px");
        };
        cmHover=() => window.matchMedia("(hover:hover) and (pointer:fine)").matches;
        cmOpen=(mode, focus) => {
            clearTimeout(this._cmT), this.cmPos();
            this._cmPosOn || (this._cmPosOn = 1, window.addEventListener("scroll", () => this.state.menuOpen && this.cmPos(), { passive: !0 }), window.addEventListener("resize", () => this.state.menuOpen && this.cmPos()));
            this.setState({ menuOpen: !0, cmMode: mode }, () => {
                focus && document.querySelector("[data-cm-panel] input")?.focus({ preventScroll: !0 });
            });
        };
        cmClose=refocus => {
            if (clearTimeout(this._cmT), !this.state.menuOpen) return;
            this.setState({ menuOpen: !1, cmMode: null, cmQ: "", cmQDeb: "" }, () => {
                refocus && document.querySelector("[data-cm-trigger]")?.focus({ preventScroll: !0 });
            });
        };
        cmLater=() => {
            clearTimeout(this._cmT), "hover" === this.state.cmMode && (this._cmT = setTimeout(() => "hover" === this.state.cmMode && this.cmClose(!1), 200));
        };
        cmMod=ev => ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey || ev.button > 0);
        cmGo=(ev, fn) => {
            if (this.cmMod(ev)) return;
            ev?.preventDefault?.(), clearTimeout(this._cmT), this.setState({ cmQ: "", cmQDeb: "", cmMode: null, cmSec: null }), fn();
        };
        catMenuVm=e => {
            const cfg = this.cmCfg(), body = () => document.querySelector("[data-cm-mbody]"), go = n => ev => this.cmGo(ev, () => this.goPath(n.path));
            const sec = e.cmSec ? this.cmNode(e.cmSec) : null;
            const roots = cfg.roots.map(r => ({ r, n: this.cmPick(r.paths || [ r.path ]) })).filter(o => o.n).map(({ r, n }) => ({
                name: n.name,
                href: X(n.path),
                icon: this.cmIcons[r.icon] || this.cmIcons.gear,
                open: go(n),
                openSec: ev => {
                    if (this.cmMod(ev)) return;
                    ev?.preventDefault?.();
                    const b = body();
                    this._cmScroll = b ? b.scrollTop : 0, this.setState({ cmSec: n.path.slice(), cmQ: "", cmQDeb: "" }, () => {
                        const b = body();
                        b && (b.scrollTop = 0), document.querySelector("[data-cm-back]")?.focus({ preventScroll: !0 });
                    });
                }
            }));
            const quick = cfg.quick.map(q => ({ q, n: this.cmPick(q.paths || [ q.path ]) })).filter(o => o.n).map(({ q, n }) => ({
                name: q.name || n.name,
                href: X(n.path),
                open: go(n)
            }));
            const sub = [];
            sec && sec.kids.filter(k => this.cmLive(k)).forEach(k => {
                const lv = k.kids.filter(l => this.cmLive(l) && this.cmNorm(l.name) !== this.cmNorm(k.name));
                sub.push({ kind: lv.length ? "group" : "item", name: k.name, href: X(k.path), open: go(k) });
                lv.forEach(l => sub.push({ kind: "leaf", name: l.name, href: X(l.path), open: go(l) }));
            });
            const q = String(e.cmQ || ""), qt = q.trim(), deb = String(e.cmQDeb || "").trim(), loading = !!qt && qt !== deb;
            const found = qt && !loading ? this.cmSearch(deb, sec) : [];
            const searchAll = () => {
                const v = (this.state.cmQ || "").trim();
                if (!v) return;
                clearTimeout(this._cmT), this.setState({ menuOpen: !1, burger: !1, cmMode: null, cmQ: "", cmQDeb: "", cmSec: null, q: v }), this.doSearch(v);
            };
            const allCats = ev => this.cmGo(ev, () => this.goAllCats());
            return {
                cmExpanded: e.menuOpen ? "true" : "false",
                burgerExpanded: e.burger ? "true" : "false",
                cmTrigEnter: () => {
                    this.cmHover() && (clearTimeout(this._cmT), this.state.menuOpen || this.cmOpen("hover", !1));
                },
                cmTrigLeave: () => this.cmLater(),
                cmTrigClick: ev => {
                    const kb = ev && 0 === ev.detail, s = this.state;
                    if (!s.menuOpen) return this.cmOpen("click", kb || this.cmHover());
                    if ("hover" === s.cmMode && !kb) return clearTimeout(this._cmT), void this.setState({ cmMode: "click" });
                    this.cmClose(kb);
                },
                openMenu: () => {},
                closeMenu: () => {},
                onCatalogPointer: () => {},
                onCatalogClick: () => {},
                hardCloseMenu: () => this.cmClose(!0),
                cmPanelEnter: () => clearTimeout(this._cmT),
                cmPanelLeave: () => this.cmLater(),
                cmPin: () => {
                    clearTimeout(this._cmT), "hover" === this.state.cmMode && this.setState({ cmMode: "click" });
                },
                cmBackdrop: () => this.cmClose(!1),
                cmQ: q,
                cmInput: ev => {
                    const v = ev.target.value;
                    clearTimeout(this._cmQt), this.setState(s => ({ cmQ: v, cmMode: s.menuOpen ? "click" : s.cmMode })), v.trim() ? this._cmQt = setTimeout(() => this.setState({ cmQDeb: v }), 220) : this.setState({ cmQDeb: "" });
                },
                cmClear: () => {
                    clearTimeout(this._cmQt), this.setState({ cmQ: "", cmQDeb: "" });
                },
                cmSubmit: ev => {
                    ev?.preventDefault?.(), searchAll();
                },
                cmSearchAll: searchAll,
                cmSearchAllLabel: qt ? "Показати всі результати для «" + qt + "»" : "Показати всі результати",
                cmIdle: !qt,
                cmLoading: loading,
                cmHasRes: !!qt && !loading && found.length > 0,
                cmNone: !!qt && !loading && !found.length,
                cmResults: found.map(n => ({
                    name: n.name,
                    trail: n.path.length > 1 ? n.path.slice(0, -1).join(" / ") : "Розділ каталогу",
                    href: X(n.path),
                    open: go(n)
                })),
                cmRoots: roots,
                cmQuick: quick,
                cmHasQuick: quick.length > 0,
                cmQuickTitle: cfg.quickTitle,
                cmAllCats: allCats,
                cmMobTitle: sec ? sec.name : "Каталог",
                cmMobDeep: !!sec,
                cmMobRoot: !sec && !qt,
                cmMobSub: !!sec && !qt,
                cmSubRows: sub,
                cmBack: () => {
                    clearTimeout(this._cmQt), this.setState({ cmSec: null, cmQ: "", cmQDeb: "" }, () => {
                        const b = body();
                        b && (b.scrollTop = this._cmScroll || 0);
                    });
                },
                cmFootLabel: sec ? "Усі товари розділу" : "Усі категорії",
                cmFootHref: sec ? X(sec.path) : "/categories",
                cmFootGo: sec ? go(sec) : allCats,
                toggleBurger: () => this.setState(s => ({ burger: !s.burger, menuOpen: !1, mobSec: null, cmSec: null, cmQ: "", cmQDeb: "" }))
            };
        };
        renderVals() {
            const t = this.renderBaseVals(), e = this.state, i = Z.filter(t => t.storeReady), s = Z.find(t => t.id === e.current) || Z[0] || EMPTY_PRODUCT, o = e.storeCatalog || {
                total: 0,
                pages: 0,
                page: 1,
                facets: {}
            }, a = "new" === e.quick ? "new" : e.sort;
            // While a new query loads, the previous total is not shown as if it were the result (no 4 → 25 jump).
            t.resultCountLoading=!!e.storeLoading;t.resultCountText=e.storeLoading?'Шукаємо…':x(Number(o.total||0),'товар','товари','товарів');Object.assign(t, this.catMenuVm(e));
            t.mobileSortLabel = {
                pop: "Популярні",
                cheap: "Дешевші",
                exp: "Дорожчі",
                new: "Новинки",
                stock: "Наявність",
                rel: "Релевантність"
            }[a] || "Популярні", t.mobileSortAria = "Сортування: " + ({
                pop: "Популярні",
                cheap: "Дешевші спочатку",
                exp: "Дорожчі спочатку",
                new: "Новинки",
                stock: "Спочатку в наявності",
                rel: "За релевантністю"
            }[a] || "Популярні"), t.catalogAllGo = t => {
                t && (t.metaKey || t.ctrlKey || t.shiftKey || t.altKey || t.button > 0) || (t?.preventDefault?.(),
                this.goAllCats());
            };
            const r = s.path || [];
            t.productCategoryHref = X(r),
            t.productCategoryGo = t => {
                t && (t.metaKey || t.ctrlKey || t.shiftKey || t.altKey || t.button > 0) || (t?.preventDefault?.(),
                this.goPath(r));
            }, Object.assign(t, {
                storeError: e.storeError || "",
                hasStoreError: !!e.storeError,
                checkoutError: e.checkoutError || "",
                hasCheckoutError: !!e.checkoutError,
                checkoutName: e.checkoutName || "",
                checkoutPhone: e.checkoutPhone || "",
                cartReminderAvailable:e.cartReminderAvailable&&!e.cartEmpty&&e.cart.length>0,cartReminderActive:!!e.cartReminderActive,cartReminderNotice:e.cartReminderNotice||"",onCartReminderToggle:this.storeCartReminderToggle,
                checkoutEmail: e.checkoutEmail || "",
                checkoutRecipient: e.checkoutRecipient || "",
                checkoutComment: e.checkoutComment || "",
                orderSending: !!e.orderSending,
                orderButtonLabel: e.orderSending ? "Зберігаємо замовлення…" : "Підтвердити замовлення",
                onCheckoutName: t => this.storeCheckoutField("checkoutName", t),
                onCheckoutPhone: t => this.storeCheckoutField("checkoutPhone", t),
                onCheckoutEmail: t => this.storeCheckoutField("checkoutEmail", t),
                onCheckoutRecipient: t => this.storeCheckoutField("checkoutRecipient", t),
                onCheckoutComment: t => this.storeCheckoutField("checkoutComment", t),
                // 5-3: optional payer requisites for the PDF invoice (invoice payment only).
                payInvoice: storeCheckoutPay(e)==='invoice', payerName: e.payerName || "", payerCode: e.payerCode || "", payerAddress: e.payerAddress || "",
                onPayerName: t => this.storeCheckoutField("payerName", t), onPayerCode: t => this.storeCheckoutField("payerCode", t), onPayerAddress: t => this.storeCheckoutField("payerAddress", t),
                products: (e.storePageItems || []).map(t => Z.find(e => e.id === t && e.storeReady)).filter(Boolean).map(this.cardVm),
                resultCount: o.total,
                // A search without results has its own block (sqZero); the filter message would contradict it.
                noResults: !e.storeLoading && 0 === o.total && !e.sq,
                hasPages: o.pages > 1,
                pageInfo: "Сторінка " + o.page + " з " + Math.max(1, o.pages),
                loading: e.loading || e.storeLoading || e.storeProductLoading,
                loadingAttr: e.loading || e.storeLoading || e.storeProductLoading ? "1" : "0",
                favItems: i.filter(t => e.fav.includes(t.id)).map(this.cardVm),
                favEmpty: !i.some(t => e.fav.includes(t.id)),
                topProducts: i.slice(0, 8).map(this.cardVm),
                homeKits: t.homeKits.filter((t, e) => E[e].items.every(t => i.some(e => e.id === t))),
                bundles: t.bundles.filter((t, e) => E[e].items.every(t => i.some(e => e.id === t))),
                isProduct: "product" === e.screen && s.storeReady && !e.storeProductLoading && !e.storeProductMissing,
                pageUrl: "rubizh.shop" + this.historyUrl(e),
                showLabel: e.storeLoading ? "Шукаємо…" : "Показати " + x(o.total, "товар", "товари", "товарів"),
                hasAttrGroups: !1,
                hasSqTry: !1,
                sqZero: !e.storeLoading && !!e.sq && 0 === o.total,
                sqSimilarShow: !1,
                onCityInput: t => this.setState({
                    cityQ: t.target.value,
                    city: t.target.value,
                    checkoutDirty: !0,
                    cityOpen: !1,
                    storeQuote: null
                }),
                cityOpen: !1,
                cityMatches: [],
                pointOpen: !1,
                pointMatches: [],
                pointDisabled: !1,
                onPointInput: t => this.setState({
                    pointQ: t.target.value,
                    point: t.target.value,
                    checkoutDirty: !0,
                    storeQuote: null
                }),
                onCityFocus: () => {},
                onPointFocus: () => {},
                goTrack: () => window.location.assign("/auth/?tab=orders"),
                isTrack: !1,
                goOffer: () => this.storeGoPage("offer"),
                goPrivacy: () => this.storeGoPage("privacy"),
                openOffer: () => this.storeGoPage("offer"),
                openPrivacy: () => this.storeGoPage("privacy")
            });
            const n = t => this.historyUrl({
                ...e,
                screen: "catalog",
                catPg: t,
                catMore: !1
            }), c = (t, i = !1) => s => {
                s?.preventDefault?.(), !e.storeLoading && t >= 1 && t <= o.pages && (i ? this.setState({
                    catPg: t,
                    catMore: !0
                }) : this.go("catalog", {
                    catPg: t,
                    catMore: !1
                }));
            };
            t.pagesList = Array.from({
                length: o.pages
            }, (t, e) => e + 1).filter(t => 1 === t || t === o.pages || Math.abs(t - o.page) <= 2).map(t => ({
                label: String(t),
                href: n(t),
                go: c(t),
                style: {
                    minWidth: "40px",
                    padding: "9px 10px",
                    textAlign: "center",
                    textDecoration: "none",
                    border: "1px solid " + (t === o.page ? "var(--legacy-f2a33c)" : "var(--legacy-2a322b)"),
                    background: t === o.page ? "var(--legacy-f2a33c)" : "transparent",
                    color: t === o.page ? "var(--button-text)" : "var(--legacy-d3d9cf)"
                }
            })), Object.assign(t, {
                prevPg: c(o.page - 1),
                nextPg: c(o.page + 1),
                prevHref: n(Math.max(1, o.page - 1)),
                nextHref: n(Math.min(o.pages, o.page + 1)),
                showMore: c(o.page + 1, !0),
                moreLabel: e.storeLoading ? "Завантажуємо…" : "Показати ще 24",
                hasMore: o.page < o.pages
            });
            const l = (t, e, i) => ({
                ...this.opt(t, 1, i.includes(t), () => this.toggleIn(e, t)),
                count: ""
            });
            t.brandFilters = (o.facets?.brands || []).map(t => l(t, "brands", e.brands)), t.camoFilters = (o.facets?.camo || []).map(t => ({
                ...this.chipC(t, 1, e.camo.includes(t), () => this.toggleIn("camo", t)),
                count: ""
            })), t.sizeGroups = (o.facets?.size_groups||[{kind:'clothing',label:'Розмір одягу',values:(o.facets?.sizes||[]).filter(x=>['XS','S','M','L','XL','XXL','3XL+'].includes(x))},{kind:'footwear',label:'Розмір взуття',values:(o.facets?.sizes||[]).filter(x=>/^\d{2}([.,]5)?$/.test(x)&&Number(x)>=35&&Number(x)<=50)}]).filter(g=>g.values.length).map(g=>({label:g.label,more:false,chips:g.values.map(value=>({...this.chipC(value,1,e.sizes.includes(g.kind+'|'+value),()=>this.toggleIn('sizes',g.kind+'|'+value)),count:''}))})), t.catFilters = (e.cpath.length ? [ this.opt("← Усі розділи", 1, !1, () => this.goPath([])) ] : []).concat((H(e.cpath)?.kids || K).map(t => this.opt(t.name, this.nodeCount(t.path), !1, () => this.goPath(t.path)))).filter(f => !(e.sq || "").trim() || e.storeLoading || Number(f.count) > 0 || String(f.name).startsWith("←")),
            t.attrGroups = Object.entries(o.facets?.attrs || {}).map(([t, i]) => ({
                title: t,
                options: i.map(i => ({
                    ...this.opt(i, 1, e.attrs.includes(t + "" + i), () => this.toggleIn("attrs", t + "" + i)),
                    count: ""
                }))
            })), t.hasAttrGroups = t.attrGroups.length > 0, t.availFilters = [ this.opt("Лише в наявності", 1, e.inStock, () => this.setState(t => ({
                inStock: !t.inStock,
                catPg: 1,
                catMore: !1
            }))), this.opt("Включно з позиціями під замовлення", 1, e.withOrder, () => this.setState(t => ({
                withOrder: !t.withOrder,
                catPg: 1,
                catMore: !1
            }))) ].map(t => ({
                ...t,
                count: ""
            }));
            const p = e.size && s.variants[e.size] ? e.size : 1 === Object.keys(s.variants).length ? Object.keys(s.variants)[0] : null, h = p ? s.variants[p] : null;
            if (t.item.wholesale=(h?.wholesale||[]).map(w=>({label:storeMoney(w.price)+" · −"+w.discount+"%"})),t.item.hasWholesale=!!t.item.wholesale.length,t.item.priceFmt = storeMoney(h?.price ?? s.price), t.item.installment = B((h?.price ?? s.price) / 4),
            t.item.url = "rubizh.shop/product/" + (s.slug || w(s.name)), t.item.made = (s.specs.find(([t]) => /Країна|Виробництво/.test(t)) || [])[1] || "Уточніть у менеджера",
            t.item.warranty = (s.specs.find(([t]) => /Гарантія/.test(t)) || [])[1] || "За умовами виробника",
            t.item.shipDate = !h ? "Залежить від обраного розміру" : h.payment_allowed ? "Після оплати; ТТН з’явиться в кабінеті" : "Строк підтвердить менеджер" + (h.delivery_lead_time_days ? " (за даними постачальника — орієнтовно " + h.delivery_lead_time_days + " дн.)" : ""), t.item.related = (this._related?.[s.id] || []).map(t => Z.find(e => e.id === t)).filter(t => t && t.id !== s.id && !this.allOut(t)).slice(0, 4).map(this.cardVm), t.item.hasRelated = t.item.related.length >= 2,
            s.storeReady && (t.sizeNote = e.addErr || (p ? "in_stock" === this.avail(s, p) ? "В наявності" : "on_order" === this.avail(s, p) ? "Під замовлення — строк уточнить менеджер" : "Немає в наявності" : "Оберіть розмір")),
            t.mobSizeLabel = p ? "Розмір: " + this.sd(s, p) : "Оберіть розмір", t.mobBuyLabel = p ? "out_of_stock" === h.availability ? "Немає в наявності" : "До кошика" : "Оберіть розмір",
            s.storeReady) {
                const galColor = storeLegacyColor(s, e, h), i = storeGalleryPhotos(s, galColor), galKey = s.colorPhotos && !s.v3 ? "-" + encodeURIComponent(galColor) : "";
                t.gal.slides = i.length ? i.map((t, e) => ({
                    slot: "img-" + s.id + galKey + "-" + e,
                    ph: s.name,
                    src: t.url,
                    hasSrc: !0,
                    eager: 0 === e
                })) : [ {
                    slot: "img-" + s.id + galKey,
                    ph: galKey ? "Фото кольору готується" : "Фото готується",
                    hasSrc: !1
                } ], t.gal.thumbs = i.map((i, o) => ({
                    ...t.gal.thumbs[o % t.gal.thumbs.length],
                    style: {
                        ...t.gal.thumbs[0]?.style,
                        border: "1px solid " + (o === (e.galIdx || 0) ? "var(--legacy-f2a33c)" : "var(--legacy-2a322b)")
                    },
                    slot: "img-" + s.id + galKey + "-" + o,
                    src: i.thumb || i.url,
                    hasSrc: !0,
                    pick: () => this.galTo(o)
                })), t.gal.next = () => this.galTo(Math.min(Math.max(0, i.length - 1), (e.galIdx || 0) + 1)),
                t.gal.counter = Math.min(e.galIdx || 0, Math.max(0, i.length - 1)) + 1 + " / " + Math.max(1, i.length),
                t.gal.dots = i.map((t, i) => ({
                    style: {
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        background: i === (e.galIdx || 0) ? "var(--legacy-f2a33c)" : "var(--legacy-99a398)"
                    }
                })), t.hasReviews = !1;
            }
            const d = Math.round(e.cart.reduce((total,line)=>{const product=Z.find(p=>p.id===line.id),v=product?.variants[line.size],kit=line.kit&&v?.pricing_policy_version===1&&v.kit_price!==null,kq=kit?Math.min(line.qty,line.kitQty??line.qty):0,retail=v?.price??line.price??0;return total+Math.round(kit?v.kit_price*100*kq+retail*100*(line.qty-kq):retail*100*line.qty);},0))/100, u = e.storeQuote?.discount??0, m=0;
            t.applyPromo = this.applyPromo, t.promoBad = !!e.promoBad, t.promoCode = e.promo || "",
            t.promoOk = !!e.promo, t.discountFmt = "−" + B(u), t.storeTotal = d - u + m, t.totalFmt = storeMoney(e.storeQuote?.total ?? t.storeTotal),
            t.subtotalFmt = storeMoney(e.storeQuote?.subtotal ?? d), t.shippingFmt = B(e.storeQuote?.shipping ?? m),
            e.storeQuote && (t.cartLines = t.cartLines.map((t, i) => {
                const s = e.cart[i]?.sku, o = e.storeQuote.lines.find(t => t.sku === s);
                return o ? {
                    ...t,
                    sumFmt: B(o.price * e.cart[i].qty)
                } : t;
            })), t.payOptions = [ {
                k: "card",
                name: "Оплата на рахунок ФОП",
                note: "Після підтвердження наявності менеджером."
            }, {
                k: "invoice",
                name: "Рахунок для підрозділу або організації",
                note: "Уточнимо реквізити та підготуємо рахунок."
            } ].map(t => ({
                ...t,
                pick: () => this.setState({
                    pay: t.k,
                    checkoutDirty: !0
                }),
                style: this.radio(e.pay === t.k),
                dotStyle: this.dot(e.pay === t.k)
            })), t.doneTotal = B(e.lastOrder?.total || 0), t.doneNumber = e.lastOrder?.number || "",
            t.doneItems = (e.lastOrder?.lines || []).reduce((t, e) => t + e.qty, 0) + " поз.",
            t.doneDelivery = e.lastOrder?.delivery || "", t.doneSteps = [ {
                title: "Замовлення збережено",
                note: "Перевіримо наявність і зв’яжемося з вами для підтвердження."
            }, {
                title: "Підтвердження на email",
                note: "sent" === e.orderEmailStatus ? "Лист із номером і складом замовлення надіслано." : "Замовлення прийняте. Лист у черзі на повторне надсилання."
            } ], t.medDone = !1, t.hasOrderLines = !!e.lastOrder?.lines?.length, t.kmHasMore = !e.kitCatalogLoading && !e.kitCatalogError && (e.kitCatalogPage || 1) < (e.kitCatalogPages || 1),
            t.kmLoadMore = () => this.storeLoadKitProducts((e.kitCatalogPage || 1) + 1), t.kmMoreLabel = e.kitCatalogLoading ? "Завантажуємо…" : "Показати ще 24";
            const g = t => {
                if (!t) return;
                const e = t.id || String(t.photo || t.slot || "").replace(/^img-/, ""), i = Z.find(t => t.id === e && t.storeReady);
                t.thumb = i?.photoData?.[0]?.thumb || i?.photos?.[0] || "", t.hasThumb = !!t.thumb;
            };
            g(t.mini), g(t.qvP);
            for (const e of t.cartLines || []) g(e);
            for (const e of t.kitSlots || []) for (const t of [ ...e.items || [], ...e.recs || [] ]) g(t);
            for (const e of t.kitTogether || []) g(e);
            for (const e of t.km?.cards || []) g(e);
            for (const e of t.item.related || []) g(e);
            // Each root uses its own named banner. Never substitute a generic product image.
            const directorySections=t.acSecs||[];
            for(const [index,section] of directorySections.entries()) {
                section.art=window.rubizhDirectoryArt?.((this._storeCategories||[]).find(c=>c.path===(Array.isArray(section.path)?section.path.join(' / '):section.path))?.category_id||section.name)||'';
                section.hasArt=!!section.art;
                section.number=String(index+1).padStart(2,'0');
                section.dialogId=section.id+'-details';
                section.headingId=section.id+'-heading';
                section.hasSubs=section.subs.length>0;
                section.subCount=x(section.subs.length,'підкатегорія','підкатегорії','підкатегорій');
                section.countLabel=x(section.count,'товар','товари','товарів');
                section.expand=()=>window.rubizhDirectoryOpen?.(section.dialogId);
                section.close=()=>document.getElementById(section.dialogId)?.close();
                section.backdrop=ev=>{if(ev.target===ev.currentTarget)section.close();};
                const decorateLink=row=>{const open=row.open;row.open=ev=>{if(ev?.metaKey||ev?.ctrlKey||ev?.shiftKey||ev?.altKey||ev?.button>0)return;section.close();open(ev);};};
                decorateLink(section);
                for(const sub of section.subs){decorateLink(sub);for(const leaf of sub.leaves)decorateLink(leaf);}
            }
            t.acQuery=e.acQuery||'';
            t.onAcQuery=ev=>this.setState({acQuery:ev.target.value});
            t.acClear=()=>this.setState({acQuery:''});
            const directoryQuery=t.acQuery.trim().toLocaleLowerCase('uk-UA');
            t.acSecs=directorySections.filter(section=>!directoryQuery||[section.name,...section.subs.flatMap(sub=>[sub.name,...sub.leaves.map(leaf=>leaf.name)])].some(name=>name.toLocaleLowerCase('uk-UA').includes(directoryQuery)));
            t.acEmpty=!t.acSecs.length;
            t.acFiltered=!!directoryQuery;
            const sectionsSource=!(e.cpath||[]).length&&!(e.roots||[]).length&&!e.sq&&!e.quick?directorySections.map(section=>({...section,src:section.art,hasSrc:section.hasArt})):t.subTiles||[];
            for(const [index,tile] of sectionsSource.entries()){
                tile.src=window.rubizhDirectoryArt?.((this._storeCategories||[]).find(c=>c.path===(Array.isArray(tile.path)?tile.path.join(' / '):tile.path))?.category_id||tile.name)||'';
                tile.hasSrc=!!tile.src;
                tile.number=String(index+1).padStart(2,'0');
            }
            // Phones swipe through every section in one carousel (category-carousel CSS); wider screens page.
            const sectionsSize=e.catalogSectionsPerPage||(window.innerWidth>=1200?10:window.innerWidth>=1000?8:window.innerWidth>=700?6:Math.max(1,sectionsSource.length));
            const sectionsPages=Math.max(1,Math.ceil(sectionsSource.length/sectionsSize));
            const sectionsPage=Math.min(e.catalogSectionsPage||0,sectionsPages-1);
            t.subTiles=sectionsSource.slice(sectionsPage*sectionsSize,(sectionsPage+1)*sectionsSize);
            t.hasSubTiles=sectionsSource.length>0;
            t.sectionsPager=sectionsPages>1;
            t.sectionsPageLabel=(sectionsPage+1)+' / '+sectionsPages;
            t.sectionsPrevDisabled=sectionsPage===0;
            t.sectionsNextDisabled=sectionsPage===sectionsPages-1;
            t.sectionsPrev=()=>this.setState({catalogSectionsPage:Math.max(0,sectionsPage-1)});
            t.sectionsNext=()=>this.setState({catalogSectionsPage:Math.min(sectionsPages-1,sectionsPage+1)});
            t.catalogSortValue=e.sort||'pop';
            t.catalogSortOptions=(e.sq?[['rel','За релевантністю']]:[]).concat([['pop','Популярні'],['cheap','Дешевші спочатку'],['exp','Дорожчі спочатку'],['new','Новинки'],['stock','Спочатку в наявності']]).map(([value,name])=>({value,name}));
            t.onCatalogSort=ev=>this.setState({sort:ev.target.value,catPg:1,catMore:false});
            const slotArt = {body:'uniform',legs:'uniform',boots:'boots',armor:'armor',gear:'gear',head:'head',med:'med',small:'accessories'};
            const slotDescriptions = {body:'Куртка, убакс або форма. Основа твого комплекту.',legs:'Штани для руху, роботи та щоденного навантаження.',boots:'Взуття під сезон, задачу та твій розмір.',armor:'Плитоноска, бронеплити та інший захист.',gear:'Рюкзак, підсумки та спорядження для необхідного.',head:'Головні убори, шоломи та аксесуари.',med:'Аптечки, турнікети та засоби першої допомоги.',small:'Рукавички, шкарпетки й корисні дрібниці.'};
            for (const [index,slot] of (t.kitSlots||[]).entries()) {
                slot.number=String(index+1).padStart(2,'0');
                slot.art=window.RUBIZH_CATEGORY_ART?.[slotArt[slot.key]]||'/assets/category-uniform.95312bde6e13.webp';
                slot.description=slotDescriptions[slot.key]||'Обери потрібне спорядження.';
                slot.status=slot.filled?'Обрано: '+storeGoodsCount((slot.items||[]).length):'Не обрано · необов’язково';
            }
            // UX/data corrections share the same variant and pricing source.
            t.priceRanges=[];{const pf=this._storeFacets?.price;t.hasPriceFilter=!pf||Number(pf.distinct)>1;t.pricePhFrom='від';t.pricePhTo='до';t.hasPriceSlider=false;if(pf&&Number(pf.distinct)>1){const mn=Number(pf.min)||0,mx=Number(pf.max)||0;t.priceRanges=(pf.ranges||[]).map(r=>{const a=r.from==null?'':String(r.from),b=r.to==null?'':String(r.to);return {...this.chipC(r.label,r.count,e.priceFrom===a&&e.priceTo===b,()=>this.setState(x=>x.priceFrom===a&&x.priceTo===b?{priceFrom:'',priceTo:'',catPg:1,catMore:!1}:{priceFrom:a,priceTo:b,catPg:1,catMore:!1})),count:String(r.count)};});t.pricePhFrom='від '+mn;t.pricePhTo='до '+mx;if(mx>mn){t.hasPriceSlider=true;t.priceSliderMin=mn;t.priceSliderMax=mx;t.priceSliderStep=Math.max(10,Math.round((mx-mn)/100/10)*10);t.priceSliderVal=e.priceTo?Math.min(mx,Math.max(mn,Number(e.priceTo)||mx)):mx;t.onPriceSlider=ev=>{const v=Number(ev.target.value);this.setState({priceTo:v>=mx?'':String(v),catPg:1,catMore:!1});};}}if(!(e.cpath||[]).length&&!e.sq&&!e.quick&&!(e.roots||[]).length)t.catH1='Каталог спорядження';}
            t.hasSizeFilters=(t.sizeGroups||[]).some(group=>(group.chips||[]).length>0);
            for(const g of t.sizeGroups||[]){const all=g.chips||[];g.chips=e.showAllSizes?all:all.slice(0,18);g.more=all.length>18;g.moreLabel=e.showAllSizes?'Згорнути':'Усі розміри ('+all.length+')';g.showMore=()=>this.setState(s=>({showAllSizes:!s.showAllSizes}));}
            const art=window.RUBIZH_CATEGORY_ART||{};
            // Банери категорій — на плитках розділів каталогу (а не на товарах).
            // Subcategory tiles above use only an explicit banner assigned to their name.
            for(const c of t.categories||[]){const a=/брон/i.test(c.name)?'armor':/взут|берц/i.test(c.name)?'boots':/форма|одяг/i.test(c.name)?'uniform':/рюк|підсум|споряд/i.test(c.name)?'gear':/мед/i.test(c.name)?'med':/термо|фліс/i.test(c.name)?'thermal':/дощ|пончо/i.test(c.name)?'rain':'accessories';c.src=art[{form:'uniform',armor:'armor',boots:'boots',load:'gear',med:'med',thermo:'thermal',small:'accessories',rain:'rain'}[c.key]||a]||'';if(c.key==='small'){c.name='Рукавички та ремені';c.open=()=>this.goPath(['Одяг та форма','Аксесуари одягу']);}if(c.key==='rain'){c.name='Дощовий захист';c.open=()=>this.go('catalog',{cpath:[],sq:'пончо'});}c.hasImage=!!c.src;}
            if(e.storeKitsReady){t.homeKits=(e.storePreparedKits||[]).map(this.storeBundleVm).filter(b=>b.count>=2);t.bundles=t.homeKits;}else{t.homeKits=[];t.bundles=[];}
            for(const row of [...t.products||[],...t.seenItems||[],...t.favItems||[],...t.topProducts||[],...t.item.related||[]]){const p=Z.find(p=>p.id===row.id);this.storeImage(row,p);if(p){row.href='/product/'+p.slug;row.cta=storeAreaUnit(p)==='m2'?'Обрати площу':storeSizeMissing(p)?'Уточнити розмір':Object.keys(p.variants).length>1?storeVariantChoice(p).cta:'Переглянути товар';row.priceFmt=p.quote?'від '+storeMoney(p.price)+(p.quoteM2?' / м²':''):storeMoney(p.price)+(p.sale_unit==='m2'?' / м²':'');row.cardAvailability=p.v3?STORE_V3_LABEL[storeV3Status(p)]:storeSizeMissing(p)?'Розміри уточнюються':Object.values(p.variants).some(v=>v.availability==='in_stock')?'В наявності':Object.values(p.variants).some(v=>v.availability==='preorder')?'Під замовлення':'Немає в наявності';if(p.v3)row.cardAvailabilityTone=storeV3Tone(storeV3Status(p));}}
            for(const [idx,row] of (t.products||[]).entries()){row.photoLoading=idx<4?'eager':'lazy';row.photoPriority=idx<2?'high':'auto';}
            const decorate=row=>{const id=row.id||String(row.photo||row.slot||'').replace(/^img-/,''),p=Z.find(p=>p.id===id);this.storeImage(row,p);};
            for(const sl of t.kitSlots||[]){sl.recs=(sl.recs||[]).filter(row=>{const id=row.id||String(row.photo||'').replace(/^img-/,''),p=Z.find(p=>p.id===id);return p&&storeKitEligible(p)&&storeKitPrimary(p)&&storeSeasonOK(p,e.kitSeason||e.pk?.season||e.pick?.season||'Демісезон');});sl.noRecs=!sl.items?.length&&!sl.recs.length;for(const row of [...sl.items||[],...sl.recs||[]])decorate(row);for(const row of sl.items||[]){const line=e.kit.find(l=>l.uid===row.uid)||e.kit.find(l=>l.id===String(row.photo||'').replace(/^img-/,''));if(!line)continue;const p=Z.find(p=>p.id===line.id);if(!p)continue;const colors=[...new Set(Object.values(p.variants).filter(v=>v.availability!=='out_of_stock').map(v=>v.color).filter(Boolean))];row.colors=colors.map(color=>({name:color,pick:()=>this.storeChangeKitColor(line.uid,color),style:{padding:'7px 9px',border:'1px solid '+((line.color||p.variants[line.size]?.color)===color?'var(--legacy-f2a33c)':'var(--legacy-3a423b)'),background:'transparent',color:'var(--legacy-edefea)',cursor:'pointer'}}));row.needsSize=!!line.needsSize;if(line.needsSize){row.priceFmt='—';row.kitFmt='—';row.saveFmt='Оберіть розмір';}row.pendingNote='Розмір '+line.previousSize+' недоступний у цьому кольорі. Оберіть інший:';row.colorSizes=Object.keys(p.variants).filter(k=>p.variants[k].color===line.color&&this.avail(p,k)!=='out').map(k=>({name:p.variants[k].size_display,pick:()=>this.storeSelectKitSize(line.uid,k)}));}}
            if(e.kit.some(l=>l.needsSize)){t.kitCanCart=false;t.kitCantCart=true;t.kitCantLabel='Оберіть розмір у вибраному кольорі';t.kitBarTotal='—';t.kitBarSave='Оберіть розмір';t.kitHasSave=false;t.kitNoSave=true;t.kitSaveEl='—';t.kitDonText='Підтримка: після вибору розміру';t.kitKitFmt='—';t.kitPriceFmt='—';t.kitSumFmt='—';t.kitFullFmt='—';t.kitSaveFmt='Оберіть розмір';}
            if(t.km){for(const row of t.km.cards||[]){decorate(row);const p=Z.find(p=>p.id===String(row.photo||'').replace(/^img-/,''))||Z.find(p=>row.href==='/product/'+p.slug);if(!p)continue;const keys=Object.keys(p.variants).filter(k=>(!e.kmColor||p.variants[k].color===e.kmColor)&&this.avail(p,k)!=='out'),only=[...new Set(keys.map(k=>p.variants[k].size_display))];row.one=only.length===1&&!storeSizeMissing(p);if(row.one){row.sizes=[];row.addOne=()=>keys.length===1?this.kitAdd(storeSlot(p),p.id,keys[0]):this.setState({qv:p.id,qvSize:null});}row.cta=keys.length===1?'Додати':'Обрати колір';}}
            t.hasProductDocs=!!s.has_docs;t.productDocsNote=s.docs_note||'';
            const area=s.sale_unit==='m2',missing=storeSizeMissing(s),confirmedVariants=Object.values(s.variants).filter(v=>!v.size_unconfirmed),currentColor=storeLegacyColor(s,e,h),availableKeys=Object.keys(s.variants).filter(k=>s.variants[k].color===currentColor&&!s.variants[k].size_unconfirmed),sizeKeys=storeProductSizeKeys(s,currentColor,p),selected=p&&availableKeys.includes(p)?p:(sizeKeys.length===1?sizeKeys[0]:null),vv=selected?s.variants[selected]:null,qty=storeQty(e.qty||1),unitPrice=vv?.price||s.price;
            t.isArea=area;t.areaQty=qty;t.areaSummary=storeMoney(unitPrice)+' / м² × '+qty+' м² = '+storeMoney(unitPrice*qty);t.onAreaQty=ev=>{const q=storeQty(ev.target.value);if(q>0&&q<=10000)this.setState({qty:q});};
            t.item.priceFmt=storeMoney(unitPrice)+(area?' / м²':'');t.item.sku=vv?.sku||s.sku;
            const desc=s.desc||'';t.item.desc=desc.length>220?desc.split(/\n\n/)[0].slice(0,220).replace(/\s+\S*$/,'')+'…':desc;t.fullDescription=desc;t.hasFullDescription=desc.length>220;
            t.productColors=[...new Set((confirmedVariants.length?confirmedVariants:Object.values(s.variants)).map(v=>v.color).filter(Boolean))].map(color=>({name:color,selected:color===currentColor?'true':'false',pick:()=>{if(color===currentColor)return;storeGalleryReset();this.setState({productColor:color,size:null,qty:1,addErr:'',galIdx:0});},style:{padding:'10px 12px',minHeight:'44px',border:'1px solid '+(color===currentColor?'var(--legacy-f2a33c)':'var(--legacy-3a423b)'),background:'transparent',color:'var(--legacy-edefea)',cursor:'pointer'}}));t.hasProductColors=t.productColors.length>1;
            if(missing){t.sizeNote='Розміри не підтверджені постачальником. Уточніть у менеджера.';t.buyOn=false;t.buyOff=true;t.mobBuyLabel='Уточнити розмір';}
            const anyAvailable=Object.values(s.variants).some(v=>v.availability!=='out_of_stock'&&!v.size_unconfirmed&&v.price>0);if(s.storeReady&&!anyAvailable&&!missing){t.buyOn=false;t.buyOff=true;t.sizeNote='Немає в наявності';t.mobBuyLabel='Немає в наявності';t.item.related=i.filter(p=>p.id!==s.id&&!this.allOut(p)).slice(0,3).map(this.cardVm);}
            const choice=storeVariantChoice(s);if(!area&&!missing&&sizeKeys.length>1){t.sizeHead=choice.head;t.sizeNote=e.addErr||(!selected?choice.choose:t.sizeNote);t.mobSizeLabel=selected?choice.head+': '+this.sd(s,selected):choice.choose;t.mobBuyLabel=selected?'До кошика':choice.cta;}
            t.addLabel=missing?'Уточніть розмір у менеджера':!selected?choice.choose:this.avail(s,selected)==='out'?'Немає в наявності':'До кошика · '+storeMoney(unitPrice*qty);
            t.incQty=()=>this.setState(x=>({qty:storeQty(Number(x.qty||1)+1)}));t.decQty=()=>this.setState(x=>({qty:Math.max(area?.01:1,storeQty(Number(x.qty||1)-1))}));
            t.item.sizes=t.item.sizes.filter(row=>sizeKeys.includes(row.variantKey)).map(row=>({...row,qtyLabel:s.variants[row.variantKey]?.stockKnown?row.qtyLabel:''}));t.sizeButtons=!area&&!missing&&sizeKeys.length>1;t.sizeOneRow=!area&&!missing&&sizeKeys.length===1;t.sizeOneText=sizeKeys.length===1?(s.variants[sizeKeys[0]].size_display==='Один розмір'?'Один розмір':(rt[s.size_scale]?.card||'Розмір')+': '+s.variants[sizeKeys[0]].size_display):'';t.oneClick=()=>!missing&&selected&&this.add(s.id,selected,qty)?this.go('cart'):this.setState({addErr:choice.choose});t.addProduct=()=>!missing&&selected&&this.add(s.id,selected,qty);t.mobBuy=()=>!missing&&selected?this.add(s.id,selected,qty):document.querySelector('[data-size-grid]')?.scrollIntoView({block:'center',behavior:'smooth'});
            if(s&&s.v3){this._v3Color=s.colors.find(c=>c.id===(e.productColorId||new URLSearchParams(location.search).get('color')))?.id||s.colors.find(c=>c.skus.some(k=>s.variants[k]?.payment_allowed))?.id||s.colors[0]?.id||null;storeV3ProductVm(this,t,e,s);}
            t.cartCount=e.cart.reduce((n,l)=>n+(l.sale_unit==='m2'?1:Number(l.qty)),0);
            for(const [idx,row] of (t.cartLines||[]).entries()){const l=e.cart[idx],p=Z.find(p=>p.id===l.id);row.isArea=(l.sale_unit||p?.sale_unit)==='m2';row.areaQty=l.qty;row.onAreaQty=ev=>this.storeAreaCartQty(idx,ev.target.value);row.size=row.isArea?l.qty+' м²':row.size;const variant=p?.variants[l.size],special=l.kit&&variant?.pricing_policy_version===1&&variant.kit_price!==null,retailUnit=variant?.price??l.price??p?.price??0,kq=special?Math.min(l.qty,l.kitQty??l.qty):0,quoted=(e.storeQuote?.lines||[]).filter(q=>q.input_index===idx);row.sumFmt=storeMoney(quoted.length?quoted.reduce((n,q)=>Math.round((n+Number(q.amount))*100)/100,0):Math.round(special?variant.kit_price*100*kq+retailUnit*100*(l.qty-kq):retailUnit*100*l.qty)/100);}
            if(t.mini&&e.miniCart){const l=e.miniCart,p=Z.find(p=>p.id===l.id),v=p?.variants[l.size];t.mini.priceFmt=storeMoney((v?.price||p?.price||0)*(l.qty||1));if(p?.sale_unit==='m2')t.mini.size=(l.qty||1)+' м²';}

            t.onCityInput=this.npCityInput;t.onPointInput=this.npPointInput;t.clearCity=this.npClear;
            t.onCityFocus=()=>{this.setState({cityOpen:true});if(e.npEnabled&&(e.cityQ||'').length>=2)this.npSearch('cities',e.cityQ);};
            t.cityOpen=!!e.npEnabled&&e.cityOpen&&(e.npCities||[]).length>0;
            t.cityMatches=(e.npCities||[]).map(c=>({name:c.name,hl:'',rest:c.name,note:c.note,pick:()=>{this.setState({city:c.name,cityQ:c.name,npCityRef:c.ref,cityOpen:false,point:'',pointQ:'',npWarehouseRef:'',npStreetRef:'',npPoints:[],npBuilding:'',npFlat:'',npError:'',pointOpen:true,checkoutDirty:true,storeQuote:null},()=>{if(this.state.delivery!=='courier')this.npSearch('warehouses','');});}}));
            t.pointDisabled=e.npEnabled&&!e.npManual?!e.npCityRef:!e.cityQ;
            t.pointPlaceholder=e.delivery==='courier'?'Вулиця':e.delivery==='box'?'Поштомат: номер або адреса':'Відділення: номер або адреса';
            t.onPointFocus=()=>{this.setState({pointOpen:true});if(e.npEnabled&&e.npCityRef)this.npSearch(e.delivery==='courier'?'streets':'warehouses',e.pointQ||'');};
            t.pointOpen=!!e.npEnabled&&e.pointOpen&&(e.npPoints||[]).length>0;
            t.pointMatches=(e.npPoints||[]).map(p=>({name:p.name,note:p.note,pick:()=>this.setState({point:p.name,pointQ:p.name,pointOpen:false,npWarehouseRef:e.delivery==='courier'?'':p.ref,npStreetRef:e.delivery==='courier'?p.ref:'',checkoutDirty:true,storeQuote:null})}));
            t.npCourier=e.delivery==='courier';t.npBuilding=e.npBuilding||'';t.npFlat=e.npFlat||'';
            t.onNpBuilding=ev=>this.setState({npBuilding:ev.target.value,checkoutDirty:true,storeQuote:null});t.onNpFlat=ev=>this.setState({npFlat:ev.target.value,checkoutDirty:true,storeQuote:null});
            t.npNote=e.npLoading?'Завантажуємо довідник НП…':e.npError||(e.npManual?'Довідник НП тимчасово недоступний. Введіть місто та адресу — менеджер перевірить їх перед відправленням.':e.npEnabled?'Оберіть місто та точне місце отримання зі списку.':'Довідник НП ще підключаємо. Введіть адресу — менеджер її перевірить.');
            t.deliverySummary=e.npEnabled&&!e.npManual&&e.npCityRef&&(e.npWarehouseRef||(e.npStreetRef&&e.npBuilding))?e.city+' · '+e.point+(e.delivery==='courier'?', '+e.npBuilding+(e.npFlat?', кв. '+e.npFlat:''):''):'';
            t.shippingFmt='Окремо за тарифом НП';
            t.deliveryOptions=[{k:'np',name:'Нова пошта — відділення',note:'Оберіть діюче відділення'},{k:'box',name:'Нова пошта — поштомат',note:'Оберіть конкретний поштомат'},{k:'courier',name:'Кур’єр Нової пошти',note:'Вулиця, будинок і квартира'}].map(d=>({name:d.name,note:d.note,price:'За тарифом НП',style:this.radio(e.delivery===d.k),dotStyle:this.dot(e.delivery===d.k),pick:()=>this.setState({delivery:d.k,point:'',pointQ:'',npWarehouseRef:'',npStreetRef:'',npPoints:[],npBuilding:'',npFlat:'',checkoutError:'',npError:'',storeQuote:null,checkoutDirty:true,pointOpen:false})}));
            t.payOptions=[...(e.monoEnabled?[{k:'card',name:'Оплата карткою',note:'Картки будь-якого банку · Apple Pay / Google Pay'}]:[]),...(e.invoiceEnabled?[{k:'invoice',name:'Оплата на рахунок ФОП',note:'Реквізити та підтвердження від менеджера'}]:[])].map(p=>({name:p.name,note:p.note,checked:String(storeCheckoutPay(e)===p.k),style:this.radio(storeCheckoutPay(e)===p.k),dotStyle:this.dot(storeCheckoutPay(e)===p.k),pick:()=>{window.rubizhAnalytics?.track('add_payment_info',{items:this.state.cart.map(l=>({item_id:l.sku,item_name:l.name,price:l.price,quantity:l.qty}))});this.setState({pay:p.k,checkoutDirty:true});}}));

            t.payNone=!t.payOptions.length;t.donationChannels=['viber','telegram'].map(channel=>({name:channel==='viber'?'Viber':'Telegram',style:this.radio((e.donationChannel||'viber')===channel),dotStyle:this.dot((e.donationChannel||'viber')===channel),pick:()=>this.setState({donationChannel:channel,checkoutDirty:true})}));
            t.donationPhone=e.donationPhone||e.checkoutPhone||'';t.onDonationPhone=event=>this.setState({donationPhone:event.target.value,checkoutDirty:true});t.donationBrigade=e.donationBrigade||'';t.onDonationBrigade=event=>this.setState({donationBrigade:event.target.value,checkoutDirty:true});t.brigadeName=t.donationBrigade.trim().replace(/\s+/g,' ')||'47 ОМБр «Магура»';
            const receipt=e.lastOrder,stage=receipt?.stage||(receipt?.payment_status==='paid'?'paid':'pending');
            t.doneReady=!!receipt?.number&&!!receipt?.lines?.length;t.doneLoading=!t.doneReady&&!e.receiptError;t.doneError=e.receiptError||'';t.doneHasError=!!e.receiptError;t.doneRefresh=this.storeLoadReceipt;
            t.doneTitle=receipt?.title||'Завантажуємо замовлення…';t.doneBadge=stage==='paid'?'Оплату підтверджено':stage==='cancelled'?'Замовлення закрите':'Очікує оплати';
            t.doneNote=stage==='paid'?'Оплату підтверджено. Статус відправлення з’явиться в кабінеті.':stage==='cancelled'?'Замовлення закрите. За потреби допоможе менеджер.':'Спорядження не чекає. Ворог — теж. Залишився один крок — оплата.';
            t.doneItems=(receipt?.lines?.length||0)+' поз.';t.orderLines=(receipt?.lines||[]).map(l=>({name:l.name,meta:l.variant||[l.size,l.color].filter(Boolean).join(' · '),sku:l.sku,status:'',statusStyle:{display:'none'},qtyPrice:l.qty+((l.sale_unit==='m2')?' м²':' шт.')+' × '+B(l.price)}));
            t.donePending=t.doneReady&&stage==='pending';t.doneRequisites=t.donePending;t.donePayUrl=receipt?.payment_url||'/auth/?tab=orders';t.doneDeadline=receipt?.payment_due_label||'';
            t.doneBrigade=receipt?.brigade||'47 ОМБр «Магура»';t.doneSeller=receipt?.seller||{};t.doneDonTitle=receipt?.donation_text||'';t.doneDonVisible=t.doneReady&&stage!=='cancelled';t.doneProofUrl=receipt?.donation?.proof_url||'';t.doneHasProof=!!t.doneProofUrl;
            t.doneSteps=t.doneReady?[{title:stage==='paid'?'Оплату підтверджено':stage==='cancelled'?'Скасовано':'Замовлення збережено',note:t.doneNote},{title:'Лист покупцю',note:e.orderEmailStatus==='sent'?'Лист із номером і складом замовлення надіслано.':e.orderEmailStatus==='failed'?'Пошта не підтвердила надсилання. Менеджер перевірить доставку.':'Лист очікує відправки. Дані замовлення вже збережені.'}]:[];
            t.doneStage=stage;t.doneTitle=stage==='cancelled'?'Замовлення скасовано':receipt?.title||'Завантажуємо замовлення…';
            t.doneCardStyle={background:stage==='paid'?'var(--success-bg)':stage==='cancelled'?'var(--danger-bg)':'var(--waiting-bg)'};t.doneIcon=stage==='paid'?'✓':stage==='cancelled'?'×':'◷';
            t.doneChipStyle={background:stage==='paid'?'var(--success-bg)':stage==='cancelled'?'var(--danger-bg)':'var(--waiting-bg)',color:stage==='paid'?'var(--success-text)':stage==='cancelled'?'var(--danger-text)':'var(--waiting-text)'};
            t.doneBadge=stage==='paid'?'Оплачено':stage==='cancelled'?'Скасовано':'Очікує оплати';
            t.doneNote=stage==='paid'?'Дякуємо за ваше замовлення. Ми вже готуємо його до відправлення та повідомимо, коли посилка буде в дорозі.':stage==='cancelled'?'Це замовлення було скасовано. Якщо у вас виникли запитання — зверніться до нашої підтримки.':'Ми зарезервували товари у вашому замовленні. Щоб підтвердити замовлення, будь ласка, здійсніть оплату.';
            t.doneAmountLabel=stage==='pending'?'Сума до оплати':'Сума замовлення';t.doneMainLabel=stage==='paid'?'Переглянути замовлення →':stage==='cancelled'?'Повернутися до магазину →':'Сплатити замовлення →';
            t.doneNext=stage==='paid'?'Ми збираємо ваше замовлення. Як тільки передамо його перевізнику, ви отримаєте повідомлення на email.':stage==='cancelled'?(receipt?.payment_status==='refunded'?'Кошти повернено тим самим способом, яким ви оплатили.':receipt?.was_paid?'Кошти повертаємо протягом 3 робочих днів тим самим способом, яким ви оплатили.':'Оплата за це замовлення не була підтверджена. Ви можете оформити нове замовлення у зручний час.'):'Після успішної оплати ми одразу підтвердимо замовлення та надішлемо вам лист із деталями.';
            t.doneErrorNote=receipt?.payment_status==='failed'?'Оплата не пройшла — спробуйте ще раз':'';
            t.doneRequisites=t.doneReady&&stage==='pending'&&receipt?.payment_method==='invoice'&&!!e.receiptRequisitesOpen;t.doneDonVisible=t.doneReady&&stage==='paid';t.doneDonationDetails=stage==='pending'?'Після оплати '+B(receipt?.donation_amount||0)+' підуть на '+t.doneBrigade+'.':'';
            t.doneMain=async()=>{if(stage==='cancelled'){this.go('catalog');return;}if(stage==='paid'){window.location.assign('/auth/?tab=orders&order='+receipt.id);return;}if(receipt.payment_method==='invoice'){this.setState(s=>({receiptRequisitesOpen:!s.receiptRequisitesOpen}));return;}try{const result=await this.storeRequest('/shop/payment-start.php',{order_id:receipt.id});if(!/^(?:https:\/\/(?:pay\.mbnk\.biz|pay\.monobank\.ua)\/|\/shop\/mono-mock-pay\.php\?invoice=mock[0-9a-f]{20}$)/.test(result.url))throw new Error('Рахунок потребує звірки.');window.location.assign(result.url);}catch(error){this.setState({receiptActionError:error.message});}};
            if(stage==='pending'&&receipt?.payment_ready!==true){t.donePending=false;t.doneRequisites=false;t.doneDeadline='';t.doneBadge='Очікує підтвердження';t.doneNote='Ми отримали замовлення. Менеджер перевірить наявність, комплектацію та строк відправлення. Оплата стане доступною після підтвердження.';t.doneAmountLabel='Сума замовлення';t.doneMainLabel='Переглянути замовлення →';t.doneNext='Очікуйте підтвердження менеджера та повідомлення з переходом до оплати.';t.doneMain=()=>window.location.assign(receipt.payment_url||'/auth/?tab=orders');}
            t.doneActionError=e.receiptActionError||'';
            t.b2bEmail = e.b2bEmail || "", t.b2bQty = e.b2bQty || "", t.b2bText = e.b2bText || "", t.b2bName = e.b2bName || "", t.b2bPhone = e.b2bPhone || "", t.b2bHp = e.b2bHp || "",
            t.notifyEmail = e.notifyEmail || "", t.b2bConsent = !!e.b2bConsent, t.b2bBusy = !!e.b2bBusy;
            for (const e of [ "b2bEmail", "b2bQty", "b2bText", "b2bName", "b2bPhone", "b2bHp", "notifyEmail" ]) t["on" + e[0].toUpperCase() + e.slice(1)] = t => this.setState({
                [e]: t.target.value,
                b2bSent: !1,
                b2bErr: ""
            });
            t.onB2bConsent = t => this.setState({ b2bConsent: !!t.target.checked });
            const k = (t, e) => window.location.assign("mailto:info@rubizh.shop?subject=" + encodeURIComponent(t) + "&body=" + encodeURIComponent(e));
            // D-54: the wholesale request is saved on the server and handled in CRM (no mailto).
            if (t.sendB2B = async () => {
                if (e.b2bBusy) return;
                const types = { "Фізособа": "PERSON", "ФОП": "FOP", "ТОВ": "LLC", "Благодійний фонд": "CHARITY", "Військова частина": "MILITARY" };
                const phone = (e.b2bPhone || "").replace(/\D/g, "");
                const b2bFail = m => { this.setState({ b2bErr: m }); setTimeout(() => document.querySelector("[data-b2b-error]")?.focus(), 60); };
                if ((e.b2bName || "").trim().length < 2) return void b2bFail("Вкажіть ім’я.");
                if (!/^(?:380\d{9}|0\d{9})$/.test(phone)) return void b2bFail("Вкажіть телефон у форматі +380XXXXXXXXX.");
                if (!(e.b2bText || "").trim()) return void b2bFail("Опишіть склад замовлення: позиції та розміри.");
                if (!e.b2bConsent) return void b2bFail("Потрібна згода на обробку персональних даних.");
                this._b2bRequestId = this._b2bRequestId || Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
                this.setState({ b2bBusy: !0, b2bErr: "" });
                try {
                    const r = await this.storeRequest("/shop/wholesale-request.php", { rz_check: e.b2bHp || "", request_id: this._b2bRequestId, name: e.b2bName || "", phone: e.b2bPhone || "", buyer_type: types[e.b2bType || "ФОП"] || "FOP", tax_id: e.invoiceTax || "", email: e.b2bEmail || "", kits: (e.b2bQty || "").trim() ? (e.b2bQty || "").trim() : null, composition: e.b2bText || "", priority: "donation" === e.bigPref ? "DONATION" : "PRICE", consent: !0 });
                    this._b2bRequestId = null;
                    this.setState({ b2bSent: !0, b2bBusy: !1, b2bMessage: r.message, b2bText: "", b2bQty: "", b2bErr: "" });setTimeout(() => document.querySelector("[data-b2b-thanks]")?.focus(), 60);
                } catch (r) {
                    this.setState({ b2bBusy: !1 }); b2bFail(r.message || "Заявку не збережено. Спробуйте ще раз.");
                }
            }, /* OD-4.6: a real form; Enter or the submit button send it, never a page reload. */t.submitB2B = ev => { ev && ev.preventDefault && ev.preventDefault(); t.sendB2B(); }, t.b2bBtnLabel = e.b2bBusy ? "Надсилаємо…" : "Надіслати запит", t.b2bErr = e.b2bErr || "", t.b2bSentText = e.b2bMessage || "Дякуємо, заявку прийнято. Менеджер зв’яжеться з вами протягом робочого дня.",
            t.sendNotify = () => {
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.notifyEmail || "") ? (k("Наявність товару РУБІЖ", "Прошу уточнити надходження: " + s.name + "\n" + new URL("/product/" + s.slug, window.location.origin).href + "\nEmail: " + e.notifyEmail),
                this.setState({
                    notify: "sent",
                    storeError: ""
                })) : this.setState({
                    storeError: "Вкажіть коректний email."
                });
            }, t.hasKitLink = !!e.kitLink, t.kitLink = e.kitLink || "", t.kitDemos = [], t.cartDemos = [],
            t.isAccount = !1, t.isLogin = !1, t.isUi = !1, "picker" === e.screen) {
                const i = this.buildKit({
                    season: e.pick.season,
                    spec: e.pick.task,
                    formSize: e.pick.size,
                    have: []
                });
                t.pickerResult = {
                    items: i.lines.map(t => {
                        const e = Z.find(e => e.id === t.id);
                        return {
                            name: e.name,
                            priceFmt: B(e.variants[t.size].price),
                            note: this.sd(e, t.size)
                        };
                    }),
                    sumFmt: B(i.sum),
                    add: () => {
                        this.setState({
                            kit: i.lines,
                            kitMiss: i.miss,
                            kitFromPick: !0
                        }), this.go("kit");
                    }
                };
            }
            t.availablePaymentsText=[...(e.monoEnabled?['Оплата карткою']:[]),...(e.invoiceEnabled?['Оплата на рахунок ФОП']:[])].join(' · ');
            t.goUniform=()=>this.goPath(['Одяг та форма']);t.goBoots=()=>this.goPath(['Взуття']);
            return storeApplySettings(t,e.storeSettings||window.RUBIZH_BOOT?.settings||{});
        }
    };
};
