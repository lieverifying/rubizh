// Stage 5.6.3 (owner check 21.10): the owner picks the light theme in the cabinet, opens another cabinet tab — the theme is
// dark again. The choice must hold on every cabinet tab, on the storefront and after a reload, also when the next page is
// opened right after the click (the profile save may still be on its way), and it must reach the profile for other devices.
import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,writeFileSync,existsSync} from 'node:fs';import path from 'node:path';
import {chromium} from 'playwright';
import {startCrm} from './helpers/crm-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const exe=process.env.CHROMIUM_PATH||'/usr/bin/chromium';

test('5.6.3 theme choice holds across cabinet tabs, the storefront and reloads, and is saved to the profile',{skip,timeout:300000},async()=>{
 const s=await startCrm({stock:20,extraConfig:",'staging_allow_loopback'=>true"});
 // Phone sign-in on the stand, exactly as the CRM E2E stand: SMS codes go to a local outbox.
 writeFileSync(path.join(s.site,'auth/config.php'),"<?php return ['sms_enabled'=>true,'turbosms_token'=>'fixture-token','turbosms_sender'=>'RUBIZH','google_enabled'=>false,'noreply_password'=>'','auth_secret'=>str_repeat('s',48),'sms_daily_limit'=>50,'sms_test_outbox'=>__DIR__.'/../sms-outbox.jsonl'];");
 const browser=await chromium.launch({executablePath:existsSync(exe)?exe:undefined,args:['--no-sandbox']});
 try{
  const ctx=await browser.newContext({viewport:{width:1280,height:900},colorScheme:'dark'});const page=await ctx.newPage();
  const phone='+380671230563';
  await page.goto(s.base+'/auth/');await page.locator('#entry-phone').fill(phone);await page.getByRole('button',{name:/Отримати код/}).first().click();
  await page.getByLabel(/Код підтвердження/).waitFor({timeout:30000});
  const code=readFileSync(path.join(s.site,'sms-outbox.jsonl'),'utf8').trim().split('\n').map(l=>JSON.parse(l)).filter(x=>x.phone.replace(/\D/g,'').endsWith('671230563')).pop().code;
  await page.getByLabel(/Код підтвердження/).fill(code);await page.getByLabel(/Код підтвердження/).press('Enter');await page.waitForLoadState('networkidle');
  const theme=()=>page.evaluate(()=>document.documentElement.dataset.theme);
  await page.goto(s.base+'/auth/?tab=profile');assert.equal(await theme(),'dark','starts dark (system)');
  // The header switch, then another tab at once — no waiting for the profile save.
  await page.locator('[data-theme-toggle]').first().click();assert.equal(await theme(),'light');
  for(const tab of ['orders','favorites','delivery','donations','profile']){await page.goto(s.base+'/auth/?tab='+tab);assert.equal(await theme(),'light','cabinet tab '+tab);}
  await page.goto(s.base+'/');assert.equal(await theme(),'light','storefront');
  await page.reload();assert.equal(await theme(),'light','after reload');
  await page.goto(s.base+'/auth/?tab=orders');assert.equal(await theme(),'light','back in the cabinet');
  // The choice reached the profile (another device of the same buyer opens light).
  await page.waitForLoadState('networkidle');
  assert.equal(s.sql("SELECT customer_id FROM rubizh_customer_preferences WHERE theme='light'").length,1,'saved to the profile');
  // The profile selector works the same way; the choice survives a tab switch.
  await page.goto(s.base+'/auth/?tab=profile');await page.locator('#profile-theme').selectOption('dark');
  await page.goto(s.base+'/auth/?tab=orders');assert.equal(await theme(),'dark','select → another tab');
  await page.goto(s.base+'/');assert.equal(await theme(),'dark');
 }finally{await browser.close();s.stop();}
});
