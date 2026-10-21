// Stage 5.6.1 (hosting, 21.10): the CRM worker is started by cron exactly as `php staff/worker.php`. Since CRM stage 4 it
// died on «Cannot redeclare database()» (auth/bootstrap.php and staff/bootstrap.php both declare it), and E2E 7 ran it with
// allowFail, so auto-tasks, CRM notifications, payment review sync and the stalled-queue alarm never ran on the hosting.
// The worker must exit 0, print its result and really produce a notification for a new order.
import {test} from 'node:test';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import path from 'node:path';
import {startCrm,line} from './helpers/crm-fixture.mjs';import {runtime,phpArgs,phpEnv} from './helpers/site-fixture.mjs';
const skip=!process.env.RUBIZH_TEST_MYSQL_SOCKET;
const mockRef=seed=>{const h=createHash('sha256').update('np-mock|'+seed).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;};
const KYIV=mockRef('city:kyiv'),NP={np_delivery:{city_ref:KYIV,warehouse_ref:mockRef('wh:'+KYIV+':1')}};

test('5.6.1 CRM worker runs as cron starts it (php staff/worker.php): exit 0, all steps done, a new order notifies the manager',{skip,timeout:240000},async()=>{
 const s=await startCrm({npMock:true,stock:20});
 try{
  const o=await s.checkout([{...line(),qty:1}],NP);
  const run=()=>spawnSync(runtime+'/bin/php8.4',[...phpArgs,path.join(s.site,'staff/worker.php')],{env:phpEnv,encoding:'utf8',timeout:120000});
  assert.equal(s.sql("SELECT COUNT(*) n FROM rubizh_crm_notifications WHERE kind='new_order' AND entity_id='"+o.id+"'")[0].n,0,'before the worker: the checkout itself does not notify');
  const p=run();
  assert.equal(p.status,0,'worker exit code; stdout: '+p.stdout+' stderr: '+p.stderr);
  const out=JSON.parse(p.stdout.trim().split('\n').pop());
  for(const step of ['reviews','tasks','notifications'])assert.ok(out.done?.includes(step),'step '+step+': '+p.stdout);
  assert.equal(s.sql("SELECT COUNT(*) n FROM rubizh_crm_notifications WHERE audience='role:MANAGER' AND kind='new_order' AND entity_id='"+o.id+"'")[0].n,1,'the manager is notified about the new order');
  // A second run (the next cron minute) is idempotent and still succeeds.
  assert.equal(run().status,0);
  assert.equal(s.sql("SELECT COUNT(*) n FROM rubizh_crm_notifications WHERE audience='role:MANAGER' AND kind='new_order' AND entity_id='"+o.id+"'")[0].n,1,'no duplicate notification');
 }finally{s.stop();}
});
