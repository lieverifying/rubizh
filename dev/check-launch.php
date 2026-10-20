<?php
declare(strict_types=1);
// Read-only: checks SMTP authentication, queue counts and scheduler heartbeats. Never sends mail.
// Stage 5.6: also the photo folder (media_dir) and, with --net, outgoing HTTPS to the supplier hosts (D-82).
if(PHP_SAPI!=='cli'){http_response_code(404);exit;}
define('RUBIZH_AUTH',true);
require __DIR__.'/../auth/identities.php';
function launchSmtpReply($socket): int {
 $code=0;for($i=0;$i<40;$i++){$line=fgets($socket,1024);if($line===false||!preg_match('/^(\d{3})([ -])/',$line,$m))throw new RuntimeException('SMTP reply unavailable');$code=(int)$m[1];if($m[2]===' ')return $code;}throw new RuntimeException('SMTP reply too long');
}
function launchSmtpAuth(string $password): string {
 if($password==='')return 'not_configured';
 $socket=null;
 try{
  $context=stream_context_create(['ssl'=>['verify_peer'=>true,'verify_peer_name'=>true,'peer_name'=>'mail.adm.tools','SNI_enabled'=>true]]);
  $socket=@stream_socket_client('ssl://mail.adm.tools:465',$errno,$error,8,STREAM_CLIENT_CONNECT,$context);if(!$socket)throw new RuntimeException('SMTP unavailable');stream_set_timeout($socket,8);
  if(launchSmtpReply($socket)!==220)throw new RuntimeException('SMTP greeting rejected');
  fwrite($socket,"EHLO rubizh.shop\r\n");if(launchSmtpReply($socket)!==250)throw new RuntimeException('SMTP EHLO rejected');
  fwrite($socket,"AUTH LOGIN\r\n");if(launchSmtpReply($socket)!==334)throw new RuntimeException('SMTP auth unavailable');
  fwrite($socket,base64_encode('noreply@rubizh.shop')."\r\n");if(launchSmtpReply($socket)!==334)throw new RuntimeException('SMTP username rejected');
  fwrite($socket,base64_encode($password)."\r\n");$ok=launchSmtpReply($socket)===235;
  fwrite($socket,"QUIT\r\n");return $ok?'verified':'failed';
 }catch(Throwable $e){return 'failed';}finally{if(is_resource($socket))fclose($socket);}
}
$root=dirname(__DIR__);$private=dirname($root).'/rubizh-automation';$report=['smtp_auth'=>in_array('--smtp',$argv,true)?launchSmtpAuth((string)(authConfig()['noreply_password']??'')):'not_checked','inbox_delivery'=>'real_checkout_test_required','workers'=>[],'mail_queues'=>[]];$failed=false;
foreach(['cache'=>180,'notifications'=>300,'payments'=>600,'delivery'=>1800,'photos'=>900,'crm'=>300] as $name=>$maxAge){
 $raw=is_file($private.'/'.$name.'.state')?trim((string)file_get_contents($private.'/'.$name.'.state')):'';$values=explode(' ',$raw);
 $valid=count($values)===3&&preg_match('/^\d+$/D',$values[0])&&preg_match('/^-?\d+$/D',$values[1])&&preg_match('/^\d+$/D',$values[2]);$success=$valid?(int)$values[2]:0;$age=$success?max(0,time()-$success):null;
 $state=!$valid?'not_seen':((int)$values[1]>0?'failed':($age!==null&&$age<=$maxAge?'verified':((int)$values[1]===-1&&time()-(int)$values[0]<300?'running':'stale')));
 $report['workers'][$name]=['status'=>$state,'last_success_age_seconds'=>$age];$failed=$failed||!in_array($state,['verified','running'],true);
}
try{
 $c=require $root.'/api/config.php';require_once $root.'/api/database.php';$db=rubizhDatabaseConnect($c);
 foreach(['rubizh_order_mail','rubizh_buyer_mail','rubizh_cart_reminders'] as $table){
  $q=$db->prepare('SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?');$q->execute([$table]);
  if(!$q->fetchColumn()){$report['mail_queues'][$table]=['status'=>'not_prepared'];$failed=true;continue;}
  $counts=$db->query('SELECT status,COUNT(*) AS count FROM '.$table.' GROUP BY status')->fetchAll(PDO::FETCH_KEY_PAIR);
  $due=(int)$db->query("SELECT COUNT(*) FROM ".$table." WHERE status='pending' AND next_at<UTC_TIMESTAMP()-INTERVAL 10 MINUTE")->fetchColumn();
  $report['mail_queues'][$table]=['counts'=>$counts,'overdue'=>$due];$failed=$failed||($counts['failed']??0)>0||$due>0;
 }
 $report['database']='verified';
 $settingsFile=$root.'/api/site-settings.json';$settings=is_file($settingsFile)?json_decode((string)file_get_contents($settingsFile),true):[];$settings=is_array($settings)?$settings:[];
 $report['analytics']=['ga4'=>preg_match('/^G-[A-Z0-9]{5,20}$/D',(string)($settings['ga4_id']??$c['ga4_id']??''))?'configured':'not_configured','meta'=>preg_match('/^\d{5,30}$/D',(string)($settings['meta_pixel_id']??$c['meta_pixel_id']??''))?'configured':'not_configured'];
 $report['photos']=$db->query("SELECT status,COUNT(*) count FROM photos GROUP BY status")->fetchAll(PDO::FETCH_KEY_PAIR);
 $report['source_attributes_missing']=(int)$db->query("SELECT COUNT(*) FROM products WHERE visible=1 AND (attributes IS NULL OR TRIM(attributes) IN ('','{}','[]'))")->fetchColumn();
 // Stage 5.5.3: the 1 UAH test products of the preview / closed staging must be off the site before the opening.
 $tp=$db->prepare("SELECT COUNT(*) FROM products WHERE visible=1 AND id IN ('rubizh-test-pay-now','rubizh-test-preorder')");$tp->execute();$report['test_products_visible']=(int)$tp->fetchColumn();$failed=$failed||$report['test_products_visible']>0;
}catch(Throwable $e){$report['database']='failed';$failed=true;}
// Stage 5.6-4б: without media_dir photos are never stored here and cards show the suppliers' own image links.
try{$cfgFile=$root.'/api/config.php';$cfgAll=is_file($cfgFile)?(require $cfgFile):[];$media=is_array($cfgAll)?trim((string)($cfgAll['media_dir']??'')):'';}catch(Throwable $e){$media='';}
$report['media_dir']=$media===''?'missing':(is_dir($media)&&is_writable($media)?'verified':'not_writable');$failed=$failed||$report['media_dir']!=='verified';
// Stage 5.6-1: the site downloads supplier exports for PIM; the hosting must allow outgoing HTTPS (one HEAD per host).
$report['outgoing_https']='not_checked';
if(in_array('--net',$argv,true)){require_once $root.'/api/supplier-fetch.php';$report['outgoing_https']=[];
 foreach(RUBIZH_SUPPLIER_FETCH_HOSTS as $host){
  $ips=supplierFetchDns($host);if(!$ips){$report['outgoing_https'][$host]='failed: DNS';$failed=true;continue;}
  if(!function_exists('curl_init')){$report['outgoing_https'][$host]='failed: curl';$failed=true;continue;}
  $h=curl_init('https://'.$host.'/');curl_setopt_array($h,[CURLOPT_NOBODY=>true,CURLOPT_RETURNTRANSFER=>true,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_CONNECTTIMEOUT=>8,CURLOPT_TIMEOUT=>15,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_PROXY=>'']);
  $ok=curl_exec($h);$code=(int)curl_getinfo($h,CURLINFO_RESPONSE_CODE);$err=curl_error($h);curl_close($h);
  $report['outgoing_https'][$host]=$ok!==false&&$code>0?'verified (HTTP '.$code.')':'failed: '.substr($err,0,80);$failed=$failed||!($ok!==false&&$code>0);
 }
}
$failed=$failed||in_array($report['smtp_auth'],['failed','not_configured'],true);
echo json_encode($report,JSON_PRETTY_PRINT|JSON_UNESCAPED_SLASHES|JSON_THROW_ON_ERROR)."\n";exit($failed?2:0);
