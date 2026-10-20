// Stage 5.6-4б/в: the launch package of 5.5 had no media_dir — photos were never stored on the site and every card
// showed the supplier's own image links. `php dev/check-launch.php` now reports the media folder; with `--net` it also
// checks outgoing HTTPS to the three supplier hosts of D-82 (run by the owner in WebSSH; tests never use the network).
import {test} from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import path from 'node:path';
import {startSite,runtime,phpArgs,phpEnv} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const check=(site,args=[])=>{const r=spawnSync(runtime+'/bin/php8.4',[...phpArgs,path.join(site,'dev/check-launch.php'),...args],{env:phpEnv,encoding:'utf8'});return JSON.parse(r.stdout);};
test('5.6 launch check: media folder missing → reported and failed; configured and writable → verified',{skip,timeout:120000},async()=>{
 const s=await startSite({enableV3:false});
 try{
  const config=path.join(s.site,'api/config.php'),base=readFileSync(config,'utf8');
  writeFileSync(config,base.replace(/'media_dir'=>'[^']*',/,''));assert.equal(check(s.site).media_dir,'missing');
  writeFileSync(config,base.replace(/'media_dir'=>'[^']*'/,`'media_dir'=>'${s.dir}/no-such-folder'`));assert.equal(check(s.site).media_dir,'not_writable');
  mkdirSync(s.dir+'/media',{recursive:true});writeFileSync(config,base);const r=check(s.site);assert.equal(r.media_dir,'verified');
  assert.equal(r.outgoing_https,'not_checked','network only with --net');
 }finally{s.stop();}
});
