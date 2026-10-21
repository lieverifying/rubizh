// Variant A: CSS has one owner before hydration; source styles and native media behaviour survive consolidation.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=p=>readFileSync(new URL(p,root),'utf8');
const html=read('index.html');
test('storefront loads one stylesheet from head and none from the dynamic helmet',()=>{
 const head=html.slice(0,html.indexOf('</head>'));
 const helmet=html.match(/<helmet>([\s\S]*?)<\/helmet>/)[1];
 assert.equal((head.match(/rel="stylesheet"/g)||[]).length,1,'one blocking CSS owner');
 assert.equal((helmet.match(/rel="stylesheet"/g)||[]).length,0,'hydration must not append duplicate or late CSS');
});
test('bundle keeps the last-occurrence source cascade, including modal/mobile/focus rules',()=>{
 const path=html.match(/href="\/(assets\/head-bundle[^"?]+\.css)"/)[1];
 const css=read(path);
 const expected=['catalog-ux.css','catalog-menu.css','theme.css','storefront-refresh.css','hero-theme.2026100608.css','cart-reminder.2026100701.css','catalog-redesign.2026100605.css','kit-parameters.2026100606.css','mobile-polish.2026100702.css','site-qa.2026101101.css','recently-viewed.2026101101.css','category-carousel.2026101101.css','store.0741b0d7ee80.css','store.be2fc78099a1.css','store.408a0466deb3.css','mobile.40ec4f813ab1.css','experience.css','ui-addendum.2026101102.css','stage41.2026101601.css','form-fields.2026102101.css'];// stage 4.1: D-55…D-64 fixes, last in the cascade
 assert.deepEqual([...css.matchAll(/\/\* --- (.*?) --- \*\//g)].map(x=>x[1]),expected);
 for(const name of expected)assert.ok(css.includes(read('assets/'+name).trim()),'complete original rules: '+name);
 assert.match(css,/focus-visible/);assert.match(css,/\[data-mobile-modal\]/);assert.match(css,/\[data-mobile-qv\]/);
});
test('hero and below-fold media keep responsive and lazy-loading contracts',()=>{
 assert.match(html,/class="rz-hero-picture"><source media="\(max-width:860px\)"><img[^>]*fetchpriority="high"/);
 for(const klass of ['rz-kit-art','rz-guide-art'])assert.match(html,new RegExp('class="'+klass+'"[\\s\\S]*?<img[^>]*loading="lazy"[^>]*decoding="async"'));
 assert.match(html,/loading="\{\{ p.photoLoading \}\}" fetchpriority="\{\{ p.photoPriority \}\}"/);
 const hero=read('assets/hero-theme.2026100801.js');assert.match(hero,/if \(location.pathname !== '\/'\) return/);
});
