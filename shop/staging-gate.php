<?php
declare(strict_types=1);
// Stage 5.5 (owner D-80): the closed mode on rubizh.shop before opening day. With environment=staging and a configured
// staging_gate (user + password_hash) every web request needs HTTP Basic Auth and is marked noindex; only then do the
// staging relaxations (mock bank, Nova Poshta and SMS stubs, no e-mail) apply on the production host. environment=staging
// without a valid gate is a misconfiguration on any public host: the site answers 503 and nothing is relaxed (the Host
// header is the caller's, so only a short list of local names counts as a local stand — 127.0.0.1, ::1, localhost, *.test,
// *.localhost — and the command line, S55-01). Any other environment never relaxes anything.
function rubizhStagingSettings(): array {
    static $c=null;if($c!==null)return $c;
    $f=$GLOBALS['rubizh_config_file']??dirname(__DIR__).'/api/config.php';$all=is_file($f)?(require $f):[];
    $c=['environment'=>is_array($all)?($all['environment']??null):null,'gate'=>is_array($all)?($all['staging_gate']??null):null,'mono_mock'=>is_array($all)?($all['mono_mock']??null):null];
    return $c;
}
// Stage 5.5 review: lowercase, no port, no trailing dot; anything that is not a local name is treated as public.
function rubizhRequestHost(): string {$h=strtolower(trim((string)($_SERVER['HTTP_HOST']??'')));if(preg_match('/^\[([0-9a-f:.]+)\](?::\d+)?$/D',$h,$m))return $m[1];return rtrim((string)preg_replace('/:\d+$/D','',$h),'.');}
function rubizhLocalStand(): bool {
    if(PHP_SAPI==='cli'&&!isset($_SERVER['HTTP_HOST']))return true;
    $h=rubizhRequestHost();return in_array($h,['127.0.0.1','::1','localhost'],true)||preg_match('/\.(?:test|localhost)$/D',$h)===1;
}
function rubizhProductionHost(): bool {return !rubizhLocalStand();}
function rubizhStagingGateConfigured(): bool {
    $c=rubizhStagingSettings();$g=$c['gate'];
    if($c['environment']!=='staging'||!is_array($g))return false;
    $user=$g['user']??null;$hash=$g['password_hash']??null;
    if(!is_string($user)||preg_match('/^[A-Za-z0-9._-]{3,64}$/D',$user)!==1||!is_string($hash))return false;
    $algo=password_get_info($hash)['algo']??null;
    return $algo!==null&&$algo!==0;
}
// The staging relaxations (mocks, on-screen SMS code, no e-mail): staging, and either a local stand or behind the gate.
function rubizhStagingRelaxed(): bool {
    return rubizhStagingSettings()['environment']==='staging'&&(!rubizhProductionHost()||rubizhStagingGateConfigured());
}
function rubizhStagingCredentials(): array {
    if(isset($_SERVER['PHP_AUTH_USER']))return [(string)$_SERVER['PHP_AUTH_USER'],(string)($_SERVER['PHP_AUTH_PW']??'')];
    $h=(string)($_SERVER['HTTP_AUTHORIZATION']??$_SERVER['REDIRECT_HTTP_AUTHORIZATION']??'');
    if(preg_match('/^Basic\s+([A-Za-z0-9+\/=]{4,512})$/D',$h,$m)){$pair=base64_decode($m[1],true);if(is_string($pair)&&str_contains($pair,':'))return explode(':',$pair,2);}
    return ['',''];
}
// PIM talks to /api/pim/… with its own key (Authorization: Bearer). Stage 5.5 review: the gate checks that key itself
// (pim_key or pim_key_next, constant time) and refuses dot segments — the raw request path is what PHP sees, so
// «/api/pim/../../shop/…» would otherwise reach any script; the public /api/ routes stay behind the password.
function rubizhStagingKeyRequest(): bool {
    $uri=(string)($_SERVER['REQUEST_URI']??'/');$path=(string)parse_url($uri,PHP_URL_PATH);
    if(!str_starts_with($path,'/api/pim/')||str_contains($path,'..')||stripos($uri,'%2e')!==false||str_contains($path,'\\'))return false;
    $h=trim((string)($_SERVER['HTTP_AUTHORIZATION']??$_SERVER['REDIRECT_HTTP_AUTHORIZATION']??''));
    if(preg_match('/^Bearer\s+(\S+)$/D',$h,$m)!==1)return false;
    $f=$GLOBALS['rubizh_config_file']??dirname(__DIR__).'/api/config.php';$all=is_file($f)?(require $f):[];if(!is_array($all))return false;
    $ok=false;foreach([$all['pim_key']??'',$all['pim_key_next']??''] as $k)if(is_string($k)&&strlen($k)>=24&&hash_equals($k,$m[1]))$ok=true;
    return $ok;
}
// Stage 5.6-3 (D-84): the bank calls the webhook without the password. Only POST to the exact path, without a query,
// dot segments or encoded characters, and with a signature header; shop/mono-webhook.php verifies the signature itself.
function rubizhStagingBankWebhook(): bool {
    // With the stand's mock bank (mono_mock) nothing outside calls the webhook — it stays behind the password.
    $uri=(string)($_SERVER['REQUEST_URI']??'');$c=rubizhStagingSettings();
    return ($c['mono_mock']??null)!==true&&($_SERVER['REQUEST_METHOD']??'')==='POST'&&$uri==='/shop/mono-webhook.php'&&($_SERVER['SCRIPT_NAME']??'')==='/shop/mono-webhook.php'&&trim((string)($_SERVER['HTTP_X_SIGN']??''))!=='';
}
function rubizhStagingGate(): void {
    if(PHP_SAPI==='cli'||!empty($GLOBALS['rubizh_staging_gate_passed']))return;
    $c=rubizhStagingSettings();if($c['environment']!=='staging')return;
    if(!headers_sent())header('X-Robots-Tag: noindex, nofollow');
    if(!rubizhStagingGateConfigured()){
        if(!rubizhProductionHost())return;
        http_response_code(503);header('Cache-Control: no-store');header('Content-Type: text/plain; charset=utf-8');header('Retry-After: 300');
        echo "Сайт тимчасово недоступний.\n";exit;
    }
    if(rubizhStagingKeyRequest()){$GLOBALS['rubizh_staging_gate_passed']=true;return;}
    if(rubizhStagingBankWebhook()){$GLOBALS['rubizh_staging_gate_passed']=true;return;}
    [$user,$password]=rubizhStagingCredentials();$g=$c['gate'];
    if(hash_equals((string)$g['user'],$user)&&password_verify($password,(string)$g['password_hash'])){$GLOBALS['rubizh_staging_gate_passed']=true;return;}
    http_response_code(401);header('WWW-Authenticate: Basic realm="RUBIZH", charset="UTF-8"');header('Cache-Control: no-store');header('Content-Type: text/plain; charset=utf-8');
    echo "Потрібен вхід.\n";exit;
}
