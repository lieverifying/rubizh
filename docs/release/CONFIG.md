# РУБІЖ SITE · RC1 · Справочник конфигурации

**Last Updated:** 2026-10-16
**Ревизия кода:** составлено по `6311e40`; код RC1 `24e27c4` — изменения этапа 3 (пакет, `.htaccess`, тесты) ключи конфигурации не затрагивают
**Источник:** только код репозитория (`path:line`). Значения секретов не приводятся.
**Статус:** RC1, production **NO-GO** (см. `docs/release-hardening/16-GO_LIVE.md:15`). Живые проверки банка, НП, SMS, почты и OAuth — этап 6.

**Связанные документы:** `docs/release-hardening/STAGE_CHECKPOINT.md`, `docs/release-hardening/08-RELEASE_READINESS.md`, [PRE_LAUNCH_BLOCKERS](PRE_LAUNCH_BLOCKERS.md), [CONTRACTS](CONTRACTS.md), [RC1_MANIFEST](RC1_MANIFEST.md).

---

## 0. Соглашения

| Колонка | Значение |
|---|---|
| Default (в коде) | Что делает код, если ключа нет или он пустой |
| Prod (рекомендация) | Рекомендуемое значение для production RC1 |
| Кто меняет | **Owner** (владелец решения), **Hosting** (администратор хостинга adm.tools), **Dev** (разработчик через защищённую CLI-команду), **UI** (менеджер через админ-страницу) |
| Риск | Что случится при неверном значении |

Пометка **BLOCKED(...)** означает, что значение нельзя выставить без входных данных владельца или хостинга (раздел 15).

Секреты указаны **только по именам**. Если в коде встречается литерал, похожий на секрет или реквизит, он не копируется, рядом стоит пометка «значение не приводится».

---

## 1. Источники конфигурации и приоритет

| Источник | Путь / механизм | Кто читает | Примечание |
|---|---|---|---|
| `api/config.php` | Личный файл хостинга (в `.gitignore`, `api/.htaccess:9` запрещает веб-доступ) | `cfg()` в `api/lib.php:17-27` | Без файла `cfg()` вызывает `fail(500)` (`api/lib.php:21`) |
| `api/np-private.php` | Тонкий файл из репозитория: читает `RUBIZH_NP_API_KEY` из окружения (`api/np-private.php:4`) | `cfg()` `api/lib.php:23` | Переопределяет `nova_poshta_api_key` |
| `api/mono-private.php` | Читает `RUBIZH_MONO_TOKEN` (`api/mono-private.php:5`); работает только при `RUBIZH_PRIVATE_CONFIG` | `cfg()` `api/lib.php:24` | Переопределяет `mono_token` |
| `api/site-settings.json` | Файл, создаётся админкой; 12 ключей (`shop/settings-lib.php:4`) | `cfg()` `api/lib.php:25` | **Побеждает** `config.php` для своих 12 ключей |
| `crm_domain_config` (GLOBAL) | `api/lib.php:27` | `cfg()` | Для `np_origin_refs`, `np_sender`, `np_staff_origin` имеет приоритет над всем остальным |
| `auth/config.php` | Личный файл (в `.gitignore`, `auth/.htaccess:3` запрещает веб-доступ) | `authConfig()` `auth/identities.php:8` | Отдельный файл, не `api/config.php` |
| Переменные окружения | `getenv()` (см. раздел 6) | `auth/identities.php:11-25`, `shop/np-lib.php:7`, `shop/mono-lib.php:4` | Для NP и MonoPay: env имеет приоритет (`?:`) над файлом |
| Приватная БД | `../rubizh-private/database.php` вне webroot (`api/database.php:6-17`) | `rubizhDatabaseSettings()` | Перекрывает `db_*` из `config.php`; обязательно `db_tls_required=true` |
| Таблица `meta` | Служебные флаги БД (раздел 7) | SQL в коде | Не настраивается из файлов |

**Порядок в `cfg()`** (`api/lib.php:17-27`): `config.php` → `np-private.php` → `mono-private.php` → `site-settings.json` (только свои ключи). Поздний источник побеждает.

**Ловушка:** значение `donation_*`, `ga4_id`, `meta_pixel_id`, `order_notification_email`, `seller`, `supplier_contacts`, `supplier_sku_map`, `instagram_url`, `tiktok_url` в `config.php` **не действует**, если такой же ключ уже сохранён в `site-settings.json`. См. раздел 14, пункт 3.

---

## 2. `api/config.php`: ключи из `api/config.sample.php`

Всего 42 ключа (`api/config.sample.php:5-53`). Этап 5 добавил `pim_key_next`, `pim_backup_dir`, `pim_backup_keep`, `pim_backup_max_bytes` (раздел 2.2, §3.1, §8); site-настройка `invoice_vat_note` — в разделе 10.

### 2.1 Инфраструктура и доступ

| Key | Тип | Default (в коде) | Prod (рекомендация) | Кто меняет | Риск при ошибке | Код |
|---|---|---|---|---|---|---|
| `trusted_proxies` | list<string> (IP / CIDR) | `[]`: `REMOTE_ADDR` используется как есть | Значение хостинга, **BLOCKED(PL-1)**. Пока `[]` | Hosting, после ответа хостинга | Неверный список: спуфинг IP и обход лимитов, либо общий IP для всех клиентов. См. раздел 4 | `api/config.sample.php:5`, `shop/runtime.php:53-66` |
| `db_host` | string | Нет (без него `db()` падает) | Адрес MySQL от хостинга | Hosting | Нет подключения, сайт не работает | `api/config.sample.php:7`, `api/database.php:20-26` |
| `db_name` | string, `^[a-zA-Z0-9_$-]{1,64}$` | Нет | Имя базы | Hosting | Ошибка валидации | `api/config.sample.php:8`, `api/database.php:20-26` |
| `db_user` | string | Нет | Отдельный пользователь приложения | Hosting | Права шире или уже нужного | `api/config.sample.php:9` |
| `db_pass` | string, **секрет** | Нет | **BLOCKED(Hosting)**. Лучше держать в `rubizh-private/database.php` (mode 0600) | Hosting | Утечка или неверный пароль | `api/config.sample.php:10` |
| `db_port` | int (только в private DB) | 3306 | Значение провайдера (если не 3306) | Hosting | Нет подключения | `api/database.php:24` |
| `db_tls_required` | bool (только в private DB) | Не задан: TLS не требуется | `true` для внешней БД | Hosting | Без TLS внешняя БД идёт открытым текстом. Если поле не `true`, файл отклоняется (`api/database.php:15`) | `api/database.php:15`, `api/database.php:30-40` |
| `db_tls_ca`, `db_tls_cert`, `db_tls_key` | path (только в private DB) | Не заданы | Пути к сертификатам хостинга вне webroot | Hosting | Ошибка TLS | `api/database.php:30-40` |
| `db_connect_timeout` | int 1…15 (private DB) | 5 | 5 | Hosting | Значения вне диапазона отклоняются | `api/database.php:26` |

### 2.2 PIM (подробно в разделе 3)

| Key | Тип | Default | Prod | Кто меняет | Риск | Код |
|---|---|---|---|---|---|---|
| `pim_legacy_sync` | bool | `false` (ключ не задан → запись отклоняется) | `false` | Owner (R1) | `true` открывает legacy-запись. Контракт 3 всё равно защищён | `api/config.sample.php:14`, `api/lib.php:235-237` |
| `pim_key` | string, **секрет**, ≥24 символов | Не задан → `require_pim()` отвечает 500 | Случайная строка ≥32 символов, **PL-3** (ротация) | Owner / Hosting; тот же ключ в PIM «Выгрузка → Сайт» | Утечка → запись каталога кем угодно. Значение с подстрокой `ЗАМЕНИТЕ` отклоняется | `api/config.sample.php:15`, `api/lib.php:143-150` |
| `pim_key_next` | string, **секрет**, ≥24 символов (необязательно) | Пусто: ротации нет | Пусто вне ротации; во время ротации (PL-3, §8) — новый ключ | Owner / Hosting; PIM «Новий ключ» → «Перевірити» → «Зробити основним» | Принимается наравне с `pim_key`. Короткий, с подстрокой `ЗАМЕНИТЕ` или равный `pim_key` — **игнорируется** с записью в `error_log` (сайт не отвечает 500 анониму). Забытый `pim_key_next` оставляет старый ключ рабочим | `api/config.sample.php:18`, `api/lib.php:148-152` |
| `pim_backup_dir` | path | `../../private/pim-backups` относительно `api/` (вне webroot) | Папка вне публичного корня, права 0700 (Hosting создаёт) | Hosting | Папка внутри публичного корня **отклоняется** (500 «не может быть в публичном корне сайта»). В папку пишется `.htaccess` с `Require all denied` (второй слой) | `api/config.sample.php:20`, `api/pim-private.php:56-65` |
| `pim_backup_keep` | int ≥1 | 14 | 14 | Owner | Меньше — старые копии удаляются раньше; больше — растёт место на диске | `api/config.sample.php:21`, `api/pim-private.php:101` |
| `pim_backup_max_bytes` | int (байты) | 67108864 (64 МБ) | 67108864 | Owner | Копия больше лимита → 413. Фактический потолок ещё и `post_max_size` хостинга | `api/config.sample.php:22`, `api/pim-private.php:74` |
| `pim_origins` | list<string> (URL) | `[]`: CORS для PIM не выдаётся | `['https://pim.rubizh.shop']` | Owner / Dev | Литерал `'*'` разрешает любой Origin | `api/config.sample.php:18`, `api/lib.php:130-141` |

### 2.3 Планировщик (cron)

| Key | Тип | Default | Prod | Кто меняет | Риск | Код |
|---|---|---|---|---|---|---|
| `cron_key` | string, **секрет**, ≥16 символов | Не задан: `/cron/photos` и mail-worker отвечают 401 | Случайная строка ≥32 символов, **PL-3** | Hosting (обновить crontab) | Утечка: любой может запускать воркеры по URL. Ротация без обновления cron останавливает очереди | `api/config.sample.php:21`, `api/index.php:100-102`, `shop/mail-worker.php:4` |

### 2.4 Фото и медиа

| Key | Тип | Default | Prod | Кто меняет | Риск | Код |
|---|---|---|---|---|---|---|
| `media_dir` | path | Не задан: `photo_storage_directory()` бросает «Неприпустима папка media» | Абсолютный путь к `media/` в webroot (`media/` в `.gitignore`) | Hosting | Фото не сохраняются, `/health` показывает фото недоступными | `api/config.sample.php:24`, `api/photo-storage.php:11-12`, `api/lib.php:405` |
| `media_url` | string (путь URL) | Не задан: пустая строка перед `/` | `/media` | Dev / Hosting | Битые ссылки на фото | `api/config.sample.php:25`, `api/lib.php:455` |
| `photo_max` | int | 1600 (`?:`), зажим 480…2400 | 1600 | Owner (качество) | Размер и трафик | `api/config.sample.php:26`, `api/photo-storage.php:50` |
| `thumb_max` | int | 480, зажим 240…640 | 480 | Owner | То же | `api/config.sample.php:27`, `api/photo-storage.php:51` |
| `webp_quality` | int | 82, зажим 50…90 | 82 | Owner | Качество / размер | `api/config.sample.php:28`, `api/photo-storage.php:46` |
| `cache_dir` | path | `<root>/cache` (`api/perf.php:16`) | По умолчанию; папка получает `.htaccess` с запретом | Hosting | Кэш вне webroot не нужен | `api/perf.php:6-16` |

### 2.5 Nova Poshta (НП)

| Key | Тип | Default | Prod | Кто меняет | Риск | Код |
|---|---|---|---|---|---|---|
| `nova_poshta_api_key` | string, **секрет** | `''` → `npConfigured()` = false. Env `RUBIZH_NP_API_KEY` приоритетнее | **BLOCKED(Owner)**: бизнес-ключ ФОП, предпочтительно через env | Owner / Hosting | Утечка ключа ФОП. Не должен попадать в браузер | `api/config.sample.php:30`, `shop/np-lib.php:7`, `shop/np-lib.php:78` |
| `np_manager_emails` | list<email> | `[]`: доступ менеджера закрыт | Подтверждённые email менеджеров | Owner | Чужой email получит права менеджера (учитывается только подтверждённый email) | `api/config.sample.php:31`, `shop/financial-permissions.php:22` |
| `np_ttn_enabled` | bool | `false`: выпуск ТТН запрещён (`npAssertReady`) | `false` до этапа 6 | Owner | `true` без проверок выпускает реальные ТТН | `api/config.sample.php:32`, `shop/np-fulfillment.php:120`, `shop/settings.php:22` |
| `np_sender` | `{ref, contact_ref, phone, confirmed}` | `ref=''`, `confirmed=false` | Заполняется `dev/configure-np.php` после подтверждения | Dev (CLI) + Owner | Неверный отправитель: ТТН с чужими реквизитами | `api/config.sample.php:33`, `shop/np-lib.php:181`, `staff/schema.php:31`, `dev/configure-np.php:58` |
| `np_origin_refs` | map `code → {city_ref, warehouse_ref, cargo_warehouse_ref}` | `[]` | Подтверждённые ref-коды складов | Dev (CLI) + Owner | Неверный склад отправки | `api/config.sample.php:34`, `shop/np-lib.php:18`, `staff/operations.php:42`, `dev/configure-np.php:60-89` |
| `np_custom_origins` | map `code → {name, city, region, branch, address}` | `[]` | Только после согласования | Owner | Новый «склад» без согласования | `api/config.sample.php:35`, `shop/np-lib.php:16` |
| `np_staff_origin` | map (переопределение полей origin) | `[]` | Не задавать без необходимости | Owner | Смена реквизитов встроенных складов | `shop/np-lib.php:17` |
| `np_supplier_names` | map | `[]` | По данным постачальников | Owner | Неверный постачальник в ТТН/уведомлении | `api/config.sample.php:36`, `shop/np-lib.php:43` |
| `np_supplier_by_sku` | map `sku → supplier` | `[]` | По данным постачальников | Owner | Неверная маршрутизация посылки | `api/config.sample.php:37`, `shop/np-lib.php:39` |
| `np_supplier_by_product` | map `product → supplier` | `[]` | По данным постачальников | Owner | То же | `api/config.sample.php:38`, `shop/np-lib.php:39` |
| `np_card_payment_verified` | bool | `false`. Альтернатива: `monoConfigured()` | `false`, пока не подключён PSP и не пройдена проверка | Owner | `true` без проверки PSP разрешает ТТН для неоплаченных карточных заказов | `api/config.sample.php:53`, `shop/np-fulfillment.php:126` |

### 2.6 Уведомления и контакты

| Key | Тип | Default | Prod | Кто меняет | Риск | Код |
|---|---|---|---|---|---|---|
| `order_notification_email` | email | `zakaz@rubizh.shop` (если пусто) | Почтовый ящик владельца заказов | Owner (также UI) | Заказы уходят не туда | `api/config.sample.php:41`, `shop/notifications.php:31`, `shop/settings.php:19` |
| `tg_bot_token` | string, **секрет**, формат `\d+:[A-Za-z0-9_-]+` | `''`: Telegram не настроен, отправка даёт исключение | **BLOCKED(Owner)**, если нужен Telegram | Owner | Утечка токена бота | `api/config.sample.php:39`, `shop/notifications.php:22` |
| `tg_chat_id` | string (число) | `''` | Приватный чат менеджера | Owner | Заказы идут в чужой чат | `api/config.sample.php:40`, `shop/notifications.php:22` |
| `supplier_contacts` | map `code → {channel, recipient, enabled}` | `[]`: уведомления постачальникам не отправляются | BLOCKED(Owner): подтверждённые контакты | Owner (UI `shop/settings.php`) | Данные заказа уходят постачальнику без согласия | `api/config.sample.php:46`, `shop/supplier-notifications.php:27,38,51` |
| `supplier_sku_map` | map `RUB-SKU → артикул` | `[]` | BLOCKED(Owner): данные постачальников, приватно | Owner / UI | Неверный артикул в заказе поставщику. Лимит 20000 записей (`shop/settings-lib.php:28`) | `api/config.sample.php:47`, `shop/supplier-notifications.php:27`, `shop/np-manager.php:75` |

### 2.7 Оплата (MonoPay)

| Key | Тип | Default | Prod | Кто меняет | Риск | Код |
|---|---|---|---|---|---|---|
| `mono_activation_confirmed` | bool | `false` → `monoConfigured()` = false | `false` до этапа 6 и проверки фискализации у ФОП | Owner | `true` без токена/проверок: платежи в боевом режиме | `api/config.sample.php:42`, `shop/mono-lib.php:4` |
| `mono_token` | string, **секрет** | `''` | **BLOCKED(Owner)**; предпочтительно `RUBIZH_MONO_TOKEN` | Owner / Hosting | Утечка токена эквайринга | `api/config.sample.php:43`, `shop/mono-lib.php:4,14` |

### 2.8 Аналитика и реклама

| Key | Тип | Default | Prod | Кто меняет | Риск | Код |
|---|---|---|---|---|---|---|
| `ga4_id` | string `G-[A-Z0-9]{5,20}` | `''`: скрипт не подключается | Только после согласия владельца (BLOCKED(Owner)) | Owner (UI, `dev/configure-analytics.php`) | Скрипт без согласия. Перекрывается `site-settings.json` | `api/config.sample.php:44`, `shop/analytics.php:3`, `shop/settings-lib.php:25` |
| `meta_pixel_id` | string (цифры) | `''` | Только после согласия (BLOCKED(Owner)) | Owner | То же | `api/config.sample.php:45`, `shop/analytics.php:3` |

### 2.9 Продавец и поддержка

| Key | Тип | Default | Prod | Кто меняет | Риск | Код |
|---|---|---|---|---|---|---|
| `seller` | map (переопределяет поля реквизитов) | `rubizhSellerDefaults()` (`api/seller.php:4`). Значения не приводятся | BLOCKED(Owner): владелец проверяет каждое поле | Owner (UI `shop/settings.php`, ключ `seller` в `site-settings.json`) | Неверные реквизиты в документах и на сайте | `api/config.sample.php:52`, `api/seller.php:4-5` |
| `donation_enabled` | bool | `false` (sample) | См. раздел 14, пункт 1 | Owner | **Код игнорирует значение**: `shop/settings-lib.php:30` и `:38` принудительно `true` | `api/config.sample.php:48`, `shop/settings-lib.php:30,38` |
| `donation_percent` | number 0…100 | 3 (sample) | Решение владельца; сейчас в коде фиксировано 3 | Owner | Неверный расчёт поддержки | `api/config.sample.php:49`, `shop/settings-lib.php:27,30` |
| `donation_schedule` | string ≤500 | `''` (код ставит текст про 3 рабочих дня) | Текст владельца | Owner | Неверный срок | `api/config.sample.php:50`, `shop/settings-lib.php:30` |
| `donation_report_url` | string ≤500 | `''` | Ссылка на отчёт или пусто | Owner | Ссылка на чужой ресурс | `api/config.sample.php:51`, `shop/settings-lib.php:38` |

### 2.10 Ключи, которых нет в sample, но которые читает код

Сверено по `cfg('...')` в `api/`, `shop/`, `auth/`, `staff/`, `dev/`, `storefront.php`, `health.php`.

| Key | Тип | Default (в коде) | Prod (рекомендация) | Кто меняет | Риск | Код |
|---|---|---|---|---|---|---|
| `environment` | string | Не задан = боевой режим (проверка только `=== 'staging'`) | Не задавать или `production` | Hosting | `staging` открывает staging-origins, mock-банк, `public_base_url`. Значение `staging` на боевом сайте опасно | `shop/store-lib.php:54`, `shop/mono-lib.php:3,18`, `staff/bootstrap.php:13` |
| `staging_origins` | list<URL> | `[]` (читается только при `environment=staging`) | Не задавать | Dev | Лишний разрешённый Origin | `shop/store-lib.php:54` |
| `staging_allow_loopback` | bool | `false` | `false` | Dev | Разрешает `127.0.0.1` как Origin и отключает `secure` у cookie на loopback | `shop/store-lib.php:55`, `shop/runtime.php:72` |
| `mono_mock` | bool | `false` | Не задавать | Dev | Имитация банка; действует только при `environment=staging` и не на `rubizh.shop` (`shop/mono-lib.php:3`) | `shop/mono-lib.php:3` |
| `public_base_url` | URL | `https://rubizh.shop` (если не staging) | Не задавать | Dev | В staging: ссылка на неверный хост | `shop/mono-lib.php:18` |
| `pim_v3_sync` | bool | `false` | `false` до решения владельца | Dev через `dev/pim-v3-enable.php` | См. раздел 3 | `shop/pim-v3-sync.php:22` |
| `cart_reminders_enabled` | bool | `true` (если не `false`) и при заданном `noreply_password` | Решение владельца | Owner | Рассылка брошенных корзин | `shop/cart-reminders-lib.php:12` |
| `staff_roles` | map `actor_id → role` | `[]` | Только явные роли `OWNER`, `MANAGER`, `LOGISTICS`, `READ_ONLY` | Owner | Выдача роли сотруднику | `shop/financial-permissions.php:15-19` (`shopStaffRole`) |
| `staff_stepup_seconds` | int, min 60 | 900 | 900 | Owner | Длинное окно для финансовых действий без повторного входа | `shop/financial-permissions.php:41` |
| `shop_promo_codes` | map `code → percent` | `[]`. Процент 1…30 | Список владельца | Owner | Скидка сверх согласованной | `shop/pricing.php:21-22` |
| `shop_wholesale_customers` | map `customer_id → tier` | `[]` | Список владельца | Owner | Оптовая цена без основания | `shop/store-lib.php:118`, `shop/pim-v3-checkout.php:60` |
| `bank_holidays` | list<`Y-m-d`> | `[]` | Праздники владельца | Owner | Неверный срок оплаты | `shop/order-lifecycle.php:5` |
| `catalog_checkout_max_age_seconds` | int, min 3600 | 172800 (48 ч) | 172800 | Owner | Старый товар уходит в заказ без подтверждения наличия | `shop/store-lib.php:115` |
| `perf_profile` | bool | `false` | `false` | Dev | Пишется `cache/perf.log` с SQL-запросами | `api/perf.php:155` |
| `health_photo_errors_max` | int | 50 | 50 | Owner | Ложная тревога `/health` | `api/index.php:135` |
| `health_publish_max_hours` | int | 72 | 72 | Owner | Ложная тревога, если выгрузка редкая | `api/index.php:136` |

---

## 3. PIM sync

Ключевой принцип RC1: **PIM→SITE sync выключен**, AUTOPRICES выключены (`docs/release-hardening/01-SOURCE_OF_TRUTH.md:28`, `docs/release-hardening/SESSION_HANDOFF.md:89`).

### 3.1 `pim_key`

- **Что делает:** Bearer-ключ для `/api/pim/sync`, `/api/pim/photos`, `/api/pim/status` (`api/index.php:3`, `api/lib.php:143-150`). Сравнение через `hash_equals`.
- **Default:** нет. Без ключа или короче 24 символов сервер отвечает 500 (`api/lib.php:146-147`).
- **Prod:** случайная строка ≥32 символов. Ключ в `config.php` и в PIM «Выгрузка → Сайт».
- **Ротация:** обязательна перед production, **PL-3**, см. раздел 8. Источник: `docs/release-hardening/08-RELEASE_READINESS.md:183`. Этап 5 добавил ротацию без простоя через `pim_key_next` (раздел 2.2); продуктовая ротация на production в этапе 5 **не выполнялась**.
- **`pim_key_next` (stage 5, необязательный):** второй принимаемый ключ на время ротации. Сайт принимает оба ключа, сравнивая каждый через `hash_equals` без короткого замыкания (`api/lib.php:148-160`). Слабый (короче 24), содержащий `ЗАМЕНИТЕ` или равный `pim_key` ключ **игнорируется** и пишется в `error_log`; анонимному вызывающему это не раскрывается. Неверный ключ — 401, при серии неудачных попыток с одной сети — 429 (`pim-auth-fail`, 30 за 600 с, `api/lib.php:159`).
- **Статус слота:** `GET /api/pim/status` (по `pim_key`) сообщает, какой слот совпал, без значения ключа.
- **Кто меняет:** Owner (генерация), Hosting (`config.php`), PIM-оператор (новый ключ в PIM «Новий ключ» → «Перевірити» → «Зробити основним»).

### 3.2 `pim_legacy_sync` (default OFF, решение R1)

- **Код:** `pimRequireLegacySync()` бросает `PimLegacySyncRejected('LEGACY_SYNC_DISABLED')`, если `cfg('pim_legacy_sync') !== true` (`api/lib.php:235-237`). Вызывается в `/pim/sync` (`api/index.php:37`), в записях товаров (`api/lib.php:246,255`) и в kits (`api/kits.php:10`).
- **Default:** `false` (ключ не задан или не `true`). Подтверждено кодом.
- **Prod:** `false`.
- **Дополнительная защита:** даже при `true` модели контракта 3 не перезаписываются: `pimAssertLegacyModels()` проверяет `products.pim_contract_version=3` и выдаёт `CONTRACT_V3_REQUIRED` (`api/lib.php:245-250`). Если включён v3, `/pim/sync` отвечает 409 (`api/index.php:38`).
- **Решение владельца:** R1 (ARCH-03 «Legacy opt-in не позволяет писать contract3», `docs/release-hardening/03-DEFECT_REGISTER.md:145`). Строка в `08-RELEASE_READINESS.md:183`: «Legacy-синхронизация выключена по умолчанию (`pim_legacy_sync=false`)».
- **Кто меняет:** Owner. Включение без решения владельца запрещено.

### 3.3 `pim_v3_sync` (контракт 3)

- **Код:** `pimV3Enabled()` = `cfg('pim_v3_sync') === true` **И** `meta.pim_v3_schema = '2'` (`shop/pim-v3-sync.php:22`).
- **Default:** `false`. Без флага capability = `{pricing_policy_version: 1}` (`shop/pim-v3-sync.php:23-25`), а приём v3 отвечает `CONTRACT_V3_NOT_ENABLED`, HTTP 409 (`shop/pim-v3-sync.php:242`).
- **Включение только через guarded-команду** `dev/pim-v3-enable.php`:
  1. `php dev/pim-v3-enable.php --plan` → SHA256 текущего `api/config.php`.
  2. `php dev/pim-v3-enable.php --apply --expect-sha256=<sha>`. Резервная копия вне webroot, `lint` и повторное чтение в отдельном процессе, откат при сбое.
  3. Откат: команда `cp` из поля `rollback` в отчёте.
  4. Проверка: `GET /api/pim/status`.
- **Схема:** `meta.pim_v3_schema='2'` ставит `shop/pim-v3-schema.php:143` (установка через `dev/migrate-pim-v3.php`).
- **Prod (RC1):** `false`. Включение на production запрещено до решения владельца (`docs/release-hardening/SESSION_HANDOFF.md:89`: «v3 на production не включать»).
- **Риск:** включение без схемы не даёт эффекта, но вводит в заблуждение PIM. Включение без решения владельца даёт PIM право писать каталог по контракту 3.

### 3.4 Capability gate

| Элемент | Значение | Код |
|---|---|---|
| Endpoint | `GET /api/pim/status` (по `pim_key`) | `api/index.php:83-86` |
| Ответ при выключенном v3 | `capabilities = {pricing_policy_version: 1}` | `shop/pim-v3-sync.php:24` |
| Ответ при включённом v3 | `PIM_V3_CONTRACT` + `envelope=products`, `max_chunk_models=200` | `shop/pim-v3-sync.php:8,25` |
| Константы контракта | `contract_version=3`, `pricing_policy_version=1`, `category_catalog_version=2`, `size_catalog_version=1`, `inventory_policy_version=1`, `order_policy_version=1`, `model_colors_version=1` | `shop/pim-v3-sync.php:8` |
| Лимиты | `PIM_V3_MAX_CHUNK_MODELS=200`, `PIM_V3_MAX_CHUNKS=200` | `shop/pim-v3-sync.php:9-10` |

`model_colors_version` **не является** флагом в `meta`. Это константа контракта (`shop/pim-v3-sync.php:8`).

### 3.5 `pim_origins` (CORS для PIM)

- **Default:** `[]`: заголовок `Access-Control-Allow-Origin` не выдаётся (`api/lib.php:133-136`).
- **Prod:** `['https://pim.rubizh.shop']`.
- **Риск:** `'*'` разрешает любой Origin для PIM-эндпоинтов. Ключ при этом всё равно нужен (Bearer), но поверхность для атак растёт.

---

## 4. `trusted_proxies` (R8) и PL-1

- **Код:** `rubizhClientAddress()` (`shop/runtime.php:53-66`). Список читается из `cfg('trusted_proxies')` (`shop/runtime.php:55`).
- **Default:** `[]`. Заголовок `X-Forwarded-For` **не учитывается**; клиентский адрес = `REMOTE_ADDR`. Это подтверждено кодом (`docs/release-hardening/02-FULL_AUDIT.md:49`: «default `trusted_proxies=[]` проверяется кодом»).
- **Логика при заполнении:** `X-Forwarded-For` разбирается только если `REMOTE_ADDR` входит в доверенную сеть. Цепочка длиннее 20 адресов или с невалидным IP даёт `REMOTE_ADDR`. Берётся первый адрес справа, не входящий в доверенные сети (`shop/runtime.php:56-63`).
- **Затрагивает:** все rate-лимиты (раздел 5) и `rz_dev`-идентификацию, IPv6 берётся как `/64` (`shop/runtime.php:68-70`).
- **Prod:** адреса или CIDR-сети прокси хостинга. **PL-1, BLOCKED(Hosting):** значение зависит от ответа хостинга ukraine.com.ua. Ссылка: `docs/release/PRE_LAUNCH_BLOCKERS.md#pl-1`. Статус R8: `docs/release-hardening/STAGE_CHECKPOINT.md:24`.
- **Риски:**
  - Список слишком широкий (например `0.0.0.0/0`): клиенты подделывают IP, лимиты обходятся.
  - Список пуст за реальным прокси: все посетители попадают в один сетевой лимит. Сетевые лимиты (например `order-network` 300/час) выбиваются для всех, а клиенты получают 429.
- **Кто меняет:** Hosting, только после ответа хостинга и проверки на staging.

---

## 5. Лимиты, окна и блокировки (R8-limits)

Все лимиты захардкожены в коде. Единственное конфигурируемое значение здесь — `sms_daily_limit` (auth/config.php). Изменение любого другого лимита требует релиза. Хранение: таблица `rubizh_shop_limits` (`shop/store-lib.php:72-80`), файлы в `rubizh-runtime/` (`shop/runtime.php:88-109`: 4096 файлов, по 64 идентичности в каждом), таблица `rubizh_phone_challenges`, `rubizh_auth_attempts`.

Ответ при превышении: HTTP 429 с `Retry-After`. Для «подтверждения» используется 428 (proof-of-work 16 бит, TTL 300 с, `shop/runtime.php:76-86`).

### 5.1 Публичные маршруты (`rubizhPublicGate`, `shop/runtime.php:110-128`)

| Маршрут | Лимит | Окно | Код |
|---|---|---|---|
| Каталог (API, не PIM) | 300 | 60 с | `api/index.php:18`, `shop/catalog.php:6` |
| Витрина | 180 | 60 с | `storefront.php:22` |
| `/health` | 120 | 60 с | `health.php:13` |
| Аккаунт (сеть), мягкий порог | 600 | 60 с | `shop/runtime.php:114` |
| Аккаунт (сеть), жёсткий | 1800 | 60 с | `shop/runtime.php:115` |
| Аккаунт (сессия), мягкий | 60 | 60 с | `shop/runtime.php:117` |
| Аккаунт (сессия), жёсткий | 180 | 60 с | `shop/runtime.php:118` |

Одновременная нагрузка (не лимит запросов): `rubizhHttpWork('public-read', 16)` (`api/index.php:18`, `shop/catalog.php:6`, `storefront.php:22`). При занятости — 503 с `Retry-After: 2`.

### 5.2 Вход по email (`auth/index.php:101-110`)

| Правило | Лимит | Окно | Итог | Код |
|---|---|---|---|---|
| На один email | 1 запрос | 60 с | 429 | `auth/index.php:103` |
| На один email | 3 запроса | 3600 с | 429 | `auth/index.php:107` |
| Глобально | 100 | 86400 с | требуется подтверждение (proof) | `auth/index.php:105` |
| На сеть (IP-hash) | 30 | 3600 с | требуется подтверждение (proof) | `auth/index.php:108` |
| TTL ссылки для входа | 2700 с (45 мин) | — | — | `auth/index.php:114` |
| Очистка журнала попыток | 172800 с (48 ч) | — | — | `auth/index.php:119` |

### 5.3 SMS (`auth/phone.php`)

| Правило | Лимит | Окно | Итог | Код |
|---|---|---|---|---|
| SMS на номер | 5 | 3600 с | 429 | `auth/phone.php:79` |
| SMS на номер | 10 | 86400 с | 429 | `auth/phone.php:80` |
| SMS с одного IP | 150 | 86400 с | 429 | `auth/phone.php:82` |
| Всплеск с IP (подозрительно) | ≥5 | 600 с | подтверждение | `auth/phone.php:83,95` |
| Неверные коды на номер+IP | 15 | 86400 с | 429 | `auth/phone.php:87-88` |
| Глобальный дневной лимит SMS | `sms_daily_limit` (по умолчанию **100**) | 86400 с | 429 | `auth/phone.php:89-91` (**конфигурируемо**, auth/config.php) |
| Подозрительность при 60% глобального лимита | `floor(limit*0.6)` | 86400 с | подтверждение | `auth/phone.php:95` |
| SMS на номер в час (подозрительно) | ≥2 | 3600 с | подтверждение | `auth/phone.php:95` |
| SMS на устройство (мягкий) | 6 | 86400 с | подтверждение | `auth/phone.php:94` |
| TTL кода | 300 с | — | — | `auth/phone.php:98` |
| Попыток ввода на код | 5 | — | код сгорает | `auth/phone.php:119` |

### 5.4 Оформление заказа (`shop/store-lib.php:178-182`, `shop/order.php:35,45`)

| Ключ | Лимит | Окно | Примечание |
|---|---|---|---|
| `order-session` | 10 | 3600 с | на сессию и устройство |
| `order-device` | 10 | 3600 с | на устройство |
| `order-network` | 300 | 3600 с | с 60-го запроса требует подтверждение (428) |
| `order-phone-hour` | 5 | 3600 с | только если телефон подтверждён (SMS) |
| `order-phone-day` | 15 | 86400 с | только если телефон подтверждён (SMS) |
| Блокировка заказа | `GET_LOCK` 2 с | — | 503 «Замовлення обробляється» (`shop/order.php:30`) |

### 5.5 Служебные маршруты (`shopLimit`, окно по умолчанию 3600 с)

| Маршрут | Лимит | Окно | Код |
|---|---|---|---|
| Напоминания о корзине | 30 | 3600 с | `shop/cart-reminder.php:17` |
| Возврат после оплаты | 12 | 60 с | `shop/payment-return.php:11` |
| Старт оплаты | 12 | 60 с | `shop/payment-start.php:4` |
| Вебхук MonoPay | 180 | 60 с | `shop/mono-webhook.php:5` |
| Статус заказа | 120 | 60 с | `shop/order-status.php:7` |
| Котировка цены | 120 | 60 с | `shop/checkout-quote.php:6` |
| Подтверждение заказа | 30 | 60 с | `shop/order-confirm.php:7` |
| Финансовые действия | 20 | 60 с | `shop/financial-actions.php:12` |
| Настройки магазина | 10 | 60 с | `shop/settings.php:11` |
| Менеджер НП | 30 | 60 с | `shop/np-manager.php:11` |
| Каталог НП-справочник | 90 | 60 с | `shop/np-directory.php:6` |
| Донаты (менеджер) | 20 | 60 с | `shop/donations.php:8` |
| Избранное | 300 | 3600 с | `shop/customer.php:8` |
| Комплекты | 60 | 3600 с | `shop/kits.php:7` |

### 5.6 Персонал (CRM)

| Правило | Лимит | Окно | Код |
|---|---|---|---|
| Неудачные входы по логину | 8 | 900 с | `staff/auth.php:27,31` (после порога нужен proof) |
| API персонала (сессия+сеть) | 240 | 60 с | `api/staff/index.php:8` (`Retry-After: 60`) |
| Повтор финансового действия без нового входа (`staff_stepup_seconds`) | 900 с (мин. 60) | — | `shop/financial-permissions.php:41` |
| Сессия клиента | 86400 с | — | `auth/bootstrap.php:57` (не настраивается) |

### 5.7 Внешние вызовы

| Что | Попытки | Пауза | Код |
|---|---|---|---|
| НП API | 4 | 10 · 2^n с | `shop/np-lib.php:54-61` |
| Уведомления (email/Telegram) | 5 | `next_at` | `shop/notifications.php:27-33` |
| Письмо заказа | 5 | `next_at` | `shop/mail-worker.php:4` и очередь |
| Блокировка задачи уведомлений | 5 мин | — | `shop/notifications.php:27` |

---

## 6. Переменные окружения

| Имя | Читается в | Назначение | Приоритет | Default | Prod | Кто задаёт |
|---|---|---|---|---|---|---|
| `RUBIZH_NP_API_KEY` | `api/np-private.php:4`, `shop/np-lib.php:7,78` | Ключ НП (секрет) | Выше `nova_poshta_api_key` | Не задан | **BLOCKED(Owner)** | Hosting |
| `RUBIZH_MONO_TOKEN` | `api/mono-private.php:5`, `shop/mono-lib.php:4,14` | Токен MonoPay (секрет) | Выше `mono_token` | Не задан | **BLOCKED(Owner)** | Hosting |
| `RUBIZH_TURBOSMS_TOKEN` | `auth/identities.php:12` | Токен TurboSMS (секрет) | Выше `turbosms_token` | Не задан | **BLOCKED(Owner)** | Hosting |
| `RUBIZH_TURBOSMS_SENDER` | `auth/identities.php:13` | Отправитель SMS | Выше `turbosms_sender` | Не задан | **BLOCKED(Owner)** | Hosting |
| `RUBIZH_AUTH_SECRET` | `auth/identities.php:14`, `dev/init-auth-secret.php:10` | Секрет подписи (≥40 символов) | Выше `auth_secret` | Не задан | Сгенерировать `dev/init-auth-secret.php` | Dev/Hosting |
| `RUBIZH_GOOGLE_CLIENT_ID` | `auth/identities.php:15` | OAuth client id | Выше `google_client_id` | Не задан | **BLOCKED(Owner)** | Hosting |
| `RUBIZH_GOOGLE_CLIENT_SECRET` | `auth/identities.php:16` | OAuth client secret (секрет) | Выше `google_client_secret` | Не задан | **BLOCKED(Owner)** | Hosting |
| `RUBIZH_NOREPLY_PASSWORD` | `auth/identities.php:17` | Пароль ящика noreply (секрет) | Выше `noreply_password` | Не задан | **BLOCKED(Hosting)** | Hosting |
| `RUBIZH_SMS_ENABLED` | `auth/identities.php:22` | Включение SMS (bool) | Выше `sms_enabled` | Не задан | `false` до этапа 6 | Owner |
| `RUBIZH_GOOGLE_ENABLED` | `auth/identities.php:22` | Включение Google (bool) | Выше `google_enabled` | Не задан | `false` до этапа 6 | Owner |
| `RUBIZH_TEST_MYSQL_SOCKET` | `dev/migrate-*.php`, `tests/helpers/mysql-snapshot.php:4` | Только тесты и миграции в изолированной БД | — | Не задан | **Не на production** | Dev |

**Примечания:**
- `auth/identities.php:19-20` применяет env через `getenv() !== false`. Пустая переменная **перекрывает** значение из файла пустой строкой. Не задавайте пустые переменные по ошибке.
- `RUBIZH_SMS_ENABLED` и `RUBIZH_GOOGLE_ENABLED` парсятся через `filter_var(FILTER_VALIDATE_BOOLEAN)` (`auth/identities.php:24`). Нераспознанное значение даёт `false`.
- Для `RUBIZH_NP_API_KEY` и `RUBIZH_MONO_TOKEN` пустая строка игнорируется (`?:`).

---

## 7. Файлы конфигурации авторизации (`auth/config.php`)

Шаблон: `auth/config.sample.php`. Загрузка: `authConfig()` (`auth/identities.php:8-27`). Всего 9 ключей, плюс 8 переменных окружения (раздел 6).

| Key | Тип | Default (в коде) | Prod | Кто меняет | Риск | Код |
|---|---|---|---|---|---|---|
| `noreply_password` | string, **секрет** | `''` → почта не настроена (`shop/store-lib.php:147`) | **BLOCKED(Hosting)**: пароль ящика | Hosting (env `RUBIZH_NOREPLY_PASSWORD`) | Письма не уходят. Отключаются напоминания о корзине (`cart-reminders-lib.php:12`) | `auth/config.sample.php:4`, `auth/index.php:22`, `auth/mailer.php:37` (SMTP `smtps://mail.adm.tools:465`) |
| `google_enabled` | bool | `false` | `false` до этапа 6 | Owner | `true` без `smsEnabled()` не работает: вход через Google зависит от SMS (`auth/identities.php:36`) | `auth/config.sample.php:9`, `auth/identities.php:34-38` |
| `google_client_id` | string, формат `\d+-…\.apps\.googleusercontent\.com` | `''` | **BLOCKED(Owner)**: OAuth-клиент. Значение в sample не приводится | Owner | Неверный redirect URI: `https://rubizh.shop/auth/google.php` (`auth/config.sample.php:12`) | `auth/config.sample.php:10`, `auth/identities.php:37` |
| `google_client_secret` | string, **секрет** | `''` | **BLOCKED(Owner)** | Owner | Утечка | `auth/config.sample.php:11`, `auth/identities.php:38` |
| `sms_enabled` | bool | `false` | `false` до этапа 6 | Owner | `true` без токена и секрета не работает (`smsEnabled()`) | `auth/config.sample.php:13`, `auth/identities.php:29-33` |
| `turbosms_token` | string, **секрет** | `''` | **BLOCKED(Owner)**: аккаунт TurboSMS | Owner | Утечка; SMS не уходят | `auth/config.sample.php:14`, `auth/phone.php:53` |
| `turbosms_sender` | string | `''` (sample: `RUBIZH`, прошёл модерацию) | `RUBIZH`, если модерация подтверждена (BLOCKED(Owner) до подтверждения) | Owner | Отказ отправителя или неверное имя | `auth/config.sample.php:15`, `auth/identities.php:32` |
| `auth_secret` | string ≥40, **секрет** | `''` → `smsEnabled()` = false | Сгенерировать `dev/init-auth-secret.php`. Не пароль почты и не ключ PIM | Dev/Hosting | Короткий секрет: SMS выключены. Утечка: подделка кодов | `auth/config.sample.php:16`, `auth/identities.php:31`, `auth/phone.php:29`, `dev/init-auth-secret.php:10-14` |
| `sms_daily_limit` | int ≥1 | 100 (`auth/phone.php:90`, `max(1,…)`) | 100 (решение владельца) | Owner | Лимит на все SMS магазина за сутки; при исчерпании вход по SMS недоступен | `auth/config.sample.php:17`, `auth/phone.php:90` |

**Важно:** `auth/config.sample.php:10` содержит литерал client id. Значение не приводится. Это публичный идентификатор, но в production он берётся из владельца OAuth-приложения.

---

## 8. Лимиты и секреты перед production: ротация (PL-3)

- **Обязательно перед production:** сменить `pim_key` и `cron_key` на новые независимые случайные значения. Для `pim_key` использовать процедуру `pim_key_next` из §3.1 (без простоя PIM); в этапе 5 production-ротация **не выполнялась**, она делается владельцем перед запуском. Ключи не менять на действующем сайте без обновления клиентов (`docs/release-hardening/08-RELEASE_READINESS.md:183`). Ссылка: `docs/release/PRE_LAUNCH_BLOCKERS.md#pl-3` (файл не создан, раздел 9).
- **Почему:** RC1 проверялся, в том числе в публичной истории; ключи могли попасть в открытый доступ. Решение владельца R10 (`docs/release-hardening/STAGE_CHECKPOINT.md:26`): «future pim_key/cron_key rotation».
- **Ротация `pim_key` без простоя (этап 5, `pim_key_next`):**
  1. Сгенерировать новый ключ вне репозитория (≥32 символов, не содержит `ЗАМЕНИТЕ`).
  2. На сайте в `api/config.php` задать `pim_key_next` = новый ключ (`chmod 600`). Сайт принимает старый и новый ключ; PIM пока работает со старым.
  3. В PIM «Выгрузка → Сайт» нажать «Новий ключ» и вставить новый ключ.
  4. В PIM нажать «Перевірити»: PIM проверяет, что сайт принимает новый ключ (сообщение «Сайт приймає новий ключ»). Только после этого переходить к шагу 5.
  5. В PIM нажать «Зробити основним» (PIM подтверждает действие и напоминает перенести ключ в `pim_key` и очистить `pim_key_next`). С этого момента PIM отправляет новый ключ.
  6. На сайте перенести новый ключ в `pim_key` и очистить `pim_key_next` (пустая строка).
  7. Проверить: старый ключ отвечает 401, новый 200 (`GET /api/pim/status`). Записи `/api/pim/costs` и `/api/pim/backup` проверяются тем же ключом.
- **`cron_key`** (без `pim_key_next`): обновить `api/config.php` и crontab хостинга (URL `/cron/photos?key=…`, mail-worker) в одном окне; до обновления cron ротации нет.
- **Порядок ротации, когда простой допустим:** сгенерировать значения вне репозитория → обновить `api/config.php` (`pim_key`, `cron_key`) и crontab → обновить PIM «Выгрузка → Сайт» → проверить 401/200 как в шаге 7.
- **Не записывать** значения в git, чат, Drive. Внимание: cron-задачи содержат ключ в командной строке; `dev/install-cache-cron.sh` не выводит содержимое crontab.

---

## 9. Файлы, секреты и хранение

| Файл | Статус в git | Защита | Примечание |
|---|---|---|---|
| `api/config.php` | Не в git (`.gitignore`) | `api/.htaccess:9` (Require all denied) | Главный файл |
| `api/config.sample.php` | В git | Публичный | Только шаблон |
| `api/site-settings.json`, `api/site-settings.lock` | Не в git | `api/.htaccess:15` | Создаётся админкой |
| `api/np-private.php`, `api/mono-private.php` | В git (тонкие файлы, только env) | `api/.htaccess:9` | Секретов в файлах нет |
| `auth/config.php` | Не в git | `auth/.htaccess:3` | Секреты |
| `auth/config.sample.php` | В git | Публичный | Литерал client id (не приводится) |
| `../rubizh-private/database.php` | Вне репозитория и вне webroot | Права 0600 | См. `dev/database-private.sample.php` |
| `../rubizh-private/mysql-ca.crt` | Вне репозитория | — | Путь из шаблона |
| `downloads/Rubizh-private-integrations.enc` | **В git** | Зашифрован | Не открывался. Проверить, что он не должен входить в релиз (раздел 14, пункт 6) |
| `tests/.staging/*.php` | В git | Только staging | Содержит тестовое значение `auth_secret` (значение не приводится) |
| `api/seller.php:4` | В git | Публичный | Жёстко заданные дефолты реквизитов (значения не приводятся) |

**Файл `docs/release/PRE_LAUNCH_BLOCKERS.md`:** создан на этапе 3 (PL-1…PL-4).

---

## 10. Прочие флаги и настройки из `api/site-settings.json`

Файл читает `shopSettingsRead()` (`shop/settings-lib.php:5-9`) и `cfg()` (`api/lib.php:25`). Пишут: **UI** `shop/settings.php:14` (менеджер с правом `payment.manual_reconcile`; для денежных полей нужен свежий вход владельца), **Dev** `dev/configure-analytics.php:12` (только `ga4_id`, `meta_pixel_id`). Лимит записи: 10 в минуту (`shop/settings.php:11`). Валидация: `shop/settings-lib.php:17-31`.

| Key | Тип | Default | Prod | Кто меняет | Риск | Код |
|---|---|---|---|---|---|---|
| `seller` | map реквизитов | Дефолты `api/seller.php:4` | BLOCKED(Owner) | Owner (UI) | Неверные реквизиты | `shop/settings-lib.php:4,28` |
| `invoice_vat_note` | string, до 200 символов (stage 5) | `''` (не заполнено) | **BLOCKED(Owner)**: точная строка статуса ПДВ владельца, печатается в PDF-рахунке дословно | Owner (UI) | Пусто → PDF рахунку ФОП не формируется; OWNER видит «Заповніть статус ПДВ у налаштуваннях». Неверный текст попадёт в документ покупателя | `shop/settings-lib.php:26`, `shop/invoice-pdf.php:178-179`, `shop/settings.php:12` |
| `ga4_id` | `G-…` | `''` | BLOCKED(Owner) согласие | Owner / Dev | Аналитика без согласия | `shop/settings-lib.php:25` |
| `meta_pixel_id` | цифры | `''` | BLOCKED(Owner) согласие | Owner | То же | `shop/settings-lib.php:25` |
| `order_notification_email` | email | `zakaz@rubizh.shop` | Ящик владельца | Owner | Заказы не туда | `shop/settings-lib.php:25` |
| `supplier_contacts` | map | `[]` | BLOCKED(Owner) | Owner | Утечка данных заказа | `shop/settings-lib.php:4,29` |
| `supplier_sku_map` | map ≤20000 | `[]` | BLOCKED(Owner) | Owner | Неверный артикул | `shop/settings-lib.php:28` |
| `donation_enabled` | bool | Игнорируется: принудительно `true` | См. раздел 14, пункт 1 | Owner | См. раздел 14, пункт 1 | `shop/settings-lib.php:26,30,38` |
| `donation_percent` | 0…100 | Игнорируется: принудительно 3 | См. раздел 14, пункт 1 | Owner | См. раздел 14, пункт 1 | `shop/settings-lib.php:27,30,38` |
| `donation_schedule` | string | Принудительно текст про 3 рабочих дня | См. раздел 14, пункт 1 | Owner | Неверный текст | `shop/settings-lib.php:30,38` |
| `donation_report_url` | string | `''` | Owner | Owner | Ссылка на чужой ресурс | `shop/settings-lib.php:25,38` |
| `instagram_url` | `https://instagram.com/…` | `''` (иконка скрыта) | Owner | Owner | Невалидная ссылка скрывается при выдаче | `shop/settings-lib.php:14-17,38` |
| `tiktok_url` | `https://tiktok.com/…` | `''` | Owner | Owner | То же | `shop/settings-lib.php:14-17,38` |

---

## 11. Live-интеграции: флаги, порядок включения

**Правило владельца:** живые проверки (HTTPS-вебхук, тестовая карта, реальная SMS, тестовая ТТН, OAuth, почта) — **DEFERRED → этап 6** (`docs/release-hardening/STAGE_CHECKPOINT.md:99`, `docs/release-hardening/16-GO_LIVE.md:15`). Включать **по одному флагу** и только после проверок этапа 6. Все флаги на RC1 — OFF.

| Флаг | Default | Prod RC1 | Порядок включения | Условия (код) | Риск |
|---|---|---|---|---|---|
| `mono_activation_confirmed` | `false` | `false` | 1-й: после тестовой оплаты и проверки фискализации у ФОП | Нужен токен (`RUBIZH_MONO_TOKEN` или `mono_token`); `shop/mono-lib.php:4` | Реальные платежи без проверки |
| `np_card_payment_verified` | `false` | `false` | После подтверждения PSP | Альтернатива: `monoConfigured()` (`shop/np-fulfillment.php:126`) | ТТН для неоплаченных заказов |
| `np_ttn_enabled` | `false` | `false` | После диагностики НП и тестового заказа | Это **единственный** выключатель выпуска ТТН. Отдельного флага автосоздания ТТН в коде нет (`shop/np-fulfillment.php:120`) | Реальные ТТН без проверки |
| `sms_enabled` (`RUBIZH_SMS_ENABLED`) | `false` | `false` | После проверки реальной SMS | Нужны `auth_secret` ≥40, `turbosms_token`, `turbosms_sender` (`auth/identities.php:29-33`) | Расход SMS, спам |
| `google_enabled` (`RUBIZH_GOOGLE_ENABLED`) | `false` | `false` | После SMS | Нужен `smsEnabled()` и OAuth-данные (`auth/identities.php:34-38`) | Вход без проверки |
| `noreply_password` (почта) | `''` | BLOCKED(Hosting) | Проверка SMTP перед заказами | Без него письма и напоминания не уходят | Заказы без писем |
| `cart_reminders_enabled` | `true`, но требует почту | Решение владельца | После почты | `shop/cart-reminders-lib.php:12` | Рассылка без согласия |
| `tg_bot_token` + `tg_chat_id` | `''` | Опционально | После проверки канала | `shop/notifications.php:22` | Заказы в чужой чат |
| `ga4_id`, `meta_pixel_id` | `''` | `''` | Только после согласия | `shop/analytics.php:3` | Трекинг без согласия |
| `donation_enabled` | `false` в sample, код принудительно `true` | Решение владельца | Сначала исправить код или подтвердить поведение | `shop/settings-lib.php:30` | См. раздел 14, пункт 1 |
| `pim_v3_sync` | `false` | `false` | Только по решению владельца, через `dev/pim-v3-enable.php` | Раздел 3.3 | Запись каталога по v3 |
| `pim_legacy_sync` | `false` | `false` | Не включать | Раздел 3.2 | Запись в legacy-модели |
| `mono_mock`, `staging_*`, `public_base_url`, `environment=staging` | Не заданы | Не задавать | Только staging | `shop/mono-lib.php:3`, `shop/store-lib.php:54-55` | Mock-оплата на боевом сайте (ограничено проверкой хоста) |

---

## 12. Схема `meta`-флагов

Значения в таблице `meta(k, v)`. Ключи — переключатели или версии схемы. Отсутствие ключа обычно означает «ещё не применено».

| k | Значение | Кто пишет | Кто читает | Default (нет ключа) | Смысл и риск | Код |
|---|---|---|---|---|---|---|
| `schema` | int (`SCHEMA_VERSION=4`) | Миграция API | `api/lib.php:53-60,108` | 0 → миграция | Версия схемы API | `api/lib.php:7,53,108` |
| `pricing_catalog_version` | hex / `legacy` | API при изменении каталога | `shop/pricing-policy.php:55`, `api/lib.php:107` | `legacy` | Версия цен для кэша и заказов | `api/lib.php:107` |
| `catalog_updated` | timestamp | Импорт, PIM | `api/index.php:115`, `api/perf.php:26` | Нет → `/health` ругается «немає жодної публікації» | Время публикации | `api/index.php:64,115` |
| `hide_unavailable` | `'1'` / `'0'` | `api/lib.php:263` (PIM/админ) | `api/index.php:150`, `shop/catalog-lib.php:96,178` | Нет → **скрытие включено** (`!== '0'`) | `'0'` показывает товары без наличия | `api/lib.php:263`, `shop/catalog-lib.php:96` |
| `pim_v3_schema` | `'2'` | `shop/pim-v3-schema.php:143` (через `dev/migrate-pim-v3.php`) | `shop/pim-v3-sync.php:19`, `shop/pim-v3-read.php:7` | Нет → v3 не готов | Предусловие `pim_v3_sync` | `shop/pim-v3-schema.php:143` |
| `order_p0_schema` | `'1'` | `shop/order-p0-schema.php:29` | `dev/prepare-runtime.php:7` | Нет → подготовка требует guard | Схема заказов P0 | `dev/prepare-runtime.php:7` |
| `rubizh_shop_schema` | `'1'` | `shop/store-lib.php:32` | `shop/store-lib.php:25` | Нет → миграция | Схема магазина | `shop/store-lib.php:25-32` |
| `rubizh_np_schema` | `'3'` | `shop/np-fulfillment.php:17` | `shop/np-fulfillment.php:5` | Нет → миграция | Схема НП | `shop/np-fulfillment.php:5,17` |
| `crm_schema` | `'1'` (`CRM_SCHEMA_VERSION`) | `staff/schema.php:32` | `staff/schema.php:22`, `shop/crm-bridge.php:9` | Нет → `STAFF_SCHEMA_REQUIRED` (503) | Если `>0` и файлы CRM отсутствуют, оплата останавливается (`shop/crm-bridge.php:9`) | `staff/schema.php:3,22,32` |
| `runtime_schema` | `'20261008-v1'` | `dev/prepare-runtime.php:10` | `shop/runtime.php:149` | Нет → первый запуск | Флаг установки, без него первый запуск | `dev/prepare-runtime.php:10`, `shop/runtime.php:145-160` |
| `canonical_taxonomy` | версия таксономии | `shop/taxonomy-migration.php:103`, `shop/reclassification-v2.php:95` | `shop/taxonomy.php:27` | Нет → legacy-дерево | Переключатель канонической таксономии (`20261007-v1` или текущая версия) | `shop/taxonomy.php:27-29` |
| `classifier_version` | `semantic-v2` | `shop/reclassification-v2.php:96` | `shop/taxonomy.php:106` | Нет | Версия классификатора | `shop/taxonomy.php:106` |
| `site_kits` | JSON | `api/kits.php:16` | `shop/kit-data.php:47`, `shop/store-lib.php:125` | `[]` | Определения комплектов | `api/kits.php:16` |
| `mono_public_key`, `mono_public_key_checked` | кэш | `shop/mono-lib.php:50-55` | `shop/mono-lib.php:43-50` | Нет → запрос ключа | Публичный ключ вебхука | `shop/mono-lib.php:43-55` |
| `photos_file_cursor`, `photos_last_progress` | служебные | `api/lib.php:417,446` | `api/lib.php:410`, `api/photo-status.php:5` | 0 | Курсор проверки фото | `api/lib.php:410-446` |
| `mono_mock_status_reads`, `mono_mock_status_fail` | тестовые | `shop/mono-mock.php:13` | `shop/mono-mock.php:14` | Нет | Только staging | `shop/mono-mock.php:13-14` |
| `pim_v3_category_revision` | служебный | `shop/pim-v3-sync.php:82` | — | — | Не переключатель | `shop/pim-v3-sync.php:82` |

**Не флаги:** `model_colors_version`, `contract_version` и др. — константы `PIM_V3_CONTRACT` (`shop/pim-v3-sync.php:8`).

---

## 13. Безопасная команда `dev/pim-v3-enable.php` (справка)

`dev/pim-v3-enable.php:1-12`: только CLI (`PHP_SAPI`). Меняет **один** ключ `pim_v3_sync` в `api/config.php`:
- `--plan [--disable] [--config=…] [--backup-dir=…]`: показывает SHA256 и план.
- `--apply --expect-sha256=<sha> [--disable]`: применяет, сохраняет резервную копию вне webroot (`BACKUP_INSIDE_WEBROOT` запрещён), проверяет `lint`, перечитывание и совпадение остальных ключей.
- Ответы: `NO_CHANGE`, `PLANNED`, `APPLIED`, `ERROR`.

---

## 14. Неоднозначности и находки (для владельца и релиза)

1. **`donation_*` принудительно переопределены в коде.** `shop/settings-lib.php:30` безусловно ставит `donation_enabled=true`, `donation_percent=3` и текст срока при каждом сохранении. `shop/settings-lib.php:38` выдаёт публичный блок с `enabled=>true`, `percent=>3`. Значения `donation_*` из `config.php` в публичной выдаче не действуют. Требуется решение владельца: поправить код или подтвердить поведение.
2. **Реквизиты по умолчанию в коде.** `api/seller.php:4` содержит жёстко заданные реквизиты (значения не приводятся). Они используются, пока владелец не переопределил их в `config.php` или `site-settings.json`. Проверить перед production.
3. **Приоритет `site-settings.json` над `config.php`** (`api/lib.php:25`). Для 12 ключей раздела 10 правка `config.php` без правки файла настроек не сработает. Это частая ошибка при ручной настройке.
4. **Google зависит от SMS.** `googleEnabled()` требует `smsEnabled()` (`auth/identities.php:36`). Включить только Google нельзя.
5. **Пустая env перекрывает файл.** `auth/identities.php:19-20` (`getenv() !== false`). Пустой `RUBIZH_TURBOSMS_TOKEN` сбрасывает токен из файла.
6. **Файл в git с приватными интеграциями.** `downloads/Rubizh-private-integrations.enc` отслеживается git. Содержимое не открывалось. Нужно решение, должен ли он входить в релиз.
7. **Ссылочный документ** `docs/release/PRE_LAUNCH_BLOCKERS.md` создан на этапе 3 (PL-1 — `trusted_proxies`, PL-3 — ротация ключей).
8. **Ответ хостинга (ukraine.com.ua) не найден в репозитории.** Значение `trusted_proxies` остаётся BLOCKED(Hosting).
9. **Имя «R8 limits».** В реестре R8 — это `trusted_proxies` и identity/proof (`docs/release-hardening/STAGE_CHECKPOINT.md:24`). Лимиты в этом документе описаны из кода (раздел 5).
10. **Автосоздание ТТН.** Отдельного флага нет. Единственный выключатель — `np_ttn_enabled`.
11. **AUTOPRICES в SITE не реализован.** Флаг существует только в PIM (раздел 14.1).
12. **Тестовый `auth_secret` в `tests/.staging/`.** Значение не приводится. Файл только для staging, в production не используется.
13. **`hide_unavailable` без записи** трактуется как «скрывать» (`shop/catalog-lib.php:96`). Это безопасное поведение, но его важно знать при первом запуске.
14. **Точное число лимитов** (`shopLimit`, `shopCheckoutLimit`) и `rubizhRateAllow` описаны по коду (раздел 5). Проверка «на сколько запросов» не выполнялась на живом окружении.

### 14.1 AUTOPRICES (PIM-side, всегда OFF на RC1)

- **В SITE:** кода нет. Упоминания только в документах: `docs/release-hardening/stage-2/00-SYSTEM_MAP.md:235` («в коде SITE отсутствует, переключатель на стороне PIM»), `docs/CATALOG-RESET-20261010.md:123,169` («AUTOPRICES остаются OFF»), `docs/SITE-QA-20261010.md:66`.
- **В PIM (только чтение):** `app/lib/production-ui.inc.js:3` — `PRODUCTION_AUTOPRICES_ENABLED=false`; `releases/pim-10.9.3/migration-control.json:54` — `AUTOPRICES_ENABLED: false`; `releases/pim-10.9.3/release-verification.json:60`; `app/tools/install-production.py:52` требует `autoprices_enabled is False`; `app/tests/release-archive-safety.test.cjs:13`.
- **Production:** OFF. Первый запуск после решения владельца — только PREVIEW (без записи), по `releases/pim-10.9.3/CLEAN-IMPORT-HARDENING-REPORT.md:182`.
- **Кто меняет:** Owner, на стороне PIM. В SITE ключа нет.
- **Риск:** автоматическая запись цен в каталог без проверки. Нет SITE-флага, который можно выключить: контроль только в PIM.

---

## 15. Минимальный production config

Имена ключей, без значений. Колонка «Статус» показывает, можно ли выставить сейчас.

**Итог:** готовые к выставлению сейчас: `pim_origins`, `pim_legacy_sync=false`, `pim_v3_sync=false`, `mono_activation_confirmed=false`, `np_ttn_enabled=false`, `np_card_payment_verified=false`, `sms_enabled=false`, `google_enabled=false`, `auth_secret` (генерация), `sms_daily_limit=100`. Все остальные ключи зависят от входных данных владельца или хостинга.

| Где | Ключ / имя | Обязателен? | Значение для RC1 | Статус |
|---|---|---|---|---|
| `api/config.php` | `db_host`, `db_name`, `db_user`, `db_pass` (или `rubizh-private/database.php` с `db_tls_required=true`) | Да | Значения хостинга | **BLOCKED(Hosting)** |
| `api/config.php` | `pim_key` | Да | Случайный ≥32, ротация PL-3 | **BLOCKED(Owner/Hosting)**: нужен новый ключ и обновление PIM |
| `api/config.php` | `cron_key` | Да | Случайный ≥32, ротация PL-3 | **BLOCKED(Hosting)**: нужно обновить crontab |
| `api/config.php` | `pim_origins` | Да | `['https://pim.rubizh.shop']` | Готово |
| `api/config.php` | `pim_legacy_sync` | Да | `false` | Готово |
| `api/config.php` | `pim_v3_sync` | Да (явно) | `false` | Готово (до решения владельца) |
| `api/config.php` | `trusted_proxies` | Да | Адреса прокси хостинга | **BLOCKED(PL-1, Hosting)** |
| `api/config.php` | `media_dir`, `media_url` | Да | Путь к `media/`, `/media` | **BLOCKED(Hosting)**: путь к папке |
| `api/config.php` | `environment` | Рекомендуется | Не задавать или `production` | Готово |
| `api/config.php` | `order_notification_email` | Да | Ящик владельца | **BLOCKED(Owner)** |
| `api/config.php` | `seller` (или подтверждённые дефолты) | Да | Реквизиты владельца | **BLOCKED(Owner)** |
| `api/config.php` | `np_manager_emails` | Да (для менеджеров) | Подтверждённые email | **BLOCKED(Owner)** |
| `api/config.php` | `np_ttn_enabled` | Да (явно) | `false` | Готово (до этапа 6) |
| `api/config.php` | `np_sender`, `np_origin_refs` | Для ТТН | Подтверждённые ref | **BLOCKED(Owner, НП-диагностика)** |
| `api/config.php` | `nova_poshta_api_key` или env `RUBIZH_NP_API_KEY` | Для НП | Бизнес-ключ ФОП | **BLOCKED(Owner)** |
| `api/config.php` | `mono_activation_confirmed` | Да (явно) | `false` до этапа 6 | Готово |
| `api/config.php` | `mono_token` или env `RUBIZH_MONO_TOKEN` | Для оплаты | Токен эквайринга | **BLOCKED(Owner, фискализация ФОП)** |
| `api/config.php` | `np_card_payment_verified` | Да (явно) | `false` до PSP | **BLOCKED(Owner, PSP)** |
| `api/config.php` | `ga4_id`, `meta_pixel_id` | Нет | `''` | **BLOCKED(Owner, согласие)** для включения |
| `api/config.php` | `supplier_contacts`, `supplier_sku_map` | Нет на старте | `[]` | **BLOCKED(Owner)** |
| `api/config.php` | `tg_bot_token`, `tg_chat_id` | Нет | `''` | **BLOCKED(Owner)** |
| `api/config.php` | `donation_*` | Нет | См. раздел 14, пункт 1 | **BLOCKED(Owner)**: решение по коду |
| `auth/config.php` | `auth_secret` (≥40) | Да | Сгенерирован `dev/init-auth-secret.php` | Готово (команда) |
| `auth/config.php` | `noreply_password` или env `RUBIZH_NOREPLY_PASSWORD` | Да | Пароль ящика | **BLOCKED(Hosting)** |
| `auth/config.php` | `sms_enabled` | Да (явно) | `false` до этапа 6 | Готово |
| `auth/config.php` | `turbosms_token`, `turbosms_sender` | Для SMS | Токен и подтверждённый отправитель | **BLOCKED(Owner, модерация TurboSMS)** |
| `auth/config.php` | `google_enabled` | Да (явно) | `false` до этапа 6 | Готово |
| `auth/config.php` | `google_client_id`, `google_client_secret` | Для Google | OAuth-данные | **BLOCKED(Owner)** |
| `auth/config.php` | `sms_daily_limit` | Нет | 100 | Готово |
| `site-settings.json` | `ga4_id`, `meta_pixel_id`, `seller`, … | Через UI | Пусто до решений | Через админку после решения владельца |
| env | `RUBIZH_NP_API_KEY`, `RUBIZH_MONO_TOKEN`, `RUBIZH_TURBOSMS_TOKEN`, `RUBIZH_GOOGLE_CLIENT_SECRET`, `RUBIZH_NOREPLY_PASSWORD` | Предпочтительно вместо файлов | Значения владельца и хостинга | **BLOCKED** |

---

## 16. CRM (этап 4): флаги, секреты, настройки

CRM работает на `/crm/` того же домена; Staff API — `/api/staff/*` (`api/staff/index.php` → `staff/router.php`). Все live-флаги **по умолчанию выключены**. Без флага на production внешнее действие отвечает 409 `FEATURE_NOT_CONNECTED` «Функція ще не підключена»; на стенде (`environment=staging`) работает mock с тем же контрактом (`staff/adapters.php:3-20`). Порядок включения: `docs/crm/16-CRM_GO_LIVE_CHECKLIST.md`.

### 16.1 Флаги `api/config.php`

| Key | Тип | Default (в коде) | Prod (рекомендация) | Кто меняет | Риск при ошибке | Код |
|---|---|---|---|---|---|---|
| `crm_enabled` | bool | `false` → Staff API отвечает `CRM_DISABLED` | `true` после деплоя, миграции и учётки OWNER с TOTP | Owner | Включение до создания OWNER — пустой вход | `staff/adapters.php:9` |
| `crm_np_tracking_live` | bool | `false` | `true` 1-м из live-флагов (только чтение статусов НП) | Owner (этап 6) | Нагрузка на API НП | `staff/adapters.php:9,18` |
| `crm_sms_live` | bool | `false` | После проверки реальной SMS | Owner (этап 6) | Расход SMS, спам | `staff/adapters.php:9,26` |
| `crm_email_live` | bool | `false` | После проверки SMTP | Owner (этап 6) | Письма сотрудникам/покупателям | `staff/adapters.php:9,26` |
| `crm_np_ttn_live` | bool | `false` | После тестовой ТТН; вместе с `np_ttn_enabled` | Owner (этап 6) | Реальные ТТН | `staff/adapters.php:9,18` |
| `crm_refund_live` | bool | `false` | Последним, после тестового возврата MonoPay | Owner (этап 6) | Реальные возвраты денег | `staff/adapters.php:9,17` |
| `crm_totp_required` | bool | не задан = **true** для OWNER и ACCOUNTANT | Не задавать (оставить обязательным) | Owner | `false` отключает обязательный 2FA (только для тестов) | `staff/security.php:68` |
| `crm_mock_outbox` | path | `''` | Не задавать | Dev (стенд) | Mock-письма в файл; только staging | `staff/adapters.php:29` |
| `pim_url` | URL `https://…` | не задан → ссылка «Відкрити в PIM» скрыта | `https://pim.rubizh.shop` | Owner | Неверный адрес ссылки | `staff/lists.php:229` |
| `np_mock` | bool | не задан | **Не задавать** | Dev (стенд) | Mock НП; на production-хосте не активируется | `shop/np-lib.php:7` |

### 16.2 Секреты

| Key / env | Тип | Default | Prod | Кто меняет | Риск | Код |
|---|---|---|---|---|---|---|
| `RUBIZH_CRM_SECRET_KEY` (env, приоритет) или `crm_secret_key` | base64 32 байта (libsodium secretbox), **секрет** | нет → TOTP недоступен, 503 `CRM_SECRET_KEY_MISSING` | Сгенерировать: `php -r 'echo base64_encode(random_bytes(32)),PHP_EOL;'`, хранить вне webroot (0600) | Hosting / Owner | Потеря ключа = все TOTP-секреты нечитаемы, сотрудники переподключают 2FA; утечка = секреты TOTP раскрыты | `staff/security.php:52-56` |
| `crm_ip_salt` | string ≥32, **секрет** | `''` (хэш IP без соли) | Случайная строка | Hosting | Без соли хэши IP в журнале обратимы перебором | `staff/security.php:11` |

### 16.3 Настройки, которые меняет OWNER в CRM («Налаштування → Системні»)

Хранятся в `rubizh_crm_settings`; значение из БД побеждает `api/config.php`, тот — значение по умолчанию (`staff/lists.php:170-175`).

| Ключ | Default | Смысл | Код |
|---|---|---|---|
| `invoice_grace_workdays` | 3 | D-51: сколько рабочих дней после `payment_due` заказ «на рахунок ФОП» ждёт звірки виписки до автоотмены | `shop/order-lifecycle.php:54-57` |
| `direct_pay_max_qty` | 3 | D-52: при наличии без количества (`pim_stock_quantity = null`) сразу оплачивается не больше N шт. одного SKU в заказе; больше — «Очікує підтвердження менеджера» | `shop/pim-v3-checkout.php:73-76` |
| `vip_paid_orders` / `vip_paid_total_minor` | 3 / 2 000 000 коп. | OD-4.7: сегмент VIP | `staff/lists.php:171` |
| `sleeping_days` | 180 | Сегмент «сплячі» | `staff/lists.php:171` |
| `auto_task_unconfirmed_minutes` / `auto_task_no_ttn_hours` | 30 / 24 | Автозадачи «не підтверджено» и «немає ТТН» | `staff/lists.php:171`, `staff/worker.php` |
| `staff_stepup_seconds` (`api/config.php`) | 900 | Окно повторного входа для чувствительных действий (≤15 мин) | `shop/financial-permissions.php:43` |

### 16.4 Стенд (не задавать на production)

`environment=staging`, `mono_mock=true`, `np_mock=true`, `staging_allow_loopback`, `staging_origins` — только тестовый стенд. Синтетические данные: `php dev/crm-synthetic.php --orders=520 [--bulk=50000]` (отказывается работать без этих ключей и при любом включённом live-флаге CRM).

## 17. Свежесть данных поставщиков (этап 5.1, решение владельца 2026-10-16)

Заменяет единый `freshHours 36` этапа 5. Пороги — **настройки владельца в PIM** («Цены»), не `api/config.php`: PIM передаёт их в chunk 0 каждого пакета `/api/pim/sync` (`freshness_policy`), SITE хранит последнюю принятую политику в `meta.pim_freshness_policy` и применяет её на сервере (`shop/stock-freshness.php`).

| Настройка PIM → поле контракта | Default | Проверка | Смысл |
|---|---|---|---|
| `payFreshHours` → `pay_fresh_hours` | 72 | целое, 1–336 | данные не старше — прямая оплата как прислал PIM (с учётом `direct_pay_max_qty`) |
| `sellMaxDays` → `sell_max_days` | 8 | целое, 1–60, `sell_max_days*24 > pay_fresh_hours` | до этого возраста товар продаётся только через «Очікує підтвердження менеджера» (без MonoPay до подтверждения, покупатель видит «Менеджер підтвердить наявність перед оплатою»); старше — SKU не заказывается, модель без других заказываемых SKU скрыта с витрины (`visible=0`, `pim_publication_reason='STALE_SUPPLIER_DATA'`, не удаляется) до свежих данных |

- **Возраст данных** — время наблюдения поставщика по позиции (`stock_observed_at`), а если его нет — **время файла поставщика** (этап 5.2, решение владельца): дата формирования внутри файла (YML `yml_catalog@date`, свойства XLSX), иначе дата изменения файла; **никогда не время импорта в PIM**. PIM передаёт его в поле `stock_imported_at` (историческое имя; сайт читает его как запасное время данных, код сайта не менялся). Дата без часового пояса — киевское время; дата в будущем или до 2020 — не учитывается. Наличие, заданное вручную в PIM (`availability_source=MANUAL`), возраста не имеет. SKU без времени данных или со временем больше чем на сутки в будущем **не считается свежим**: продаётся только через подтверждение менеджера (fail closed, security-ревью M3; решение владельца S51-04).
- **Где применяется:** оформление и счёт — точно в момент запроса (`pimV3ResolveLine`); карточка товара — точно (`pimV3ProductDto`); списки, фильтры, sitemap, видимость моделей — сохранённое состояние: для записанных моделей пересчитывается в той же транзакции синхронизации, для остальных — не чаще раза в минуту при чтении (`shopFreshnessSweep`, отметка `meta.pim_freshness_swept_at`), на PHP-FPM — после отправки ответа, не дольше 2 с за проход, ожидание блокировок ≤ 2 с, без блокирующего чтения (условные UPDATE по `pim_revision`); после изменений сбрасывается кэш каталога. Замер: 5008 SKU — 70 мс без изменений, 0,68 с при смене уровня у всех.
- **Хранимое состояние:** колонки разрешений SKU — то, что PIM разрешает сейчас (их пишет синхронизация); возраст их только сужает (между синхронизациями данные лишь стареют). После смены политики владельцем (в пакете синхронизации) всё пересчитывается из присланного PIM (`variants.data`), поэтому более мягкая политика возвращает прямую оплату без новых данных.
- **Нет политики от PIM** (старый PIM или пустой `meta`) — действуют значения по умолчанию 72 ч / 8 дн. Неверная политика в пакете — весь пакет отклоняется `400 FRESHNESS_POLICY`, сохранённая политика не меняется.
- **Видно владельцу:** `GET /api/pim/status` (по ключу PIM) — `freshness_policy`, `capabilities.freshness_policy_version=1`, `products.hidden_stale_supplier_data`. PIM публикует только на сайт с `freshness_policy_version=1`.
- **Заказы:** оплаченные и уже созданные заказы правило не меняет; заказ с позицией из «правила 2» создаётся в `WAITING_CONFIRMATION` (`contact.confirmation_reason=STALE_SUPPLIER_DATA`) и виден в CRM в «Очікують підтвердження».


## 18. Загрузка выгрузок поставщиков через сайт (этап 5.6-1, D-82)

| Ключ | Тип | По умолчанию | Значение |
|---|---|---|---|
| `supplier_fetch_hosts` | list | `[]` | дополнительные домены поставщиков для `POST /api/pim/supplier-fetch` (к встроенным `armoline.com.ua`, `tactic-shop.in.ua`, `tacticalbelt.salesdrive.me`; домен разрешён вместе с `www.`). Только имена хостов: IP, `*` и прочее не принимаются как домен |

Ограничения (код, не настройки): HTTPS, порт 443, публичные адреса после DNS (закреплены на соединение), редирект только в пределах того же домена, 100 МБ, 120 с, 30 запросов в час на сеть, 2 одновременно. Лимиты PHP веб-сервера видны в `GET /api/pim/status` → `php_limits`. Исходящий HTTPS к поставщикам: `php dev/check-launch.php --net`.
