// Stage 5.6-1 (D-82): PIM in the browser cannot read the Армолайн and Киборг exports (no CORS), so SITE downloads a
// supplier export for PIM by the PIM key: POST /api/pim/supplier-fetch {url}. Only HTTPS, only owner-listed supplier
// hosts (built-in three + config supplier_fetch_hosts), no internal or private addresses — checked after DNS and pinned
// for the connection, every redirect hop re-checked (DNS rebinding) —, redirects stay on the same domain, 100 MB,
// a deadline, a rate limit, and the log never carries the query string (it holds publicKey). No real supplier, DNS or
// network is contacted: policy cases use an injected resolver and transport; the curl transport is exercised against a
// local HTTPS server with a throwaway certificate.
import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
import {spawnSync,spawn} from 'node:child_process';import {createServer} from 'node:https';import {createHash} from 'node:crypto';
import {startSite,php,root,runtime,phpArgs,phpEnv} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const sha=b=>createHash('sha256').update(b).digest('hex');
const lib=`require '${root}/api/supplier-fetch.php';`;
// A fake DNS answer (a list of answers = one per lookup) and a fake HTTP exchange per hop: [code, fields, body].
const harness=`$GLOBALS['calls']=[];
function fakeResolver(array $map):callable{$n=[];return function(string $host)use($map,&$n){$v=$map[$host]??[];if(isset($v[0])&&is_array($v[0])){$i=$n[$host]=($n[$host]??-1)+1;return $v[min($i,count($v)-1)];}return $v;};}
function fakeTransport(array $hops):callable{return function(string $url,string $host,array $ips,$sink,int $limit,float $deadline)use(&$hops){$GLOBALS['calls'][]=['url'=>$url,'host'=>$host,'ips'=>$ips];[$code,$fields,$body]=array_shift($hops)??[500,[],''];if(strlen($body)>$limit)return ['code'=>$code,'too_large'=>true]+$fields;fwrite($sink,$body);return ['code'=>$code]+$fields;};}
function attempt(string $url,array $resolve,array $hops,array $opt=[]):array{$sink=tmpfile();try{$r=supplierFetch($url,supplierFetchHosts($opt['hosts']??null),$sink,['resolver'=>fakeResolver($resolve),'transport'=>fakeTransport($hops)]+$opt);rewind($sink);return ['ok'=>true,'body'=>stream_get_contents($sink)]+$r;}catch(SupplierFetchRejected $e){return ['ok'=>false,'reason'=>$e->reason,'status'=>$e->getCode()];}finally{fclose($sink);}}`;
const evalPhp=code=>JSON.parse(php(lib+harness+code).stdout);
const PUBLIC=JSON.stringify(['93.184.216.34']);

test('5.6-1 policy: HTTPS only, listed supplier domains only, no credentials, ports or look-alike hosts',{skip},()=>{
 const urls=['http://armoline.com.ua/content/export/a.xml','https://evil.example/a.xml','https://armoline.com.ua.evil.example/a.xml','https://evilarmoline.com.ua/a.xml',
  'https://sub.armoline.com.ua/a.xml','https://user:pw@armoline.com.ua/a.xml','https://armoline.com.ua:8443/a.xml','https://armoline.com.ua./a.xml','https://93.184.216.34/a.xml',
  'ftp://armoline.com.ua/a.xml','file:///etc/passwd','https://armoline.com.ua/a b.xml','https:///a.xml','javascript:alert(1)'];
 const v=evalPhp(`$o=[];foreach(json_decode(base64_decode('${Buffer.from(JSON.stringify(urls)).toString('base64')}'),true) as $u)$o[$u]=attempt($u,['armoline.com.ua'=>['93.184.216.34'],'armoline.com.ua.evil.example'=>['93.184.216.34'],'evil.example'=>['93.184.216.34'],'evilarmoline.com.ua'=>['93.184.216.34'],'sub.armoline.com.ua'=>['93.184.216.34']],[[200,[],'<yml_catalog/>']]);$o['calls']=count($GLOBALS['calls']);echo json_encode($o);`);
 for(const u of urls){assert.equal(v[u].ok,false,u);assert.equal(v[u].status,422,u);}
 assert.equal(v['http://armoline.com.ua/content/export/a.xml'].reason,'HTTPS_REQUIRED');
 assert.equal(v['https://evil.example/a.xml'].reason,'HOST_NOT_ALLOWED');
 assert.equal(v.calls,0,'nothing is downloaded for a refused address');
 // The three suppliers of D-82 (www. of a listed domain is the same domain) and an owner-added host pass.
 const ok=evalPhp(`$o=[];foreach(['https://www.armoline.com.ua/content/export/x.xml','https://armoline.com.ua/content/export/x.xml','https://tactic-shop.in.ua/content/export/y.xml','https://tacticalbelt.salesdrive.me/export/z/export.yml?publicKey=SECRET'] as $u)$o[]=attempt($u,['www.armoline.com.ua'=>${PUBLIC},'armoline.com.ua'=>${PUBLIC},'tactic-shop.in.ua'=>${PUBLIC},'tacticalbelt.salesdrive.me'=>${PUBLIC}],[[200,[],'<yml_catalog/>']])['ok'];
  $o[]=attempt('https://prices.newsupplier.example/feed.xml',['prices.newsupplier.example'=>${PUBLIC}],[[200,[],'<yml_catalog/>']],['hosts'=>['prices.newsupplier.example']])['ok'];
  $o[]=attempt('https://prices.newsupplier.example/feed.xml',['prices.newsupplier.example'=>${PUBLIC}],[[200,[],'<yml_catalog/>']])['ok'];
  $o[]=supplierFetchHosts(['  Prices.Other.Example ','*.example','','x..y','-bad.example',7]);echo json_encode($o);`);
 assert.deepEqual(ok.slice(0,6),[true,true,true,true,true,false],'built-in three + configured host; an unlisted host is refused');
 assert.deepEqual(ok[6],['armoline.com.ua','tactic-shop.in.ua','tacticalbelt.salesdrive.me','prices.other.example'],'config entries are normalised; wildcards and junk are not hosts');
});

test('5.6-1 policy: internal and private addresses are refused after DNS, on every hop (DNS rebinding), and the connection is pinned',{skip},()=>{
 const v=evalPhp(`$o=[];$u='https://tactic-shop.in.ua/content/export/k.xml';
  foreach([['127.0.0.1'],['10.0.0.5'],['192.168.1.1'],['169.254.169.254'],['::1'],['::ffff:10.0.0.1'],['fd00::1'],['93.184.216.34','10.0.0.5'],[],['64:ff9b::7f00:1'],['2002:7f00:1::']] as $i=>$ips)$o['dns'.$i]=attempt($u,['tactic-shop.in.ua'=>$ips],[[200,[],'x']]);
  $o['calls_after_private']=count($GLOBALS['calls']);
  // An IP-literal host that the owner listed by mistake is still checked as an address.
  $o['literal']=attempt('https://127.0.0.1/feed.xml',[],[[200,[],'x']],['hosts'=>['127.0.0.1']]);
  // First answer public, the redirect hop to the same host resolves to an internal address: refused before connecting.
  $o['rebind']=attempt($u,['tactic-shop.in.ua'=>[['93.184.216.34'],['127.0.0.1']]],[[302,['location'=>'/content/export/k2.xml'],''],[200,[],'x']]);
  $o['rebind_calls']=count($GLOBALS['calls'])-$o['calls_after_private'];
  $GLOBALS['calls']=[];$o['pinned']=attempt($u,['tactic-shop.in.ua'=>['93.184.216.34','2606:2800:220:1::1']],[[200,[],'<yml_catalog/>']]);$o['pin']=$GLOBALS['calls'][0];echo json_encode($o);`);
 for(const i of [0,1,2,3,4,5,6,7,9,10]){assert.equal(v['dns'+i].ok,false,'dns'+i);assert.equal(v['dns'+i].reason,'ADDRESS_FORBIDDEN','dns'+i+' (9, 10: NAT64 / 6to4 with an IPv4 inside)');}
 assert.equal(v.dns8.reason,'UNRESOLVED');
 assert.equal(v.calls_after_private,0,'no connection to a private address');
 assert.equal(v.literal.reason,'ADDRESS_FORBIDDEN');
 assert.equal(v.rebind.ok,false);assert.equal(v.rebind.reason,'ADDRESS_FORBIDDEN');assert.equal(v.rebind_calls,1,'the second hop never connects');
 assert.equal(v.pinned.ok,true);assert.deepEqual(v.pin.ips,['93.184.216.34','2606:2800:220:1::1'],'the transport connects only to the checked addresses');
});

test('5.6-1 policy: redirects stay on the same domain and HTTPS; size and status checks; log without the query',{skip},()=>{
 const v=evalPhp(`$o=[];$u='https://tacticalbelt.salesdrive.me/export/abc/export.yml?publicKey=SECRETKEY123';$d=['tacticalbelt.salesdrive.me'=>['93.184.216.34'],'evil.example'=>['93.184.216.34'],'salesdrive.me'=>['93.184.216.34'],'www.armoline.com.ua'=>['93.184.216.34'],'armoline.com.ua'=>['93.184.216.34'],'tactic-shop.in.ua'=>['93.184.216.34']];
  $o['foreign']=attempt($u,$d,[[302,['location'=>'https://evil.example/x.yml'],''],[200,[],'x']]);
  $o['parent']=attempt($u,$d,[[301,['location'=>'https://salesdrive.me/x.yml'],''],[200,[],'x']]);
  $o['other_supplier']=attempt($u,$d,[[302,['location'=>'https://tactic-shop.in.ua/x.yml'],''],[200,[],'x']]);
  $o['http']=attempt($u,$d,[[302,['location'=>'http://tacticalbelt.salesdrive.me/x.yml'],''],[200,[],'x']]);
  $o['same']=attempt($u,$d,[[302,['location'=>'/export/abc/v2.yml?publicKey=SECRETKEY123'],''],[200,[],'<yml_catalog date="2026-10-20 10:00"/>']]);
  $o['www']=attempt('https://armoline.com.ua/content/export/a.xml',$d,[[301,['location'=>'https://www.armoline.com.ua/content/export/a.xml'],''],[200,[],'<yml_catalog/>']]);
  $o['loop']=attempt($u,$d,array_fill(0,8,[302,['location'=>'/again'],'']));
  $o['big']=attempt($u,$d,[[200,[],str_repeat('x',2048)]],['max'=>1024]);
  $o['limit_default']=RUBIZH_SUPPLIER_FETCH_MAX;
  $o['http404']=attempt($u,$d,[[404,[],'nope']]);
  $o['empty']=attempt($u,$d,[[200,[],'']]);
  $o['timeout']=attempt($u,$d,[[0,['timeout'=>true],'']]);
  $o['network']=attempt($u,$d,[[0,['error'=>'Could not resolve'],'']]);
  $o['log']=[supplierFetchLogUrl($u),supplierFetchLogUrl('https://user:pw@www.armoline.com.ua/content/export/a.xml#frag'),supplierFetchLogUrl('not a url ?publicKey=SECRETKEY123'),supplierFetchLogUrl('https://tactic-shop.in.ua/content/export/0123456789abcdef0123456789abcdef.xml'),supplierFetchLogUrl("https://evil.example/a\nrubizh fake line"),strlen(supplierFetchLogUrl('https://evil.example/'.str_repeat('a/',3000)))];echo json_encode($o);`);
 for(const k of ['foreign','parent','other_supplier','http']){assert.equal(v[k].ok,false,k);assert.equal(v[k].reason,'REDIRECT_FORBIDDEN',k);}
 assert.equal(v.same.ok,true);assert.match(v.same.body,/yml_catalog/);
 assert.equal(v.www.ok,true,'apex → www of the same listed domain');
 assert.equal(v.loop.reason,'TOO_MANY_REDIRECTS');
 assert.equal(v.big.ok,false);assert.equal(v.big.reason,'TOO_LARGE');assert.equal(v.big.status,413);
 assert.equal(v.limit_default,100*1024*1024,'100 MB');
 assert.equal(v.http404.reason,'UPSTREAM_HTTP');assert.equal(v.http404.status,502);
 assert.equal(v.empty.reason,'EMPTY');
 assert.equal(v.timeout.reason,'TIMEOUT');assert.equal(v.timeout.status,504);
 assert.equal(v.network.reason,'UPSTREAM_UNREACHABLE');assert.equal(v.network.status,502);
 // Армолайн and Киборг put the export key in the path: long token segments are masked too.
 assert.deepEqual(v.log,['https://tacticalbelt.salesdrive.me/export/abc/export.yml','https://www.armoline.com.ua/content/export/a.xml','(невірна адреса)','https://tactic-shop.in.ua/content/export/0123…xml','https://evil.example/a_rubizh?fake?line',300],'no line breaks or unbounded text in the log');
});

test('5.6-1 curl transport: streams to disk, stops over the limit (body and Content-Length), honours the deadline, never follows redirects itself',{skip,timeout:120000},async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'rubizh-56-tls-'));
 try{
  const gen=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',dir+'/k.pem','-out',dir+'/c.pem','-days','1','-subj','/CN=tactic-shop.in.ua','-addext','subjectAltName=DNS:tactic-shop.in.ua'],{encoding:'utf8'});
  assert.equal(gen.status,0,gen.stderr);
  const big=Buffer.alloc(3*1024*1024,'a'),yml=Buffer.from('<?xml version="1.0"?><yml_catalog date="2026-10-20 09:00"><shop><offers><offer id="1"><price>100</price></offer></offers></shop></yml_catalog>');
  const server=createServer({key:readFileSync(dir+'/k.pem'),cert:readFileSync(dir+'/c.pem')},(req,res)=>{
   if(req.url==='/ok.xml'){res.writeHead(200,{'Content-Type':'application/xml','Last-Modified':'Mon, 20 Oct 2026 09:00:00 GMT'});res.end(yml);}
   else if(req.url==='/big'){res.writeHead(200);res.end(big);}
   else if(req.url==='/declared'){res.writeHead(200,{'Content-Length':String(500*1024*1024)});res.write('x');}
   else if(req.url==='/slow'){res.writeHead(200);res.write('x');}
   else if(req.url==='/redirect'){res.writeHead(302,{Location:'https://evil.example/'});res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
  try{
   const env=Object.fromEntries(Object.entries(phpEnv).filter(([k])=>k!=='RZ_DISABLE_CURL'));
   const code=`require '${root}/api/supplier-fetch.php';$o=[];foreach(['ok.xml','big','declared','slow','redirect'] as $p){$sink=tmpfile();$t=microtime(true);$r=supplierFetchCurl('https://tactic-shop.in.ua:${port}/'.$p,'tactic-shop.in.ua',['127.0.0.1'],$sink,1024*1024,microtime(true)+3,['port'=>${port},'cainfo'=>'${dir}/c.pem']);rewind($sink);$r['bytes']=strlen(stream_get_contents($sink));$r['ms']=(int)(1000*(microtime(true)-$t));$o[$p]=$r;fclose($sink);}echo json_encode($o);`;
   const p=await new Promise(resolve=>{const c=spawn(runtime+'/bin/php8.4',[...phpArgs,'-r',code],{env});let out='',err='';c.stdout.on('data',x=>out+=x);c.stderr.on('data',x=>err+=x);c.on('close',status=>resolve({status,out,err}));});
   assert.equal(p.status,0,p.err+p.out);const v=JSON.parse(p.out);
   assert.equal(v['ok.xml'].code,200);assert.equal(v['ok.xml'].bytes,yml.length);assert.equal(v['ok.xml'].last_modified,'Mon, 20 Oct 2026 09:00:00 GMT');assert.equal(v['ok.xml'].content_type,'application/xml');
   assert.equal(v.big.too_large,true,'body over the limit is cut');assert.ok(v.big.bytes<=1024*1024);
   assert.equal(v.declared.too_large,true,'a declared Content-Length over the limit stops at once');assert.ok(v.declared.ms<2500);
   assert.equal(v.slow.timeout,true,'deadline');assert.ok(v.slow.ms<5000);
   assert.equal(v.redirect.code,302);assert.equal(v.redirect.location,'https://evil.example/','the transport reports, the policy decides');
  }finally{server.close();}
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('5.6-1 endpoint: PIM key required, refusals are explicit JSON, rate limited, CORS exposes the file headers, log without query',{skip,timeout:180000},async()=>{
 const s=await startSite({extraConfig:",'pim_origins'=>['https://pim.rubizh.shop'],'supplier_fetch_hosts'=>['127.0.0.1']"});
 try{
  const call=(body,headers=s.auth)=>s.post('/api/pim/supplier-fetch',body,headers);
  assert.equal((await call({url:'https://tactic-shop.in.ua/content/export/k.xml'},{})).status,401,'no key');
  assert.equal((await call({url:'https://tactic-shop.in.ua/content/export/k.xml'},{Authorization:'Bearer wrong-key-wrong-key-wrong-key'})).status,401,'wrong key');
  assert.equal((await s.get('/api/pim/supplier-fetch',s.auth)).status,405,'POST only');
  const foreign=await call({url:'https://evil.example/feed.xml?publicKey=LEAKME42'});
  assert.equal(foreign.status,422);assert.equal(foreign.data.error_code,'HOST_NOT_ALLOWED');assert.match(foreign.data.error,/списку/);
  const internal=await call({url:'https://127.0.0.1/feed.xml?publicKey=LEAKME42'});
  assert.equal(internal.status,422);assert.equal(internal.data.error_code,'ADDRESS_FORBIDDEN','even an owner-listed internal address is refused');
  assert.equal((await call({url:'http://tactic-shop.in.ua/x.xml'})).data.error_code,'HTTPS_REQUIRED');
  assert.equal((await call('not json')).status,400);
  assert.equal((await call({url:'https://tactic-shop.in.ua/'+'x'.repeat(5000)})).status,422);
  // 5.6-4в: the web PHP limits are visible to the owner through PIM (key only), for ЗАПУСК.md.
  const st=await s.get('/api/pim/status',s.auth);for(const k of ['post_max_size','upload_max_filesize','memory_limit','max_execution_time','curl'])assert.ok(k in st.data.php_limits,k);
  assert.equal(st.data.php_limits.supplier_fetch_max_mb,100);assert.equal((await s.get('/api/pim/status')).status,401);
  const pre=await fetch(s.base+'/api/pim/supplier-fetch',{method:'OPTIONS',headers:{Origin:'https://pim.rubizh.shop','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});
  const expose=(pre.headers.get('access-control-expose-headers')||'').toLowerCase();
  for(const h of ['x-supplier-last-modified','x-supplier-content-type'])assert.ok(expose.includes(h),h+' exposed to PIM');
  // 30 calls per hour per network: the next one is refused with Retry-After.
  let last;for(let i=0;i<40;i++){last=await call({url:'https://evil.example/'+i+'.xml'});if(last.status===429)break;}
  assert.equal(last.status,429,'rate limited');assert.ok(+last.headers.get('retry-after')>0);
  await new Promise(r=>setTimeout(r,200));
  const log=s.errors();assert.match(log,/supplier-fetch/,'every refusal is logged');assert.doesNotMatch(log,/LEAKME42|publicKey/,'the query string never reaches the log');
 }finally{s.stop();}
});

test('5.6-1 endpoint end to end: a supplier YML passes byte for byte with its file time (injected transport only)',{skip},()=>{
 const yml=readFileSync(path.join(root,'tests/fixtures/stage56-supplier.yml'));
 const dir=mkdtempSync(path.join(tmpdir(),'rubizh-56-e2e-'));writeFileSync(dir+'/in.yml',yml);
 try{
  const r=php(lib+harness+`$body=file_get_contents('${dir}/in.yml');
   ob_start();supplierFetchRespond(['url'=>'https://tactic-shop.in.ua/content/export/feed.xml?publicKey=Z'],['resolver'=>fakeResolver(['tactic-shop.in.ua'=>['93.184.216.34']]),'transport'=>fakeTransport([[200,['content_type'=>'text/xml','last_modified'=>'Mon, 20 Oct 2026 09:00:00 GMT'],$body]]),'emit_headers'=>false]);
   $out=ob_get_clean();echo json_encode(['sha'=>hash('sha256',$out),'len'=>strlen($out),'headers'=>$GLOBALS['rubizh_supplier_fetch_headers']]);`);
  const v=JSON.parse(r.stdout);
  assert.equal(v.sha,sha(yml),'byte-exact');assert.equal(v.len,yml.length);
  assert.equal(v.headers['X-Supplier-Last-Modified'],'Mon, 20 Oct 2026 09:00:00 GMT');assert.equal(v.headers['X-Supplier-Content-Type'],'text/xml');
  assert.equal(v.headers['Cache-Control'],'no-store');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
