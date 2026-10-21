// Stage 5.6.1 (hosting, 21.10): in the closed mode (D-80) PIM connects from https://pim.rubizh.shop with its key in the
// Authorization header, so Chrome first sends a CORS preflight (OPTIONS, no Authorization). The gate let through only
// requests that carry the key and answered the preflight 401 — PIM could not reach the site at all («Failed to fetch»).
// The gate now passes only a real preflight (OPTIONS + Access-Control-Request-Method) from a configured PIM origin to
// /api/pim/… (no dot segments); it carries no data and api/lib.php cors() answers 204. Everything else keeps the password.
import {test} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {startSite,php,PIM_KEY} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const USER='rubizh-test',PASSWORD='stage561-closed-mode-password',PIM='https://pim.rubizh.shop';
function request(base,path,{method='GET',headers={}}={}){
 const u=new URL(base);
 return new Promise((resolve,reject)=>{const r=http.request({host:u.hostname,port:u.port,path,method,headers:{Host:'rubizh.shop',...headers}},res=>{let b='';res.on('data',d=>b+=d);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:b}));});r.on('error',reject);r.end();});
}

test('5.6.1 closed mode: the PIM CORS preflight passes the password gate; nothing else does',{skip,timeout:180000},async()=>{
 const hash=php(`echo password_hash(${JSON.stringify(PASSWORD)},PASSWORD_DEFAULT);`).stdout.trim();
 const s=await startSite({enableV3:false,extraConfig:`,'environment'=>'staging','staging_gate'=>['user'=>'${USER}','password_hash'=>'${hash}'],'pim_origins'=>['${PIM}']`});
 try{
  const preflight=(path,origin=PIM,extra={})=>request(s.base,path,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type',...extra}});
  for(const p of ['/api/pim/status','/api/pim/v3/batches','/api/pim/supplier-fetch']){
   const r=await preflight(p);
   assert.equal(r.status,204,p+' preflight: '+r.body);assert.equal(r.headers['access-control-allow-origin'],PIM,p);assert.match(r.headers['access-control-allow-headers']||'',/Authorization/i,p);
   assert.equal(r.headers['www-authenticate'],undefined,p+' no password prompt');assert.equal(r.body,'',p+' no data in a preflight');
  }
  // Another origin, no preflight header, other API paths and dot segments stay behind the password.
  assert.equal((await preflight('/api/pim/status','https://evil.example')).status,401,'foreign origin');
  assert.equal((await request(s.base,'/api/pim/status',{method:'OPTIONS',headers:{Origin:PIM}})).status,401,'OPTIONS without Access-Control-Request-Method');
  for(const p of ['/api/staff/auth/session','/api/catalog','/api/pimx/status','/api/pim/..%5c..%5cshop/customer.php','/api/pim/../../shop/customer.php','/api/pim/%2e%2e/%2e%2e/shop/customer.php','/shop/customer.php'])
   assert.equal((await preflight(p)).status,401,p);
  assert.equal((await request(s.base,'/api/pim/status',{method:'OPTIONS',headers:{'Access-Control-Request-Method':'POST'}})).status,401,'preflight without Origin');
  for(const method of ['GET','POST'])assert.equal((await request(s.base,'/api/pim/status',{method,headers:{Origin:PIM,'Access-Control-Request-Method':'POST'}})).status,401,method+' with preflight headers is not a preflight');
  // A '*' origin list (allowed by cors() for keyed requests) never opens the preflight to any origin.
  const {readFileSync,writeFileSync}=await import('node:fs');const cfg=s.site+'/api/config.php';writeFileSync(cfg,readFileSync(cfg,'utf8').replace(`'pim_origins'=>['${PIM}']`,`'pim_origins'=>['*']`));
  assert.equal((await preflight('/api/pim/status','https://evil.example')).status,401,"'*' does not open the preflight");
  // The key request itself is unchanged: with the PIM key 200, without it the password.
  assert.equal((await request(s.base,'/api/pim/status',{headers:{Origin:PIM,Authorization:'Bearer '+PIM_KEY}})).status,200,'PIM with its key');
  assert.equal((await request(s.base,'/api/pim/status',{headers:{Origin:PIM}})).status,401,'PIM without the key');
 }finally{s.stop();}
});
