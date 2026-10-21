<?php
declare(strict_types=1);
// Contract-driven Staff API dispatcher (stage 4). Order of checks for every request:
// route → authentication → CSRF (non-GET) → permission → step-up → strict request schema → expected_version presence →
// Idempotency-Key (stored result / conflict) → handler (lock, version, transaction, audit) → envelope.

function crmMessages(): array {
 return [
  'AUTH_REQUIRED'=>'Увійдіть до робочого простору.','PERMISSION_DENIED'=>'Недостатньо прав для цієї дії.','ORDER_NOT_ASSIGNED'=>'Замовлення закріплене за іншим менеджером. Спочатку перепризначте його з причиною.',
  'STEP_UP_REQUIRED'=>'Для цієї дії підтвердьте вхід.','REAUTH_FAILED'=>'Пароль або код не підходить.','STALE_ORDER'=>'Замовлення змінилося. Оновіть сторінку й повторіть дію.',
  'LOGIN_FAILED'=>'Перевірте email і пароль.','TOTP_REQUIRED'=>'Введіть код з додатка автентифікації або резервний код.','TOTP_INVALID'=>'Код не підходить або вже використаний.','TOTP_ENROLL_REQUIRED'=>'Для вашої ролі потрібна двофакторна перевірка. Підключіть додаток автентифікації.',
  'RATE_LIMITED'=>'Забагато запитів. Зачекайте хвилину або зверніться до власника.','CHECK_REQUIRED'=>'Потрібна перевірка входу. Відкрийте /auth/staff-login.php та увійдіть ще раз.',
  'SENDER_PROFILE_INCOMPLETE'=>'Профіль відправника потребує підтверджених даних НП.','FEATURE_NOT_CONNECTED'=>'Функція ще не підключена.','CRM_DISABLED'=>'CRM ще не увімкнено.',
  'INVALID_REQUEST'=>'Перевірте введені дані.','INVALID_QUERY'=>'Перевірте фільтри та пошук.','IDEMPOTENCY_KEY_REQUIRED'=>'Оновіть сторінку й повторіть дію.','IDEMPOTENCY_CONFLICT'=>'Цю дію вже виконано з іншими даними. Оновіть сторінку.',
  'VERSION_REQUIRED'=>'Оновіть сторінку й повторіть дію.','NOT_FOUND'=>'Не знайдено.','METHOD_NOT_ALLOWED'=>'Дія недоступна.','CSRF_INVALID'=>'Сесію оновлено. Оновіть сторінку й повторіть дію.',
  'HTTPS_REQUIRED'=>'Потрібне захищене з’єднання.','PAYLOAD_TOO_LARGE'=>'Запит завеликий.','INVALID_JSON'=>'Перевірте введені дані.','STAFF_SCHEMA_REQUIRED'=>'CRM оновлюється. Спробуйте пізніше.','SERVICE_UNAVAILABLE'=>'Сервіс тимчасово недоступний. Дію не виконано.',
  'WEAK_PASSWORD'=>'Пароль занадто простий: щонайменше 12 символів, не з переліку поширених і не з вашого email.','TOKEN_INVALID'=>'Посилання недійсне або вже використане. Попросіть нове.','STAFF_EXISTS'=>'Співробітник з таким email уже є.',
  'LAST_OWNER_REQUIRED'=>'Має залишитися щонайменше один активний власник.','CRM_SECRET_KEY_MISSING'=>'Двофакторна перевірка ще не налаштована на сервері.','TOTP_ALREADY_ENABLED'=>'Двофакторну перевірку вже ввімкнено.','TOTP_SETUP_REQUIRED'=>'Спочатку почніть підключення.','TOTP_ENROLL_GRANT_REQUIRED'=>'Підключення двофакторної перевірки доступне за посиланням від власника (запрошення або скидання пароля).',
  'ALREADY_ORDERED'=>'Із цієї заявки вже створено замовлення.','BUSY'=>'Цю дію вже виконує інший співробітник. Спробуйте за хвилину.','REASON_REQUIRED'=>'Вкажіть причину (6–400 символів).','INVALID_ASSIGNEE'=>'Цьому співробітнику не можна призначити замовлення.','VERIFIED_PAYMENT_REQUIRED'=>'Немає підтвердженої банком оплати.',
  'REFUND_LIMIT_EXCEEDED'=>'Сума перевищує доступний до повернення залишок.','REFUND_RECONCILIATION_REQUIRED'=>'Попереднє повернення потребує звірки з банком.','PROVIDER_RESULT_UNKNOWN'=>'Банк або перевізник не підтвердив результат. Перевірте перед повтором.',
  'VAT_NOTE_MISSING'=>'Рахунок недоступний: не заповнено статус ПДВ у налаштуваннях.','NOT_INVOICE'=>'Замовлення оплачується карткою — рахунок ФОП не потрібен.','NOT_READY'=>'Рахунок буде доступний після підтвердження замовлення.','CANCELLED'=>'Замовлення скасовано.',
  'LINE_OUT_OF_STOCK'=>'Є позиція без наявності: замініть або приберіть її перед підтвердженням.','INVALID_STATE_TRANSITION'=>'Цей перехід недоступний.','PAID_ORDER_REQUIRED'=>'Дія доступна лише для оплаченого замовлення.',
  'TTN_FORMAT_INVALID'=>'ТТН Нової пошти — 14 цифр, наприклад 20450123456789.','TTN_ALREADY_USED'=>'Ця ТТН уже внесена в іншу посилку.',
 ];
}

function crmOut(mixed $data,int $status=200): never {
 http_response_code($status);echo json_encode(['ok'=>true,'data'=>$data,'meta'=>['request_id'=>$GLOBALS['crm_request_id'],'csrf'=>$_SESSION['staff_csrf']??null]],JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);exit;
}

function crmBootstrapApi(): PDO {
 rubizhHeaders();header('Cache-Control: no-store, private');header('X-Robots-Tag: noindex, nofollow');header('Content-Type: application/json; charset=UTF-8');
 header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'");header('X-Frame-Options: DENY');header('Referrer-Policy: no-referrer');
 $https=($_SERVER['HTTPS']??'')==='on';$loopback=in_array($_SERVER['REMOTE_ADDR']??'',['127.0.0.1','::1'],true)&&cfg('environment')==='staging';if(!$https&&!$loopback)throw new CrmError('HTTPS_REQUIRED',403);
 if(cfg('crm_enabled')!==true)throw new CrmError('CRM_DISABLED',503);
 session_name('rubizh_staff');session_cache_limiter('');ini_set('session.use_strict_mode','1');ini_set('session.gc_maxlifetime',(string)CRM_SESSION_ABSOLUTE);
 session_set_cookie_params(['lifetime'=>0,'path'=>'/api/staff','secure'=>$https,'httponly'=>true,'samesite'=>'Strict']);session_start();$_SESSION['staff_csrf']??=bin2hex(random_bytes(32));
 $db=database();if(!crmApiSchemaReady($db))throw new CrmError('STAFF_SCHEMA_REQUIRED',503);return $db;
}

function crmIdempotencyKey(array $route,array $body): ?string {
 $key=$_SERVER['HTTP_IDEMPOTENCY_KEY']??$body['request_id']??null;
 if(empty($route['idempotent']))return null;
 // Money and creation routes always need the per-attempt key (M-11); elsewhere a key is honoured when the client sends
 // one (the CRM frontend always does) and the order version alone protects legacy clients.
 $required=in_array($route['id'],['orders.create','payments.refund','orders.invoice.accept','orders.reconcile.not_created','orders.reconcile.manual','staff.invite','staff.reset','orders.shipment.draft','orders.shipment.manual','returns.create','wholesale.order'],true);
 if($key===null&&!$required)return null;
 if(!is_string($key)||!preg_match('/^[a-f0-9]{32}$/D',$key))throw new CrmError('IDEMPOTENCY_KEY_REQUIRED',400);
 return $key;
}

// 5.6.2 (owner decision): one login for CRM and PIM. PIM runs on another origin of the same site (pim_origins, exact match)
// and signs in through these four routes only, with credentials; every other route stays same-origin (no CORS, CSRF refuses
// the PIM origin). /pim/connection hands the API address and the PIM key to the OWNER session.
const CRM_PIM_ROUTES=['auth.session','auth.login','auth.logout','pim.connection'];
function crmPimOrigin(): ?string {
 $origin=(string)($_SERVER['HTTP_ORIGIN']??'');$allowed=cfg('pim_origins');
 return $origin!==''&&is_array($allowed)&&in_array($origin,$allowed,true)?$origin:null;
}
function crmPimCors(string $origin): void {header('Access-Control-Allow-Origin: '.$origin);header('Access-Control-Allow-Credentials: true');header('Vary: Origin');}
function crmPimConnection(): array {
 $key=cfg('pim_key');if(!is_string($key)||strlen($key)<24)throw new CrmError('SERVICE_UNAVAILABLE',503);
 $base=rtrim((string)(cfg('public_base_url')??''),'/');
 if($base===''){$host=(string)($_SERVER['HTTP_HOST']??'');if(preg_match('/^[A-Za-z0-9.-]+(?::\d+)?$/D',$host)!==1)throw new CrmError('SERVICE_UNAVAILABLE',503);$base=((($_SERVER['HTTPS']??'')==='on')?'https':'http').'://'.$host;}
 return ['api_url'=>$base.'/api','pim_key'=>$key];
}
function crmDispatch(): never {
 $GLOBALS['crm_request_id']=bin2hex(random_bytes(16));
 try{
  $db=crmBootstrapApi();
  // Path without query, percent-decoded once (customer ids contain ':'); route parameters are then regex-validated.
  $path=preg_replace('~^/api/staff~','',rawurldecode((string)strtok((string)($_SERVER['REQUEST_URI']??'/'),'?')));$method=$_SERVER['REQUEST_METHOD']??'GET';
  if(preg_match('/[\x00-\x1f\x7f]/',$path))throw new CrmError('NOT_FOUND',404);
  if($method==='OPTIONS'){
   $origin=crmPimOrigin();$want=strtoupper(trim((string)($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_METHOD']??'')));$pm=$origin!==null&&$want!==''?crmRouteMatch($want,$path):null;
   if(!$pm||!in_array($pm[0]['id'],CRM_PIM_ROUTES,true))throw new CrmError('NOT_FOUND',404);
   crmPimCors($origin);header('Access-Control-Allow-Methods: GET, POST');header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');header('Access-Control-Max-Age: 600');http_response_code(204);exit;
  }
  $m=crmRouteMatch($method,$path);if(!$m)throw new CrmError('NOT_FOUND',404);[$route,$params]=$m;
  if(($origin=crmPimOrigin())!==null&&in_array($route['id'],CRM_PIM_ROUTES,true)){crmPimCors($origin);$GLOBALS['crm_pim_origin_route']=true;}
  // Limit per staff session (not per office IP, R8/PL-1); anonymous requests are limited per network identity.
  $limitKey=isset($_SESSION['staff_id'])?'s|'.session_id():'n|'.rubizhNetworkIdentity();
  if(!rubizhRateAllow('staff-request',$limitKey,240,60)){header('Retry-After: 60');throw new CrmError('RATE_LIMITED',429,['retry_after'=>60]);}
  $body=[];$obj=new stdClass();
  if($method!=='GET'){
   if((int)($_SERVER['CONTENT_LENGTH']??0)>65536)throw new CrmError('PAYLOAD_TOO_LARGE',413);
   $raw=(string)file_get_contents('php://input',false,null,0,65537);if(strlen($raw)>65536)throw new CrmError('PAYLOAD_TOO_LARGE',413);
   // Decoded as objects for validation ({"0":…} stays an object), then as arrays for the handlers.
   $obj=$raw===''?new stdClass():json_decode($raw,false,64,JSON_THROW_ON_ERROR);if(!$obj instanceof stdClass)throw new CrmError('INVALID_JSON');
   $body=json_decode($raw===''?'{}':$raw,true,64,JSON_THROW_ON_ERROR);
  }
  $query=crmValidateQuery($route,$_GET);
  if($route['id']==='auth.session'){try{$a=crmActor($db,true);}catch(CrmError $e){$a=null;}crmOut(['authenticated'=>$a!==null,'user'=>$a,'totp_enroll_required'=>$a!==null&&$a['totp_required']&&empty($_SESSION['staff_totp_ok']),'totp_required'=>$a['totp_required']??false]);}
  if($route['auth']==='public'){
   if($method!=='GET')crmCsrf($body);
   $clean=crmStripLegacy($body,$route);crmValidateBody($route,crmStripLegacyObject($obj,$route));
   crmOut(crmHandle($db,null,$route,$params,$clean,$query,null));
  }
  $actor=crmActor($db,in_array($route['auth'],['enroll','session'],true));
  if($method!=='GET')crmCsrf($body);
  if($route['permission']!==null)crmPermit($actor,$route['permission']);
  if(!empty($route['step_up']))crmRequireFresh();
  $key=crmIdempotencyKey($route,$body);$clean=crmStripLegacy($body,$route);
  crmValidateBody($route,crmStripLegacyObject($obj,$route));
  if(($route['version']??'')==='required'&&!is_string($clean['expected_version']??null))throw new CrmError('VERSION_REQUIRED',400);
  // Only authentication routes change the session; everything else releases the session lock early.
  if($route['auth']==='staff')session_write_close();
  if($key!==null){
   $hash=hash('sha256',$actor['id'].'|'.$route['id'].'|'.$key);$bodyHash=hash('sha256',json_encode([$params,$clean],JSON_THROW_ON_ERROR));
   // Concurrent repeats of one key wait for the first one (code review M5) instead of running the handler twice.
   $GLOBALS['crm_idem_lock']='crm-idem-'.substr($hash,0,40);if((int)$db->query('SELECT GET_LOCK('.$db->quote($GLOBALS['crm_idem_lock']).',10)')->fetchColumn()!==1)throw new CrmError('SERVICE_UNAVAILABLE',503);
   $old=crmOne($db,'SELECT * FROM rubizh_crm_idempotency WHERE key_hash=?',[$hash]);
   if($old){if(!hash_equals($old['body_hash'],$bodyHash))throw new CrmError('IDEMPOTENCY_CONFLICT',409);header('Idempotent-Replay: true');crmOut(json_decode($old['response_json'],true),(int)$old['status']);}
   $GLOBALS['crm_idempotency_key']=$key;
  }
  $data=crmHandle($db,$actor,$route,$params,$clean,$query,$key);
  $status=!empty($route['created'])?201:200;
  // R4-06: one-time invite/reset links are never kept in the replay store; a replay says the link was already issued.
  $stored=in_array($route['id'],['staff.invite','staff.reset'],true)&&is_array($data)?['url'=>null,'expires_at'=>$data['expires_at']??null,'delivery'=>$data['delivery']??null,'replayed'=>true]:$data;
  if($key!==null){$db->prepare('INSERT IGNORE INTO rubizh_crm_idempotency(key_hash,route,body_hash,status,response_json,created_at) VALUES(?,?,?,?,?,UTC_TIMESTAMP())')->execute([$hash,$route['id'],$bodyHash,$status,json_encode($stored,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE)]);$db->query('SELECT RELEASE_LOCK('.$db->quote($GLOBALS['crm_idem_lock']).')');}
  crmOut($data,$status);
 }catch(Throwable $e){crmFail($e,$db??null);}
}

/** Legacy aliases: request_id → Idempotency-Key, version → expected_version; csrf is transport, not data. */
function crmStripLegacy(array $body,array $route): array {
 unset($body['csrf'],$body['request_id']);
 if(array_key_exists('version',$body)&&!in_array($route['request']??'',['SenderRequest','TaskUpdateRequest'],true)&&in_array($route['version']??'',['required'],true)){$body['expected_version']??=$body['version'];unset($body['version']);}
 if($route['id']==='returns.transition'&&array_key_exists('version',$body)){$body['return_version']=$body['version'];unset($body['version']);}
 return $body;
}

/** Same stripping on the object form used for schema validation. */
function crmStripLegacyObject(stdClass $o,array $route): stdClass {
 $o=clone $o;unset($o->csrf,$o->request_id);
 if(property_exists($o,'version')&&($route['version']??'')==='required'&&!in_array($route['request']??'',['SenderRequest','TaskUpdateRequest','LegacySenderRequest'],true)){if(!property_exists($o,'expected_version'))$o->expected_version=$o->version;unset($o->version);}
 if($route['id']==='returns.transition'&&property_exists($o,'version')){$o->return_version=$o->version;unset($o->version);}
 return $o;
}
/** Safe error envelope (CRM-PHP-01): domain texts are Ukrainian user messages; anything else gets a generic message. */
function crmFail(Throwable $e,?PDO $db): never {
 if($db&&$db->inTransaction())$db->rollBack();
 [$status,$code]=match(true){
  $e instanceof CrmError=>[$e->status,$e->reason],
  $e instanceof ShopOrderConflict=>[409,$e->reason],
  $e instanceof ShopPermissionException=>[str_contains($e->getMessage(),'підтвердьте вхід')?401:403,str_contains($e->getMessage(),'підтвердьте вхід')?'STEP_UP_REQUIRED':'PERMISSION_DENIED'],
  $e instanceof ShopPricingException=>[409,$e->reason],
  $e instanceof JsonException=>[400,'INVALID_JSON'],
  $e instanceof PDOException=>[503,'SERVICE_UNAVAILABLE'],
  $e instanceof TypeError||$e instanceof ValueError||$e instanceof ArgumentCountError=>[400,'INVALID_REQUEST'],
  $e instanceof InvalidArgumentException||$e instanceof RuntimeException=>[409,'DOMAIN_CONFLICT'],
  default=>[500,'SERVICE_UNAVAILABLE'],
 };
 $messages=crmMessages();$text=$e->getMessage();
 $domainText=($e instanceof ShopOrderConflict||$e instanceof ShopPricingException||$code==='DOMAIN_CONFLICT')&&preg_match('/\p{Cyrillic}/u',$text)&&!preg_match('~/|\\\\|\.php|SQLSTATE~',$text);
 $message=$messages[$code]??($domainText?$text:'Дію не виконано. Оновіть сторінку або зверніться до власника.');
 if($code==='DOMAIN_CONFLICT'&&!$domainText){$status=500;$code='SERVICE_UNAVAILABLE';$message=$messages['SERVICE_UNAVAILABLE'];}
 // Logs carry class and location only: no request data, personal data or secrets.
 if($status>=500||$e instanceof Error)error_log('CRM failure '.($GLOBALS['crm_request_id']??'').' '.get_class($e).' '.($e instanceof PDOException?$e->getCode():'').' at '.basename($e->getFile()).':'.$e->getLine().(cfg('environment')==='staging'&&getenv('RUBIZH_CRM_DEBUG')?' '.$e->getMessage():''));
 $details=$e instanceof CrmError||$e instanceof ShopOrderConflict?$e->details:[];
 if(!headers_sent())header('Content-Type: application/json; charset=UTF-8');
 http_response_code($status);
 echo json_encode(['ok'=>false,'error'=>['code'=>$code,'message'=>$message,'details'=>$details],'meta'=>['request_id'=>$GLOBALS['crm_request_id']??'','csrf'=>$_SESSION['staff_csrf']??null]],JSON_UNESCAPED_UNICODE|JSON_THROW_ON_ERROR|JSON_PARTIAL_OUTPUT_ON_ERROR);
 exit;
}
