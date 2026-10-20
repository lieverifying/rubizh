<?php
// РУБІЖ · API магазина: база, приём товаров из PIM, фото.
declare(strict_types=1);
ini_set('display_errors','0');

const API_VERSION = '1.3.0';
const SCHEMA_VERSION = 4;
require_once __DIR__.'/../shop/runtime.php';
require_once __DIR__ . '/perf.php';
require_once __DIR__.'/database.php';
require_once __DIR__.'/../shop/pricing-policy.php';
require_once __DIR__.'/../shop/units.php';
require_once __DIR__.'/../shop/normalization.php';
require_once __DIR__.'/../shop/taxonomy.php';
require_once __DIR__.'/../shop/pim-v3-read.php';
require_once __DIR__.'/../shop/stock-freshness.php';

function cfg(string $k = null) {
  static $c = null;
  if ($c === null) {
    $f = __DIR__ . '/config.php';
    if (!is_file($f)) fail(500, 'Нет файла api/config.php — скопируйте config.sample.php и заполните');
    $c = require $f;
    $private=__DIR__.'/np-private.php';if(is_file($private))$c=array_replace($c,require $private);
    $monoPrivate=__DIR__.'/mono-private.php';if(is_file($monoPrivate)){if(!defined('RUBIZH_PRIVATE_CONFIG'))define('RUBIZH_PRIVATE_CONFIG',true);$c=array_replace($c,require $monoPrivate);}
    require_once __DIR__.'/../shop/settings-lib.php';$settings=shopSettingsRead();if(isset($settings['seller']))$settings['seller']=array_replace(is_array($c['seller']??null)?$c['seller']:[],$settings['seller']);$c=array_replace($c,$settings);
  }
  if($k!==null&&in_array($k,['np_origin_refs','np_sender','np_staff_origin'],true)&&array_key_exists($k,$GLOBALS['crm_domain_config']??[]))return $GLOBALS['crm_domain_config'][$k];
  return $k === null ? $c : ($c[$k] ?? null);
}

function db(): PDO {
  static $pdo = null;
  if ($pdo) return $pdo;
  try {
    shopPerfStart(); $pdoClass = shopPerfOn() ? 'RubizhPDO' : 'PDO';
    $pdo = rubizhDatabaseConnect(cfg(), $pdoClass);
  } catch (Throwable $e) {
    fail(500, 'Нет подключения к базе MySQL: проверьте данные в config.php');
  }
  if (shopPerfOn()) $pdo->setAttribute(PDO::ATTR_STATEMENT_CLASS, ['RubizhStatement', []]);
  if(!empty($GLOBALS['rubizh_public_query_budget'])){
    $server=(string)$pdo->getAttribute(PDO::ATTR_SERVER_VERSION);
    try{$pdo->exec(stripos($server,'mariadb')!==false?'SET SESSION max_statement_time=6':'SET SESSION MAX_EXECUTION_TIME=6000');}
    catch(PDOException $e){error_log('rubizh public SQL deadline unavailable');}
  }
  migrate($pdo);
  pimV3DetectColumns($pdo);
  // Stage 5.1: supplier data age → stored payment/visibility state (at most once a minute, after the response; never breaks a read).
  shopFreshnessSweepOnRead($pdo);
  return $pdo;
}

// Таблицы создаются сами при первом обращении
function migrate(PDO $pdo): void {
  try { $v=(int)$pdo->query("SELECT v FROM meta WHERE k='schema'")->fetchColumn(); if($v>=SCHEMA_VERSION)return; }
  catch(PDOException $e){if($e->getCode()!=='42S02')throw $e;}
  $schemaLock='rubizh-schema-'.substr(hash('sha256',(string)$pdo->query('SELECT DATABASE()')->fetchColumn()),0,32);
  $claim=$pdo->prepare('SELECT GET_LOCK(?,10)');$claim->execute([$schemaLock]);
  if((int)$claim->fetchColumn()!==1)throw new RuntimeException('Схема бази оновлюється; повторіть запит.');
  try {
  $pdo->exec("CREATE TABLE IF NOT EXISTS meta (k VARCHAR(64) PRIMARY KEY, v TEXT) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $v = (int)($pdo->query("SELECT v FROM meta WHERE k='schema'")->fetchColumn() ?: 0);
  if ($v >= SCHEMA_VERSION) return;
  $pdo->exec("CREATE TABLE IF NOT EXISTS categories (
    id CHAR(40) PRIMARY KEY, path VARCHAR(600) NOT NULL, name VARCHAR(255) NOT NULL, slug VARCHAR(255) NOT NULL,
    url_path VARCHAR(700) NOT NULL, parent_id CHAR(40) NULL, depth TINYINT NOT NULL, sort INT NOT NULL DEFAULT 0,
    product_count INT NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL,
    KEY parent (parent_id), KEY url (url_path(191))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $pdo->exec("CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(64) PRIMARY KEY, slug VARCHAR(191) NOT NULL, name VARCHAR(500) NOT NULL, brand VARCHAR(191) NOT NULL DEFAULT '',
    category_id CHAR(40) NULL, category_path VARCHAR(600) NOT NULL DEFAULT '', description MEDIUMTEXT, attributes MEDIUMTEXT,
    links TEXT, has_docs TINYINT NOT NULL DEFAULT 0, docs_note VARCHAR(255) NOT NULL DEFAULT '',
    price_min INT NULL, price_max INT NULL, availability VARCHAR(10) NOT NULL DEFAULT 'out', variants_count INT NOT NULL DEFAULT 0,
    visible TINYINT NOT NULL DEFAULT 1, hash CHAR(40) NOT NULL DEFAULT '', data MEDIUMTEXT,
    created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, synced_at DATETIME NOT NULL,
    UNIQUE KEY slug (slug), KEY cat (category_id), KEY vis (visible, availability), KEY price (price_min)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $pdo->exec("CREATE TABLE IF NOT EXISTS variants (
    sku VARCHAR(64) PRIMARY KEY, product_id VARCHAR(64) NOT NULL, size VARCHAR(120) NOT NULL DEFAULT '', color VARCHAR(120) NOT NULL DEFAULT '',
    barcode VARCHAR(64) NOT NULL DEFAULT '', price INT NULL, kit_price INT NULL, availability VARCHAR(10) NOT NULL DEFAULT 'out',
    lead_time VARCHAR(60) NOT NULL DEFAULT '', sort INT NOT NULL DEFAULT 0, data TEXT,
    KEY prod (product_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $pdo->exec("CREATE TABLE IF NOT EXISTS photos (
    id INT AUTO_INCREMENT PRIMARY KEY, product_id VARCHAR(64) NOT NULL, pos INT NOT NULL, src_url TEXT NOT NULL, src_hash CHAR(40) NOT NULL,
    file VARCHAR(255) NOT NULL DEFAULT '', thumb VARCHAR(255) NOT NULL DEFAULT '', width INT NOT NULL DEFAULT 0, height INT NOT NULL DEFAULT 0,
    status VARCHAR(10) NOT NULL DEFAULT 'pending', error VARCHAR(255) NOT NULL DEFAULT '', tries INT NOT NULL DEFAULT 0, updated_at DATETIME NOT NULL,
    UNIQUE KEY prodpos (product_id, pos), KEY st (status), KEY src (src_hash)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $pdo->exec("CREATE TABLE IF NOT EXISTS sync_log (
    id INT AUTO_INCREMENT PRIMARY KEY, at DATETIME NOT NULL, mode VARCHAR(10) NOT NULL, received INT NOT NULL, saved INT NOT NULL,
    unchanged INT NOT NULL, hidden INT NOT NULL, errors INT NOT NULL, note VARCHAR(255) NOT NULL DEFAULT ''
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  // Private fulfillment data: never included in product cards or public API responses.
  $pdo->exec("CREATE TABLE IF NOT EXISTS rubizh_catalog_fulfillment (
    sku VARCHAR(64) PRIMARY KEY, product_id VARCHAR(64) NOT NULL,
    supplier_name VARCHAR(191) NOT NULL, updated_at DATETIME NOT NULL,
    KEY product_id (product_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $pdo->exec("CREATE TABLE IF NOT EXISTS rubizh_catalog_supplier_articles (
    sku VARCHAR(64) PRIMARY KEY, product_id VARCHAR(64) NOT NULL,
    supplier_name VARCHAR(191) NOT NULL, supplier_sku VARCHAR(120) NOT NULL,
    updated_at DATETIME NOT NULL, KEY product_id(product_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $pdo->exec("CREATE TABLE IF NOT EXISTS rubizh_catalog_pricing(sku VARCHAR(64) PRIMARY KEY,product_id VARCHAR(64) NOT NULL,policy_json TEXT NOT NULL,revision CHAR(64) NOT NULL,updated_at DATETIME NOT NULL,KEY product_id(product_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
  $pdo->exec('ALTER TABLE variants MODIFY price DECIMAL(14,2) NULL, MODIFY kit_price DECIMAL(14,2) NULL');
  $pdo->exec('ALTER TABLE products MODIFY price_min DECIMAL(14,2) NULL, MODIFY price_max DECIMAL(14,2) NULL');
  $pdo->exec("INSERT IGNORE INTO meta(k,v) VALUES('pricing_catalog_version','legacy')");
  $pdo->exec("INSERT INTO meta (k,v) VALUES ('schema','" . SCHEMA_VERSION . "') ON DUPLICATE KEY UPDATE v=VALUES(v)");
  }finally{$release=$pdo->prepare('SELECT RELEASE_LOCK(?)');$release->execute([$schemaLock]);}
}

/* ---------- HTTP ---------- */
function out($data, int $code = 200): void {
  http_response_code($code);
  header('Content-Type: application/json; charset=utf-8');
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
  exit;
}
function fail(int $code, string $msg): void { out(['ok' => false, 'error' => $msg], $code); }
function now(): string { return gmdate('Y-m-d H:i:s'); }
function body(): array {
  $limit=16*1024*1024;
  if((int)($_SERVER['CONTENT_LENGTH']??0)>$limit)fail(413,'Запрос слишком большой');
  $raw = file_get_contents('php://input',false,null,0,$limit+1) ?: '';
  if(strlen($raw)>$limit)fail(413,'Запрос слишком большой');
  $j = json_decode($raw, true,64);
  if (!is_array($j)) fail(400, 'Тело запроса не JSON');
  return $j;
}
function cors(bool $pim): void {
  $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
  if ($pim) {
    $allowed = cfg('pim_origins') ?: [];
    if ($origin && (in_array($origin, $allowed, true) || in_array('*', $allowed, true))) header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Headers: Authorization, Content-Type, X-Backup-Sha256, X-Backup-Label');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Expose-Headers: X-Supplier-Content-Type, X-Supplier-Last-Modified');
    header('Vary: Origin');
  } else {
    header('Access-Control-Allow-Origin: *');
  }
  if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }
}
function require_pim(): void {
  $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
  if (!$h && function_exists('getallheaders')) { foreach (getallheaders() as $k => $v) if (strtolower($k) === 'authorization') $h = $v; }
  $key = (string)cfg('pim_key');
  if (strlen($key) < 24 || str_contains($key, 'ЗАМЕНИТЕ')) fail(500, 'В config.php не задан pim_key (минимум 24 символа)');
  // Rotation without downtime (stage 5): an optional pim_key_next is accepted too until the owner promotes it. A weak,
  // placeholder or duplicate next key fails closed. Both keys are always compared (no short-circuit on the first).
  $next = cfg('pim_key_next');$next = $next === null ? '' : (string)$next;
  // A weak, placeholder or duplicate next key is never honoured (logged, not revealed to anonymous callers).
  if ($next !== '' && (strlen($next) < 24 || str_contains($next, 'ЗАМЕНИТЕ') || hash_equals($key, $next))) {error_log('rubizh: pim_key_next ignored (weak, placeholder or equal to pim_key)');$next = '';}
  $given = trim((string)$h);
  $current = hash_equals('Bearer ' . $key, $given);
  $nextOk = $next !== '' && hash_equals('Bearer ' . $next, $given);
  if (!$current && !$nextOk) {
    // Failed keys are counted per network (stage 5 review): guessing is throttled.
    require_once __DIR__.'/../shop/runtime.php';
    if (!rubizhRateAllow('pim-auth-fail', rubizhNetworkIdentity(), 30, 600)) {header('Retry-After: 600');fail(429, 'Забагато невдалих спроб. Спробуйте пізніше.');}
    fail(401, 'Неверный ключ PIM');
  }
  $GLOBALS['rubizh_pim_key_slot'] = $current ? 'current' : 'next';
  $GLOBALS['rubizh_pim_key_rotation'] = $next !== '';
}

/* ---------- приём товаров ---------- */
function slugify(string $s): string {
  static $tr = ['а'=>'a','б'=>'b','в'=>'v','г'=>'h','ґ'=>'g','д'=>'d','е'=>'e','є'=>'ie','ж'=>'zh','з'=>'z','и'=>'y','і'=>'i','ї'=>'i','й'=>'i','к'=>'k','л'=>'l','м'=>'m','н'=>'n','о'=>'o','п'=>'p','р'=>'r','с'=>'s','т'=>'t','у'=>'u','ф'=>'f','х'=>'kh','ц'=>'ts','ч'=>'ch','ш'=>'sh','щ'=>'shch','ь'=>'','ю'=>'iu','я'=>'ia','’'=>'',"'"=>'','ʼ'=>'','ы'=>'y','э'=>'e','ё'=>'e','ъ'=>''];
  $s = mb_strtolower($s, 'UTF-8'); $o = '';
  foreach (preg_split('//u', $s, -1, PREG_SPLIT_NO_EMPTY) as $ch) $o .= $tr[$ch] ?? $ch;
  return trim(preg_replace('/[^a-z0-9]+/', '-', $o), '-');
}
const AVAIL = ['in' => 3, 'order' => 2, 'out' => 1];
function clean_avail($a): string {
  $a = (string)$a;
  $map = ['in_stock' => 'in', 'available' => 'in', 'backorder' => 'order', 'preorder' => 'order', 'out_of_stock' => 'out','IN_STOCK'=>'in','ORDER_ON_REQUEST'=>'order','order_on_request'=>'order','OUT_OF_STOCK'=>'out'];
  $a = $map[$a] ?? $a;
  return isset(AVAIL[$a]) ? $a : 'out';
}

function sync_categories(PDO $pdo, array $cats): void {
  if(shopTaxonomyActive($pdo))return; // Canonical definitions are versioned, never recreated from PIM labels.
  $st = $pdo->prepare("INSERT INTO categories (id,path,name,slug,url_path,parent_id,depth,sort,product_count,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)
    ON DUPLICATE KEY UPDATE name=VALUES(name), slug=VALUES(slug), url_path=VALUES(url_path), parent_id=VALUES(parent_id), depth=VALUES(depth), sort=VALUES(sort), updated_at=VALUES(updated_at)");
  $seen = [];
  foreach ($cats as $i => $c) {
    $path = trim((string)($c['path'] ?? '')); if ($path === '') continue;
    $parts = array_values(array_filter(array_map('trim', explode(' / ', $path)), 'strlen'));
    $path = implode(' / ', $parts);
    $id = sha1($path); $seen[] = $id;
    $parent = count($parts) > 1 ? sha1(implode(' / ', array_slice($parts, 0, -1))) : null;
    $url = implode('/', array_map('slugify', $parts));
    $st->execute([$id, $path, end($parts), slugify(end($parts)), $url, $parent, count($parts), $i, 0, now()]);
  }
  // Keep historical categories and URLs: a partial PIM tree must never delete them.

}

function recount_categories(PDO $pdo): void {
  if(shopTaxonomyActive($pdo))return; // Historical tree stays available for rollback; public counts come from canonical relations.
  $pdo->exec("UPDATE categories SET product_count=0");
  $rows = $pdo->query("SELECT category_path, COUNT(*) n FROM products WHERE visible=1 GROUP BY category_path")->fetchAll();
  $add = [];
  $create=$pdo->prepare("INSERT IGNORE INTO categories(id,path,name,slug,url_path,parent_id,depth,sort,product_count,updated_at) VALUES(?,?,?,?,?,?,?,9999,0,?)");
  foreach ($rows as $r) {
    $parts = array_values(array_filter(explode(' / ', (string)$r['category_path']), 'strlen'));
    for ($i = 1; $i <= count($parts); $i++) {
      $branch=array_slice($parts,0,$i);$path=implode(' / ',$branch);$k=sha1($path);
      if(!isset($add[$k]))$create->execute([$k,$path,end($branch),slugify(end($branch)),implode('/',array_map('slugify',$branch)),$i>1?sha1(implode(' / ',array_slice($branch,0,-1))):null,$i,now()]);
      $add[$k] = ($add[$k] ?? 0) + (int)$r['n'];
    }
  }
  $st = $pdo->prepare("UPDATE categories SET product_count=? WHERE id=?");
  foreach ($add as $id => $n) $st->execute([$n, $id]);
}

function unique_slug(PDO $pdo, string $slug, string $id): string {
  $slug = $slug !== '' ? mb_substr($slug, 0, 180) : 'tovar';
  $st = $pdo->prepare("SELECT id FROM products WHERE slug=? AND id<>?");
  $base = $slug; $n = 2;
  while (true) { $st->execute([$slug, $id]); if (!$st->fetchColumn()) return $slug; $slug = $base . '-' . $n++; }
}

function catalog_public_data(array $data): array {
  foreach($data as $key=>$value){
    if(is_string($key) && in_array(strtolower($key),['fulfillment_supplier','fulfillment_supplier_sku','supplier','suppliers','supplier_code','supplier_name','supplier_sku','cost','purchase_price','procurement_price','documents','docs','supplier_description','minimum_sale_price','discount_margin_floor_pct','supplier_payout','profit','profit_margin','pricing_rules','minimum_cents','_pricing','supplier_payment','buy_price','supplier_cost','cost_price','margin','margin_pct','target_margin_pct','tax_pct','acquiring_pct','pricing_policy','profit_after_donation','api_key','token','password'],true)){unset($data[$key]);continue;}
    if(is_array($value))$data[$key]=catalog_public_data($value);
  }
  return $data;
}
function sync_product_fulfillment(PDO $pdo, string $productId, array $rows): void {
  $pdo->prepare('DELETE FROM rubizh_catalog_fulfillment WHERE product_id=?')->execute([$productId]);
  $insert = $pdo->prepare('INSERT INTO rubizh_catalog_fulfillment(sku,product_id,supplier_name,updated_at) VALUES(?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE product_id=VALUES(product_id),supplier_name=VALUES(supplier_name),updated_at=VALUES(updated_at)');
  foreach ($rows as $sku=>$supplier) if ($supplier !== '') $insert->execute([$sku,$productId,$supplier]);
}
function sync_product_supplier_articles(PDO $pdo,string $id,array $rows): void {
 $pdo->prepare('DELETE FROM rubizh_catalog_supplier_articles WHERE product_id=?')->execute([$id]);
 $q=$pdo->prepare('INSERT INTO rubizh_catalog_supplier_articles(sku,product_id,supplier_name,supplier_sku,updated_at) VALUES(?,?,?,?,UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE product_id=VALUES(product_id),supplier_name=VALUES(supplier_name),supplier_sku=VALUES(supplier_sku),updated_at=VALUES(updated_at)');
 foreach($rows as $sku=>$r)if($r['supplier_name']!==''&&$r['supplier_sku']!=='')$q->execute([$sku,$id,$r['supplier_name'],$r['supplier_sku']]);
}
function catalog_order_articles(PDO $pdo,array $lines): array {
 $q=$pdo->prepare('SELECT supplier_name,supplier_sku FROM rubizh_catalog_supplier_articles WHERE sku=? AND product_id=?');$out=[];
 foreach($lines as $no=>$line){$q->execute([$line['sku'],$line['product_id']]);$r=$q->fetch(PDO::FETCH_ASSOC);if($r)$out[$no]=$r;}
 return $out;
}

final class PimLegacySyncRejected extends RuntimeException {
  public function __construct(public readonly string $reason) { parent::__construct($reason,409); }
}
function pimRequireLegacySync(): void {
  if(cfg('pim_legacy_sync')!==true)throw new PimLegacySyncRejected('LEGACY_SYNC_DISABLED');
}
/** Inspect the real column, independently of activation and migration metadata flags. */
function pimLegacyHasContractColumn(PDO $pdo): bool {
  static $known=null;if($known===null)$known=new WeakMap;
  if(isset($known[$pdo]))return true;
  $q=$pdo->query("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='products' AND column_name='pim_contract_version'");
  if((int)$q->fetchColumn()>0){$known[$pdo]=true;return true;}return false;
}
function pimAssertLegacyModels(PDO $pdo,array $ids): void {
  pimRequireLegacySync();
  if(!pimLegacyHasContractColumn($pdo))return;
  foreach(array_chunk(array_values(array_unique(array_filter(array_map(fn($id)=>trim((string)$id),$ids)))),500) as $chunk){
    $q=$pdo->prepare('SELECT id FROM products WHERE pim_contract_version=3 AND id IN ('.implode(',',array_fill(0,count($chunk),'?')).') LIMIT 1'.($pdo->inTransaction()?' FOR UPDATE':''));
    $q->execute($chunk);if($q->fetchColumn()!==false)throw new PimLegacySyncRejected('CONTRACT_V3_REQUIRED');
  }
}
/** Legacy writers serialize with contract-3 publication before inspecting model ownership. */
function pimLegacyWrite(PDO $pdo,callable $write): mixed {
  pimRequireLegacySync();$owns=!$pdo->inTransaction();
  if($owns)$pdo->beginTransaction();
  try {shopPricingCatalogVersion($pdo,true);$result=$write();if($owns){if(is_array($result)&&($result['status']??null)==='error')$pdo->rollBack();else $pdo->commit();}return $result;}
  catch(Throwable $e){if($owns&&$pdo->inTransaction())$pdo->rollBack();throw $e;}
}
function hide_unavailable(PDO $pdo,bool $hide): void {
  pimLegacyWrite($pdo,function()use($pdo,$hide){
    if(pimLegacyHasContractColumn($pdo)&&$pdo->query('SELECT id FROM products WHERE pim_contract_version=3 LIMIT 1 FOR UPDATE')->fetchColumn()!==false)throw new PimLegacySyncRejected('CONTRACT_V3_REQUIRED');
    $pdo->prepare("INSERT INTO meta(k,v) VALUES('hide_unavailable',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([$hide?'1':'0']);
  });
}
function save_product(PDO $pdo,array $p): array {
  $p['id']=trim((string)($p['id']??''));
  pimAssertLegacyModels($pdo,[$p['id']]);
  if(($categoryError=shopTaxonomySyncValidate($pdo,$p))!==null)return ['id'=>$p['id'],'status'=>'error','error'=>$categoryError];
  return pimLegacyWrite($pdo,function()use($pdo,$p){pimAssertLegacyModels($pdo,[(string)($p['id']??'')]);return pimSaveLegacyProduct($pdo,$p);});
}

function pimSaveLegacyProduct(PDO $pdo, array $p): array {
  if(!$pdo->inTransaction())return save_product($pdo,$p);
  shopPricingCatalogVersion($pdo,true);
  pimAssertLegacyModels($pdo,[(string)($p['id']??'')]);
  $id = trim((string)($p['id'] ?? ''));
  if ($id === '' || strlen($id) > 64) return ['id' => $id, 'status' => 'error', 'error' => 'нет id'];
  if(($categoryError=shopTaxonomySyncValidate($pdo,$p))!==null)return ['id'=>$id,'status'=>'error','error'=>$categoryError];
  $name = trim((string)($p['name'] ?? ''));
  $vars = is_array($p['variants'] ?? null) ? $p['variants'] : [];
  if ($name === '') return ['id' => $id, 'status' => 'error', 'error' => 'нет названия'];
  if (!$vars) return ['id' => $id, 'status' => 'error', 'error' => 'нет вариантов'];
  $seen=[];
  foreach($vars as $row){$sku=is_array($row)?trim((string)($row['sku']??'')):'';
    if($sku==='' || strlen($sku)>64 || isset($seen[$sku]))return ['id'=>$id,'status'=>'error','error'=>'Невірний або повторений SKU'];
    $seen[$sku]=true;
  }
  $policies=[];
  try {
    if(isset($p['pricing_policy_version'])&&$p['pricing_policy_version']!==1)throw new ShopPricingException('DISCOUNT_NOT_ALLOWED','Непідтримувана версія цін.');
    foreach($vars as &$v){
      if(in_array($v['availability']??'', ['ORDER_ON_REQUEST','order_on_request'],true))$v['order_on_request']=true;
      if(($v['pricing_policy_version']??null)===1&&($p['pricing_policy_version']??null)!==1)throw new ShopPricingException('DISCOUNT_NOT_ALLOWED','Товар без версії цін PIM.');
      if(($p['pricing_policy_version']??null)===1&&($v['pricing_policy_version']??null)!==1)throw new ShopPricingException('DISCOUNT_NOT_ALLOWED','SKU без версії цін PIM.');
      $policy=shopPricingPolicy($v);$policies[$v['sku']]=$policy;
      $v=array_replace($v,shopPricingPublic($policy));
    }unset($v);
    $owner=$pdo->prepare('SELECT product_id FROM variants WHERE sku=?');
    foreach(array_keys($seen) as $sku){$owner->execute([$sku]);$found=$owner->fetchColumn();if($found!==false&&$found!==$id)throw new ShopPricingException('INVALID_VARIANT','SKU вже належить іншому товару; потрібен підтверджений mapping.');}
  }catch(ShopPricingException $e){return ['id'=>$id,'status'=>'error','error'=>$e->getMessage(),'error_code'=>$e->reason];}
  $ownsTransaction=!$pdo->inTransaction();
  // A protected PIM sync may carry the chosen supplier for each variant.
  // Store it separately, then remove all private fields before hashing and saving public data.
  $hasFulfillment = false; $fulfillment = []; $hasArticles=false; $articles=[];
  foreach ($vars as &$v) {
    if (array_key_exists('fulfillment_supplier',$v) || array_key_exists('supplier',$v)) $hasFulfillment = true;
    $sku = trim((string)($v['sku'] ?? ''));
    $supplier = $v['fulfillment_supplier'] ?? $v['supplier'] ?? '';
    if ($sku !== '' && is_string($supplier)) $fulfillment[$sku] = mb_substr(trim($supplier),0,191);
    if(array_key_exists('fulfillment_supplier_sku',$v)){$hasArticles=true;$native=$v['fulfillment_supplier_sku'];if(!is_string($native)||mb_strlen($native)>120||preg_match('/[\x00-\x1f\x7f]/u',$native))return ['id'=>$id,'status'=>'error','error'=>'Невірний артикул постачальника'];$articles[$sku]=['supplier_name'=>$fulfillment[$sku]??'','supplier_sku'=>trim($native)];}
    unset($v['fulfillment_supplier'], $v['fulfillment_supplier_sku'], $v['supplier'], $v['supplier_code'], $v['cost'], $v['supplier_sku']);
  } unset($v);
  unset($p['fulfillment_supplier'], $p['supplier_code'], $p['supplier'], $p['suppliers'], $p['cost'], $p['docs'], $p['documents']);
  $p['variants'] = $vars;
  $p = catalog_public_data($p); $vars=$p['variants'];
  $p['attributes']=shopDescriptionAttributes((string)($p['description']??''),is_array($p['attributes']??null)?$p['attributes']:[]);
  $p['category']=shopCorrectCategory($name,(string)($p['category']??''));

  $hash = sha1(json_encode([$p,$policies], JSON_UNESCAPED_UNICODE));
  $old = $pdo->prepare("SELECT hash, visible FROM products WHERE id=?"); $old->execute([$id]); $o = $old->fetch();
  if ($o && $o['hash'] === $hash && (int)$o['visible'] === 1) {
    try {
      if($ownsTransaction)$pdo->beginTransaction();
      if ($hasFulfillment) sync_product_fulfillment($pdo,$id,$fulfillment);
      if($hasArticles)sync_product_supplier_articles($pdo,$id,$articles);
      $pdo->prepare("UPDATE products SET synced_at=? WHERE id=?")->execute([now(), $id]);
      shopPricingStore($pdo,$id,$policies);
      shopTaxonomySyncProduct($pdo,$p);
      if($ownsTransaction)$pdo->commit();
    } catch (Throwable $e) {
      if ($ownsTransaction && $pdo->inTransaction()) $pdo->rollBack();
      return ['id'=>$id,'status'=>'error','error'=>'Не вдалося оновити відправника товару.'];
    }
    return ['id' => $id, 'status' => 'unchanged'] + (($p['pricing_policy_version']??null)===1?['pricing_policy_version'=>1]:[]);
  }
  $path = implode(' / ', array_values(array_filter(array_map('trim', explode(' / ', (string)($p['category'] ?? ''))), 'strlen')));
  $prices = []; $best = 'out';
  foreach ($vars as $v) { $pr = shopMoneyValue(shopMoney($v['price'] ?? 0)); if ($pr > 0) $prices[] = $pr; $a = clean_avail($v['availability'] ?? 'out'); if (AVAIL[$a] > AVAIL[$best]) $best = $a; }
  $slug = unique_slug($pdo, slugify((string)($p['slug'] ?? '')) ?: slugify($name), $id);
  $p['slug'] = $slug;
  if($ownsTransaction)$pdo->beginTransaction();
  try {
    $pdo->prepare("INSERT INTO products (id,slug,name,brand,category_id,category_path,description,attributes,links,has_docs,docs_note,price_min,price_max,availability,variants_count,visible,hash,data,created_at,updated_at,synced_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE slug=VALUES(slug), name=VALUES(name), brand=VALUES(brand), category_id=VALUES(category_id), category_path=VALUES(category_path),
      description=VALUES(description), attributes=VALUES(attributes), links=VALUES(links), has_docs=VALUES(has_docs), docs_note=VALUES(docs_note),
      price_min=VALUES(price_min), price_max=VALUES(price_max), availability=VALUES(availability), variants_count=VALUES(variants_count), visible=1,
      hash=VALUES(hash), data=VALUES(data), updated_at=VALUES(updated_at), synced_at=VALUES(synced_at)")
      ->execute([$id, $slug, mb_substr($name, 0, 500), mb_substr((string)($p['brand'] ?? ''), 0, 191), $path ? sha1($path) : null, $path,
        (string)($p['description'] ?? ''), json_encode($p['attributes'] ?? new stdClass, JSON_UNESCAPED_UNICODE), json_encode($p['links'] ?? new stdClass, JSON_UNESCAPED_UNICODE),
        !empty($p['has_docs']) ? 1 : 0, mb_substr((string)($p['docs_note'] ?? ''), 0, 255), $prices ? min($prices) : null, $prices ? max($prices) : null, $best, count($vars),
        $hash, json_encode($p, JSON_UNESCAPED_UNICODE), now(), now(), now()]);
    $pdo->prepare("DELETE FROM variants WHERE product_id=?")->execute([$id]);
    $vs = $pdo->prepare("INSERT INTO variants (sku,product_id,size,color,barcode,price,kit_price,availability,lead_time,sort,data) VALUES (?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE product_id=VALUES(product_id), size=VALUES(size), color=VALUES(color), barcode=VALUES(barcode), price=VALUES(price), kit_price=VALUES(kit_price), availability=VALUES(availability), lead_time=VALUES(lead_time), sort=VALUES(sort), data=VALUES(data)");
    foreach ($vars as $i => $v) {
      $sku = trim((string)($v['sku'] ?? '')); if ($sku === '') continue;
      $vs->execute([$sku, $id, mb_substr((string)($v['size_display'] ?? $v['size'] ?? ''), 0, 120), mb_substr((string)($v['color'] ?? ''), 0, 120), mb_substr((string)($v['barcode'] ?? ''), 0, 64),
        ($v['price'] ?? null) !== null ? shopMoneyValue(shopMoney($v['price'])) : null, ($v['kit_price'] ?? null) !== null ? shopMoneyValue(shopMoney($v['kit_price'])) : null,
        clean_avail($v['availability'] ?? 'out'), mb_substr((string)($v['lead_time'] ?? ''), 0, 60), $i, json_encode($v, JSON_UNESCAPED_UNICODE)]);
    }
    if ($hasFulfillment) sync_product_fulfillment($pdo,$id,$fulfillment);
      if($hasArticles)sync_product_supplier_articles($pdo,$id,$articles);
    $pdo->prepare('DELETE f FROM rubizh_catalog_fulfillment f LEFT JOIN variants v ON v.sku=f.sku AND v.product_id=f.product_id WHERE f.product_id=? AND v.sku IS NULL')->execute([$id]);
    // Фото: новая ссылка или другой порядок → в очередь на скачивание; совпадающие не трогаем
    $photos = array_values(array_filter(array_map('strval', is_array($p['photos'] ?? null) ? $p['photos'] : []), fn($u) => preg_match('~^https?://~i', $u)));
    $cur = $pdo->prepare("SELECT pos, src_hash FROM photos WHERE product_id=?"); $cur->execute([$id]);
    $have = []; foreach ($cur->fetchAll() as $r) $have[(int)$r['pos']] = $r['src_hash'];
    $ins = $pdo->prepare("INSERT INTO photos (product_id,pos,src_url,src_hash,status,updated_at) VALUES (?,?,?,?, 'pending', ?)
      ON DUPLICATE KEY UPDATE src_url=VALUES(src_url), src_hash=VALUES(src_hash), file='', thumb='', status='pending', error='', tries=0, updated_at=VALUES(updated_at)");
    foreach ($photos as $pos => $u) { $h = sha1($u); if (($have[$pos] ?? null) !== $h) $ins->execute([$id, $pos, $u, $h, now()]); }
    $pdo->prepare("DELETE FROM photos WHERE product_id=? AND pos>=?")->execute([$id, count($photos)]);
    shopPricingStore($pdo,$id,$policies);
    shopTaxonomySyncProduct($pdo,$p);
    if($ownsTransaction)$pdo->commit();
  } catch (Throwable $e) {
    if($ownsTransaction&&$pdo->inTransaction())$pdo->rollBack();
    return ['id' => $id, 'status' => 'error', 'error' => 'Не вдалося атомарно зберегти товар і ціни.'];
  }
  return ['id' => $id, 'status' => $o ? 'updated' : 'created', 'slug' => $slug] + (($p['pricing_policy_version']??null)===1?['pricing_policy_version'=>1]:[]);
}

function hide_products(PDO $pdo,array $ids): int {
  return pimLegacyWrite($pdo,function()use($pdo,$ids){pimAssertLegacyModels($pdo,$ids);return pimHideLegacyProducts($pdo,$ids);});
}
function pimHideLegacyProducts(PDO $pdo, array $ids): int {
  if(!$pdo->inTransaction())return hide_products($pdo,$ids);
  shopPricingCatalogVersion($pdo,true);
  pimAssertLegacyModels($pdo,$ids);
  $ids = array_values(array_filter(array_map('strval', $ids), 'strlen'));
  if (!$ids) return 0;
  $n = 0;
  foreach (array_chunk($ids, 500) as $chunk) {
    $in = implode(',', array_fill(0, count($chunk), '?'));
    $st = $pdo->prepare("UPDATE products SET visible=0, updated_at=? WHERE visible=1 AND id IN ($in)");
    $st->execute(array_merge([now()], $chunk)); $n += $st->rowCount();
  }
  return $n;
}

/* ---------- фото: скачать, сжать в WebP, сохранить у себя ---------- */
function media_file_exists(string $rel): bool {
  if (!preg_match('~^p/[a-f0-9]{2}/[a-f0-9]{40}(?:-t)?\.webp$~D', $rel)) return false;
  $file=rtrim((string)cfg('media_dir'),'/').'/'.$rel;
  return is_file($file) && filesize($file)>0;
}
// Audit a bounded batch every worker run; an imported "ok" flag is not proof of a file.
function repair_photo_files(PDO $pdo, int $limit=250, bool $all=false): array {
  $cursor=$all?0:(int)$pdo->query("SELECT v FROM meta WHERE k='photos_file_cursor'")->fetchColumn();$checked=0;$missing=0;
  $update=$pdo->prepare("UPDATE photos SET status='pending',file='',thumb='',tries=0,error='',updated_at=UTC_TIMESTAMP() WHERE id=? AND status='ok'");
  do {
    $rows=$pdo->query("SELECT id,file,thumb FROM photos WHERE status='ok' AND id>".$cursor." ORDER BY id LIMIT ".max(1,$limit))->fetchAll(PDO::FETCH_ASSOC);
    foreach($rows as $r){$cursor=(int)$r['id'];$checked++;if(!media_file_exists((string)$r['file'])||!media_file_exists((string)$r['thumb'])){$update->execute([$r['id']]);$missing+=$update->rowCount();}}
  } while($all&&count($rows)===$limit);
  if(count($rows)<$limit)$cursor=0;
  $pdo->prepare("INSERT INTO meta(k,v) VALUES('photos_file_cursor',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([(string)$cursor]);
  if($missing)$pdo->prepare("INSERT INTO meta(k,v) VALUES('catalog_updated',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([now().'-photos-'.bin2hex(random_bytes(3))]);
  return ['checked'=>$checked,'missing_requeued'=>$missing];
}
function process_photos(PDO $pdo, int $limit = 40, float $budget = 20.0): array {
  if((int)$pdo->query("SELECT GET_LOCK('rubizh_photo_worker',0)")->fetchColumn()!==1)return ['processed'=>0,'errors'=>0,'skipped'=>'worker_busy'];
  try{return process_photos_locked($pdo,max(1,min(150,$limit)),max(.1,min(50.0,$budget)));}
  finally{$pdo->query("SELECT RELEASE_LOCK('rubizh_photo_worker')");}
}
function process_photos_locked(PDO $pdo, int $limit, float $budget): array {
  $t0 = microtime(true); $done = 0; $err = 0;
  require_once __DIR__.'/photo-storage.php';$dir=photo_storage_directory();
  repair_photo_files($pdo);
  $rows = $pdo->query("SELECT ph.id, ph.product_id, ph.pos, ph.src_url, ph.src_hash FROM photos ph JOIN products p ON p.id=ph.product_id WHERE ph.status='pending' OR (ph.status='error' AND ph.tries<3 AND ph.updated_at < (UTC_TIMESTAMP() - INTERVAL 1 HOUR)) ORDER BY p.visible DESC, ph.pos, ph.id LIMIT " . (int)$limit)->fetchAll();
  $upd = $pdo->prepare("UPDATE photos SET status=?, file=?, thumb=?, width=?, height=?, error=?, tries=tries+1, updated_at=? WHERE id=?");
  $same = $pdo->prepare("SELECT file, thumb, width, height FROM photos WHERE src_hash=? AND status='ok' LIMIT 1");
  foreach ($rows as $r) {
    if (microtime(true) - $t0 > $budget) break;
    $same->execute([$r['src_hash']]);
    if (($s = $same->fetch()) && media_file_exists((string)$s['file']) && media_file_exists((string)$s['thumb'])) { $upd->execute(['ok', $s['file'], $s['thumb'], $s['width'], $s['height'], '', now(), $r['id']]); $done++; continue; }
    try {
      [$file, $thumb, $w, $h] = fetch_to_webp($r['src_url'], $r['src_hash'], $dir,max(.1,$budget-(microtime(true)-$t0)));
      $upd->execute(['ok', $file, $thumb, $w, $h, '', now(), $r['id']]); $done++;
    } catch (Throwable $e) {
      $upd->execute(['error', '', '', 0, 0, mb_substr($e->getMessage(), 0, 250), now(), $r['id']]); $err++;
    }
  }
  $pending = (int)$pdo->query("SELECT COUNT(*) FROM photos WHERE status='pending'")->fetchColumn();
  $failed = (int)$pdo->query("SELECT COUNT(*) FROM photos WHERE status='error'")->fetchColumn();
  if($done>0)$pdo->prepare("INSERT INTO meta(k,v) VALUES('photos_last_progress',?) ON DUPLICATE KEY UPDATE v=VALUES(v)")->execute([now()]);
  return ['processed' => $done, 'errors' => $err, 'pending' => $pending, 'failed' => $failed];
}
function fetch_to_webp(string $url, string $hash, string $dir,float $timeout=20.0): array {
  require_once __DIR__.'/http-download.php';require_once __DIR__.'/photo-storage.php';
  return save_photo_webp(rubizhDownloadImage($url,$timeout),$hash,$dir);
}

/* ---------- отдача каталога сайту ---------- */
function media_url(string $rel): string { return rtrim((string)cfg('media_url'), '/') . '/' . ltrim($rel, '/'); }
function product_photos(PDO $pdo, array $ids): array {
  if (!$ids) return [];
  $in = implode(',', array_fill(0, count($ids), '?'));
  $st = $pdo->prepare("SELECT product_id, pos, src_url, src_hash, file, thumb, width, height, status FROM photos WHERE product_id IN ($in) ORDER BY product_id, pos");
  $st->execute($ids); $out = [];
  foreach ($st->fetchAll() as $r) {
    $ok = $r['status'] === 'ok' && media_file_exists((string)$r['file']);
    // Пока фото не обработано, отдаём ссылку поставщика — сайт не остаётся без картинок
    $out[$r['product_id']][] = ['url' => $ok ? media_url($r['file']) : $r['src_url'], 'thumb' => $ok ? media_url(media_file_exists((string)$r['thumb'])?$r['thumb']:$r['file']) : $r['src_url'], 'width' => (int)$r['width'], 'height' => (int)$r['height'], 'local' => $ok, 'key' => (string)($r['src_hash'] ?: sha1((string)$r['src_url']))];
  }
  return $out;
}
function card_row(array $r, array $photos): array {
  return ['id' => $r['id'], 'slug' => $r['slug'], 'name' => $r['name'], 'brand' => $r['brand'], 'category' => $r['category_path'],
    'price_min' => $r['price_min'] !== null ? (float)$r['price_min'] : null, 'price_max' => $r['price_max'] !== null ? (float)$r['price_max'] : null,
    'availability' => $r['availability'], 'variants_count' => (int)$r['variants_count'], 'has_docs' => (bool)$r['has_docs'],
    'photo' => $photos[$r['id']][0] ?? null];
}
