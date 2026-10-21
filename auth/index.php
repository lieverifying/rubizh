<?php
declare(strict_types=1);
require __DIR__.'/bootstrap.php';require_once __DIR__.'/../shop/theme-bootstrap.php';
$message = (string)($_SESSION['auth_error'] ?? ''); unset($_SESSION['auth_error']);
$phoneView=false; $mergeView=false; $phoneValue=''; $challenge=null;
$googleReady=googleEnabled(); $smsReady=smsEnabled();
$success = false; $pending = false; $emailValue = ''; $linkSent = false; $resendAfter = 0;
$sentEmail = (string)($_SESSION['auth_pending_email'] ?? '');
$sentAt = (int)($_SESSION['auth_pending_sent_at'] ?? 0);
if ($sentEmail !== '' && $sentAt > 0 && time() - $sentAt < 2700) {
    if (($_GET['sent'] ?? '') === '1') { $linkSent = true; $emailValue = $sentEmail; $resendAfter = max(0, 60 - (time() - $sentAt)); }
    elseif (($_GET['change'] ?? '') === '1') { $emailValue = $sentEmail; }
}
$tab = is_string($_GET['tab'] ?? null) ? $_GET['tab'] : 'orders';
if (!in_array($tab, ['overview','orders','favorites','profile','delivery','security','donations'], true)) { $tab = 'overview'; }
if (isset($_SESSION['flash'])) { $message = (string)$_SESSION['flash']; $success = true; unset($_SESSION['flash']); }
$orderExplicit=!empty($_GET['order']);if(in_array($tab,['overview','security'],true))$tab=$tab==='overview'?'orders':'profile';
$orderView=in_array($_GET['view']??'',['active','history'],true)?$_GET['view']:'active';$preferences=['theme'=>'system','donation_channel'=>'viber','donation_phone'=>''];
$accountReady = false; $profile = []; $orders = []; $order = null; $orderStats = ['total'=>0,'active'=>0]; $ordersPage = 1; $ordersPages = 1;
function sendLink(string $recipient, string $link): void {
    // Stage 5.5 (D-80): the closed staging mode sends no e-mail; the login link is shown on the «check your mail» screen.
    if (rubizhStagingRelaxed()) { $_SESSION['staging_login_link']=$link; return; }
    $cfg = authConfig();
    $password = (string)($cfg['noreply_password'] ?? '');
    if ($password === '') { throw new RuntimeException('Пошта ще не налаштована. Зверніться до менеджера.'); }
    require_once __DIR__.'/mailer.php';
    rubizhSendLogin($recipient, $password, $link);
}
function validToken(string $token): bool { return (bool)preg_match('/^[a-f0-9]{64}$/D', $token); }
$token = $_GET['token'] ?? '';
if (!is_string($token)) { $token = ''; }
if ($_SERVER['REQUEST_METHOD']==='POST') {
    try {
        authCsrf($_POST);
        $action = $_POST['action'] ?? '';
        if ($action==='logout') {
            $_SESSION=[]; session_regenerate_id(true); $_SESSION['csrf']=bin2hex(random_bytes(32));
            header('Location: /auth/', true, 303); exit;
        }
        if ($action==='cancel_phone') {
            unset($_SESSION['identity_pending'],$_SESSION['sms_challenge'],$_SESSION['identity_merge']);
            header('Location: /auth/',true,303); exit;
        }
        if ($action==='phone_request') {
            unset($_SESSION['identity_merge']);
            if (!smsEnabled()) { throw new RuntimeException('SMS-вхід ще не підключений. Скористайтеся email.'); }
            $phoneValue=is_string($_POST['phone'] ?? null) ? $_POST['phone'] : '';
            $flow=authPending();
            if ($flow===null) { authPendingSet(['kind'=>'phone']); }
            $phoneView=true;
            phoneRequest($phoneValue);
            header('Location: /auth/?phone=1',true,303); exit;
        }
        if ($action==='phone_verify') {
            $phoneView=true; $code=is_string($_POST['code'] ?? null) ? $_POST['code'] : '';
            $phone=phoneVerify($code); $flow=authPending();
            if ($flow===null) { throw new RuntimeException('Почніть вхід ще раз.'); }
            $result=identityFinishPhone($phone);
            if ($result['merge']) {
                $_SESSION['identity_merge']=$result+['flow'=>$flow['flow'],'expires'=>time()+300];
                header('Location: /auth/?phone=1',true,303); exit;
            }
            customerLogin($result['id'],$result['method']);
            header('Location: /auth/',true,303); exit;
        }
        if ($action==='approve_merge') {
            $proof=$_SESSION['identity_merge'] ?? null; $flow=authPending();
            if (!is_array($proof) || $flow===null || ($proof['expires'] ?? 0)<=time() || !hash_equals($flow['flow'],$proof['flow'])) { throw new RuntimeException('Підтвердження прострочене. Почніть вхід ще раз.'); }
            $result=($proof['kind'] ?? '')==='email_link'
                ? identityFinishEmail($proof['actor'],$proof['email'],true)
                : identityFinishPhone($proof['phone'],true);
            customerLogin($result['id'],$result['method']); $_SESSION['flash']='Кабінети об’єднано. Замовлення та способи входу збережено.';
            header('Location: /auth/',true,303); exit;
        }
        if($action==='remove_favorite') {
            $id=customerId();if($id===null)throw new RuntimeException('Увійдіть до кабінету.');
            $product=customerField($_POST,'product_id',64);shopStoreDatabase()->prepare('DELETE FROM rubizh_favorites WHERE customer_id=? AND product_id=?')->execute([$id,$product]);
            header('Location: /auth/?tab=favorites',true,303);exit;
        }
        if ($action==='save_profile' || $action==='save_delivery') {
            if (customerId()===null) { throw new RuntimeException('Увійдіть, щоб зберегти дані.'); }
            $tab = $action==='save_profile' ? 'profile' : 'delivery';
            if ($action==='save_profile') { customerSaveProfile(customerId(), $_POST);shopSavePreferences(shopStoreDatabase(),customerId(),$_POST); }
            else { customerSaveDelivery(customerId(), $_POST); }
            $_SESSION['flash'] = $action==='save_profile' ? 'Особисті дані збережено.' : 'Адресу доставки збережено.';
            header('Location: /auth/?tab='.$tab, true, 303); exit;
        }
        if ($action==='request' || $action==='link_email') {
            $linkActor=$action==='link_email' ? customerId() : null;
            if ($action==='link_email' && $linkActor===null) { throw new RuntimeException('Спочатку увійдіть до кабінету.'); }
            $email = $_POST['email'] ?? '';
            if (!is_string($email)) { $email=''; }
            $email=trim($email); $emailValue=$email;
            if (strlen($email)>254 || !filter_var($email, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n<>]/', $email)) { throw new RuntimeException('Вкажіть коректну адресу email.'); }
            $email = strtolower($email);
            $db=database(); $now=time();
            // Серверне обмеження; REMOTE_ADDR не береться з підроблюваних HTTP-заголовків.
            $ip=hash('sha256',rubizhNetworkIdentity());
            $db->beginTransaction();
            $got=(int)$db->query("SELECT GET_LOCK('rubizh_auth_request',2)")->fetchColumn();
            if ($got!==1) { $db->rollBack(); throw new RuntimeException('Спробуйте за хвилину.'); }
            try {
                $q=$db->prepare('SELECT COUNT(*) FROM rubizh_auth_attempts WHERE created_at>? AND email=?'); $q->execute([$now-3600,$email]);
                $hour=(int)$q->fetchColumn();
                $q=$db->prepare('SELECT COUNT(*) FROM rubizh_auth_attempts WHERE email=? AND created_at>?'); $q->execute([$email,$now-60]);
                $recent=(int)$q->fetchColumn();
                $q=$db->prepare('SELECT COUNT(*) FROM rubizh_auth_attempts WHERE created_at>?'); $q->execute([$now-86400]);
                $global=(int)$q->fetchColumn();
                if ($hour>=3 || $recent>0)throw new RubizhHttpException(429,'Забагато запитів для цієї адреси. Зачекайте або увійдіть через телефон; також можна звернутися до менеджера.',$recent>0?60:3600);
                $q=$db->prepare('SELECT COUNT(*) FROM rubizh_auth_attempts WHERE created_at>? AND ip_hash=?');$q->execute([$now-3600,$ip]);$networkHour=(int)$q->fetchColumn();
                if(($networkHour>=30||$global>=100)&&!phoneCheckValid('email:'.$email)){phoneCheckIssue('email:'.$email);throw new PhoneCheckRequired('Підтверджуємо запит: натисніть «Отримати посилання» ще раз. Якщо не виходить — увійдіть через телефон або зверніться до менеджера.');}
                $q=$db->prepare('INSERT INTO rubizh_auth_attempts(email,ip_hash,created_at) VALUES(?,?,?)'); $q->execute([$email,$ip,$now]);
                $db->commit();
            } finally { if ($db->inTransaction()) { $db->rollBack(); } $db->query("SELECT RELEASE_LOCK('rubizh_auth_request')"); }
            $newToken=bin2hex(random_bytes(32)); $hash=hash('sha256',$newToken);
            $q=$db->prepare('INSERT INTO rubizh_auth_links(email,token_hash,ip_hash,created_at,expires_at) VALUES(?,?,?,?,?)'); $q->execute([$email,$hash,$ip,$now,$now+2700]);
            if ($linkActor!==null) { identityDatabase()->prepare('INSERT INTO rubizh_auth_link_targets(token_hash,customer_id) VALUES(?,?)')->execute([$hash,$linkActor]); }
            try { sendLink($email,'https://rubizh.shop/auth/?token='.$newToken); }
            catch (Throwable $e) { $q=$db->prepare('DELETE FROM rubizh_auth_links WHERE token_hash=?'); $q->execute([$hash]); throw $e; }
            $q=$db->prepare('DELETE FROM rubizh_auth_links WHERE expires_at<?'); $q->execute([$now-86400]);
            $q=$db->prepare('DELETE FROM rubizh_auth_attempts WHERE created_at<?'); $q->execute([$now-172800]);
            if ($linkActor!==null) { $_SESSION['flash']='Лист для прив’язки email надіслано. Відкрийте його на цьому пристрої.'; header('Location: /auth/?tab=security',true,303); exit; }
            $_SESSION['auth_pending_email'] = $email; $_SESSION['auth_pending_sent_at'] = time();
            header('Location: /auth/?sent=1', true, 303); exit;
        } elseif ($action==='consume') {
            $submitted=$_POST['token'] ?? '';
            if (!is_string($submitted) || !validToken($submitted)) { throw new RuntimeException('Посилання недійсне.'); }
            $activeCustomer=customerId(); $db=identityDatabase(); customerDatabase(); $db->beginTransaction();
            try {
                $q=$db->prepare('SELECT id,email FROM rubizh_auth_links WHERE token_hash=? AND used_at IS NULL AND expires_at>? FOR UPDATE'); $q->execute([hash('sha256',$submitted),time()]); $row=$q->fetch(PDO::FETCH_ASSOC);
                if (!$row) { throw new RuntimeException('Посилання вже використане або термін його дії минув. Запросіть нове.'); }
                $q=identityDatabase()->prepare('SELECT customer_id FROM rubizh_auth_link_targets WHERE token_hash=?'); $q->execute([hash('sha256',$submitted)]); $emailLinkActor=$q->fetchColumn();
                if ($emailLinkActor!==false && customerId()!==identityCanonical($emailLinkActor)) { throw new RuntimeException('Відкрийте посилання на пристрої, де запитували прив’язку email, та увійдіть у той самий кабінет.'); }
                $q=$db->prepare('UPDATE rubizh_auth_links SET used_at=? WHERE id=?'); $q->execute([time(),$row['id']]);
                $db->commit();
            } catch (Throwable $e) { if ($db->inTransaction()) { $db->rollBack(); } throw $e; }
            if ($emailLinkActor!==false) {
                $actor=identityCanonical($emailLinkActor); $result=identityFinishEmail($actor,$row['email']);
                if ($result['merge']) {
                    authPendingSet(['kind'=>'email_link','actor'=>$actor,'email'=>$row['email']]);
                    $_SESSION['identity_merge']=$result+['phone'=>customerVerifiedPhone($actor),'flow'=>authPending()['flow'],'expires'=>time()+300];
                    header('Location: /auth/?phone=1',true,303); exit;
                }
                customerLogin($actor,'email'); $_SESSION['flash']='Email прив’язано до цього кабінету.';
                header('Location: /auth/?tab=security',true,303); exit;
            }
            $owner=identityTransaction(fn(PDO $db)=>identityLegacyEmail($db,$row['email'],false));
            if ($smsReady && $owner===null) {
                authPendingSet(['kind'=>'email','email'=>$row['email'],'actor'=>null]);
                header('Location: /auth/?phone=1',true,303); exit;
            }
            $owner=$owner ?? customerResolve($row['email']); customerLogin($owner,'email');
            header('Location: /auth/', true, 303); exit;
        }
    } catch (RuntimeException $e) {if($e instanceof PhoneCheckRequired){http_response_code(428);header('Retry-After: 1');}if($e instanceof RubizhHttpException){http_response_code($e->status);if($e->retryAfter)header('Retry-After: '.$e->retryAfter);} $message=$e instanceof PDOException ? 'Сервер тимчасово недоступний. Спробуйте пізніше.' : $e->getMessage(); }
      catch (Throwable $e) { $message='Сервер тимчасово недоступний. Спробуйте пізніше.'; }
}
if ($token!=='') {
    try {
        if (!validToken($token)) { throw new RuntimeException('Посилання недійсне.'); }
        $q=database()->prepare('SELECT email FROM rubizh_auth_links WHERE token_hash=? AND used_at IS NULL AND expires_at>?'); $q->execute([hash('sha256',$token),time()]);
        $target=$q->fetchColumn();
        if (!$target) { throw new RuntimeException('Посилання вже використане або термін його дії минув. Запросіть нове.'); }
        $pending=true;
    } catch (Throwable $e) { $message='Посилання недійсне, використане або прострочене. Запросіть нове.'; }
}
$identityFlow=authPending();
if (!$pending && (($_GET['phone'] ?? '')==='1' || $phoneView) && ($smsReady || ($identityFlow['kind'] ?? '')==='email_link')) {
    $phoneView=true;
    if ($identityFlow===null) { authPendingSet(['kind'=>'phone']); $identityFlow=authPending(); }
    $challenge=($_GET['change_phone'] ?? '')==='1' ? null : phoneChallenge();
    if ($challenge) { $phoneValue=$challenge['phone']; $resendAfter=max(0,60-(time()-(int)$challenge['sent_at'])); }
    $proof=$_SESSION['identity_merge'] ?? null;
    $mergeView=is_array($proof) && (int)($proof['expires'] ?? 0)>time() && hash_equals($identityFlow['flow'],$proof['flow']);
}
try { $authed=customerId()!==null; } catch (Throwable $e) { $authed=isset($_SESSION['customer_id']) || isset($_SESSION['email']); $message='Кабінет тимчасово недоступний. Спробуйте пізніше.'; }
if ($authed && !$pending && !$phoneView) {
    try {
        $profile = customerProfile(customerId());$preferences=shopPreferences(shopStoreDatabase(),customerId());
        $orderStats = customerOrderStats(customerId());
        $ordersCount=customerOrdersCount(customerId(),$tab==='orders'?$orderView:null);$ordersPages = max(1,(int)ceil($ordersCount/20));
        $rawPage = $_GET['page'] ?? '1';
        if (is_string($rawPage) && preg_match('/^[1-9][0-9]{0,7}$/D', $rawPage)) { $ordersPage = min((int)$rawPage, $ordersPages); }
        $orders = customerOrders(customerId(), $tab==='orders' ? $ordersPage : 1,$tab==='orders'?$orderView:null);
        $requestedOrder = $_GET['order'] ?? '';if($tab==='orders'&&$requestedOrder===''&&!empty($orders))$requestedOrder=(string)$orders[0]['id'];
        if ($tab === 'orders' && is_string($requestedOrder) && preg_match('/^[1-9][0-9]{0,17}$/D', $requestedOrder)) {
            $order = customerOrder(customerId(), (int)$requestedOrder);
            if($order){$receipt=shopOrderReceipt(shopStoreDatabase(),(int)$order['id']);$order['donation']=$receipt['donation'];$order['donation_amount']=$receipt['donation_amount'];$order['donation_text']=$receipt['donation_text'];$order['receipt']=$receipt;$order['timeline']=shopTimeline(shopStoreDatabase(),npOrder(shopStoreDatabase(),(int)$order['id']));}
            if (!$order) { http_response_code(404); $message = 'Замовлення не знайдено.'; $success = false; }
        }
        $accountReady = true;$accountPhotos=shopOrderThumbs(shopStoreDatabase(),$orders);if($order)$accountPhotos+=shopOrderThumbs(shopStoreDatabase(),[$order]);
        if ($_SERVER['REQUEST_METHOD'] === 'POST' && !$success) {
            foreach (['first_name','last_name','phone','delivery_type','city','delivery_address'] as $key) {
                if (isset($_POST[$key]) && is_string($_POST[$key])) { $profile[$key] = mb_substr($_POST[$key], 0, 240); }
            }
        }
    } catch (Throwable $e) { $message = 'Не вдалося завантажити кабінет. Оновіть сторінку або спробуйте пізніше.'; $success = false; }
}
?>
<!doctype html><html lang="uk"><head><?=shopThemeMarkup($accountReady?$preferences['theme']:null)?><meta name="rubizh-csrf" content="<?=esc($_SESSION['csrf'])?>"><meta name="rubizh-authed" content="<?=$authed?'1':'0'?>"><script src="/assets/theme.js?v=4"></script><link rel="stylesheet" href="/assets/theme.css?v=2"><meta charset="utf-8">
<link rel="icon" href="/favicon.ico?v=2" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png?v=2">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png?v=2">
<meta name="viewport" content="width=device-width,initial-scale=1"><script defer src="/auth/account-ui.js?v=2"></script><?php if(!empty($_SESSION['sms_check']['nonce'])):?><meta name="rubizh-sms-check" content="<?=esc($_SESSION['sms_check']['nonce'].':'.$_SESSION['sms_check']['bits'])?>"><?php endif;?><title><?=$authed && !$pending && !$phoneView ? 'Особистий кабінет' : 'Вхід'?> — РУБІЖ</title><link rel="stylesheet" href="/auth/account.css?v=6"><?php if (!$authed || $pending || $phoneView): ?><link rel="preload" as="image" href="/assets/hero-mobile.2026100602.webp" media="(max-width:980px)"><link rel="preload" as="image" href="/assets/hero-desktop.2026100602.webp" media="(min-width:981px)"><?php endif; ?><link rel="stylesheet" href="/assets/theme.css?v=2"><?php if (!$authed || $pending || $phoneView): ?><link rel="stylesheet" href="/auth/login-refresh.css?v=2"><?php endif; ?><?php if ($authed && !$pending && !$phoneView): ?><link rel="stylesheet" href="/auth/account-refresh.2026100606.css"><link rel="stylesheet" href="/auth/account-addendum.2026101102.css"><?php endif; ?><link rel="stylesheet" href="/assets/mobile-polish.2026100702.css"><link rel="stylesheet" href="/assets/form-fields.2026102101.css"></head><body class="<?=$authed && !$pending && !$phoneView ? 'cabinet-page' : 'login-page'?>">
<?php require __DIR__.'/header.php'; ?>
<main class="<?=$authed && !$pending && !$phoneView ? 'account-main' : 'auth-main'?>">
<?php if ($authed && !$pending && !$phoneView): ?>
<?php if ($message !== ''): ?><div class="msg <?=$success ? 'msg-success' : 'msg-error'?>" role="<?=$success ? 'status' : 'alert'?>"><?=esc($message)?></div><?php endif; ?>
<?php require __DIR__.'/account-view.php'; ?>
<?php else: ?><?php require __DIR__.'/login-view.php'; ?><?php endif; ?>
</main><?php if (($linkSent || $phoneView || !empty($_SESSION['sms_check'])) && !$pending): ?><script defer src="/auth/login.js?v=2"></script><?php endif; ?></body></html>
