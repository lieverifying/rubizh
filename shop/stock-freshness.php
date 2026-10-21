<?php
declare(strict_types=1);
// Stage 5.1 (owner 2026-10-16): supplier data freshness, applied by SITE on the server. The owner imports supplier files
// once a week; the age of a SKU's data (the supplier's stock_observed_at, else the PIM import time stock_imported_at) decides:
//   age ≤ pay_fresh_hours (default 72 h)                 → as PIM sent it (direct payment; the D-52 quantity limit applies);
//   pay_fresh_hours < age ≤ sell_max_days (default 8 d)  → still sold, but only through «Очікує підтвердження менеджера»
//                                                           (no MonoPay before the manager confirms), like a preorder;
//   age > sell_max_days                                  → not orderable; a model with no other orderable SKU is hidden from
//                                                           the storefront (not deleted) until fresh data arrives.
// Both thresholds are owner settings in PIM, sent with the sync batch (freshness_policy) and kept in meta. A SKU whose
// availability the owner set by hand in PIM (availability_source MANUAL) has no age. A SKU without any data time, or with a
// time more than a day ahead, is never treated as fresh: it is sold through manager confirmation (fail closed, review M3).
// The stored permission columns are what PIM allows now (a sync writes them); the age only ever narrows them, and data only
// gets older between syncs. The flags PIM sent also stay in variants.data: when the owner changes the policy, the columns are
// recomputed from them (a looser policy may widen again). Every reader (catalog, product, filters, sitemap, checkout) sees
// the same state (K6).

const SHOP_FRESHNESS_DEFAULT=['version'=>1,'pay_fresh_hours'=>72,'sell_max_days'=>8];
const SHOP_FRESHNESS_HIDE_REASON='STALE_SUPPLIER_DATA';
const SHOP_FRESHNESS_CONFIRM_NOTE='Менеджер підтвердить наявність перед оплатою';

/** Errors of a freshness_policy object from PIM (empty = valid). */
function shopFreshnessPolicyErrors(mixed $p): array {
    if(!is_array($p)||array_is_list($p))return ['FRESHNESS_POLICY'];
    $errors=[];
    if(array_diff(array_keys($p),['version','pay_fresh_hours','sell_max_days']))$errors[]='FRESHNESS_POLICY_FIELDS';
    if(($p['version']??null)!==1)$errors[]='FRESHNESS_POLICY_VERSION';
    $pay=$p['pay_fresh_hours']??null;$sell=$p['sell_max_days']??null;
    if(!is_int($pay)||$pay<1||$pay>336)$errors[]='PAY_FRESH_HOURS';
    if(!is_int($sell)||$sell<1||$sell>60)$errors[]='SELL_MAX_DAYS';
    if(is_int($pay)&&is_int($sell)&&$sell*24<=$pay)$errors[]='SELL_MAX_DAYS_NOT_AFTER_PAY';
    return $errors;
}
/** The policy SITE applies: the last valid one PIM sent, else the defaults (read once per connection). */
function shopFreshnessPolicy(PDO $db): array {
    $key=spl_object_id($db);
    if(isset($GLOBALS['rubizh_freshness_policy'][$key]))return $GLOBALS['rubizh_freshness_policy'][$key];
    try{$raw=$db->query("SELECT v FROM meta WHERE k='pim_freshness_policy'")->fetchColumn();}catch(PDOException){$raw=false;}
    $p=is_string($raw)?json_decode($raw,true):null;
    return $GLOBALS['rubizh_freshness_policy'][$key]=shopFreshnessPolicyErrors($p)?SHOP_FRESHNESS_DEFAULT:$p;
}
function shopFreshnessPolicyStore(PDO $db,array $p): void {
    $db->prepare("INSERT INTO meta(k,v) VALUES('pim_freshness_policy',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([json_encode($p,JSON_THROW_ON_ERROR)]);
    unset($GLOBALS['rubizh_freshness_policy'][spl_object_id($db)]);
}
/**
 * What PIM sent for a variant: [order_submission_allowed, payment_allowed, requires_order_confirmation, stock_imported_at].
 * Full rows carry variants.data; the sweep selects only these JSON fields (j_*), never the whole document.
 */
function shopFreshnessRaw(array $v): array {
    $col=static fn(string $c)=>(int)($v[$c]??0)===1;
    if(array_key_exists('j_pay',$v)){
        $b=static fn($x,bool $fallback)=>$x===null||$x==='null'?$fallback:in_array(strtolower(trim((string)$x)),['true','1'],true);
        $ms=static fn($x)=>is_string($x)&&ctype_digit(trim($x))?(int)$x:null;
        return [$b($v['j_submit']??null,$col('pim_order_submission_allowed')),$b($v['j_pay'],$col('pim_payment_allowed')),$b($v['j_confirm']??null,$col('pim_requires_order_confirmation')),$ms($v['j_imported']??null),$ms($v['j_valid']??null)];
    }
    $raw=json_decode((string)($v['data']??''),true);$raw=is_array($raw)?$raw:[];
    $flag=static fn(string $k,string $c)=>array_key_exists($k,$raw)?(bool)$raw[$k]:$col($c);
    $imported=$raw['stock_imported_at']??null;$valid=$raw['stock_valid_until']??null;
    return [$flag('order_submission_allowed','pim_order_submission_allowed'),$flag('payment_allowed','pim_payment_allowed'),$flag('requires_order_confirmation','pim_requires_order_confirmation'),is_int($imported)&&$imported>0?$imported:null,is_int($valid)&&$valid>0?$valid:null];
}
/** Data time of a SKU: the supplier's observation time, else the PIM import time; null = unknown. */
function shopFreshnessDataTime(array $v): ?int {
    $observed=$v['pim_stock_observed_at']??null;
    if(is_numeric($observed)&&(int)$observed>0)return (int)$observed;
    return shopFreshnessRaw($v)[3];
}
/** FRESH | CONFIRM | HIDDEN for one variant row. */
function shopFreshnessTier(array $v,array $policy,?int $nowMs=null): string {
    if(($v['pim_availability_source']??null)==='MANUAL')return 'FRESH';
    $now=$nowMs??(int)floor(microtime(true)*1000);
    $time=shopFreshnessDataTime($v);
    // 5.7: «Прайс актуальний до» of a manual-price supplier — fresh until that date, which may be at most 62 days after the data
    // time itself (review: never measured from «now», so old data cannot become fresh again); then the rule below.
    $valid=shopFreshnessRaw($v)[4]??null;if($valid!==null&&$time!==null&&$now<=$valid&&$valid<=$time+62*86400000)return 'FRESH';
    if($time===null||$time>$now+86400000)return 'CONFIRM';
    $age=$now-$time;
    if($age<=$policy['pay_fresh_hours']*3600000)return 'FRESH';
    return $age<=$policy['sell_max_days']*86400000?'CONFIRM':'HIDDEN';
}
/** Effective permissions: the stored columns (or, $fromData, what PIM sent in variants.data), narrowed by the tier. */
function shopFreshnessFlags(array $v,string $tier,bool $fromData=false): array {
    if($fromData)[$submit,$pay,$confirm]=shopFreshnessRaw($v);
    else{$submit=(int)($v['pim_order_submission_allowed']??0)===1;$pay=(int)($v['pim_payment_allowed']??0)===1;$confirm=(int)($v['pim_requires_order_confirmation']??0)===1;}
    if($tier==='CONFIRM'&&$pay){$pay=false;$confirm=true;}
    if($tier==='HIDDEN'){$submit=false;$pay=false;}
    return ['pim_order_submission_allowed'=>(int)$submit,'pim_payment_allowed'=>(int)$pay,'pim_requires_order_confirmation'=>(int)$confirm,'availability'=>$pay?'in':($submit?'order':'out')];
}
/** The row with its effective columns and the tier (stock_freshness). */
function shopFreshnessApplyRow(PDO $db,array $v,?int $nowMs=null): array {
    $tier=shopFreshnessTier($v,shopFreshnessPolicy($db),$nowMs);
    return array_replace($v,shopFreshnessFlags($v,$tier),['stock_freshness'=>$tier]);
}
/**
 * Bring the stored effective columns and model visibility in line with the data age (review M1/M2):
 * - public reads: at most once a minute (claimed atomically in meta), after the response when the server allows it,
 *   at most 2 s of work per run, lock waits ≤ 2 s; what is not finished continues on the next run;
 * - sync: $productIds = the models just written, inside the sync transaction (no window where a stale model is listed);
 *   $fromData after a policy change: recompute from what PIM sent (variants.data), so a looser policy can widen again.
 * No locking scan: rows are read with only the needed JSON fields and each change is a conditional UPDATE that applies
 * only if the row still holds the same PIM data (revision, observation time, data hash). Returns the number of changed rows.
 */
function shopFreshnessSweep(PDO $db,bool $force=false,?array $productIds=null,bool $fromData=false): int {
    if(empty($GLOBALS['rubizh_pim_v3_columns']))return 0;
    $scoped=$productIds!==null;
    if($scoped){$productIds=array_values(array_unique(array_filter($productIds,'is_string')));if(!$productIds)return 0;}
    elseif($db->inTransaction())return 0;
    $now=time();
    if(!$scoped&&!$force){
        $claim=$db->prepare("UPDATE meta SET v=? WHERE k='pim_freshness_swept_at' AND CAST(v AS UNSIGNED)<=?");$claim->execute([(string)$now,$now-60]);
        if($claim->rowCount()!==1){$ins=$db->prepare("INSERT IGNORE INTO meta(k,v) VALUES('pim_freshness_swept_at',?)");$ins->execute([(string)$now]);if($ins->rowCount()!==1)return 0;}
    }elseif(!$scoped)$db->prepare("INSERT INTO meta(k,v) VALUES('pim_freshness_swept_at',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([(string)$now]);
    $policy=shopFreshnessPolicy($db);$nowMs=(int)floor(microtime(true)*1000);$deadline=microtime(true)+($scoped?60:2);$changed=0;$timeout=null;
    if(!$scoped)try{$timeout=(int)$db->query('SELECT @@SESSION.innodb_lock_wait_timeout')->fetchColumn();$db->exec('SET SESSION innodb_lock_wait_timeout=2');}catch(PDOException){$timeout=null;}
    try{
        $in=$scoped?' AND v.product_id IN ('.implode(',',array_fill(0,count($productIds),'?')).')':'';
        $q=$db->prepare("SELECT v.product_id,v.sku,v.pim_revision,v.pim_stock_observed_at,v.pim_availability_source,v.pim_order_submission_allowed,v.pim_payment_allowed,v.pim_requires_order_confirmation,v.availability,
            MD5(COALESCE(v.data,'')) data_md5,CASE WHEN JSON_VALID(v.data) THEN JSON_EXTRACT(v.data,'$.order_submission_allowed') END j_submit,CASE WHEN JSON_VALID(v.data) THEN JSON_EXTRACT(v.data,'$.payment_allowed') END j_pay,
            CASE WHEN JSON_VALID(v.data) THEN JSON_EXTRACT(v.data,'$.requires_order_confirmation') END j_confirm,CASE WHEN JSON_VALID(v.data) THEN JSON_EXTRACT(v.data,'$.stock_imported_at') END j_imported,CASE WHEN JSON_VALID(v.data) THEN JSON_EXTRACT(v.data,'$.stock_valid_until') END j_valid
            FROM variants v JOIN products p ON p.id=v.product_id WHERE p.pim_contract_version=3 AND v.pim_active=1$in ORDER BY v.product_id,v.sku");
        $q->execute($scoped?$productIds:[]);
        $set=$db->prepare('UPDATE variants SET pim_order_submission_allowed=?,pim_payment_allowed=?,pim_requires_order_confirmation=?,availability=? WHERE product_id=? AND sku=? AND pim_active=1 AND pim_revision<=>? AND pim_stock_observed_at<=>? AND MD5(COALESCE(data,\'\'))=?');
        $models=[];$current=null;$model=null;$complete=true;
        while($v=$q->fetch(PDO::FETCH_ASSOC)){
            if($v['product_id']!==$current){if($current!==null)$models[$current]=$model;$current=$v['product_id'];$model=['open'=>false,'best'=>'out'];
                if(microtime(true)>$deadline){$complete=false;$current=null;break;}}
            $tier=shopFreshnessTier($v,$policy,$nowMs);$f=shopFreshnessFlags($v,$tier,$fromData);
            if($tier!=='HIDDEN')$model['open']=true;
            $model['best']=$f['availability']==='in'||$model['best']==='in'?'in':($f['availability']==='order'||$model['best']==='order'?'order':'out');
            if((int)$v['pim_order_submission_allowed']!==$f['pim_order_submission_allowed']||(int)$v['pim_payment_allowed']!==$f['pim_payment_allowed']||(int)$v['pim_requires_order_confirmation']!==$f['pim_requires_order_confirmation']||$v['availability']!==$f['availability']){
                $set->execute([$f['pim_order_submission_allowed'],$f['pim_payment_allowed'],$f['pim_requires_order_confirmation'],$f['availability'],$v['product_id'],$v['sku'],$v['pim_revision'],$v['pim_stock_observed_at'],$v['data_md5']]);$changed+=$set->rowCount();
            }
        }
        if($current!==null)$models[$current]=$model;
        $q->closeCursor();
        // Models: only those whose SKUs were all seen in this run; hide/show are conditional, so a PIM hide always wins.
        $pin=$scoped?' AND id IN ('.implode(',',array_fill(0,count($productIds),'?')).')':'';
        $p=$db->prepare("SELECT id,visible,availability,pim_publication_reason FROM products WHERE pim_contract_version=3 AND (pim_publication_state='ACTIVE' OR pim_publication_reason='".SHOP_FRESHNESS_HIDE_REASON."')$pin ORDER BY id");
        $p->execute($scoped?$productIds:[]);$products=$p->fetchAll(PDO::FETCH_ASSOC);
        $hide=$db->prepare("UPDATE products SET visible=0,pim_publication_state='HIDDEN',pim_publication_reason='".SHOP_FRESHNESS_HIDE_REASON."',updated_at=UTC_TIMESTAMP() WHERE id=? AND visible=1 AND pim_publication_state='ACTIVE'");
        $show=$db->prepare("UPDATE products SET visible=1,pim_publication_state='ACTIVE',pim_publication_reason=NULL,updated_at=UTC_TIMESTAMP() WHERE id=? AND pim_publication_reason='".SHOP_FRESHNESS_HIDE_REASON."'");
        $best=$db->prepare('UPDATE products SET availability=? WHERE id=? AND availability<>?');
        foreach($products as $row){
            $id=$row['id'];$stale=$row['pim_publication_reason']===SHOP_FRESHNESS_HIDE_REASON;
            if(!array_key_exists($id,$models)){
                // No active SKU at all (size requests only) → no data age; models not reached in time wait for the next run.
                if($stale&&$complete){$c=$db->prepare("SELECT COUNT(*) FROM variants WHERE product_id=? AND pim_active=1");$c->execute([$id]);if((int)$c->fetchColumn()===0){$show->execute([$id]);$changed+=$show->rowCount();}}
                continue;
            }
            $m=$models[$id];
            if($stale&&$m['open']){$show->execute([$id]);$changed+=$show->rowCount();}
            elseif(!$stale&&!$m['open']&&(int)$row['visible']===1){$hide->execute([$id]);$changed+=$hide->rowCount();}
            $best->execute([$m['best'],$id,$m['best']]);$changed+=$best->rowCount();
        }
    }finally{if($timeout!==null)try{$db->exec('SET SESSION innodb_lock_wait_timeout='.$timeout);}catch(PDOException){}}
    // The sync bumps the catalog version and clears caches itself; a read-time sweep does it here.
    if($changed&&!$scoped){
        $db->prepare("INSERT INTO meta(k,v) VALUES('catalog_updated',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([gmdate('Y-m-d H:i:s').'-fresh-'.bin2hex(random_bytes(4))]);
        if(function_exists('shopCacheClear'))try{shopCacheClear();}catch(Throwable){}
    }
    return $changed;
}
/** Read-time hook: run the due sweep after the response when the server supports it, else now; never breaks a read. */
function shopFreshnessSweepOnRead(PDO $db): void {
    if(empty($GLOBALS['rubizh_pim_v3_columns'])||!empty($GLOBALS['rubizh_freshness_hooked']))return;
    $GLOBALS['rubizh_freshness_hooked']=true;
    $run=static function()use($db){try{shopFreshnessSweep($db);}catch(Throwable $e){error_log('rubizh freshness sweep: '.get_class($e));}};
    if(function_exists('fastcgi_finish_request')){register_shutdown_function(static function()use($run){@fastcgi_finish_request();$run();});return;}
    $run();
}
