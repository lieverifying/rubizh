// Stage 5.6.1 (hosting, 21.10): on rubizh.shop HTTPS ends at the hosting proxy, Apache sees plain HTTP (%{HTTPS} off) and
// the request carries X-Forwarded-Proto: https. api/.htaccess and feeds/.htaccess redirected on %{HTTPS} alone, so every
// /api/ and /feeds/ request answered 301 to the same URL (PIM, CRM and the feeds were unreachable); the root .htaccess
// already honoured the proxy header. (1) every HTTPS redirect in a tracked .htaccess honours X-Forwarded-Proto;
// (2) a real Apache with the repository's .htaccess files: behind the proxy no redirect, plain HTTP still goes to https.
import {test} from 'node:test';import assert from 'node:assert/strict';import {execFileSync,spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,existsSync,rmSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import http from 'node:http';import net from 'node:net';
const root=new URL('..',import.meta.url).pathname;
const htaccessFiles=execFileSync('git',['ls-files','*.htaccess','.htaccess'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);

test('5.6.1 every HTTPS redirect in .htaccess honours the hosting proxy (X-Forwarded-Proto)',()=>{
 const bad=[];
 for(const f of htaccessFiles){const lines=readFileSync(path.join(root,f),'utf8').split('\n');
  lines.forEach((l,i)=>{if(!/^\s*RewriteCond\s+%\{HTTPS\}\s+!=on\b/.test(l))return;
   // The conditions of one rule are the consecutive RewriteCond lines before its RewriteRule.
   let j=i;while(j>0&&/^\s*RewriteCond\b/.test(lines[j-1]))j--;
   const block=[];for(let k=j;k<lines.length&&/^\s*RewriteCond\b/.test(lines[k]);k++)block.push(lines[k]);
   if(!block.some(c=>/^\s*RewriteCond\s+%\{HTTP:X-Forwarded-Proto\}\s+!https\b/i.test(c)))bad.push(f+':'+(i+1));});}
 assert.ok(htaccessFiles.length>=3,'tracked .htaccess files: '+htaccessFiles.join(' '));
 assert.deepEqual(bad,[],'HTTPS redirect without the proxy header check');
});

// Apache 2.4: /usr/sbin/apache2 (Ubuntu CI) or /usr/sbin/httpd (macOS). CI must have it — no silent skip there.
const apache=[['/usr/sbin/apache2','/usr/lib/apache2/modules'],['/usr/sbin/httpd','/usr/libexec/apache2']].find(([b,m])=>existsSync(b)&&existsSync(m));
const skipApache=apache||process.env.CI?false:'Apache 2.4 not installed locally';
const freePort=()=>new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const get=(port,p,headers={})=>new Promise((resolve,reject)=>{const r=http.get({host:'127.0.0.1',port,path:p,headers:{Host:'rubizh.shop',...headers}},res=>{res.resume();res.on('end',()=>resolve({status:res.statusCode,location:res.headers.location||''}));});r.on('error',reject);r.setTimeout(10000,()=>r.destroy(new Error('timeout '+p)));});

test('5.6.1 real Apache with the repository .htaccess: /api/, /feeds/ and / are served behind the HTTPS proxy, plain HTTP is redirected once',{skip:skipApache,timeout:60000},async()=>{
 assert.ok(apache,'Apache 2.4 is required in CI (apache2)');
 const [bin,mods]=apache,dir=mkdtempSync(path.join(tmpdir(),'rubizh-apache-')),doc=path.join(dir,'www');
 // Only the routing rules are under test: the repository's .htaccess files and empty stand-ins for the scripts they route to.
 for(const f of ['.htaccess','api/.htaccess','feeds/.htaccess']){mkdirSync(path.dirname(path.join(doc,f)),{recursive:true});copyFileSync(path.join(root,f),path.join(doc,f));}
 for(const f of ['storefront.php','api/index.php','feeds/google.php','feeds/meta.php'])writeFileSync(path.join(doc,f),'stand-in\n');
 const port=await freePort(),mod=(name,file)=>`<IfModule !${name}>\nLoadModule ${name} ${mods}/${file}\n</IfModule>`;
 writeFileSync(path.join(dir,'httpd.conf'),[`ServerRoot "${dir}"`,`Listen 127.0.0.1:${port}`,'ServerName localhost',
  mod('mpm_prefork_module','mod_mpm_prefork.so'),mod('unixd_module','mod_unixd.so'),mod('authz_core_module','mod_authz_core.so'),mod('dir_module','mod_dir.so'),
  mod('rewrite_module','mod_rewrite.so'),mod('headers_module','mod_headers.so'),mod('setenvif_module','mod_setenvif.so'),
  `PidFile "${dir}/httpd.pid"`,`ErrorLog "${dir}/error.log"`,`DefaultRuntimeDir "${dir}"`,`Mutex file:${dir} default`,
  `DocumentRoot "${doc}"`,`<Directory "${doc}">`,' AllowOverride All',' Require all granted','</Directory>',''].join('\n'));
 const httpd=spawn(bin,['-X','-f',path.join(dir,'httpd.conf')],{stdio:['ignore','pipe','pipe']});let stderr='';httpd.stderr.on('data',d=>stderr+=d);
 try{
  let up=false;for(let i=0;i<100&&!up&&httpd.exitCode===null;i++){try{await get(port,'/robots.txt');up=true;}catch{await new Promise(r=>setTimeout(r,100));}}
  assert.ok(up,'Apache did not start: '+stderr+(existsSync(path.join(dir,'error.log'))?readFileSync(path.join(dir,'error.log'),'utf8'):''));
  const proxy={'X-Forwarded-Proto':'https'};
  for(const p of ['/api/pim/status','/api/staff/auth/session','/feeds/google.xml','/']){
   const behind=await get(port,p,proxy);assert.equal(behind.status,200,p+' behind the HTTPS proxy must not redirect (got '+behind.status+' → '+behind.location+')');
   const plain=await get(port,p);assert.equal(plain.status,301,p+' over plain HTTP');assert.equal(plain.location,'https://rubizh.shop'+p,p+' redirect target');
  }
 }finally{if(httpd.exitCode===null&&httpd.signalCode===null){httpd.kill('SIGTERM');await new Promise(r=>httpd.once('exit',r));}rmSync(dir,{recursive:true,force:true});}
});
