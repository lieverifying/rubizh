// Stage 5.6-3 (D-84): before opening, one live 1 UAH payment with a real card. Checks: (1) the webhook signature key
// comes from the bank by the token (GET /api/merchant/pubkey) and is bound to that token — after switching the sandbox
// token to the production one the next webhook verifies with the production key, nothing else to change; (2) in the
// closed mode (D-80) the monobank webhook path passes the password gate — only POST to the exact path, the script
// itself verifies the signature; (3) amounts in kopecks, UAH (980): the 1 UAH test product is 100. No real bank:
// a test transport and a locally generated key pair.
import {test} from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {generateKeyPairSync,createSign} from 'node:crypto';
import {startSite,php} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const USER='rubizh-test',PASSWORD='stage56-closed-mode-password';
const pem=k=>Buffer.from(k.export({type:'spki',format:'pem'})).toString('base64');
function request(base,path,{method='GET',body=null,headers={},auth=null}={}){
 const u=new URL(base);const h={Host:'rubizh.shop',...headers};if(auth)h.Authorization='Basic '+Buffer.from(auth.join(':')).toString('base64');if(body)h['Content-Length']=Buffer.byteLength(body);
 return new Promise((resolve,reject)=>{const r=http.request({host:u.hostname,port:u.port,path,method,headers:h},res=>{let b='';res.on('data',d=>b+=d);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:b}));});r.on('error',reject);if(body)r.write(body);r.end();});
}

test('5.6-3 webhook key: fetched from the bank by the token, bound to it; a new token refetches at once; amounts in kopecks',{skip,timeout:120000},async()=>{
 const s=await startSite({enableV3:false});
 try{
  const a=pem(generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey),b=pem(generateKeyPairSync('ec',{namedCurve:'prime256v1'}).publicKey);
  const out=JSON.parse(php(`define('RUBIZH_MONO_TESTS',true);require '${s.site}/api/lib.php';require_once '${s.site}/shop/mono-lib.php';$db=db();
   $calls=[];$GLOBALS['mono_test_transport']=function($path,$body)use(&$calls){$calls[]=[$path,getenv('RUBIZH_MONO_TOKEN')];return ['key'=>getenv('RUBIZH_MONO_TOKEN')==='prod-token'?'${b}':'${a}'];};
   $o=[];putenv('RUBIZH_MONO_TOKEN=sandbox-token');$o[]=monoPublicKey($db)==='${a}';$o[]=monoPublicKey($db)==='${a}';$o[]=count($calls);
   putenv('RUBIZH_MONO_TOKEN=prod-token');$o[]=monoPublicKey($db)==='${b}';$o[]=count($calls);
   $o[]=monoPublicKey($db,true)==='${b}';$o[]=count($calls);$o[]=array_column($calls,0);
   // A third token whose fetch fails: one immediate attempt, the next within 10 s is refused without a request.
   putenv('RUBIZH_MONO_TOKEN=broken-token');$GLOBALS['mono_test_transport']=function($path)use(&$calls){$calls[]=[$path,'broken'];throw new RuntimeException('bank down');};
   $f=[];for($k=0;$k<3;$k++){try{monoPublicKey($db);$f[]='ok';}catch(Throwable $e){$f[]=get_class($e);}}$o[]=[$f,count($calls)];putenv('RUBIZH_MONO_TOKEN=prod-token');
   // A key stored before the binding (no token tag) is still used as before — refetched only when a signature fails.
   $db->exec("DELETE FROM meta WHERE k IN ('mono_public_key_token','mono_public_key_checked')");$o[]=monoPublicKey($db)==='${b}';$o[]=count($calls);
   $o[]=[monoMinor(1),monoMinor('1'),monoMinor('1499.99'),monoMinor(0.01)];
   echo json_encode($o);`).stdout);
  assert.deepEqual(out.slice(0,3),[true,true,1],'fetched once by the sandbox token, then cached');
  assert.deepEqual(out.slice(3,5),[true,2],'the production token gets its own key at once (no 60 s wait)');
  assert.deepEqual(out.slice(5,7),[true,2],'a forced refresh within 60 s is throttled (no request flood)');
  assert.deepEqual(out[7],['pubkey','pubkey'],'GET /api/merchant/pubkey');
  assert.deepEqual(out[8],[['RuntimeException','RubizhHttpException','RubizhHttpException'],3],'a failing new token: one request, then throttled');
  assert.deepEqual(out.slice(9,11),[true,3],'legacy key without a tag: no extra request');
  assert.deepEqual(out[11],[100,100,149999,1],'kopecks: 1 UAH = 100');
 }finally{s.stop();}
});

test('5.6-3 closed mode: the monobank webhook passes the password gate (POST, exact path), its signature is still checked',{skip,timeout:180000},async()=>{
 const hash=php(`echo password_hash(${JSON.stringify(PASSWORD)},PASSWORD_DEFAULT);`).stdout.trim();
 // The real bank behind the closed mode (D-84 live payment): mono_mock off. With the stand's mock bank the path stays closed.
 const s=await startSite({enableV3:false,extraConfig:`,'environment'=>'staging','mono_mock'=>false,'staging_gate'=>['user'=>'${USER}','password_hash'=>'${hash}']`});
 try{
  const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
  s.sql(`INSERT INTO meta(k,v) VALUES('mono_public_key','${pem(publicKey)}'),('mono_public_key_checked',UNIX_TIMESTAMP()) ON DUPLICATE KEY UPDATE v=VALUES(v)`);
  const raw=JSON.stringify({invoiceId:'stage56-unknown-invoice',status:'success',amount:100,ccy:980,modifiedDate:new Date().toISOString()});
  const sign=b=>createSign('SHA256').update(b).sign(privateKey).toString('base64');
  const post=(path,body,headers={})=>request(s.base,path,{method:'POST',body,headers:{'Content-Type':'application/json',...headers}});
  // A signed webhook reaches the handler without the password: the signature passes, and an invoice not yet recorded
  // answers the handler's 503 «retry the callback» (JSON), never the gate's 401.
  const ok=await post('/shop/mono-webhook.php',raw,{'X-Sign':sign(raw)});
  assert.notEqual(ok.status,401,'the bank has no password: '+ok.body);assert.equal(ok.status,503,ok.body);assert.deepEqual(JSON.parse(ok.body),{ok:false});assert.doesNotMatch(ok.headers['www-authenticate']||'',/Basic/);
  // The gate opens the path, not the payment: a wrong signature is the script's 403.
  assert.equal((await post('/shop/mono-webhook.php',raw,{'X-Sign':sign('other body')})).status,403,'signature still checked');
  // Everything else stays behind the password.
  assert.equal((await request(s.base,'/shop/mono-webhook.php')).status,401,'GET is not the bank');
  for(const p of ['/shop/mono-webhook.php/../customer.php','/shop/%2e%2e/shop/customer.php','/shop/mono-webhook.php?x=/../','/shop/mono-mock-pay.php','/shop/payment-return.php','/shop/customer.php'])
   assert.equal((await post(p,raw,{'X-Sign':sign(raw)})).status,401,p);
  const {readFileSync,writeFileSync}=await import('node:fs');const cfg=s.site+'/api/config.php';writeFileSync(cfg,readFileSync(cfg,'utf8').replace("'mono_mock'=>false","'mono_mock'=>true"));
  assert.equal((await post('/shop/mono-webhook.php',raw,{'X-Sign':sign(raw)})).status,401,'with the mock bank nothing outside calls the webhook');
 }finally{s.stop();}
});

// 5.6-4е: an SMS the provider refuses (e.g. the alpha name is not active: 401 NOT_ALLOWED_MESSAGE_SENDER_NOT_ACTIVE) was
// invisible to the owner — now the provider code reaches the PHP error log, never the phone number or the code.
test('5.6-4е TurboSMS refusal is logged with the provider code only',{skip,timeout:120000},async()=>{
 const s=await startSite({enableV3:false});
 try{
  const r=php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${s.site}/auth/bootstrap.php';require_once '${s.site}/auth/phone.php';
   echo json_encode([turboSmsFailureNote(['response_code'=>401,'response_status'=>'NOT_ALLOWED_MESSAGE_SENDER_NOT_ACTIVE','response_result'=>null],'+380671234567'),
    turboSmsFailureNote(['response_code'=>0,'response_status'=>'OK','response_result'=>[['phone'=>'380671234567','response_code'=>406,'response_status'=>'NOT_ALLOWED_RECIPIENT_COUNTRY','message_id'=>null]]],'+380671234567'),
    turboSmsFailureNote(['response_code'=>'<script>'.str_repeat('x',300)],'+380671234567')]);`).stdout;
  const [a,b,c]=JSON.parse(r);
  assert.equal(a,'TurboSMS refused: 401 NOT_ALLOWED_MESSAGE_SENDER_NOT_ACTIVE');assert.equal(b,'TurboSMS refused: 0 OK; recipient 406 NOT_ALLOWED_RECIPIENT_COUNTRY');
  for(const x of [a,b,c])assert.doesNotMatch(x,/380671234567|<script>/);assert.ok(c.length<160);
 }finally{s.stop();}
});
