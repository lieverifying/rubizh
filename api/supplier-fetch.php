<?php
declare(strict_types=1);
// Stage 5.6-1 (D-82): PIM in the browser cannot read the Армолайн and Киборг exports (no CORS), so SITE downloads a
// supplier export for PIM by the PIM key. Only HTTPS; only owner-listed supplier domains (a listed domain or its www.);
// public addresses only — checked after DNS and pinned for the connection (CURLOPT_RESOLVE), every redirect hop
// resolved and checked again (DNS rebinding); redirects stay on the same listed domain; 100 MB; a deadline. The file
// goes to a temporary file, never into memory. Logs carry the address without the query (it holds publicKey).
require_once __DIR__.'/http-download.php';

const RUBIZH_SUPPLIER_FETCH_HOSTS=['armoline.com.ua','tactic-shop.in.ua','tacticalbelt.salesdrive.me'];
const RUBIZH_SUPPLIER_FETCH_MAX=100*1024*1024;
const RUBIZH_SUPPLIER_FETCH_TIMEOUT=120.0;
const RUBIZH_SUPPLIER_FETCH_HOPS=4;

final class SupplierFetchRejected extends RuntimeException {
    public function __construct(public string $reason,int $status,string $message){parent::__construct($message,$status);}
}
function supplierFetchReject(string $reason,string $detail=''): never {
    $known=['URL_INVALID'=>[422,'Невірне посилання на прайс.'],'HTTPS_REQUIRED'=>[422,'Потрібне посилання HTTPS.'],
        'HOST_NOT_ALLOWED'=>[422,'Домену постачальника немає у списку дозволених (supplier_fetch_hosts у налаштуваннях сайту).'],
        'ADDRESS_FORBIDDEN'=>[422,'Адреса постачальника веде у внутрішню мережу — заборонено.'],'UNRESOLVED'=>[502,'Домен постачальника не знайдено (DNS).'],
        'REDIRECT_FORBIDDEN'=>[422,'Постачальник перенаправляє на інший домен або без HTTPS — заборонено.'],'TOO_MANY_REDIRECTS'=>[502,'Забагато перенаправлень у постачальника.'],
        'TOO_LARGE'=>[413,'Файл прайсу більший за дозволений розмір.'],'TIMEOUT'=>[504,'Постачальник не віддав файл вчасно.'],
        'UPSTREAM_HTTP'=>[502,'Постачальник відповів помилкою.'],'UPSTREAM_UNREACHABLE'=>[502,'Не вдалося з’єднатися з постачальником.'],'EMPTY'=>[502,'Постачальник віддав порожній файл.']];
    [$status,$message]=$known[$reason];
    throw new SupplierFetchRejected($reason,$status,$message.($detail!==''?' '.$detail:''));
}
// Built-in suppliers of D-82 plus owner-added hosts (config supplier_fetch_hosts). Wildcards and junk are not hosts.
function supplierFetchHosts(mixed $extra): array {
    $hosts=RUBIZH_SUPPLIER_FETCH_HOSTS;
    foreach(is_array($extra)?$extra:[] as $h){
        if(!is_string($h))continue;$h=strtolower(trim($h));
        if(filter_var($h,FILTER_VALIDATE_IP)||preg_match('/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/D',$h))$hosts[]=$h;
    }
    return array_values(array_unique($hosts));
}
function supplierFetchLogUrl(string $url): string {
    $p=parse_url($url);if(!is_array($p)||!isset($p['scheme'],$p['host']))return '(невірна адреса)';
    // Армолайн and Киборг put the export key in the path (/content/export/<key>.xml): long token segments are masked.
    $path=implode('/',array_map(fn($seg)=>preg_match('/^([A-Za-z0-9_-]{4})[A-Za-z0-9_-]{12,}(?:\.([A-Za-z0-9]{1,5}))?$/D',$seg,$m)?$m[1].'…'.($m[2]??''):$seg,explode('/',(string)($p['path']??''))));
    return strtolower($p['scheme']).'://'.strtolower($p['host']).(isset($p['port'])?':'.$p['port']:'').$path;
}
// Returns the listed domain the address belongs to; a redirect must stay on that same domain.
function supplierFetchCheckUrl(string $url,array $hosts): array {
    if($url===''||strlen($url)>4096||preg_match('/[\x00-\x20\x7f]/',$url))supplierFetchReject('URL_INVALID');
    $p=parse_url($url);
    if(!is_array($p)||!isset($p['scheme']))supplierFetchReject('URL_INVALID');
    if(strtolower($p['scheme'])!=='https')supplierFetchReject('HTTPS_REQUIRED');
    $host=strtolower(trim((string)($p['host']??''),'[]'));
    if($host===''||isset($p['user'])||isset($p['pass'])||(isset($p['port'])&&(int)$p['port']!==443))supplierFetchReject('URL_INVALID');
    foreach($hosts as $entry)if($host===$entry||$host==='www.'.$entry)return ['host'=>$host,'entry'=>$entry];
    supplierFetchReject('HOST_NOT_ALLOWED');
}
function supplierFetchDns(string $host): array {
    $ips=[];foreach(@dns_get_record($host,DNS_A|DNS_AAAA)?:[] as $r){$ip=$r['ip']??$r['ipv6']??'';if($ip!=='')$ips[]=$ip;}
    // The hosting blocks outgoing UDP: when the direct DNS query gets nothing, the system resolver answers (IPv4).
    if(!$ips)$ips=@gethostbynamel($host)?:[];
    return $ips;
}
function supplierFetchResolve(string $host,callable $resolver): array {
    $ips=filter_var($host,FILTER_VALIDATE_IP)?[$host]:array_values(array_filter(array_map('strval',(array)$resolver($host)),'strlen'));
    if(!$ips)supplierFetchReject('UNRESOLVED');
    foreach($ips as $ip)if(!rubizhPublicIp($ip))supplierFetchReject('ADDRESS_FORBIDDEN');
    return $ips;
}
// One HTTPS exchange to the pinned addresses; reports, never follows redirects. The body is streamed into $sink.
function supplierFetchCurl(string $url,string $host,array $ips,mixed $sink,int $limit,float $deadline,array $tls=[]): array {
    if(!function_exists('curl_init'))return ['code'=>0,'error'=>'curl недоступний'];
    $port=(int)($tls['port']??443);$out=['code'=>0,'location'=>'','content_type'=>'','last_modified'=>''];$written=0;$tooLarge=false;
    $remaining=(int)ceil(1000*($deadline-microtime(true)));if($remaining<=0)return ['code'=>0,'timeout'=>true];
    $h=curl_init($url);
    $options=[CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,CURLOPT_CONNECTTIMEOUT_MS=>min(10000,$remaining),CURLOPT_TIMEOUT_MS=>$remaining,
        CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_PROXY=>'',CURLOPT_ENCODING=>'',CURLOPT_USERAGENT=>'RubizhShop/1.4 (+https://rubizh.shop) supplier-prices',
        CURLOPT_RESOLVE=>[$host.':'.$port.':'.implode(',',array_map(fn($ip)=>str_contains($ip,':')?'['.$ip.']':$ip,$ips))],
        CURLOPT_HEADERFUNCTION=>function($c,string $line)use(&$out,&$tooLarge,$limit){
            [$name,$value]=array_pad(explode(':',$line,2),2,'');$name=strtolower(trim($name));$value=trim($value);
            if($name==='location')$out['location']=$value;elseif($name==='content-type')$out['content_type']=$value;elseif($name==='last-modified')$out['last_modified']=$value;
            elseif($name==='content-length'&&ctype_digit($value)&&(int)$value>$limit){$tooLarge=true;return 0;}
            return strlen($line);},
        CURLOPT_WRITEFUNCTION=>function($c,string $chunk)use($sink,&$written,&$tooLarge,$limit){
            if($written+strlen($chunk)>$limit){$tooLarge=true;return 0;}
            $n=fwrite($sink,$chunk);if($n===false)return 0;$written+=$n;return $n;}];
    if(isset($tls['cainfo']))$options[CURLOPT_CAINFO]=(string)$tls['cainfo'];
    curl_setopt_array($h,$options);
    try{$ok=curl_exec($h);$errno=curl_errno($h);$error=curl_error($h);$out['code']=(int)curl_getinfo($h,CURLINFO_RESPONSE_CODE);}finally{curl_close($h);}
    if($tooLarge)return ['too_large'=>true]+$out;
    if($ok===false){if($errno===CURLE_OPERATION_TIMEDOUT)return ['timeout'=>true]+$out;return ['error'=>$error!==''?$error:'curl '.$errno]+$out;}
    return $out;
}
function supplierFetch(string $url,array $hosts,mixed $sink,array $opt=[]): array {
    $resolver=$opt['resolver']??'supplierFetchDns';$transport=$opt['transport']??'supplierFetchCurl';
    $limit=(int)($opt['max']??RUBIZH_SUPPLIER_FETCH_MAX);$deadline=microtime(true)+(float)($opt['timeout']??RUBIZH_SUPPLIER_FETCH_TIMEOUT);
    $target=supplierFetchCheckUrl($url,$hosts);$entry=$target['entry'];
    for($hop=0;$hop<=RUBIZH_SUPPLIER_FETCH_HOPS;$hop++){
        $ips=supplierFetchResolve($target['host'],$resolver);
        ftruncate($sink,0);rewind($sink);
        $r=$transport($url,$target['host'],$ips,$sink,$limit,$deadline);
        if(!empty($r['too_large']))supplierFetchReject('TOO_LARGE','Ліміт '.intdiv($limit,1024*1024).' МБ.');
        if(!empty($r['timeout'])||microtime(true)>$deadline)supplierFetchReject('TIMEOUT');
        $code=(int)($r['code']??0);
        if($code===0||!empty($r['error']))supplierFetchReject('UPSTREAM_UNREACHABLE');
        if(in_array($code,[301,302,303,307,308],true)){
            try{$next=rubizhRedirectUrl($url,(string)($r['location']??''));$nextTarget=supplierFetchCheckUrl($next,$hosts);}
            catch(RuntimeException $e){supplierFetchReject('REDIRECT_FORBIDDEN');}
            if($nextTarget['entry']!==$entry)supplierFetchReject('REDIRECT_FORBIDDEN');
            $url=$next;$target=$nextTarget;continue;
        }
        if($code!==200)supplierFetchReject('UPSTREAM_HTTP','HTTP '.$code.'.');
        fflush($sink);$bytes=(int)(fstat($sink)['size']??0);
        if($bytes===0)supplierFetchReject('EMPTY');
        return ['bytes'=>$bytes,'content_type'=>(string)($r['content_type']??''),'last_modified'=>(string)($r['last_modified']??''),'redirects'=>$hop];
    }
    supplierFetchReject('TOO_MANY_REDIRECTS');
}
function supplierFetchHeaderValue(string $v): string {return substr((string)preg_replace('/[\x00-\x1f\x7f]/','',$v),0,200);}
// The HTTP answer for PIM: the supplier file byte for byte, its HTTP time and type in X-Supplier-* headers.
function supplierFetchRespond(array $input,array $opt=[]): void {
    $url=is_string($input['url']??null)?trim($input['url']):'';$log=supplierFetchLogUrl($url);$t0=microtime(true);
    $hosts=$opt['hosts']??supplierFetchHosts(function_exists('cfg')?cfg('supplier_fetch_hosts'):null);
    $sink=tmpfile();if($sink===false)throw new RuntimeException('No temporary file for the supplier download');
    try{
        try{$r=supplierFetch($url,$hosts,$sink,$opt);}
        catch(SupplierFetchRejected $e){error_log('rubizh supplier-fetch: '.$log.' refused '.$e->reason);throw $e;}
        error_log('rubizh supplier-fetch: '.$log.' ok '.$r['bytes'].' bytes '.(int)(1000*(microtime(true)-$t0)).' ms');
        $headers=['Content-Type'=>'application/octet-stream','Content-Length'=>(string)$r['bytes'],'Content-Disposition'=>'attachment','Cache-Control'=>'no-store','X-Content-Type-Options'=>'nosniff',
            'X-Supplier-Content-Type'=>supplierFetchHeaderValue($r['content_type']),'X-Supplier-Last-Modified'=>supplierFetchHeaderValue($r['last_modified'])];
        $GLOBALS['rubizh_supplier_fetch_headers']=$headers;
        if(($opt['emit_headers']??true)!==false){http_response_code(200);foreach($headers as $k=>$v)header($k.': '.$v);}
        rewind($sink);fpassthru($sink);
    }finally{fclose($sink);}
}
