<?php
declare(strict_types=1);
// Forwarding headers are accepted only through explicitly configured trusted proxies.
final class RubizhHttpException extends RuntimeException {
    public function __construct(public readonly int $status, string $message, public readonly int $retryAfter=0) {parent::__construct($message);}
}
function rubizhRuntimeDir(): string {
    $dir=$GLOBALS['rubizh_runtime_dir']??dirname(__DIR__,2).'/rubizh-runtime';
    if(!is_dir($dir)&&!@mkdir($dir,0700,true)&&!is_dir($dir))throw new RubizhHttpException(503,'Сервіс тимчасово недоступний.',5);
    return $dir;
}
function rubizhCacheHeartbeat(bool $healthy): void {
    $file = rubizhRuntimeDir().'/cache-heartbeat.json';
    $temp = tempnam(dirname($file), '.heartbeat-');
    if ($temp === false) throw new RuntimeException('Worker heartbeat unavailable');
    try {
        chmod($temp, 0600);
        $data = json_encode(['at'=>time(), 'healthy'=>$healthy], JSON_THROW_ON_ERROR);
        if (file_put_contents($temp, $data, LOCK_EX) !== strlen($data) || !rename($temp, $file)) throw new RuntimeException('Worker heartbeat unavailable');
    } finally {if (is_file($temp)) unlink($temp);}
}
function rubizhCacheHealthy(?int $now = null): bool {
    $file = rubizhRuntimeDir().'/cache-heartbeat.json';
    if (!is_file($file)) return false;
    $value = json_decode((string)file_get_contents($file), true);
    $now ??= time();
    return is_array($value) && ($value['healthy'] ?? null) === true && is_int($value['at'] ?? null)
        && $value['at'] <= $now + 10 && $value['at'] >= $now - 180;
}
function rubizhHeaders(): void {
    header('X-Content-Type-Options: nosniff');header('X-Frame-Options: DENY');
    header('Strict-Transport-Security: max-age=31536000');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
    header("Content-Security-Policy: frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
}
function rubizhStorefrontCsp(): string {
    $nonce=base64_encode(random_bytes(18));
    // Stage 5.3 (PL-2): no unsafe-eval — the runtime runs the storefront's logic script without compiling it.
    // Inline scripts still require a fresh nonce; inline event attributes and injected third-party scripts fail.
    header("Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-".$nonce."' https://www.googletagmanager.com https://connect.facebook.net; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; font-src 'self'; connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://www.facebook.com; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
    return $nonce;
}
function rubizhNonceHtml(string $html,string $nonce): string {return preg_replace('/<script\b/i','<script nonce="'.htmlspecialchars($nonce,ENT_QUOTES,'UTF-8').'"',$html);}
function rubizhAddressMatches(string $address,string $network): bool {
    $parts=explode('/',$network,2);$ip=@inet_pton($address);$base=@inet_pton($parts[0]);
    if($ip===false||$base===false||strlen($ip)!==strlen($base))return false;
    $bits=isset($parts[1])&&preg_match('/^\d+$/D',$parts[1])?(int)$parts[1]:(isset($parts[1])?-1:strlen($ip)*8);
    if($bits<0||$bits>strlen($ip)*8)return false;
    $bytes=intdiv($bits,8);$rest=$bits%8;
    return substr($ip,0,$bytes)===substr($base,0,$bytes)&&(!$rest||((ord($ip[$bytes])^ord($base[$bytes]))&(255<<(8-$rest)))===0);
}
function rubizhClientAddress(?array $trusted=null): string {
    $remote=(string)($_SERVER['REMOTE_ADDR']??'unknown');
    $trusted??=function_exists('cfg')?(array)(cfg('trusted_proxies')??[]):[];
    $isTrusted=fn(string $ip)=>count(array_filter($trusted,fn($net)=>is_string($net)&&rubizhAddressMatches($ip,$net)))>0;
    if(!$isTrusted($remote))return $remote;
    $chain=array_map('trim',explode(',',(string)($_SERVER['HTTP_X_FORWARDED_FOR']??'')));
    if(count($chain)>20)return $remote;
    foreach($chain as $ip)if(!filter_var($ip,FILTER_VALIDATE_IP))return $remote;
    for($i=count($chain)-1;$i>=0;$i--)if(!$isTrusted($chain[$i]))return $chain[$i];
    return $remote;
}
function rubizhNetworkIdentity(?string $address=null): string {
    $address??=rubizhClientAddress();$packed=@inet_pton($address);
    return $packed!==false&&strlen($packed)===16?inet_ntop(substr($packed,0,8).str_repeat("\0",8)).'/64':$address;
}
// Stage 5.5.3: cookies are Secure everywhere except the local owner stand (PHP built-in server, staging_allow_loopback, a loopback
// client): Safari drops Secure cookies on http://127.0.0.1, so sign-in and checkout failed there. Production never matches.
function rubizhCookieSecure(): bool {return !(PHP_SAPI==='cli-server'&&function_exists('cfg')&&cfg('staging_allow_loopback')===true&&in_array($_SERVER['REMOTE_ADDR']??'',['127.0.0.1','::1'],true));}
function rubizhDeviceIdentity(): string {
    $id=$_COOKIE['rz_dev']??'';
    if(!is_string($id)||!preg_match('/^[a-f0-9]{64}$/D',$id)){
        $id=bin2hex(random_bytes(32));$_COOKIE['rz_dev']=$id;
        if(!headers_sent())setcookie('rz_dev',$id,['expires'=>time()+31536000,'path'=>'/','secure'=>rubizhCookieSecure(),'httponly'=>true,'samesite'=>'Lax']);
    }
    return $id;
}
function rubizhProofIssue(string $scope,int $bits=16): array {
    return $_SESSION['rate_proof']=['nonce'=>bin2hex(random_bytes(16)),'bits'=>max(8,min(20,$bits)),'scope'=>hash('sha256',$scope),'expires'=>time()+300];
}
function rubizhProofValid(string $scope,mixed $answer): bool {
    $proof=$_SESSION['rate_proof']??null;
    if(!is_array($proof)||!is_string($answer)||!preg_match('/^\d{1,12}$/D',$answer)||($proof['expires']??0)<time()||!hash_equals($proof['scope']??'',hash('sha256',$scope)))return false;
    $hash=hash('sha256',$proof['nonce'].':'.$answer,true);$zero=0;
    foreach(str_split($hash) as $byte){$value=ord($byte);if($value===0){$zero+=8;continue;}$zero+=8-strlen(decbin($value));break;}
    if($zero<(int)$proof['bits'])return false;
    unset($_SESSION['rate_proof']);return true;
}
function rubizhRateCheck(string $kind,string $identity,int $limit,int $window,?int $now=null): bool {return rubizhRateAllow($kind,$identity,$limit,$window,$now,false);}
function rubizhRateAllow(string $kind,string $identity,int $limit,int $window,?int $now=null,bool $consume=true): bool {

    $now??=time();$hash=hash('sha256',$kind.'|'.$identity);
    // Fixed 4096 files; each holds at most 64 short-lived identities. Random URLs/IPs
    // cannot create an unlimited number of files on a shared disk.
    $file=rubizhRuntimeDir().'/rate-'.substr($hash,0,3).'.json';$handle=@fopen($file,'c+');
    // Concurrent requests from one address (one NAT, one page with parallel fetches) share this file: wait briefly
    // for the sub-millisecond critical section instead of refusing them.
    $locked=false;$deadline=microtime(true)+0.25;
    if($handle)do{if(flock($handle,LOCK_EX|LOCK_NB)){$locked=true;break;}usleep(1000);}while(microtime(true)<$deadline);
    if(!$locked){if($handle)fclose($handle);throw new RubizhHttpException(503,'Спробуйте за кілька секунд.',2);}
    try {
        $raw=stream_get_contents($handle);$rows=json_decode($raw?:'{}',true);if(!is_array($rows))$rows=[];
        foreach($rows as $key=>$row)if(!is_array($row)||($row['until']??0)<=$now)unset($rows[$key]);
        if(!$consume)return (int)($rows[$hash]['hits']??0)<$limit;
        if(!isset($rows[$hash])&&count($rows)>=64){uasort($rows,fn($a,$b)=>($a['until']??0)<=>($b['until']??0));array_shift($rows);}
        $row=$rows[$hash]??['until'=>$now+$window,'hits'=>0];$row['hits']++;$rows[$hash]=$row;
        $json=json_encode($rows,JSON_THROW_ON_ERROR);rewind($handle);
        if(!ftruncate($handle,0)||fwrite($handle,$json)!==strlen($json)||!fflush($handle))throw new RubizhHttpException(503,'Сервіс тимчасово недоступний.',5);
        return $row['hits']<=$limit;
    } finally {flock($handle,LOCK_UN);fclose($handle);}
}
function rubizhPublicGate(string $kind,int $limit=300,int $window=60): void {
    if(PHP_SAPI==='cli')return;
    $network=rubizhNetworkIdentity();
    if($kind==='account'){
        $networkSoft=!rubizhRateCheck('account',$network,600,60);
        if(!rubizhRateAllow('account',$network,1800,60))throw new RubizhHttpException(429,'Забагато запитів з мережі. Зачекайте хвилину або зверніться до менеджера.',60);
        if(session_status()!==PHP_SESSION_ACTIVE)return;
        $identity=session_id();$sessionSoft=!rubizhRateCheck('account-session',$identity,60,60);
        if(!rubizhRateAllow('account-session',$identity,180,60))throw new RubizhHttpException(429,'Забагато запитів у цьому сеансі. Зачекайте хвилину або зверніться до менеджера.',60);
        if(($networkSoft||$sessionSoft)&&(int)($_SESSION['account_rate_verified_until']??0)<time()){
            $scope='account:'.$identity;
            if(rubizhProofValid($scope,$_SERVER['HTTP_X_RUBIZH_RATE_PROOF']??$_GET['_rate_proof']??null))$_SESSION['account_rate_verified_until']=time()+60;
            else{rubizhProofIssue($scope);throw new RubizhHttpException(428,'Підтвердьте запит. Якщо перевірка не працює — зачекайте хвилину або зверніться до менеджера.',1);}
        }
        return;
    }
    if(!rubizhRateAllow($kind,$network,$limit,$window))throw new RubizhHttpException(429,'Забагато запитів. Спробуйте пізніше або зверніться до менеджера.',$window);
}
function rubizhWorkAcquire(string $kind,int $capacity=4): mixed {
    if(!preg_match('/^[a-z-]+$/D',$kind))throw new LogicException('Invalid work pool');
    for($i=0;$i<$capacity;$i++){
        $h=@fopen(rubizhRuntimeDir().'/work-'.$kind.'-'.$i.'.lock','c');
        if($h&&flock($h,LOCK_EX|LOCK_NB))return $h;
        if($h)fclose($h);
    }
    throw new RubizhHttpException(503,'Зараз багато відвідувачів. Повторіть запит за кілька секунд.',2);
}
function rubizhWorkRelease(mixed $handle): void {if(is_resource($handle)){flock($handle,LOCK_UN);fclose($handle);}}
function rubizhHttpWork(string $kind,int $capacity): void {
    if(PHP_SAPI==='cli')return;
    $handle=rubizhWorkAcquire($kind,$capacity);
    register_shutdown_function(fn()=>rubizhWorkRelease($handle));
}
// This flag is written only by the CLI installer after every component is prepared.
// Bump it whenever a schema migration changes. A missing flag keeps first-run behavior.
function rubizhSchemaPrepared(PDO $db): bool {
    static $known;
    $known??=new WeakMap();
    if(isset($known[$db]))return $known[$db];
    try{$value=$db->query("SELECT v FROM meta WHERE k='runtime_schema'")->fetchColumn();}
    catch(PDOException $e){$value=false;}
    return $known[$db]=$value==='20261008-v1';
}
function rubizhCatalogInput(array $input): array {
    $limits=['action'=>20,'id'=>64,'ids'=>13000,'slug'=>191,'code'=>40,'q'=>160,'category'=>700,'roots'=>1500,'leaf'=>255,'brands'=>1500,'sizes'=>1000,'camo'=>1000,'attrs'=>4096,'slot'=>20,'sort'=>20,'availability'=>20,'page'=>8,'limit'=>4,'price_from'=>16,'price_to'=>16];
    foreach($limits as $key=>$max)if(isset($input[$key])){
        if(!is_scalar($input[$key])||!mb_check_encoding((string)$input[$key],'UTF-8')||mb_strlen((string)$input[$key])>$max)throw new RubizhHttpException(400,'Перевірте параметри каталогу.');
        $input[$key]=trim((string)$input[$key]);
    }
    foreach(['page','limit'] as $key)if(isset($input[$key])){
        if(!preg_match('/^\d{1,8}$/D',$input[$key]))throw new RubizhHttpException(400,'Перевірте сторінку каталогу.');
        $input[$key]=(string)max(1,min($key==='limit'?100:1000,(int)$input[$key]));
    }
    if(isset($input['attrs'])){$attrs=json_decode($input['attrs'],true,8);if(!is_array($attrs)||count($attrs)>24||array_filter($attrs,fn($v)=>!is_string($v)||strlen($v)>500))throw new RubizhHttpException(400,'Перевірте фільтри каталогу.');}
    return $input;
}
// Stage 5.5 (D-80): the closed mode is checked before any page or API code runs.
require_once __DIR__.'/staging-gate.php';
rubizhStagingGate();
