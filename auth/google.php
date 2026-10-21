<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';
require_once __DIR__.'/google-client.php';
try {
    if (!googleEnabled()) { throw new RuntimeException('Вхід через Google ще не підключений. Скористайтеся email.'); }
    if ($_SERVER['REQUEST_METHOD']==='POST') {
        authCsrf($_POST);
        if (strtolower((string)($_SERVER['HTTP_HOST'] ?? ''))!=='rubizh.shop') { throw new RuntimeException('Відкрийте rubizh.shop та почніть вхід ще раз.'); }
        $mode=$_POST['mode'] ?? 'login';
        if (!in_array($mode,['login','link'],true)) { throw new RuntimeException('Почніть вхід ще раз.'); }
        $actor=customerId(); if ($mode==='link' && $actor===null) { throw new RuntimeException('Спочатку увійдіть до кабінету.'); }
        if ($mode==='login' && $actor!==null) { throw new RuntimeException('Для іншого акаунта спочатку вийдіть.'); }
        unset($_SESSION['identity_pending'],$_SESSION['sms_challenge'],$_SESSION['identity_merge']);
        $state=bin2hex(random_bytes(32)); $nonce=bin2hex(random_bytes(32));
        $_SESSION['google_oauth']=['state'=>$state,'nonce'=>$nonce,'actor'=>$actor,'expires'=>time()+600,'mode'=>$mode];
        $url='https://accounts.google.com/o/oauth2/v2/auth?'.http_build_query([
            'client_id'=>authConfig()['google_client_id'],'redirect_uri'=>'https://rubizh.shop/auth/google.php',
            'response_type'=>'code','scope'=>'openid email profile','state'=>$state,'nonce'=>$nonce,'prompt'=>'select_account'
        ],'','&',PHP_QUERY_RFC3986);
        header('Location: '.$url,true,303); exit;
    }
    if ($_SERVER['REQUEST_METHOD']!=='GET') { http_response_code(405); header('Allow: GET, POST'); exit; }
    $flow=$_SESSION['google_oauth'] ?? null; unset($_SESSION['google_oauth']);
    $state=$_GET['state'] ?? '';
    if (!is_array($flow) || (int)($flow['expires'] ?? 0)<=time() || !is_string($state)
        || !hash_equals($flow['state'],$state) || customerId()!==$flow['actor']) { throw new RuntimeException('Вхід через Google прострочений. Спробуйте ще раз.'); }
    if (isset($_GET['error'])) { throw new RuntimeException('Вхід через Google скасовано. Можна спробувати ще раз або обрати інший спосіб.'); }
    $code=$_GET['code'] ?? '';
    if (!is_string($code) || $code==='' || strlen($code)>4096) { throw new RuntimeException('Почніть вхід через Google ще раз.'); }
    $claims=googleExchange($code,$flow['nonce']); $owner=identityFind('google',$claims['sub']);
    if ($flow['mode']==='link') {
        if ($owner!==null && $owner!==$flow['actor']) { throw new RuntimeException('Цей Google уже прив’язано до іншого кабінету. Увійдіть через нього та підтвердьте свій телефон для об’єднання.'); }
        if (customerVerifiedPhone($flow['actor'])!=='') {
            identityTransaction(fn(PDO $db)=>identityAttach($db,$flow['actor'],'google',$claims['sub'],$claims['email']));
            $_SESSION['flash']='Google прив’язано. Телефон і Google відкривають один кабінет.';
            header('Location: /auth/?tab=security',true,303); exit;
        }
    } elseif ($owner!==null && customerVerifiedPhone($owner)!=='') {
        customerLogin($owner,'google'); header('Location: /auth/',true,303); exit;
    }
    authPendingSet($claims+['actor'=>$flow['actor']]);
    header('Location: /auth/?phone=1',true,303); exit;
} catch (Throwable $e) {
    // 5.6.3: the cause reaches the PHP log (class and place); the buyer keeps the short message.
    error_log('rubizh google sign-in: '.get_class($e).' at '.basename($e->getFile()).':'.$e->getLine());
    $_SESSION['auth_error']=$e instanceof RuntimeException && !($e instanceof PDOException) ? $e->getMessage() : 'Вхід тимчасово недоступний. Спробуйте пізніше.';
    header('Location: /auth/',true,303); exit;
}
