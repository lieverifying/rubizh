<?php
declare(strict_types=1);
if (!defined('RUBIZH_AUTH')) { http_response_code(404); exit; }
function authPhone(string $value): string {
    if (strlen($value)>30 || !preg_match('/^[+0-9() .\-]+$/D',$value)) { throw new RuntimeException('Вкажіть український номер у форматі +380XXXXXXXXX.'); }
    $phone=preg_replace('/[^0-9]/','',$value);
    if (preg_match('/^0\d{9}$/D',$phone)) { $phone='38'.$phone; }
    if (!preg_match('/^380\d{9}$/D',$phone)) { throw new RuntimeException('Вкажіть український номер у форматі +380XXXXXXXXX.'); }
    return '+'.$phone;
}
function phoneDatabase(): PDO {
    $db=identityDatabase(); if(function_exists('rubizhSchemaPrepared')&&rubizhSchemaPrepared($db))return $db;
    static $ready=false;
    if (!$ready) {
        $db->exec("CREATE TABLE IF NOT EXISTS rubizh_phone_challenges (
            id CHAR(32) PRIMARY KEY, phone VARCHAR(20) NOT NULL, code_hash CHAR(64) NOT NULL,
            flow_hash CHAR(64) NOT NULL, ip_hash CHAR(64) NOT NULL, sent_at BIGINT NOT NULL,
            expires_at BIGINT NOT NULL, attempts INT NOT NULL DEFAULT 0, used_at BIGINT NULL,
            state VARCHAR(10) NOT NULL DEFAULT 'pending', INDEX(phone,sent_at), INDEX(ip_hash,sent_at), INDEX(sent_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"); $ready=true;
    } return $db;
}
function phoneFlowHash(): string {
    $pending=authPending(); if ($pending === null) { throw new RuntimeException('Почніть вхід ще раз.'); }
    if (!isset($_SESSION['phone_session'])) { $_SESSION['phone_session']=bin2hex(random_bytes(32)); }
    return hash('sha256',$_SESSION['phone_session'].':'.$pending['flow']);
}
function phoneCodeHash(string $id, string $phone, string $code): string {
    $secret=(string)(authConfig()['auth_secret'] ?? '');
    if (strlen($secret)<40) { throw new RuntimeException('SMS-вхід ще не налаштований.'); }
    return hash_hmac('sha256',$id.':'.$phone.':'.$code,$secret);
}
function turboSmsAccepted(array $response, string $phone): bool {
    if (!in_array($response['response_code'] ?? null,[0,800,801,802,803,507],true)) { return false; }
    $items = $response['response_result'] ?? null;
    if (!is_array($items)) { return false; }
    foreach ($items as $item) {
        if (is_array($item) && (string)($item['phone'] ?? '')===ltrim($phone,'+')
            && ($item['response_code'] ?? null)===0 && is_string($item['message_id'] ?? null) && $item['message_id']!=='') { return true; }
    } return false;
}
// 5.6-4е: what the provider answered (codes and statuses only — never the phone or the code) for the PHP error log.
function turboSmsFailureNote(array $response, string $phone): string {
    $clean=fn($v)=>substr((string)preg_replace('/[^A-Za-z0-9_ -]/','',is_scalar($v)?(string)$v:''),0,60);
    $note='TurboSMS refused: '.$clean($response['response_code']??'').' '.$clean($response['response_status']??'');
    foreach (is_array($response['response_result']??null)?$response['response_result']:[] as $item) {
        if (is_array($item) && (string)($item['phone']??'')===ltrim($phone,'+')) { $note.='; recipient '.$clean($item['response_code']??'').' '.$clean($item['response_status']??''); }
    }
    return (string)preg_replace('/\d{6,}/','#',str_replace(ltrim($phone,'+'),'',trim($note)));
}
function sendPhoneCode(string $phone, string $code, string $id): void {
    // Automated tests only: a test transport replaces the provider (the constant is never defined by the site).
    if (defined('RUBIZH_SMS_TESTS') && is_callable($GLOBALS['sms_test_transport'] ?? null)) { ($GLOBALS['sms_test_transport'])($phone,'RUBIZH: kod '.$code); return; }
    // Browser tests on the PHP built-in server only (never production): codes go to a local outbox file.
    $outbox=(string)(authConfig()['sms_test_outbox'] ?? ''); if (PHP_SAPI==='cli-server' && $outbox!=='') { file_put_contents($outbox,json_encode(['phone'=>$phone,'code'=>$code])."\n",FILE_APPEND|LOCK_EX); return; }
    // Stage 5.5 (D-80): the closed staging mode never calls the SMS provider; the code is shown on the confirmation screen.
    if (rubizhStagingRelaxed()) { $_SESSION['staging_sms_code']=$code; return; }
    require_once __DIR__.'/http.php'; $c=authConfig();
    // A sequence ID prevents duplicate sends after an ambiguous provider timeout.
    // No automatic retry is made and provider errors never expose credentials/codes.
    $result=authHttp('https://api.turbosms.ua/message/send.json',json_encode([
        'sequence_id'=>$id,'recipients'=>[ltrim($phone,'+')],
        'sms'=>['sender'=>$c['turbosms_sender'],'text'=>'RUBIZH: kod '.$code.'. Diie 5 khv. Nikomu ne povidomliaite.']
    ],JSON_THROW_ON_ERROR),['Content-Type: application/json','Authorization: Bearer '.$c['turbosms_token']],25);
    if (!turboSmsAccepted($result,$phone)) { error_log(turboSmsFailureNote($result,$phone)); throw new RuntimeException('Не вдалося надіслати SMS. Спробуйте пізніше або увійдіть через email.'); }
}
// Q-6: a request that looks automated must first pass a small proof-of-work check (no third-party CAPTCHA, CSP-safe,
// solved invisibly by auth/login.js). Without JavaScript the message offers email login as the accessible fallback.
final class PhoneCheckRequired extends RuntimeException {}
function phoneCheckBits(): int {return max(8,min(20,(int)(authConfig()['sms_check_bits'] ?? 16)));}
function phoneCheckIssue(string $phone): void {$_SESSION['sms_check']=['nonce'=>bin2hex(random_bytes(16)),'bits'=>phoneCheckBits(),'phone'=>hash('sha256',$phone),'expires'=>time()+300];}
function phoneCheckValid(string $phone): bool {
    $c=$_SESSION['sms_check'] ?? null; $answer=$_POST['sms_check'] ?? '';
    if (!is_array($c) || !is_string($answer) || !preg_match('/^[0-9]{1,12}$/D',$answer) || (int)($c['expires'] ?? 0)<time() || !hash_equals((string)($c['phone'] ?? ''),hash('sha256',$phone))) { return false; }
    $h=hash('sha256',$c['nonce'].':'.$answer,true); $zero=0;
    for ($i=0;$i<strlen($h);$i++) { $b=ord($h[$i]); if ($b===0) { $zero+=8; continue; } $zero+=8-strlen(decbin($b)); break; }
    unset($_SESSION['sms_check']); return $zero>=(int)$c['bits'];
}
function phoneRequest(string $phone): void {
    if (!smsEnabled()) { throw new RuntimeException('SMS-вхід ще не підключений. Скористайтеся email.'); }
    $phone=authPhone($phone); $flowHash=phoneFlowHash(); $db=phoneDatabase();
    $now=time(); $ip=hash('sha256',rubizhNetworkIdentity()); $id=bin2hex(random_bytes(16));
    $code=str_pad((string)random_int(0,999999),6,'0',STR_PAD_LEFT);
    $got=(int)$db->query("SELECT GET_LOCK('rubizh_sms_request',5)")->fetchColumn();
    if ($got!==1) { throw new RuntimeException('Спробуйте за хвилину.'); }
    try {
        $db->beginTransaction();
        $q=$db->prepare('SELECT COUNT(*) FROM rubizh_phone_challenges WHERE phone=? AND sent_at>?');
        $q->execute([$phone,$now-60]); if ((int)$q->fetchColumn()>0) { throw new RuntimeException('Повторне SMS можна надіслати через хвилину.'); }
        $q->execute([$phone,$now-3600]); if ((int)$q->fetchColumn()>=5) { throw new RubizhHttpException(429,'Забагато SMS для цього номера. Зачекайте годину або увійдіть через email.',3600); }
        $q->execute([$phone,$now-86400]); if ((int)$q->fetchColumn()>=10) { throw new RubizhHttpException(429,'Забагато SMS для цього номера. Спробуйте завтра або увійдіть через email.',86400); }
        $q=$db->prepare('SELECT COUNT(*) FROM rubizh_phone_challenges WHERE ip_hash=? AND sent_at>?');
        $q->execute([$ip,$now-86400]); if ((int)$q->fetchColumn()>=150) { throw new RubizhHttpException(429,'Забагато SMS із цієї мережі. Спробуйте завтра або увійдіть через email.',86400); }
        $q->execute([$ip,$now-600]); $ipBurst=(int)$q->fetchColumn();

        // Wrong codes across today's codes for this number from this address (re-requesting to brute force); counted per
        // address so wrong codes typed elsewhere cannot lock the number's owner out.
        $q=$db->prepare('SELECT COALESCE(SUM(attempts),0) FROM rubizh_phone_challenges WHERE phone=? AND ip_hash=? AND sent_at>? AND used_at IS NULL');
        $q->execute([$phone,$ip,$now-86400]); if ((int)$q->fetchColumn()>=15) { throw new RubizhHttpException(429,'Забагато невдалих спроб для цього номера. Спробуйте завтра або увійдіть через email.',86400); }
        $q=$db->prepare('SELECT COUNT(*) FROM rubizh_phone_challenges WHERE sent_at>?'); $q->execute([$now-86400]); $global=(int)$q->fetchColumn();
        $limit=max(1,(int)(authConfig()['sms_daily_limit'] ?? 100));
        if ($global>=$limit) { throw new RubizhHttpException(429,'SMS-вхід тимчасово недоступний. Скористайтеся email або зверніться до менеджера.',86400); }
        $q=$db->prepare('SELECT COUNT(*) FROM rubizh_phone_challenges WHERE phone=? AND sent_at>?'); $q->execute([$phone,$now-3600]); $phoneHour=(int)$q->fetchColumn();
        // The check is a deterrent (hard limits above do the protecting); above 60% it applies to every number alike.
        $device=rubizhDeviceIdentity();$deviceSoft=!rubizhRateCheck('sms-device',$device,6,86400);
        $suspicious=$deviceSoft || $ipBurst>=5 || $phoneHour>=2 || $global>=(int)floor($limit*0.6);
        if ($suspicious && !phoneCheckValid($phone)) { phoneCheckIssue($phone); throw new PhoneCheckRequired('Підтверджуємо, що запит робить людина: натисніть «Надіслати код» ще раз. Якщо не виходить — увійдіть через email.'); }
        $db->prepare("UPDATE rubizh_phone_challenges SET state='cancelled' WHERE flow_hash=? AND used_at IS NULL")->execute([$flowHash]);
        $db->prepare('INSERT INTO rubizh_phone_challenges(id,phone,code_hash,flow_hash,ip_hash,sent_at,expires_at) VALUES(?,?,?,?,?,?,?)')->execute([$id,$phone,phoneCodeHash($id,$phone,$code),$flowHash,$ip,$now,$now+300]);
        $db->commit();rubizhRateAllow('sms-device',$device,PHP_INT_MAX,86400);
    } catch (Throwable $e) { if ($db->inTransaction()) { $db->rollBack(); }if($e instanceof RubizhHttpException){header('Retry-After: '.$e->retryAfter);throw $e;}if(!$e instanceof PhoneCheckRequired&&$e instanceof RuntimeException&&!$e instanceof PDOException){header('Retry-After: 60');throw new RubizhHttpException(429,$e->getMessage().' Скористайтеся email або зверніться до менеджера.',60);}throw $e; }
    finally { $db->query("SELECT RELEASE_LOCK('rubizh_sms_request')"); }
    try { sendPhoneCode($phone,$code,$id); }
    catch (Throwable $e) { $db->prepare("UPDATE rubizh_phone_challenges SET state='failed' WHERE id=?")->execute([$id]); throw $e; }
    $db->prepare("UPDATE rubizh_phone_challenges SET state='sent' WHERE id=? AND state='pending'")->execute([$id]);
    $_SESSION['sms_challenge']=$id;
    $db->prepare('DELETE FROM rubizh_phone_challenges WHERE sent_at<?')->execute([$now-172800]);
}
function phoneChallenge(): ?array {
    $id=$_SESSION['sms_challenge'] ?? ''; if (!is_string($id) || !preg_match('/^[a-f0-9]{32}$/D',$id) || authPending()===null) { return null; }
    $q=phoneDatabase()->prepare("SELECT id,phone,sent_at,expires_at,attempts FROM rubizh_phone_challenges WHERE id=? AND flow_hash=? AND state='sent' AND used_at IS NULL");
    $q->execute([$id,phoneFlowHash()]); $row=$q->fetch(PDO::FETCH_ASSOC); return $row ?: null;
}
function phoneVerify(string $code): string {
    if (!smsEnabled()) { throw new RuntimeException('SMS-вхід ще не підключений.'); }
    $db=phoneDatabase(); $id=(string)($_SESSION['sms_challenge'] ?? ''); $db->beginTransaction();
    try {
        $q=$db->prepare("SELECT * FROM rubizh_phone_challenges WHERE id=? AND flow_hash=? AND state='sent' AND used_at IS NULL FOR UPDATE");
        $q->execute([$id,phoneFlowHash()]); $row=$q->fetch(PDO::FETCH_ASSOC);
        if (!$row || (int)$row['expires_at']<=time() || (int)$row['attempts']>=5) { throw new RuntimeException('Код прострочений або спроби вичерпано. Запросіть новий.'); }
        // Commit the failed attempt before returning the error, so it cannot reset.
        if (!preg_match('/^[0-9]{6}$/D',$code) || !hash_equals($row['code_hash'],phoneCodeHash($id,$row['phone'],$code))) {
            $db->prepare('UPDATE rubizh_phone_challenges SET attempts=attempts+1 WHERE id=?')->execute([$id]); $db->commit();
            throw new RuntimeException('Невірний код. Перевірте SMS та спробуйте ще раз.');
        }
        $db->prepare('UPDATE rubizh_phone_challenges SET used_at=? WHERE id=?')->execute([time(),$id]); $db->commit();
        unset($_SESSION['sms_challenge']); return $row['phone'];
    } catch (Throwable $e) { if ($db->inTransaction()) { $db->rollBack(); } throw $e; }
}
