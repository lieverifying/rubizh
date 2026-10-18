// Stage 5.5 (owner D-80): the closed staging package for rubizh.shop, built locally (never touches the hosting).
//  1. a fresh local database through the same installers as production (pim v3, runtime, CRM);
//  2. the catalogue: PIM audit/staging-dump-5-5.cjs sends ≤500 READY «Перша хвиля» products of a rehearsal backup;
//  3. CRM test users of every role (dev/staff-user.php, passwords only for staging, written to OUT, never to git);
//  4. checks: no supplier costs, no customers, orders or other personal data;
//  5. SQL dump without DEFINER clauses (shared hosting), the code archive (package-release.py --staging), sha256 of both,
//     the api/config.php template with the closed-mode password hash.
// Needs the local test runtime (RUBIZH_PHP_RUNTIME, RUBIZH_TEST_MYSQL_SOCKET) like the tests.
// Usage: node dev/build-staging.mjs BACKUP.json.gz OUT_DIR
import {spawnSync} from 'node:child_process';import {mkdirSync,writeFileSync,readFileSync,chmodSync} from 'node:fs';
import {createHash,randomBytes} from 'node:crypto';import path from 'node:path';import zlib from 'node:zlib';import os from 'node:os';
const [backup,out]=process.argv.slice(2);if(!out)throw Error('Usage: node dev/build-staging.mjs BACKUP.json.gz OUT_DIR');
const root=path.resolve(import.meta.dirname,'..'),pim=path.join(os.homedir(),'Projects/pim.rubizh');
const {startSite,php,runtime,phpArgs,phpEnv,PIM_KEY}=await import(path.join(root,'tests/helpers/site-fixture.mjs'));
mkdirSync(out,{recursive:true,mode:0o700});
const sha=b=>createHash('sha256').update(b).digest('hex');
const secret=n=>randomBytes(n).toString('base64url');
const head=spawnSync('git',['rev-parse','--short','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim();
if(spawnSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).stdout.trim())throw Error('Commit first: the package must match a commit');
const gateUser='rubizh',gatePassword=secret(18);
const gateHash=php(`echo password_hash(${JSON.stringify(gatePassword)},PASSWORD_DEFAULT);`).stdout.trim();
const site=await startSite({enableV3:true,extraConfig:",'environment'=>'staging','mono_mock'=>true,'mono_mock_page'=>true,'np_mock'=>true,'np_ttn_enabled'=>true,'crm_enabled'=>true"});
const cli=(script,args=[],input)=>{const r=spawnSync(runtime+'/bin/php8.4',[...phpArgs,path.join(site.site,script),...args],{env:phpEnv,encoding:'utf8',input,timeout:300000});if(r.status!==0)throw Error(script+' failed: '+r.stdout+r.stderr);return r.stdout;};
const report={commit:head,built_at:new Date().toISOString()};
try{
 cli('dev/prepare-runtime.php');
 php(`define('RUBIZH_AUTH_NO_SESSION',true);require '${site.site}/auth/bootstrap.php';require_once '${site.site}/staff/auth.php';require_once '${site.site}/staff/read.php';crmMigrate(shopStoreDatabase());`);
 // The catalogue (PIM tooling, read-only over the backup).
 const dumpJson=path.join(out,'staging-catalogue.json');
 const r=spawnSync(process.execPath,['--max-old-space-size=6144',path.join(pim,'audit/staging-dump-5-5.cjs'),backup,site.base,PIM_KEY,dumpJson,'500'],{encoding:'utf8',timeout:1800000,stdio:['ignore','pipe','pipe']});
 if(r.status!==0)throw Error('catalogue: '+r.stdout+r.stderr);report.catalogue=JSON.parse(readFileSync(dumpJson,'utf8'));
 // Stage 5.5.3 (owner): two 1 UAH test products in a batch of their own (template: a contract-v3 batch prepared by PIM —
 // RZ_TEMPLATE_CHUNKS, default the run11 owner-preview chunks); removed before the opening (dev/remove-test-products.php).
 const {testProducts,testBatchId}=await import(path.join(root,'dev/test-products.mjs'));
 const tplFile=process.env.RZ_TEMPLATE_CHUNKS||path.join(os.homedir(),'Projects/rubizh-supplier-files/out/run11/owner-preview-chunks.json.gz');
 const tpl=JSON.parse(zlib.gunzipSync(readFileSync(tplFile)).toString('utf8'));const {products:_p,...tplHead}=tpl[0];
 const tp=await site.post('/api/pim/sync',{...tplHead,batch_id:testBatchId(),chunk_index:0,chunk_count:1,hide_ids:[],products:testProducts(tpl.flatMap(c=>c.products))},{'Authorization':'Bearer '+PIM_KEY});
 if(tp.status!==200)throw Error('test products: '+tp.status+' '+JSON.stringify(tp.data).slice(0,600));report.test_products=['rubizh-test-pay-now','rubizh-test-preorder'];
 // Stage 5.5.3: the package is a snapshot — with PIM's 72 h / 8 days the test checkout closed three days after the build and
 // the catalogue disappeared after eight. Staging only: the longest policy the site accepts (336 h / 60 days); production gets
 // PIM's own policy with its first sync.
 php(`require '${site.site}/api/lib.php';require_once '${site.site}/shop/stock-freshness.php';$db=db();shopFreshnessPolicyStore($db,['version'=>1,'pay_fresh_hours'=>336,'sell_max_days'=>60]);$GLOBALS['rubizh_freshness_policy']=[];shopFreshnessSweep($db,true,null,true);`);
 report.freshness_policy_staging={pay_fresh_hours:336,sell_max_days:60};
 // CRM test users of every role.
 const roles={OWNER:'owner',MANAGER:'manager',ACCOUNTANT:'accountant',SUPPORT:'support',WAREHOUSE:'warehouse'},users=[];
 for(const [role,name] of Object.entries(roles)){const password=secret(15);cli('dev/staff-user.php',['--email='+name+'@staging.rubizh.shop','--name=Тест '+role,'--role='+role,'--reason=Stage 5.5 closed staging test account'],password+'\n');users.push({role,email:name+'@staging.rubizh.shop',password});}
 // No costs, no customers, no orders, no personal data.
 const counts=Object.fromEntries(site.sql("SELECT table_name t FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='BASE TABLE' ORDER BY 1").map(({t})=>[t,Number(site.sql('SELECT COUNT(*) n FROM `'+t+'`')[0].n)]));
 const personal=Object.entries(counts).filter(([t,n])=>n>0&&/customer|order|phone|identit|session|address|donation|cart|payment|refund|invoice|notification|mail|wholesale|request|costs/i.test(t)&&!/^rubizh_staff_/.test(t));
 report.tables=counts;report.non_empty_sensitive=personal;
 // Stage 5.5 review: the dump goes to the hosting — any personal or cost row stops the build (not only a report line).
 if(!('rubizh_crm_sku_costs' in counts))throw Error('the supplier costs table is missing: the cost check cannot be made');
 if(counts.rubizh_crm_sku_costs)throw Error('supplier costs present');
 if(personal.length)throw Error('personal data in the dump: '+personal.map(([t,n])=>t+'='+n).join(', '));
 // Dump: schema, data, triggers; DEFINER removed (a shared hosting user cannot create objects for root@localhost).
 const dump=spawnSync('/opt/homebrew/opt/mariadb@11.4/bin/mariadb-dump',['--socket='+process.env.RUBIZH_TEST_MYSQL_SOCKET,'-uroot','--single-transaction','--routines','--triggers','--skip-comments','--default-character-set=utf8mb4',site.schema],{encoding:'utf8',maxBuffer:1024*1024*1024});
 if(dump.status!==0)throw Error('dump: '+dump.stderr);
 const sql=dump.stdout.replace(/\/\*!50017 DEFINER=`[^`]+`@`[^`]+`\*\/\s*/g,'').replace(/DEFINER=`[^`]+`@`[^`]+`\s*/g,'');
 if(/DEFINER=/i.test(sql))throw Error('DEFINER left in the dump');
 const dumpFile=path.join(out,'rubizh-staging-db.sql.gz');writeFileSync(dumpFile,zlib.gzipSync(sql,{level:9}));
 report.dump={file:path.basename(dumpFile),sha256:sha(readFileSync(dumpFile)),bytes:readFileSync(dumpFile).length,triggers:(sql.match(/CREATE[^;]*TRIGGER/g)||[]).length};
 // The code archive.
 const zip=path.join(out,'Rubizh-staging-'+head+'.zip');const pk=spawnSync('python3',[path.join(root,'dev/package-release.py'),zip,'--staging'],{cwd:root,encoding:'utf8'});if(pk.status!==0)throw Error('package: '+pk.stderr);
 report.archive=JSON.parse(pk.stdout.trim().split('\n').pop());
 writeFileSync(zip+'.sha256',report.archive.sha256+'  '+path.basename(zip)+'\n');writeFileSync(dumpFile+'.sha256',report.dump.sha256+'  '+path.basename(dumpFile)+'\n');
 // The CRM front end: built from the CRM commit pinned in CI (uploaded into crm/ on the hosting, as in GO_LIVE C3).
 const crmSha=readFileSync(path.join(root,'.github/workflows/ci.yml'),'utf8').match(/repository: alexalixmanov-del\/crm\.rubizh\s+ref: ([0-9a-f]{40})/)[1];
 const crmRepo=path.join(os.homedir(),'Projects/crm.rubizh'),crmTree=path.join(os.tmpdir(),'rubizh-crm-'+crmSha.slice(0,7)+'-'+process.pid);
 const git=(...a)=>{const g=spawnSync('git',a,{cwd:crmRepo,encoding:'utf8'});if(g.status!==0)throw Error('git '+a.join(' ')+': '+g.stderr);return g.stdout;};
 git('worktree','add','--detach',crmTree,crmSha);
 try{
  spawnSync('ln',['-s',path.join(crmRepo,'node_modules'),path.join(crmTree,'node_modules')]);
  const b=spawnSync('npm',['run','build'],{cwd:crmTree,encoding:'utf8'});if(b.status!==0)throw Error('CRM build: '+b.stdout+b.stderr);
  const crmZip=path.join(out,'Rubizh-crm-'+crmSha.slice(0,7)+'.zip');const z=spawnSync('python3',['-c',`import sys,zipfile,os
from pathlib import Path
src=Path(sys.argv[1]);out=sys.argv[2]
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for f in sorted(p for p in src.rglob('*') if p.is_file()):
        i=zipfile.ZipInfo('crm/'+f.relative_to(src).as_posix(),(2026,10,9,0,0,0));i.external_attr=0o644<<16;i.compress_type=zipfile.ZIP_DEFLATED;z.writestr(i,f.read_bytes())`,path.join(crmTree,'dist'),crmZip],{encoding:'utf8'});
  if(z.status!==0)throw Error('CRM zip: '+z.stderr);
  report.crm={commit:crmSha,file:path.basename(crmZip),sha256:sha(readFileSync(crmZip))};writeFileSync(crmZip+'.sha256',report.crm.sha256+'  '+path.basename(crmZip)+'\n');chmodSync(crmZip,0o600);
 }finally{git('worktree','remove','--force',crmTree);}
 // api/config.php template: the owner fills the database name, user and password from the hosting panel.
 const pimKey=secret(32),cronKey=secret(32);
 writeFileSync(path.join(out,'config.staging.php.txt'),`<?php
// api/config.php для ЗАКРЫТОГО режима (стейджинг) на rubizh.shop. Заполнить три строки БД из панели хостинга.
return [
  'db_host' => 'localhost',
  'db_name' => 'ВПИСАТЬ_ИМЯ_НОВОЙ_БД',
  'db_user' => 'ВПИСАТЬ_ПОЛЬЗОВАТЕЛЯ_БД',
  'db_pass' => 'ВПИСАТЬ_ПАРОЛЬ_БД',
  'environment' => 'staging',
  'staging_gate' => ['user' => '${gateUser}', 'password_hash' => '${gateHash}'],
  'pim_key' => '${pimKey}',
  'cron_key' => '${cronKey}',
  'pim_v3_sync' => true,
  'pim_legacy_sync' => false,
  'mono_mock' => true,
  'mono_mock_page' => true,
  'np_mock' => true,
  'np_ttn_enabled' => true,
  'crm_enabled' => true,
  'crm_secret_key' => '${randomBytes(32).toString('base64')}',
  'crm_refund_live' => false, 'crm_np_ttn_live' => false, 'crm_np_tracking_live' => false, 'crm_sms_live' => false, 'crm_email_live' => false,
];
`,{mode:0o600});
 // auth/config.php template: SMS login works with the code shown on screen, no e-mail, no Google, a new secret.
 writeFileSync(path.join(out,'auth-config.staging.php.txt'),`<?php
// auth/config.php для ЗАКРЫТОГО режима (стейджинг). Ничего не менять: SMS не отправляются (код показывается на экране), письма тоже.
if (!defined('RUBIZH_AUTH')) { http_response_code(404); exit; }
return [
    'noreply_password' => '',
    'google_enabled' => false,
    'google_client_id' => '',
    'google_client_secret' => '',
    'sms_enabled' => true,
    'turbosms_token' => '',
    'turbosms_sender' => '',
    'auth_secret' => '${secret(48)}',
    'sms_daily_limit' => 100,
];
`,{mode:0o600});
 writeFileSync(path.join(out,'ПАРОЛИ-СТЕЙДЖИНГ.txt'),['Закрытый режим rubizh.shop (стейджинг). Только для стейджинга, не использовать на запуске. Не пересылать в мессенджерах.','',
  'Вход на сайт (окно браузера «Потрібен вхід»):','  логин:  '+gateUser,'  пароль: '+gatePassword,'',
  'CRM (https://rubizh.shop/crm/), при первом входе — привязка приложения-аутентификатора:',...users.map(u=>'  '+u.role.padEnd(10)+' '+u.email+'  пароль: '+u.password),'',
  'Ключ PIM для стейджинга (настройки связи с сайтом в PIM, только если будете пробовать отправку): '+pimKey,''].join('\n'),{mode:0o600});
 writeFileSync(path.join(out,'staging-build.json'),JSON.stringify(report,null,1)+'\n',{mode:0o600});
 for(const f of [zip,zip+'.sha256',dumpFile,dumpFile+'.sha256',dumpJson])chmodSync(f,0o600);
 console.log(JSON.stringify({commit:head,archive:report.archive,crm:report.crm,dump:report.dump,catalogue:{products:report.catalogue.products,skus:report.catalogue.skus},non_empty_sensitive:personal}));
}finally{site.stop();}
