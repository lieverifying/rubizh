<?php
declare(strict_types=1);
if (!defined('RUBIZH_AUTH')) { http_response_code(404); exit; }
// 5.6.3: a refused provider call (e.g. Google «invalid_client» after a revoked secret) was invisible — the owner saw only
// «Сервіс входу тимчасово недоступний». The PHP log gets host/path, status and the provider's error code; never the query,
// the body, tokens or secrets.
function authHttpFailureNote(string $url, int $status, string $response, bool $transport): string {
    $where=preg_replace('/[^A-Za-z0-9.\/_-]/','',(string)parse_url($url,PHP_URL_HOST).(string)parse_url($url,PHP_URL_PATH));
    $err=json_decode($response,true); $code=is_array($err)&&is_string($err['error']??null)?substr((string)preg_replace('/[^A-Za-z0-9_.-]/','',$err['error']),0,40):'';
    return 'rubizh auth http: '.substr($where,0,120).($transport?' transport failure':' status '.$status).($code!==''?' '.$code:'');
}
function authHttp(string $url, ?string $body = null, array $headers = [], int $timeout = 15): array {
    if (!function_exists('curl_init')) { throw new RuntimeException('Сервіс входу тимчасово недоступний.'); }
    $ch=curl_init($url); $response='';
    curl_setopt_array($ch,[CURLOPT_RETURNTRANSFER=>false,CURLOPT_FOLLOWLOCATION=>false,
        CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_CONNECTTIMEOUT=>5,CURLOPT_TIMEOUT=>$timeout,
        CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_HTTPHEADER=>$headers,
        CURLOPT_WRITEFUNCTION=>static function($ch,string $part) use(&$response): int {
            if (strlen($response)+strlen($part)>1048576) { return 0; } $response.=$part; return strlen($part);
        }]);
    if ($body !== null) { curl_setopt($ch,CURLOPT_POST,true); curl_setopt($ch,CURLOPT_POSTFIELDS,$body); }
    $ok=curl_exec($ch); $status=(int)curl_getinfo($ch,CURLINFO_RESPONSE_CODE); curl_close($ch);
    if ($ok === false || $status !== 200) { error_log(authHttpFailureNote($url,$status,$response,$ok === false)); throw new RuntimeException('Сервіс входу тимчасово недоступний. Спробуйте пізніше.'); }
    $data=json_decode($response,true,32,JSON_THROW_ON_ERROR);
    if (!is_array($data)) { throw new RuntimeException('Сервіс входу тимчасово недоступний.'); } return $data;
}
