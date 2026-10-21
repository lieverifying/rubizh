// Stage 5.6.2 (owner decision 21.10): one login for CRM and PIM — the owner's e-mail and password, no separate PIM
// password and no PIM key typed by the owner. PIM (https://pim.rubizh.shop, same site, other origin) signs in through the
// Staff API with credentials and receives the API address and the PIM key from GET /api/staff/pim/connection (OWNER only).
// CORS with credentials is opened for the PIM origin on exactly four routes; every other Staff API route stays same-origin.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {startCrm,staffEmail,password} from './helpers/crm-fixture.mjs';import {PIM_KEY} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const PIM='https://pim.rubizh.shop';

test('5.6.2 PIM signs in with the CRM e-mail and password and receives the API address and its key (OWNER only)',{skip,timeout:240000},async()=>{
 const s=await startCrm({extraConfig:`,'pim_origins'=>['${PIM}']`});
 try{
  const call=async(path,{method='GET',origin=PIM,cookie='',csrf='',body,headers={}}={})=>{
   const r=await fetch(s.base+'/api/staff'+path,{method,redirect:'manual',headers:{...(origin?{Origin:origin}:{}),...(cookie?{Cookie:cookie}:{}),...(csrf?{'X-CSRF-Token':csrf}:{}),...(body?{'Content-Type':'application/json'}:{}),...headers},body:body?JSON.stringify(body):undefined});
   const text=await r.text();let data=null;try{data=JSON.parse(text);}catch{}return {status:r.status,headers:r.headers,data,text};};
  const preflight=(path,method='POST')=>call(path,{method:'OPTIONS',headers:{'Access-Control-Request-Method':method,'Access-Control-Request-Headers':'content-type,x-csrf-token'}});
  // Preflight: the four PIM routes answer 204 with credentials allowed; any other Staff API route gets no CORS.
  for(const [p,m] of [['/auth/session','GET'],['/auth/login','POST'],['/auth/logout','POST'],['/pim/connection','GET']]){
   const r=await preflight(p,m);assert.equal(r.status,204,p+' '+r.text);assert.equal(r.headers.get('access-control-allow-origin'),PIM,p);assert.equal(r.headers.get('access-control-allow-credentials'),'true',p);
   assert.match(r.headers.get('access-control-allow-headers')||'',/x-csrf-token/i,p);
  }
  for(const [p,m] of [['/orders','GET'],['/me/password','POST'],['/staff','GET']]){const r=await preflight(p,m);assert.notEqual(r.status,204,p);assert.equal(r.headers.get('access-control-allow-origin'),null,p);}
  assert.equal((await call('/auth/login',{method:'OPTIONS',origin:'https://evil.example',headers:{'Access-Control-Request-Method':'POST'}})).headers.get('access-control-allow-origin'),null,'foreign origin');
  // Session → login (e-mail + password, no second factor: crm_totp_required=false) → connection.
  const login=async role=>{
   const session=await call('/auth/session');assert.equal(session.status,200,session.text);assert.equal(session.headers.get('access-control-allow-origin'),PIM);assert.equal(session.headers.get('access-control-allow-credentials'),'true');
   let cookie=session.headers.get('set-cookie').split(';')[0];
   const r=await call('/auth/login',{method:'POST',cookie,csrf:session.data.meta.csrf,body:{email:staffEmail(role),password}});
   assert.equal(r.status,200,r.text);assert.equal(r.headers.get('access-control-allow-origin'),PIM);cookie=r.headers.get('set-cookie')?.split(';')[0]||cookie;
   return {cookie,csrf:r.data.meta.csrf};};
  const owner=await login('OWNER');
  const me=await call('/auth/session',{cookie:owner.cookie});assert.equal(me.data.data.authenticated,true,'signed in with e-mail and password only');assert.equal(me.data.data.totp_required,false);
  const c=await call('/pim/connection',{cookie:owner.cookie});
  assert.equal(c.status,200,c.text);assert.equal(c.headers.get('access-control-allow-origin'),PIM);
  assert.equal(c.data.data.pim_key,PIM_KEY);assert.match(c.data.data.api_url,/^https?:\/\/[^/]+\/api$/);
  assert.equal(c.headers.get('cache-control')?.includes('no-store'),true,'the key is never cached');
  // Other roles never receive the key; without a session — 401.
  const manager=await login('MANAGER');assert.equal((await call('/pim/connection',{cookie:manager.cookie})).status,403,'MANAGER has no PIM key');
  assert.equal((await call('/pim/connection')).status,401,'no session');
  // From the PIM origin every other state-changing route is refused (CSRF), even with a valid session and token.
  const pw=await call('/me/password',{method:'POST',cookie:owner.cookie,csrf:owner.csrf,body:{current_password:password,new_password:'Another-strong-password-43'}});
  assert.equal(pw.status,403,pw.text);assert.equal(pw.data?.error?.code,'CSRF_INVALID');assert.equal(pw.headers.get('access-control-allow-origin'),null);
  // A foreign origin cannot sign in.
  const fs=await call('/auth/session',{origin:'https://evil.example'});const fcookie=fs.headers.get('set-cookie').split(';')[0];
  const fl=await call('/auth/login',{method:'POST',origin:'https://evil.example',cookie:fcookie,csrf:fs.data.meta.csrf,body:{email:staffEmail('OWNER'),password}});
  assert.equal(fl.status,403,fl.text);assert.equal(fl.data?.error?.code,'CSRF_INVALID');
  // Logout from PIM works and ends the session.
  const out=await call('/auth/logout',{method:'POST',cookie:owner.cookie,csrf:owner.csrf,body:{}});assert.equal(out.status,200,out.text);
  assert.equal((await call('/pim/connection',{cookie:owner.cookie})).status,401,'logged out');
 }finally{s.stop();}
});
