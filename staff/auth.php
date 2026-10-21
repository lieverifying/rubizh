<?php
declare(strict_types=1);
require_once __DIR__.'/contract.php';require_once __DIR__.'/security.php';
final class CrmError extends RuntimeException {public function __construct(public readonly string $reason,public readonly int $status=400,public readonly array $details=[]){parent::__construct($reason);}}

// Same algorithm as real hashes, so an unknown e-mail costs the same time as a wrong password (R4-01).
const CRM_DUMMY_HASH='$argon2id$v=19$m=65536,t=4,p=1$bnIzbjJUejhBV0Vvb3kzVA$6GoF5cM3t50srUV2j76F4/2zSC05LLJqJLMDR8Z9A0U';
const CRM_ROLES=['OWNER','MANAGER','WAREHOUSE','SUPPORT','ACCOUNTANT'];
function crmRoleLabels(): array {return ['OWNER'=>'Власник','MANAGER'=>'Менеджер','WAREHOUSE'=>'Склад','SUPPORT'=>'Підтримка','ACCOUNTANT'=>'Бухгалтер'];}
/** OD-4.2: older staff role names in private config map onto the stage-4 roles. */
function crmRoleAlias(string $role): string {return ['LOGISTICS'=>'WAREHOUSE','READ_ONLY'=>'SUPPORT'][$role]??$role;}
/** Permissions come from the contract (single source); SITE domain permissions are added for the same role. */
function crmRolePermissions(string $role): array {
 $role=crmRoleAlias($role);if(!in_array($role,CRM_ROLES,true))return [];
 $out=[];foreach(crmContract()['permissions'] as $p=>$roles)if(in_array($role,$roles,true))$out[]=$p;
 return array_values(array_unique([...$out,...shopRolePermissions($role)]));
}
function staffVerifiedRole(string $actor): ?string {return ($GLOBALS['crm_staff_actor']['id']??null)===$actor?($GLOBALS['crm_staff_actor']['role']??null):null;}

/** The authenticated staff member. $enrollOnly lets a session that still owes TOTP enrolment reach only the enrolment routes. */
function crmActor(PDO $db,bool $enrollOnly=false): array {
 $id=$_SESSION['staff_id']??null;
 if(!is_string($id)||time()-(int)($_SESSION['staff_login_at']??0)>CRM_SESSION_ABSOLUTE||time()-(int)($_SESSION['staff_seen_at']??0)>CRM_SESSION_IDLE)throw new CrmError('AUTH_REQUIRED',401);
 $a=crmOne($db,'SELECT u.id,u.email,u.name,u.role,u.enabled,u.session_version,COALESCE(p.theme,\'light\') theme FROM rubizh_staff_users u LEFT JOIN rubizh_staff_prefs p ON p.staff_id=u.id WHERE u.id=?',[$id]);
 if(!$a||!(int)$a['enabled']||(int)$a['session_version']!==(int)($_SESSION['staff_version']??0)||!crmSessionAlive($db,$id))throw new CrmError('AUTH_REQUIRED',401);
 $a['role']=crmRoleAlias($a['role']);if(!in_array($a['role'],CRM_ROLES,true))throw new CrmError('AUTH_REQUIRED',401);
 $a['totp_enabled']=crmTotpEnabled($db,$id);$a['totp_required']=crmTotpRequired($a['role']);
 if($a['totp_required']&&empty($_SESSION['staff_totp_ok'])&&!$enrollOnly)throw new CrmError('TOTP_ENROLL_REQUIRED',403);
 $a['permissions']=crmRolePermissions($a['role']);$a['fresh_until']=crmFreshUntil()?gmdate('Y-m-d H:i:s',crmFreshUntil()):null;
 unset($a['enabled'],$a['session_version']);$_SESSION['staff_seen_at']=time();
 return $GLOBALS['crm_staff_actor']=$a;
}
function crmCan(array $actor,string $permission): bool {return in_array($permission,$actor['permissions']??[],true);}
/** Owner-only permissions are re-checked by role, so a mis-seeded table can never widen them. */
function crmPermit(array $actor,string $permission): void {
 if(!crmCan($actor,$permission))throw new CrmError('PERMISSION_DENIED',403,['permission'=>$permission]);
 if(in_array($permission,['payment.refund.execute','payment.manual_reconcile','payment.review','order.price_override','order.total_override','settings.system','staff.manage','supplier.manage','export.full','shipment.resolve_unknown','shipment.manual_deliver','inventory.return','site.speed.view'],true)&&$actor['role']!=='OWNER')throw new CrmError('PERMISSION_DENIED',403);
}
function crmRequestId(mixed $id): string {if(!is_string($id)||!preg_match('/^[a-f0-9]{32}$/D',$id))throw new CrmError('INVALID_REQUEST_ID');return $id;}
function crmAudit(PDO $db,?array $a,string $entity,string $id,string $action,array $old,array $new,string $reason='',?string $request=null,string $source='STAFF'): void {
 $db->prepare('INSERT INTO rubizh_staff_audit(actor_id,actor_role,source,entity,entity_id,action,before_json,after_json,reason,request_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,UTC_TIMESTAMP())')->execute([$a['id']??str_repeat('0',32),$a['role']??'SYSTEM',$source,$entity,$id,$action,json_encode($old,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE),json_encode($new,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE),mb_substr($reason,0,400),$request??$GLOBALS['crm_request_id']??bin2hex(random_bytes(16))]);
 $auditId=(int)$db->lastInsertId();// read before any other statement: mysqlnd reports the last statement's id
 if(PHP_SAPI!=='cli'&&function_exists('crmClientIpHash')&&crmApiTableExists($db,'rubizh_staff_audit_context'))$db->prepare('INSERT INTO rubizh_staff_audit_context(audit_id,ip_hash,agent) VALUES(?,?,?)')->execute([$auditId,crmClientIpHash(),crmAgent()]);
}
function crmApiTableExists(PDO $db,string $table): bool {static $seen=[];if(!array_key_exists($table,$seen)){$q=$db->prepare('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?');$q->execute([$table]);$seen[$table]=(bool)$q->fetchColumn();}return $seen[$table];}
function crmCsrf(array $b): void {
 $token=$_SERVER['HTTP_X_CSRF_TOKEN']??$b['csrf']??null;
 if(!is_string($token)||!hash_equals($_SESSION['staff_csrf']??'',$token))throw new CrmError('CSRF_INVALID',403);
 // 5.6.2: the PIM origin is accepted only on the PIM sign-in routes (router.php CRM_PIM_ROUTES).
 if(!empty($GLOBALS['crm_pim_origin_route'])&&crmPimOrigin()!==null)return;
 if(isset($_SERVER['HTTP_ORIGIN'])){$actual=parse_url((string)$_SERVER['HTTP_ORIGIN']);$host=$_SERVER['HTTP_HOST']??'';$expected=($actual['host']??'').(isset($actual['port'])?':'.$actual['port']:'');if($expected!==$host||($actual['scheme']??'')!==((($_SERVER['HTTPS']??'')==='on')?'https':'http'))throw new CrmError('CSRF_INVALID',403);}
}
/**
 * R8: only failed attempts count. Per network identity + account a proof-of-work challenge follows 8 failures (an office
 * behind one IP is never locked out); independently each account has a hard limit of 20 failed passwords and 5 failed
 * second factors per 15 minutes from any address (R4-01), which no proof can bypass. Nothing is locked permanently.
 */
function crmLogin(PDO $db,array $b): array {
 crmCsrf($b);$email=mb_strtolower(trim((string)($b['email']??'')));$password=$b['password']??'';if(!is_string($password)||strlen($password)>72||strlen($email)>254)throw new CrmError('LOGIN_FAILED',401);
 $ip=rubizhNetworkIdentity();$loginKey=hash('sha256',$ip.'|'.$email);$proofScope='staff-login:'.$loginKey;$account=hash('sha256','account|'.$email);
 if(!rubizhRateCheck('staff-login-account',$account,20,900)){if(function_exists('crmNotify'))crmNotify($db,'role:OWNER','login_locked','security',$account,'Багато невдалих входів до одного облікового запису (тимчасове обмеження 15 хв)',true,'locked:'.$account.':'.gmdate('YmdH'));header('Retry-After: 900');throw new CrmError('RATE_LIMITED',429,['retry_after'=>900]);}
 $network=hash('sha256','network|'.$ip);
 if((!rubizhRateCheck('staff-login-failed',$loginKey,8,900)||!rubizhRateCheck('staff-login-network',$network,30,900))&&!rubizhProofValid($proofScope,$b['rate_proof']??null)){
  $proof=rubizhProofIssue($proofScope,18);header('Retry-After: 1');throw new CrmError('CHECK_REQUIRED',428,['challenge'=>['nonce'=>$proof['nonce'],'bits'=>$proof['bits'],'purpose'=>'staff-login'],'continue_url'=>'/auth/staff-login.php']);
 }
 $a=crmOne($db,'SELECT * FROM rubizh_staff_users WHERE email=?',[$email]);$verified=password_verify($password,$a['password_hash']??CRM_DUMMY_HASH);
 $fail=function(string $code='LOGIN_FAILED')use($db,$loginKey,$email,$ip,$account,$network){rubizhRateAllow('staff-login-failed',$loginKey,PHP_INT_MAX,900);rubizhRateAllow('staff-login-network',$network,PHP_INT_MAX,900);rubizhRateAllow('staff-login-account',$account,PHP_INT_MAX,900);if($code==='TOTP_INVALID')rubizhRateAllow('staff-totp-account',$account,PHP_INT_MAX,900);crmAudit($db,null,'security',hash('sha256',$email),'login.failed',[],['ip_hash'=>hash('sha256',$ip),'reason'=>$code],'',null,'SYSTEM');throw new CrmError($code,401);};
 if(!$a||!$verified||!(int)$a['enabled'])$fail();
 $totpEnabled=crmTotpEnabled($db,$a['id']);
 if($totpEnabled){$code=$b['totp']??null;$backup=$b['backup_code']??null;if(($code===null||$code==='')&&($backup===null||$backup===''))throw new CrmError('TOTP_REQUIRED',401);if(!rubizhRateCheck('staff-totp-account',$account,5,900)){header('Retry-After: 900');throw new CrmError('RATE_LIMITED',429,['retry_after'=>900]);}if(!crmTotpVerify($db,$a['id'],is_string($code)?$code:null,is_string($backup)?$backup:null))$fail('TOTP_INVALID');}
 if(password_needs_rehash($a['password_hash'],defined('PASSWORD_ARGON2ID')?PASSWORD_ARGON2ID:PASSWORD_BCRYPT))$db->prepare('UPDATE rubizh_staff_users SET password_hash=? WHERE id=?')->execute([crmPasswordHash($password),$a['id']]);
 session_regenerate_id(true);
 $_SESSION=['staff_id'=>$a['id'],'staff_version'=>(int)$a['session_version'],'staff_login_at'=>time(),'staff_seen_at'=>time(),'staff_fresh_at'=>time(),'staff_totp_ok'=>$totpEnabled,'staff_csrf'=>bin2hex(random_bytes(32))];
 crmSessionRegister($db,$a['id']);
 $enroll=!$totpEnabled&&crmTotpRequired(crmRoleAlias($a['role']));
 $actor=crmActor($db,$enroll);crmAudit($db,$actor,'security',$a['id'],'login.success',[],['session_created'=>true,'totp'=>$totpEnabled]);
 return ['authenticated'=>true,'user'=>$actor,'totp_enroll_required'=>$enroll];
}
/** Step-up re-entry for sensitive actions (≤ 15 min): password, plus TOTP when enabled. */
function crmReauth(PDO $db,array $actor,array $b): array {
 $u=crmOne($db,'SELECT password_hash FROM rubizh_staff_users WHERE id=?',[$actor['id']]);$key=hash('sha256',rubizhNetworkIdentity().'|'.$actor['email']);
 $account=hash('sha256','account|'.mb_strtolower((string)$actor['email']));if(!rubizhRateCheck('staff-login-failed',$key,8,900)||!rubizhRateCheck('staff-login-account',$account,20,900))throw new CrmError('RATE_LIMITED',429,['retry_after'=>900]);
 $ok=$u&&password_verify((string)($b['password']??''),$u['password_hash']);
 if($ok&&crmTotpEnabled($db,$actor['id']))$ok=crmTotpVerify($db,$actor['id'],is_string($b['totp']??null)?$b['totp']:null,null);
 if(!$ok){rubizhRateAllow('staff-login-failed',$key,PHP_INT_MAX,900);rubizhRateAllow('staff-login-account',$account,PHP_INT_MAX,900);crmAudit($db,$actor,'security',$actor['id'],'reauth.failed',[],[]);throw new CrmError('REAUTH_FAILED',401);}
 $_SESSION['staff_fresh_at']=time();crmAudit($db,$actor,'security',$actor['id'],'reauth.success',[],[]);
 return ['authenticated'=>true,'user'=>crmActor($db)];
}
