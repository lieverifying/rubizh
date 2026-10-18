#!/usr/bin/env node
// Stage 5.5 (5.5-10): the owner's local preview — `npm run owner-preview`.
// MariaDB (a throw-away data directory), the PHP site with the "Перша хвиля" catalogue of rehearsal run11 (or the test
// catalogue), the CRM built at the SHA pinned in ci.yml, test staff accounts of every role, monobank / Nova Poshta / SMS
// stubs. Real provider calls are impossible: provider keys never reach PHP (tests/helpers/site-fixture.mjs), monobank and
// Nova Poshta go through the stand's mocks, SMS codes and e-mails stay on screen (closed staging mode, D-80), and PHP runs
// with curl, sockets and URL fopen disabled. Ctrl+C stops everything, MariaDB included, and removes the temporary files.
// Options: --without-vat-note (no invoice_vat_note: payment to the FOP account is hidden, D-79), --ready-json (one JSON
// line for tests), `ttn <number> <StatusCode>` (in a second terminal: the NP stub reports that status for a TTN).
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {existsSync,mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,renameSync,chmodSync} from 'node:fs';
import {homedir,tmpdir} from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
const argv=process.argv.slice(2),flag=f=>argv.includes(f);
const cache=path.join(process.env.XDG_CACHE_HOME||path.join(homedir(),'.cache'),'rubizh-owner-preview');
const stateFile=path.join(cache,'current.json');
const say=(...a)=>{if(!flag('--ready-json'))console.log(...a);};
// A failure after MariaDB or the temporary folder exist still stops and removes them (stage 5.5 review): nothing is left running.
const fail=m=>{console.error('Не вдалося запустити перегляд: '+m);cleanupNow();process.exit(1);};
let mariadb=null,site=null,work=null,stopping=false,ownDb=false,fixturePhpArgs=null;
function cleanupNow(){
 try{site?.stop();}catch(e){console.error('Сайт: '+e.message);}
 if(mariadb&&mariadb.exitCode===null){try{mariadb.kill('SIGKILL');}catch(e){console.error('MariaDB: '+e.message);}}
 if(work)try{rmSync(work,{recursive:true,force:true});}catch(e){console.error('Тимчасові файли: '+e.message);}
}
const which=n=>{const r=spawnSync('/bin/sh',['-c','command -v '+n],{encoding:'utf8'});return r.status===0?r.stdout.trim():'';};
const firstFile=list=>list.find(f=>f&&existsSync(f))||'';
// Functions that reach the network from PHP. The stand's mocks never need them.
const NETWORK_OFF=['-d','allow_url_fopen=0','-d','disable_functions=curl_init,curl_multi_init,curl_share_init,fsockopen,pfsockopen,stream_socket_client'];

if(argv[0]==='ttn'){
 const [number,code]=argv.slice(1);
 if(!/^\d{10,20}$/.test(number||'')||!/^\d{1,3}$/.test(code||''))fail('формат: npm run owner-preview -- ttn <номер ТТН> <код статусу НП>, наприклад 9 — отримано');
 if(!existsSync(stateFile))fail('перегляд не запущено');
 const s=JSON.parse(readFileSync(stateFile,'utf8'));
 const r=spawnSync(s.php,[...(s.phpArgs||['-n']),'-r',`$db=new PDO('mysql:unix_socket=${s.socket};dbname=${s.schema};charset=utf8mb4','root','');$db->prepare('INSERT INTO meta(k,v) VALUES(?,?) ON DUPLICATE KEY UPDATE v=VALUES(v)')->execute(['np_mock_status_${number}','${code}']);`],{encoding:'utf8'});
 if(r.status!==0)fail(r.stderr||r.stdout);
 console.log(`Заглушка НП: ТТН ${number} має статус ${code}. У CRM відкрийте замовлення й оновіть статус доставки.`);process.exit(0);
}

const started=Date.now();work=mkdtempSync(path.join(tmpdir(),'rz-op-'));
async function stop(code=0){
 if(stopping)return;stopping=true;
 try{site?.stop();}catch(e){console.error('Сайт: '+e.message);}
 // On a shared MariaDB (tests) only this stand's schema is removed; an own server is stopped with its data directory.
 if(site&&!ownDb){const d=spawnSync(process.env.RUBIZH_PHP_RUNTIME+'/bin/php8.4',[...(fixturePhpArgs||['-n']),'-r',`(new PDO('mysql:unix_socket=${process.env.RUBIZH_TEST_MYSQL_SOCKET}','root',''))->exec('DROP DATABASE IF EXISTS ${site.schema}');`],{encoding:'utf8'});if(d.status!==0)console.error('Схему стенду не видалено: '+(d.stderr||d.stdout).slice(-300));}
 if(mariadb&&mariadb.exitCode===null){mariadb.kill('SIGTERM');await new Promise(r=>{const t=setTimeout(()=>{try{mariadb.kill('SIGKILL')}catch{}r();},15000);mariadb.once('exit',()=>{clearTimeout(t);r();});});}
 try{rmSync(work,{recursive:true,force:true});}catch{}
 try{rmSync(stateFile,{force:true});}catch{}
 say('Перегляд зупинено: сайт, CRM і MariaDB.');process.exit(code);
}
process.on('SIGINT',()=>stop(0));process.on('SIGTERM',()=>stop(0));process.on('SIGHUP',()=>stop(0));
for(const ev of ['uncaughtException','unhandledRejection'])process.on(ev,e=>{console.error('Помилка перегляду: '+(e?.stack||e));if(stopping){cleanupNow();process.exit(1);}stop(1);});

// 1. PHP: the tests' runtime layout (bin/php8.4 under RUBIZH_PHP_RUNTIME), wrapped so that the network stays off.
{
 // The tests' default runtime path (tests/helpers/site-fixture.mjs) when the variable is not set (CI).
 if(!process.env.RUBIZH_PHP_RUNTIME&&existsSync('/workspace/php-runtime/root/usr/bin/php8.4'))process.env.RUBIZH_PHP_RUNTIME='/workspace/php-runtime/root/usr';
 const inner=process.env.RUBIZH_PHP_RUNTIME?process.env.RUBIZH_PHP_RUNTIME+'/bin/php8.4':firstFile([process.env.PHP_PATH,which('php'),'/opt/homebrew/opt/php@8.4/bin/php','/opt/homebrew/opt/php@8.2/bin/php','/opt/homebrew/bin/php']);
 if(!inner)fail('немає PHP. Встановіть: brew install php');
 const keepExtensions=!!process.env.RUBIZH_PHP_RUNTIME;
 if(!keepExtensions){const r=spawnSync(inner,['-r',"exit(extension_loaded('pdo_mysql')&&extension_loaded('mbstring')?0:1);"]);if(r.status!==0)fail('у PHP немає pdo_mysql або mbstring');}
 const bin=path.join(work,'rt/usr/bin');mkdirSync(bin,{recursive:true});
 // Homebrew PHP has the extensions built in, so explicit "-d extension=…" arguments of the test helpers are dropped there.
 writeFileSync(path.join(bin,'php8.4'),`#!/bin/bash\nargs=(); skip=0\nfor a in "$@"; do\n  if [ $skip = 1 ]; then skip=0\n    case "$a" in extension=*) ${keepExtensions?'args+=("-d" "$a")':':'};; *) args+=("-d" "$a");; esac\n    continue\n  fi\n  case "$a" in -d) skip=1;; *) args+=("$a");; esac\ndone\nexec ${JSON.stringify(inner)} ${NETWORK_OFF.map(x=>JSON.stringify(x)).join(' ')} "\${args[@]}"\n`);
 chmodSync(path.join(bin,'php8.4'),0o755);
 process.env.RUBIZH_PHP_RUNTIME=path.join(work,'rt/usr');
}

// 2. MariaDB: the tests' socket if one is given, otherwise a fresh server in a temporary data directory.
if(!(process.env.RUBIZH_TEST_MYSQL_SOCKET&&existsSync(process.env.RUBIZH_TEST_MYSQL_SOCKET))){
 const dirs=['/opt/homebrew/opt/mariadb@11.4/bin','/opt/homebrew/opt/mariadb/bin','/opt/homebrew/bin','/usr/local/opt/mariadb/bin','/usr/local/bin','/usr/bin','/usr/sbin'];
 const server=firstFile([which('mariadbd'),...dirs.map(d=>d+'/mariadbd')]),install=firstFile([which('mariadb-install-db'),...dirs.map(d=>d+'/mariadb-install-db')]);
 if(!server||!install)fail('немає MariaDB. Встановіть: brew install mariadb@11.4');
 const data=path.join(work,'db'),socket=path.join(work,'mysqld.sock');
 const init=spawnSync(install,['--no-defaults','--datadir='+data,'--auth-root-authentication-method=normal','--skip-test-db'],{encoding:'utf8'});
 if(init.status!==0)fail('MariaDB не ініціалізувалась: '+(init.stderr||init.stdout).slice(-400));
 mariadb=spawn(server,['--no-defaults','--datadir='+data,'--socket='+socket,'--skip-networking','--pid-file='+path.join(work,'mysqld.pid')],{stdio:['ignore','ignore','pipe']});
 let log='';mariadb.stderr.on('data',x=>log+=x);mariadb.once('exit',()=>{if(!stopping){console.error('MariaDB зупинилась: '+log.slice(-400));stop(1);}});
 for(let i=0;i<300&&!existsSync(socket);i++)await new Promise(r=>setTimeout(r,100));
 if(!existsSync(socket))fail('MariaDB не відповідає: '+log.slice(-400));
 process.env.RUBIZH_TEST_MYSQL_SOCKET=socket;ownDb=true;
}

// 3. CRM frontend at the SHA pinned in ci.yml (built once, kept in the cache).
if(!process.env.RUBIZH_CRM_DIR||!existsSync(process.env.RUBIZH_CRM_DIR+'/dist/index.html')){
 const sha=(readFileSync(path.join(root,'.github/workflows/ci.yml'),'utf8').match(/repository: [\w.-]+\/crm\.rubizh\s+ref: ([0-9a-f]{40})/)||[])[1];
 if(!sha)fail('у ci.yml не знайдено закріплений SHA CRM');
 const out=path.join(cache,'crm-'+sha);
 if(!existsSync(out+'/dist/index.html')){
  say('Перший запуск: збираю CRM '+sha.slice(0,7)+' (1–2 хв)…');
  const repo=firstFile([process.env.RUBIZH_CRM_REPO,path.join(homedir(),'Projects/crm.rubizh'),path.resolve(root,'../crm.rubizh')].filter(Boolean).map(d=>d+'/.git')).replace(/\/\.git$/,'');
  const src=path.join(work,'crm-src');mkdirSync(src,{recursive:true});
  const git=(...a)=>execFileSync('git',a,{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  try{
   if(repo){try{git('-C',repo,'cat-file','-e',sha+'^{commit}');}catch{git('-C',repo,'fetch','--quiet','origin',sha);}execFileSync('/bin/sh',['-c',`git -C ${JSON.stringify(repo)} archive ${sha} | tar -x -C ${JSON.stringify(src)}`]);}
   else{git('clone','--quiet','https://github.com/alexalixmanov-del/crm.rubizh.git',src);git('-C',src,'checkout','--quiet',sha);}
   for(const step of [['ci','--ignore-scripts','--no-audit','--no-fund'],['run','build']]){const r=spawnSync('npm',step,{cwd:src,encoding:'utf8'});if(r.status!==0)throw Error('npm '+step[0]+': '+(r.stderr||r.stdout).slice(-400));}
  }catch(e){fail('CRM не зібралась: '+e.message);}
  mkdirSync(out,{recursive:true});renameSync(path.join(src,'dist'),out+'/dist');
 }
 process.env.RUBIZH_CRM_DIR=out;
}

// 4. Site + CRM: the same stand as the CRM E2E tests (staging mode, monobank mock, NP mock, five staff roles).
const {startCrm,roles5,staffEmail,password}=await import('../tests/helpers/crm-fixture.mjs');
const {freshWire,PIM_KEY,php,phpArgs}=await import('../tests/helpers/site-fixture.mjs');const {testProducts,testBatchId}=await import('./test-products.mjs');fixturePhpArgs=phpArgs;
const vat=flag('--without-vat-note')?",'invoice_vat_note'=>''":'';
try{site=await startCrm({frontend:true,npMock:true,extraConfig:vat});}catch(e){console.error(e.message);await stop(1);}
// SMS login with the code shown on screen (D-80: staging without a provider) — nothing is sent.
writeFileSync(path.join(site.site,'auth/config.php'),"<?php return ['sms_enabled'=>true,'google_enabled'=>false,'noreply_password'=>'','auth_secret'=>'pim-v3-fixture-secret-at-least-forty-characters'];");
// Same stand settings as the E2E tests: loopback origin for the buyer's cookies, NP recovery columns, a confirmed NP sender.
writeFileSync(path.join(site.site,'api/config.php'),readFileSync(path.join(site.site,'api/config.php'),'utf8').replace(/\];\s*$/,",'staging_allow_loopback'=>true,'mono_mock_page'=>true];"));
php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';npRecoveryMigrate(shopStoreDatabase());`);
const npRef=seed=>{const h=createHash('sha256').update('np-mock|'+seed).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;};
site.sql(`UPDATE rubizh_sender_profiles SET city='Київ',region='Київська',branch='1',city_ref='${npRef('city:kyiv')}',warehouse_ref='${npRef('wh:'+npRef('city:kyiv')+':1')}',sender_ref='${npRef('sender')}',contact_ref='${npRef('contact')}',phone='+380671234567',confirmed=1`);
// monobank: the site's own test bank page of the closed staging mode (shop/mono-mock-pay.php, stage 5.5.3) — the same page as
// on staging; nothing is signed or sent.
// The shop's own routes (root .htaccess), the CRM and the stand's provider stubs.
writeFileSync(path.join(site.site,'router.php'),`<?php require '${site.dir}/provider-fixture.php';$p=(string)strtok($_SERVER['REQUEST_URI'],'?');
if(preg_match('~^/(?:dev|tests|docs|contracts|cache|node_modules)(?:/|$)|(?:^|/)\\.~',$p)){http_response_code(403);return;}
if(str_starts_with($p,'/__preview-media/')){header('Content-Type: image/svg+xml');header('Cache-Control: no-store');echo '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800"><rect width="800" height="800" fill="#3a3f2e"/><text x="400" y="410" fill="#d8d2b8" font-family="sans-serif" font-size="36" text-anchor="middle">Фото тестового каталогу</text></svg>';return;}
// Test-catalogue photos are addressed to the live domain (https://rubizh.shop/media/…): on the stand they are local placeholders,
// so the browser never asks the production site for anything.
ob_start(fn($b)=>str_replace(['https://rubizh.shop/media/','https:\\\\/\\\\/rubizh.shop\\\\/media\\\\/'],['/__preview-media/','\\\\/__preview-media\\\\/'],$b));
if(str_starts_with($p,'/api/')){require __DIR__.'/api/index.php';return;}
if(str_starts_with($p,'/crm/')&&!is_file(__DIR__.$p)){require __DIR__.'/crm/index.html';return;}
if($p==='/'||preg_match('~^/(?:(?:product|catalog|kit|categories|porady|rozdil)(?:/.*)?|offer/?|privacy/?)$~',$p)){require __DIR__.'/storefront.php';return;}
if($p==='/sitemap.xml'){require __DIR__.'/sitemap.php';return;}
if(is_file(__DIR__.$p)||is_dir(__DIR__.$p))return false;http_response_code(404);`);

// 5. The wave catalogue of rehearsal run11 (chunks prepared by PIM audit/staging-dump-5-5.cjs; supplier data, not in git).
const chunksFile=process.env.RUBIZH_PREVIEW_CHUNKS||path.join(homedir(),'Projects/rubizh-supplier-files/out/run11/owner-preview-chunks.json.gz');
let catalogue='тестовий каталог (файл хвилі run11 не знайдено: '+chunksFile+')',products=null;
if(existsSync(chunksFile)){
 const chunks=JSON.parse((chunksFile.endsWith('.gz')?gunzipSync(readFileSync(chunksFile)):readFileSync(chunksFile)).toString('utf8'));
 // Supplier data time moved to "6 hours ago" in memory (as the fixture does), otherwise the 5.1 freshness rule hides it.
 // The test catalogue (published by the stand) is hidden by the last chunk, so the site shows the wave only.
 const last=chunks[chunks.length-1];last.hide_ids=[...new Set([...(last.hide_ids||[]),...site.wire.products.map(m=>m.id)])];
 // Stage 5.5.3: the two 1 UAH test products ride in the same batch; the PIM import time is «6 hours ago» at every start, so
 // the 72 h / 8 days freshness rule never closes payment or hides the catalogue on a later day.
 last.products.push(...testProducts(chunks.flatMap(c=>c.products)));
 for(const c of chunks){freshWire(c);for(const m of c.products)for(const v of m.variants)if(v.stock_imported_at!=null){v.stock_imported_at=Date.now()-6*3600000;v.stock_data_age_hours=6;}const r=await site.post('/api/pim/sync',c,{'Authorization':'Bearer '+PIM_KEY});if(r.status!==200){console.error('Сайт не прийняв частину хвилі '+c.chunk_index+': '+r.status+' '+JSON.stringify((r.data?.results||[]).filter(x=>x.status!=='valid')).slice(0,1500));await stop(1);}}
 products=chunks.reduce((n,c)=>n+c.products.length,0);catalogue='перша хвиля run11: '+(products-2)+' товарів і 2 тестові по 1 грн';
}else{
 // The test catalogue of the stand: the two 1 UAH test products are added by a batch of their own.
 const {products:_,...head}=site.wire,extra={...head,batch_id:testBatchId(),chunk_index:0,chunk_count:1,hide_ids:[],products:testProducts(site.wire.products)};
 const r=await site.post('/api/pim/sync',extra,{'Authorization':'Bearer '+PIM_KEY});if(r.status!==200){console.error('Сайт не прийняв тестові товари: '+r.status+' '+JSON.stringify(r.data).slice(0,300));await stop(1);}
 products=site.wire.products.length+2;catalogue='тестовий каталог і 2 тестові товари по 1 грн';
}
const users=roles5.map(role=>({role,email:staffEmail(role)}));
mkdirSync(cache,{recursive:true});
writeFileSync(stateFile,JSON.stringify({php:process.env.RUBIZH_PHP_RUNTIME+'/bin/php8.4',phpArgs,socket:process.env.RUBIZH_TEST_MYSQL_SOCKET,schema:site.schema}));
const seconds=Math.round((Date.now()-started)/1000);
if(flag('--ready-json'))console.log(JSON.stringify({site:site.base,crm:site.base+'/crm/',users,password,schema:site.schema,socket:process.env.RUBIZH_TEST_MYSQL_SOCKET,php:process.env.RUBIZH_PHP_RUNTIME+'/bin/php8.4',php_args:phpArgs,own_db:ownDb,products,vat_note:!vat,seconds}));
else{
 console.log(`\nRUBIZH — локальний перегляд для власника (запуск ${seconds} с)\n`);
 console.log('  Сайт:  '+site.base+'/        ('+catalogue+')');
 console.log('  CRM:   '+site.base+'/crm/');
 console.log('  Пароль усіх працівників: '+password+'   (двофакторний вхід вимкнено)');
 for(const u of users)console.log('    '+u.role.padEnd(10)+' '+u.email);
 console.log('\n  Оплата карткою — заглушка monobank (гроші не списуються). Нова пошта — заглушка: ТТН створюється, статус задає');
 console.log('  команда в іншому терміналі: npm run owner-preview -- ttn <номер ТТН> 9   (9 — отримано, 7 — прибув, 102 — повернення)');
 console.log('  Вхід за SMS: код показується на екрані, SMS не надсилаються. Листи не надсилаються.');
 console.log('  Оплата на рахунок ФОП: '+(vat?'ВИМКНЕНА (запуск з --without-vat-note)':'увімкнена (є тестовий статус ПДВ; без нього: npm run owner-preview -- --without-vat-note)'));
 console.log('  Справжні платежі, SMS, ТТН і листи неможливі: ключів немає, PHP без мережі.');
 console.log('\n  Зупинити все (і MariaDB): Ctrl+C\n');
}
