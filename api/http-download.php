<?php
declare(strict_types=1);
// Untrusted supplier URLs must never reach loopback, private networks or metadata.
function rubizhPublicIp(string $ip): bool {
    $packed=@inet_pton($ip);
    if($packed===false)return false;
    if(strlen($packed)===4&&ord($packed[0])>=224)return false;
    if(strlen($packed)===16&&ord($packed[0])===255)return false;
    // Stage 5.6 review: NAT64 (64:ff9b::/96, 64:ff9b:1::/48) and 6to4 (2002::/16) carry an IPv4 inside — never public here.
    if(strlen($packed)===16&&(str_starts_with($packed,"\x00\x64\xff\x9b")||str_starts_with($packed,"\x20\x02")))return false;
    return filter_var($ip,FILTER_VALIDATE_IP,FILTER_FLAG_GLOBAL_RANGE)!==false;
}
function rubizhDownloadTarget(string $url): array {
    if(strlen($url)>4096||preg_match('/[\x00-\x20\x7f]/',$url))throw new RuntimeException('Недопустима адреса фото');
    $p=parse_url($url);$scheme=strtolower($p['scheme']??'');$host=strtolower(trim($p['host']??'','[]'));
    if(!in_array($scheme,['http','https'],true)||$host===''||isset($p['user'])||isset($p['pass'])||!preg_match('/^[a-z0-9.:-]+$/D',$host))throw new RuntimeException('Недопустима адреса фото');
    $port=(int)($p['port']??($scheme==='https'?443:80));
    if($port!==($scheme==='https'?443:80))throw new RuntimeException('Недопустимий порт фото');
    $ips=[];
    if(filter_var($host,FILTER_VALIDATE_IP))$ips[]=$host;
    else{foreach(@dns_get_record($host,DNS_A|DNS_AAAA)?:[] as $record){$ip=$record['ip']??$record['ipv6']??'';if($ip!=='')$ips[]=$ip;}}
    if(!$ips)throw new RuntimeException('Адреса фото недоступна');
    foreach($ips as $ip)if(!rubizhPublicIp($ip))throw new RuntimeException('Внутрішні адреси фото заборонені');
    usort($ips,fn($a,$b)=>(int)str_contains($a,':')<=>(int)str_contains($b,':'));
    return ['host'=>$host,'port'=>$port,'ip'=>$ips[0],'ips'=>$ips];
}
function rubizhRedirectUrl(string $base,string $location): string {
    if($location===''||preg_match('/[\x00-\x20\x7f]/',$location))throw new RuntimeException('Недопустиме перенаправлення фото');
    if(preg_match('~^[a-z][a-z0-9+.-]*:~i',$location))return $location;
    $p=parse_url($base);$origin=$p['scheme'].'://'.$p['host'].(isset($p['port'])?':'.$p['port']:'');
    if(str_starts_with($location,'//'))return $p['scheme'].':'.$location;
    if(str_starts_with($location,'?'))return $origin.($p['path']??'/').$location;
    $relative=parse_url($location);$path=$relative['path']??'';
    if(!str_starts_with($path,'/'))$path=substr($p['path']??'/',0,strrpos($p['path']??'/','/')+1).$path;
    $parts=[];foreach(explode('/',$path) as $part){if($part==='..')array_pop($parts);elseif($part!=='.'&&$part!=='')$parts[]=$part;}
    return $origin.'/'.implode('/',$parts).(isset($relative['query'])?'?'.$relative['query']:'');
}
function rubizhDownloadImage(string $url,float $timeout=20.0): string {
    $deadline=microtime(true)+max(.1,min(20.0,$timeout));$limit=15*1024*1024;
    for($hop=0;$hop<=4;$hop++){
        $target=rubizhDownloadTarget($url);$body='';$location='';$h=curl_init($url);
        $resolve=$target['host'].':'.$target['port'].':'.implode(',',array_map(fn($ip)=>str_contains($ip,':')?'['.$ip.']':$ip,$target['ips']));
        $remaining=max(1,(int)ceil(1000*($deadline-microtime(true))));
        curl_setopt_array($h,[CURLOPT_FOLLOWLOCATION=>false,CURLOPT_CONNECTTIMEOUT_MS=>min(5000,$remaining),CURLOPT_TIMEOUT_MS=>$remaining,CURLOPT_SSL_VERIFYPEER=>true,CURLOPT_SSL_VERIFYHOST=>2,CURLOPT_PROTOCOLS=>CURLPROTO_HTTP|CURLPROTO_HTTPS,CURLOPT_RESOLVE=>[$resolve],CURLOPT_PROXY=>'',CURLOPT_USERAGENT=>'RubizhShop/1.4 (+https://rubizh.shop)',CURLOPT_REFERER=>parse_url($url,PHP_URL_SCHEME).'://'.$target['host'].'/',
            CURLOPT_WRITEFUNCTION=>function($h,string $chunk)use(&$body,$limit){if(strlen($body)+strlen($chunk)>$limit)return 0;$body.=$chunk;return strlen($chunk);},
            CURLOPT_HEADERFUNCTION=>function($h,string $line)use(&$location){if(strncasecmp($line,'Location:',9)===0)$location=trim(substr($line,9));return strlen($line);}]);
        try{$ok=curl_exec($h);$code=(int)curl_getinfo($h,CURLINFO_RESPONSE_CODE);}finally{curl_close($h);}
        if($ok===false||microtime(true)>$deadline)throw new RuntimeException('Фото не завантажено або перевищує ліміт');
        if(in_array($code,[301,302,303,307,308],true)){$url=rubizhRedirectUrl($url,$location);continue;}
        if($code!==200)throw new RuntimeException('Фото недоступне: HTTP '.$code);
        return $body;
    }
    throw new RuntimeException('Забагато перенаправлень фото');
}
