// Stage 5.6.3 (owner check 21.10, WCAG 1.4.11): in the light theme the form fields were almost invisible (field boundary
// 1.0–1.4:1 against the surface; dark 1.5–1.8:1). Every visible text field, select and textarea on the sign-in page, the
// cabinet and the checkout must have a boundary of at least 3:1 against the surface around it, in both themes.
// A search field inside its own framed box is measured by the box (the box carries the boundary).
import {test,before,after} from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';
import {chromium} from 'playwright';import {startPreview} from '../dev/preview.mjs';
let browser,server,base;
before(async()=>{server=await startPreview(0);base='http://127.0.0.1:'+server.address().port;const exe=process.env.CHROMIUM_PATH||'/usr/bin/chromium';browser=await chromium.launch({executablePath:existsSync(exe)?exe:undefined,headless:true,args:['--no-sandbox']});});
after(async()=>{await browser?.close();await new Promise(r=>server.close(r));});
const measure=()=>{
 const rgb=s=>{const m=s.match(/rgba?\(([^)]+)\)/);if(!m)return null;const p=m[1].split(/[ ,/]+/).filter(Boolean).map(Number);return {r:p[0],g:p[1],b:p[2],a:p.length>3?p[3]:1};};
 const lum=c=>{const f=v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;};return .2126*f(c.r)+.7152*f(c.g)+.0722*f(c.b);};
 const ratio=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 const over=(t,u)=>({r:t.r*t.a+u.r*(1-t.a),g:t.g*t.a+u.g*(1-t.a),b:t.b*t.a+u.b*(1-t.a),a:1});
 const behind=el=>{const stack=[];for(let e=el.parentElement;e;e=e.parentElement){const c=rgb(getComputedStyle(e).backgroundColor);if(c&&c.a>0)stack.push(c);if(c&&c.a===1)break;}const base=stack.length&&stack[stack.length-1].a===1?{r:0,g:0,b:0,a:1}:(rgb(getComputedStyle(document.body).backgroundColor)||{r:255,g:255,b:255,a:1});return stack.reverse().reduce((u,t)=>over(t,u),base);};
 const boundary=el=>{const cs=getComputedStyle(el),around=behind(el),fill=over(rgb(cs.backgroundColor)||{r:0,g:0,b:0,a:0},around),bc=rgb(cs.borderBottomColor),w=parseFloat(cs.borderBottomWidth)||0;return Math.max(w>=1&&bc&&bc.a>0?ratio(over(bc,around),around):1,ratio(fill,around));};
 const rows=[];
 for(const el of document.querySelectorAll('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea')){
  const r=el.getBoundingClientRect(),cs=getComputedStyle(el);if(r.width<8||r.height<8||cs.visibility==='hidden'||cs.display==='none')continue;
  const box=el.type==='search'&&el.parentElement&&parseFloat(getComputedStyle(el.parentElement).borderBottomWidth)>=1?el.parentElement:null;
  rows.push({field:(el.id||el.name||el.type)+(box?' (box)':''),ratio:Math.round(boundary(box||el)*100)/100});
 }
 return rows;
};
async function checkout(page){await page.goto(base+'/product/demo-uniform');await page.locator('[data-store-surface]').waitFor();await page.getByRole('button',{name:'L',exact:true}).click();await page.getByRole('button',{name:/До кошика/}).first().click();await page.getByRole('button',{name:'Продовжити',exact:true}).click();await page.locator('header [aria-label="Кошик"]').click();await page.getByRole('heading',{name:'Оформлення замовлення'}).waitFor();}

test('5.6.3 form field boundaries are at least 3:1 on sign-in, cabinet and checkout in both themes',{timeout:240000},async()=>{
 for(const theme of ['light','dark'])for(const [name,open] of [['sign-in',p=>p.goto(base+'/auth/')],['cabinet profile',p=>p.goto(base+'/auth/preview-account?tab=profile')],['cabinet delivery',p=>p.goto(base+'/auth/preview-account?tab=delivery')],['checkout',checkout]]){
  const ctx=await browser.newContext({viewport:{width:1280,height:900}});await ctx.addInitScript(t=>{try{localStorage.setItem('rubizh.theme',t);}catch{}},theme);const page=await ctx.newPage();
  try{await open(page);await page.waitForLoadState('networkidle');assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),theme);
   const rows=await page.evaluate(measure);assert.ok(rows.length>0,theme+' '+name+': fields found');
   const low=rows.filter(r=>r.ratio<3);assert.deepEqual(low,[],theme+' '+name+': field boundary below 3:1');}
  finally{await ctx.close();}
 }
});
