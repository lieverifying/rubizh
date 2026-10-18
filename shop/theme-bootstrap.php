<?php
declare(strict_types=1);
function shopThemeMarkup(?string $provided=null): string {
 $theme=$provided;if($theme===null&&!empty($_COOKIE['rubizh_customer'])){try{
 if(session_status()!==PHP_SESSION_ACTIVE){session_name('rubizh_customer');ini_set('session.use_strict_mode','1');session_set_cookie_params(['lifetime'=>0,'path'=>'/','secure'=>!function_exists('rubizhCookieSecure')||rubizhCookieSecure(),'httponly'=>true,'samesite'=>'Lax']);session_start();$close=true;}
 $id=$_SESSION['customer_id']??'';$valid=is_string($id)&&preg_match('/^[a-f0-9]{32}$/D',$id)&&time()-(int)($_SESSION['login_time']??0)<=86400;if(!empty($close))session_write_close();
 if($valid){$q=db()->prepare('SELECT theme FROM rubizh_customer_preferences WHERE customer_id=?');$q->execute([$id]);$theme=$q->fetchColumn()?:'system';header('Cache-Control: private, no-store');}
 }catch(Throwable $e){if(!empty($close)&&session_status()===PHP_SESSION_ACTIVE)session_write_close();}}
 return in_array($theme,['light','dark','system'],true)?'<meta name="rubizh-profile-theme" content="'.htmlspecialchars($theme,ENT_QUOTES,'UTF-8').'">':'';
}
