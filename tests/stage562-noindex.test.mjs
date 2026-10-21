// Stage 5.6.2 (owner decision 21.10): before opening the site is open without a password but not indexed. The working mode
// (no environment=staging) with 'noindex'=>true: every PHP response carries X-Robots-Tag noindex, there is no sitemap, and
// none of the closed-mode relaxations (on-screen SMS code, mock bank or Nova Poshta) applies on the public host.
import {test} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {startSite,php} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const get=(base,path)=>{const u=new URL(base);return new Promise((resolve,reject)=>{const r=http.get({host:u.hostname,port:u.port,path,headers:{Host:'rubizh.shop'}},res=>{let b='';res.on('data',d=>b+=d);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:b}));});r.on('error',reject);});};

test('5.6.2 noindex without a password: open site, X-Robots-Tag on every PHP response, no sitemap, no staging relaxations',{skip,timeout:240000},async()=>{
 const s=await startSite({enableV3:false,extraConfig:",'noindex'=>true,'mono_mock'=>true,'np_mock'=>true"});
 try{
  for(const p of ['/','/shop/customer.php','/api/catalog?limit=1']){
   const r=await get(s.base,p);
   assert.notEqual(r.status,401,p+' opens without a password');assert.equal(r.headers['www-authenticate'],undefined,p);
   assert.equal(r.headers['x-robots-tag'],'noindex, nofollow',p);
  }
  assert.equal((await get(s.base,'/sitemap.php')).status,404,'no sitemap before opening');
  const relaxed=JSON.parse(php(`$_SERVER['HTTP_HOST']='rubizh.shop';$_SERVER['REQUEST_URI']='/';$GLOBALS['rubizh_config_file']='${s.site}/api/config.php';require_once '${s.site}/shop/staging-gate.php';require_once '${s.site}/api/lib.php';require_once '${s.site}/shop/mono-lib.php';require_once '${s.site}/shop/np-lib.php';echo json_encode([rubizhStagingRelaxed(),monoMockEnabled(),npMockEnabled()]);`).stdout);
  assert.deepEqual(relaxed,[false,false,false],'mocks and the on-screen SMS code never apply on the open site');
 }finally{s.stop();}
 // Without the flag the working mode adds no noindex (the opening day just removes the line).
 const open=await startSite({enableV3:false});
 try{const r=await get(open.base,'/');assert.equal(r.headers['x-robots-tag'],undefined);assert.notEqual((await get(open.base,'/sitemap.php')).status,404);}
 finally{open.stop();}
});
