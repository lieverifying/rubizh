<?php
declare(strict_types=1);
require_once __DIR__.'/lib.php';
function rubizhSellerDefaults(): array {return ['name'=>'ФОП Мєшалкін Андрій Леонідович','tax_id'=>'2837300592','iban'=>'UA943220010000026004380084907','bank'=>'УНІВЕРСАЛ БАНК','mfo'=>'322001','bank_tax_id'=>'21133352','address'=>'Україна, 18007, м. Черкаси, вул. Смілянська, 23/1','email'=>'info@rubizh.shop','phone'=>'+380976867892','phone_label'=>'+380 97 686 78 92','telegram'=>''];}
function rubizhSeller(): array {$defaults=rubizhSellerDefaults();$c=is_file(__DIR__.'/config.php')?(cfg('seller')??[]):[];return array_replace($defaults,array_intersect_key(is_array($c)?$c:[],$defaults));}
function rubizhSellerHtml(string $html): string {$defaults=rubizhSellerDefaults();$seller=rubizhSeller();$map=[];foreach($defaults as $k=>$v)if($seller[$k]!==$v)$map[$v]=htmlspecialchars((string)$seller[$k],ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');return strtr($html,$map);}

// Stage 5.5 (owner): messenger chats with the shop phone, from the seller settings only (config seller.phone, optional
// seller.telegram username) — the footer never hard-codes them. Viber opens its app (no new tab); the rest open a new tab.
function rubizhMessengers(?array $seller=null): array {
    $seller??=rubizhSeller();$digits=preg_replace('/\D+/','',(string)$seller['phone']);if(strlen($digits)<10||strlen($digits)>15)return [];
    $nick=preg_match('/^[A-Za-z][A-Za-z0-9_]{4,31}$/D',(string)$seller['telegram'])===1?(string)$seller['telegram']:'';
    return [
        ['id'=>'viber','label'=>'Написати у Viber','href'=>'viber://chat?number=%2B'.$digits,'tab'=>false],
        ['id'=>'whatsapp','label'=>'Написати у WhatsApp','href'=>'https://wa.me/'.$digits,'tab'=>true],
        ['id'=>'telegram','label'=>'Написати у Telegram','href'=>'https://t.me/'.($nick!==''?$nick:'+'.$digits),'tab'=>true],
        ['id'=>'signal','label'=>'Написати у Signal','href'=>'https://signal.me/#p/+'.$digits,'tab'=>true],
    ];
}
function rubizhMessengersHtml(?array $seller=null): string {
    $e=fn($v)=>htmlspecialchars((string)$v,ENT_QUOTES|ENT_SUBSTITUTE,'UTF-8');$out='';
    foreach(rubizhMessengers($seller) as $m)$out.='<a class="rz-msg rz-msg-'.$m['id'].'" href="'.$e($m['href']).'" aria-label="'.$e($m['label']).'" title="'.$e($m['label']).'"'.($m['tab']?' target="_blank" rel="noopener noreferrer"':'').'><span aria-hidden="true"></span></a>';
    return '<div class="rz-msgs" data-footer-messengers="1">'.$out.'</div>';
}
/** The footer block of index.html (rendered with the defaults) replaced by the current settings. */
function rubizhMessengersInHtml(string $html): string {return (string)preg_replace('~<div class="rz-msgs" data-footer-messengers="1">.*?</div>~s',str_replace(['\\','$'],['\\\\','\\$'],rubizhMessengersHtml()),$html,1);}
