// Owner (stage 5.5.3): four messenger icons under the footer phone — chats with that number, built from the seller settings
// (config seller.phone, optional seller.telegram username), never hard-coded; local SVG icons (CSP, no CDN); light icons with
// the phone's orange accent on hover; ≥ 44 px targets; Ukrainian aria-labels; a new tab except viber://; both themes, 360–1440.
import {test} from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const LINKS=[['Написати у Viber','viber://chat?number=%2B380976867892',null],['Написати у WhatsApp','https://wa.me/380976867892','_blank'],
 ['Написати у Telegram','https://t.me/+380976867892','_blank'],['Написати у Signal','https://signal.me/#p/+380976867892','_blank']];
const links=html=>[...html.matchAll(/<a class="rz-msg rz-msg-\w+" href="([^"]+)" aria-label="([^"]+)"[^>]*?(?: target="(_blank)" rel="noopener noreferrer")?>/g)].map(m=>[m[2],m[1].replace(/&amp;/g,'&'),m[3]??null]);

test('footer messengers: the links come from the seller settings (default phone; another phone and a Telegram username change every link)',{skip,timeout:240000},async()=>{
 const {startSite}=await import('./helpers/site-fixture.mjs');
 const site=await startSite({enableV3:false});
 try{
  const html=await (await fetch(site.base+'/')).text();const footer=html.slice(html.indexOf('<footer'));
  assert.deepEqual(links(footer),LINKS);
  for(const id of ['viber','whatsapp','telegram','signal']){const r=await fetch(site.base+'/assets/messenger-'+id+'.2026101801.svg');assert.equal(r.status,200,id);assert.match(await r.text(),/^<svg[^>]*viewBox="0 0 24 24"/,id+': local SVG');}
  assert.doesNotMatch(footer,/https?:\/\/(?!wa\.me|t\.me|signal\.me)[^"']*\.(?:svg|png|css|js)/,'no icon or style from another host');
 }finally{site.stop();}
 const other=await startSite({enableV3:false,extraConfig:",'seller'=>['phone'=>'+380 50 111 22 33','telegram'=>'rubizh_shop']"});
 try{
  const html=await (await fetch(other.base+'/')).text();
  assert.deepEqual(links(html.slice(html.indexOf('<footer'))),[['Написати у Viber','viber://chat?number=%2B380501112233',null],['Написати у WhatsApp','https://wa.me/380501112233','_blank'],['Написати у Telegram','https://t.me/rubizh_shop','_blank'],['Написати у Signal','https://signal.me/#p/+380501112233','_blank']]);
  assert.doesNotMatch(html.slice(html.indexOf('<footer')),/380976867892/,'the old number is gone from the footer links');
 }finally{other.stop();}
});

test('footer messengers: 360–1440, both themes — four ≥ 44 px targets, light icons, the phone colour on hover, no overflow, nothing from outside',{skip,timeout:300000},async()=>{
 const {startSite}=await import('./helpers/site-fixture.mjs');const require=createRequire(import.meta.url);const {chromium}=require('playwright');
 const site=await startSite({enableV3:false});const browser=await chromium.launch(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{});
 try{
  for(const theme of ['dark','light'])for(const width of [360,768,1440]){
   const ctx=await browser.newContext({viewport:{width,height:900},colorScheme:theme});const page=await ctx.newPage();const outside=[],errors=[];
   page.on('request',r=>{if(!r.url().startsWith(site.base))outside.push(r.url());});page.on('pageerror',e=>errors.push(e.message));
   await page.goto(site.base+'/');await page.evaluate(t=>{document.documentElement.dataset.theme=t;},theme);
   const a=page.locator('footer [data-footer-messengers] a');await a.first().scrollIntoViewIfNeeded();
   const info=await a.evaluateAll(xs=>xs.map(x=>{const r=x.getBoundingClientRect();return [x.getAttribute('aria-label'),Math.round(r.width),Math.round(r.height),getComputedStyle(x.firstElementChild).maskImage||getComputedStyle(x.firstElementChild).webkitMaskImage];}));
   const where=theme+' '+width;assert.equal(info.length,4,where);
   for(const [label,w,h,mask] of info){assert.ok(w>=44&&h>=44,where+' '+label+' '+w+'×'+h);assert.match(mask,/\/assets\/messenger-\w+\.2026101801\.svg/,where+' local icon');}
   const phone=await page.evaluate(()=>getComputedStyle(document.querySelector('[data-footer-phone]')).color);
   assert.notEqual(await a.nth(2).evaluate(x=>getComputedStyle(x).color),phone,where+': icons are the footer text colour, not the accent');
   await a.nth(2).hover();await page.waitForTimeout(250);assert.equal(await a.nth(2).evaluate(x=>getComputedStyle(x).color),phone,where+': hover = the phone accent');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,where+': no horizontal scroll');
   assert.deepEqual(outside,[],where);assert.deepEqual(errors,[],where);await ctx.close();
  }
 }finally{await browser.close();site.stop();}
});
