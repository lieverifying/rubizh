# CRM РУБІЖ — API (этап 4)

> Сгенерировано из `contracts/crm/crm-api.json` (`dev/crm-contract-gen.mjs`). Схемы запросов/ответов — в контракте; типы клиента — `crm.rubizh/src/contract.gen.ts`.

База: `/api/staff`. Все маршруты — в `docs/release-hardening/stage-2/00-SYSTEM_MAP.md` (раздел Staff API).

## Соглашения

- **envelope**: success {ok:true,data,meta{request_id,csrf}}; error {ok:false,error{code,message(uk),details},meta}
- **csrf**: every non-GET request carries the session CSRF token in header X-CSRF-Token or body field csrf
- **idempotency**: routes with idempotent=true require header Idempotency-Key (32 lowercase hex) generated per user attempt; body request_id is a legacy alias
- **version**: routes with version=required require body expected_version (order version hash); body version is a legacy alias; mismatch → 409 STALE_ORDER
- **step_up**: routes with step_up=true require a password re-entry (POST /auth/reauth or login) not older than 900 s → 401 STEP_UP_REQUIRED
- **money**: integer minor units (kopiyky), currency 980; *_minor fields
- **time**: UTC 'YYYY-MM-DD HH:MM:SS'; displayed in Europe/Kyiv
- **order_scope**: write: MANAGER may change only orders assigned to self or unassigned (403 ORDER_NOT_ASSIGNED); payments/refunds are visible to MANAGER only for own orders

## Маршруты

| ID | Метод | Путь | Право | Запрос | Ответ | Описание |
|---|---|---|---|---|---|---|
| `auth.session` | GET | `/auth/session` | public | — | `Session` | Стан сесії співробітника |
| `auth.login` | POST | `/auth/login` | public | `LoginRequest` | `Session` | Вхід: email, пароль, TOTP або резервний код |
| `auth.logout` | POST | `/auth/logout` | session | `Empty` | `Done` | Вийти |
| `auth.reauth` | POST | `/auth/reauth` | session | `ReauthRequest` | `Session` | Повторний вхід для чутливої дії (діє 15 хв) |
| `auth.totp.setup` | POST | `/auth/totp/setup` | enroll | `Empty` | `TotpSetup` | Почати підключення TOTP |
| `auth.totp.enable` | POST | `/auth/totp/enable` | enroll | `TotpEnableRequest` | `TotpEnabled` | Увімкнути TOTP, отримати резервні коди |
| `auth.token.accept` | POST | `/auth/token/accept` | public | `TokenAcceptRequest` | `Done` | Прийняти запрошення або скинути пароль за одноразовим посиланням |
| `me.view` | GET | `/me` | session | — | `StaffUser` | Поточний співробітник |
| `me.preferences` | POST | `/me/preferences` | `settings.personal` | `PreferencesRequest` | `StaffUser` | Ім’я та тема |
| `me.password` | POST | `/me/password` | `settings.personal` | `PasswordChangeRequest` | `Done` | Змінити свій пароль (завершує інші сесії) |
| `me.sessions` | GET | `/me/sessions` | `settings.personal` | — | `SessionList` | Мої активні сесії |
| `me.sessions.revoke` | POST | `/me/sessions/revoke-others` | `settings.personal` | `Empty` | `Done` | Завершити інші сесії |
| `dashboard` | GET | `/dashboard` | `dashboard.view` | query `PeriodQuery` | `Dashboard` | Огляд |
| `orders.list` | GET | `/orders` | `order.view` | query `OrderQuery` | `OrderList` | Список замовлень |
| `orders.counters` | GET | `/orders/counters` | `order.view` | — | `Counters` | Лічильники вкладок |
| `orders.export` | GET | `/orders/export` | `export.orders` | query `OrderQuery` | `csv` | Експорт CSV (фінансові колонки — лише з export.finance) |
| `orders.create` | POST | `/orders` | `order.create` | `PhoneOrderRequest` | `Order` | Телефонне замовлення через shopCreateOrder |
| `orders.bulk.assign` | POST | `/orders/bulk/assign` | `order.assign.any` | `BulkAssignRequest` | `BulkResult` | Масово призначити |
| `orders.view` | GET | `/orders/{id}` | `order.view` | — | `Order` | Картка замовлення |
| `orders.assign` | POST | `/orders/{id}/assign` | `order.assign.self` | `AssignRequest` | `Order` | Взяти в роботу / призначити (чуже — причина) |
| `orders.confirm` | POST | `/orders/{id}/confirm` | `order.confirm` | `ConfirmRequest` | `Order` | Підтвердити замовлення / передзамовлення v3 |
| `orders.resolve_item` (совм.) | POST | `/orders/{id}/resolve-item` | `order.confirm` | `ConfirmRequest` | `Order` | Сумісність: те саме, що confirm |
| `orders.line.stock` | POST | `/orders/{id}/lines/{line}/stock` | `order.confirm` | `LineStockRequest` | `Order` | Підтвердити залишок у постачальника по рядку |
| `orders.line.replace` | POST | `/orders/{id}/lines/{line}/replace` | `order.confirm` | `LineReplaceRequest` | `Order` | Замінити позицію (за згодою клієнта, нова перевірка ціни) |
| `orders.line.remove` | POST | `/orders/{id}/lines/{line}/remove` | `order.confirm` | `ReasonRequest` | `Order` | Прибрати позицію (перерахунок сервером) |
| `orders.line.supplier` | POST | `/orders/{id}/lines/{line}/supplier` | `order.line.supplier` | `LineSupplierRequest` | `Order` | LOG-05: призначити постачальника рядку |
| `orders.invoice` | POST | `/orders/{id}/invoice` | `payment.invoice.create` | `Empty` | `Order` | Посилання на оплату MonoPay (R5) |
| `orders.cancel` | POST | `/orders/{id}/cancel` | `order.cancel` | `ReasonRequest` | `Order` | Скасувати до оплати |
| `orders.problem` | POST | `/orders/{id}/problem` | `order.problem` | `ProblemRequest` | `Order` | Позначити / зняти проблему |
| `orders.packing` | POST | `/orders/{id}/packing` | `order.packing` | `Empty` | `Order` | Передати в комплектацію |
| `orders.complete` | POST | `/orders/{id}/complete` | `order.complete` | `Empty` | `Order` | Завершити (усі посилки доставлено) |
| `orders.delivery` | POST | `/orders/{id}/delivery` | `order.delivery.edit` | `DeliveryRequest` | `Order` | LOG-06: виправити адресу до ТТН |
| `orders.note` | POST | `/orders/{id}/note` | `note.create` | `NoteRequest` | `Note` | Внутрішній коментар |
| `orders.shipment.draft` | POST | `/orders/{id}/shipments` | `shipment.manage` | `ShipmentDraftRequest` | `Order` | Нове відправлення постачальника |
| `orders.shipment.manual` | POST | `/orders/{id}/shipments/manual` | `shipment.manage` | `ManualTtnRequest` | `Order` | 5.6-2 (D-83): ТТН, створена поза CRM (кабінет постачальника або власника), вноситься вручну; одна ТТН — одна посилка з нерозподілених позицій одного постачальника; лише оплачене замовлення |
| `orders.invoice.pdf` | GET | `/orders/{id}/invoice-pdf` | `order.invoice.pdf` | — | `Pdf` | 5-3: PDF-рахунок (оплата на рахунок ФОП); без статусу ПДВ у налаштуваннях — 409 VAT_NOTE_MISSING |
| `orders.invoice.accept` | POST | `/orders/{id}/accept-invoice-payment` | `payment.invoice.accept` | `InvoiceAcceptRequest` | `Order` | D-51: прийняти оплату за рахунком ФОП |
| `orders.reconcile.not_created` | POST | `/orders/{id}/reconcile-not-created` | `payment.manual_reconcile` | `ReasonRequest` | `Order` | R-C1: рахунок у банку не створено |
| `orders.reconcile.manual` | POST | `/orders/{id}/manual-reconcile` | `payment.manual_reconcile` | `ManualReconcileRequest` | `Order` | Прив’язати invoice_id з кабінету monobank |
| `customers.list` | GET | `/customers` | `customer.view` | query `ListQuery` | `CustomerList` | Клієнти (маска телефону) |
| `customers.export` | GET | `/customers/export` | `export.customers` | query `ListQuery` | `csv` | Експорт клієнтів з маскою |
| `customers.export.full` | POST | `/customers/export-full` | `export.full` | `ReasonRequest` | `csv` | Повний експорт (OWNER, підтвердження) |
| `customers.view` | GET | `/customers/{cid}` | `customer.view` | — | `CustomerDetail` | Картка клієнта |
| `customers.phone` | POST | `/customers/{cid}/phone` | `customer.phone.full` | `Empty` | `PhoneReveal` | Показати повний телефон (запис в audit) |
| `customers.edit` | POST | `/customers/{cid}/profile` | `customer.edit` | `CustomerEditRequest` | `CustomerDetail` | Змінити ім’я в профілі (через SITE) |
| `customers.note` | POST | `/customers/{cid}/note` | `note.create` | `NoteRequest` | `Note` | Коментар до клієнта |
| `payments.list` | GET | `/payments` | `payment.view` | query `ListQuery` | `PaymentList` | Платежі |
| `payments.export` | GET | `/payments/export` | `export.finance` | query `ListQuery` | `csv` | Експорт платежів |
| `payments.review.list` | GET | `/payments/review` | `payment.review` | — | `ReviewList` | CRM-4.1: потребують перевірки |
| `payments.review.check` | POST | `/payments/review/{rid}/check` | `payment.review` | `Empty` | `Review` | Перевірити в банку зараз |
| `payments.review.resolve` | POST | `/payments/review/{rid}/resolve` | `payment.review` | `ReasonRequest` | `Review` | Позначити розглянутим |
| `payments.view` | GET | `/payments/{id}` | `payment.view` | — | `PaymentDetail` | Рахунок та події MonoPay |
| `payments.refund` | POST | `/payments/{id}/refund` | `payment.refund.execute` | `RefundRequest` | `Refund` | Повернення коштів (CRM-4.2) |
| `shipments.list` | GET | `/shipments` | `shipment.view` | query `ListQuery` | `ShipmentList` | Відправлення |
| `shipments.view` | GET | `/shipments/{id}` | `shipment.view` | — | `ShipmentDetail` | Відправлення |
| `shipments.create` | POST | `/shipments/{id}/create` | `shipment.manage` | `Empty` | `Order` | Створити ТТН |
| `shipments.refresh` | POST | `/shipments/{id}/refresh` | `shipment.manage` | `Empty` | `Order` | Оновити статус НП |
| `shipments.reconcile` | POST | `/shipments/{id}/reconcile` | `shipment.manage` | `Empty` | `Order` | Звірити з НП |
| `shipments.cancel` | POST | `/shipments/{id}/cancel` | `shipment.manage` | `Empty` | `Order` | Видалити чернетку / ТТН до передачі |
| `shipments.resolve` | POST | `/shipments/{id}/resolve` | `shipment.resolve_unknown` | `ResolveUnknownRequest` | `Order` | R6: розбір ТТН з невідомим результатом |
| `shipments.deliver` | POST | `/shipments/{id}/deliver-manually` | `shipment.manual_deliver` | `ReasonRequest` | `Order` | M-4: підтвердити доставку вручну |
| `shipments.notify` | POST | `/shipments/{id}/notify` | `shipment.manage` | `Empty` | `Done` | Повідомити клієнта про ТТН |
| `shipments.note` | POST | `/shipments/{id}/note` | `note.create` | `NoteRequest` | `Note` | Коментар |
| `returns.list` | GET | `/returns` | `return.view` | query `ListQuery` | `ReturnList` | Повернення |
| `returns.create` | POST | `/returns` | `return.create` | `ReturnCreateRequest` | `Return` | Запит повернення |
| `returns.view` | GET | `/returns/{id}` | `return.view` | — | `ReturnDetail` | Повернення |
| `returns.transition` | POST | `/returns/{id}/transition` | `return.receive` | `ReturnTransitionRequest` | `Return` | Перехід повернення (APPROVED/REJECTED/REFUND_PENDING/CLOSED — return.review) |
| `returns.note` | POST | `/returns/{id}/note` | `note.create` | `NoteRequest` | `Note` | Коментар |
| `products.list` | GET | `/products` | `product.view` | query `ProductQuery` | `ProductList` | Товари з PIM (лише читання) |
| `products.view` | GET | `/products/{pid}` | `product.view` | — | `ProductDetail` | Модель, кольори, розміри, SKU |
| `suppliers.list` | GET | `/suppliers` | `supplier.view` | query `PeriodQuery` | `SupplierList` | Постачальники |
| `suppliers.view` | GET | `/suppliers/{code}` | `supplier.view` | — | `SupplierDetail` | Постачальник |
| `suppliers.sender` | POST | `/suppliers/{code}/sender` | `supplier.manage` | `SenderRequest` | `Sender` | LOG-04: профіль відправника — єдине джерело |
| `tasks.list` | GET | `/tasks` | `task.view` | query `TaskQuery` | `TaskList` | Завдання |
| `tasks.create` | POST | `/tasks` | `task.manage` | `TaskCreateRequest` | `Task` | Нове завдання |
| `tasks.update` | POST | `/tasks/{id}` | `task.manage` | `TaskUpdateRequest` | `Task` | Статус / виконавець завдання |
| `notifications.list` | GET | `/notifications` | `notification.view` | query `ListQuery` | `NotificationList` | Сповіщення |
| `notifications.read` | POST | `/notifications/read` | `notification.view` | `NotificationReadRequest` | `Done` | Позначити прочитаними |
| `views.list` | GET | `/views` | `order.view` | — | `SavedViewList` | Збережені подання |
| `views.save` | POST | `/views` | `order.view` | `SavedViewRequest` | `SavedView` | Зберегти подання |
| `views.delete` | POST | `/views/{id}/delete` | `order.view` | `Empty` | `Done` | Видалити подання |
| `staff.assignees` | GET | `/staff/assignees` | `staff.assignees` | — | `AssigneeList` | Кому можна призначити |
| `staff.list` | GET | `/staff` | `staff.manage` | — | `StaffList` | Співробітники |
| `staff.invite` | POST | `/staff/invite` | `staff.manage` | `InviteRequest` | `TokenLink` | Запросити (одноразове посилання) |
| `staff.update` | POST | `/staff/{sid}` | `staff.manage` | `StaffUpdateRequest` | `StaffUser` | Роль, активність |
| `staff.reset` | POST | `/staff/{sid}/reset-password` | `staff.manage` | `ReasonRequest` | `TokenLink` | Скинути пароль (одноразове посилання) |
| `staff.logout` | POST | `/staff/{sid}/logout` | `staff.manage` | `ReasonRequest` | `StaffUser` | Примусовий вихід |
| `audit.list` | GET | `/audit` | `audit.view` | query `AuditQuery` | `AuditList` | Активність (лише читання) |
| `analytics` | GET | `/analytics` | `report.view` | query `PeriodQuery` | `Analytics` | Аналітика |
| `site.speed` | GET | `/site-speed` | `site.speed.view` | — | `SiteSpeed` | D-72: швидкість сайту (LCP, CLS, INP) — медіана й p75 за 7 і 28 днів за шаблонами сторінок і пристроями |
| `reports.legacy` (совм.) | GET | `/reports` | `dashboard.view` | query `PeriodQuery` | `Report` | Сумісність: короткий звіт |
| `settings.view` | GET | `/settings` | `settings.personal` | — | `Settings` | Налаштування: особисті, системні, стан прапорців |
| `settings.system` | POST | `/settings/system` | `settings.system` | `SystemSettingsRequest` | `Settings` | Пороги (OWNER) |
| `settings.sender.legacy` (совм.) | PUT | `/settings/senders/{code}` | `supplier.manage` | `LegacySenderRequest` | `Sender` | Сумісність: профіль відправника |
| `settings.staff.create.legacy` (совм.) | POST | `/settings/staff` | `staff.manage` | `LegacyStaffRequest` | `StaffUser` | Сумісність: створити співробітника |
| `settings.staff.update.legacy` (совм.) | PUT | `/settings/staff/{sid}` | `staff.manage` | `LegacyStaffRequest` | `StaffUser` | Сумісність: змінити співробітника |
| `search` | GET | `/search` | `search` | query `SearchQuery` | `SearchResult` | ⌘K з урахуванням прав |
| `wholesale.list` | GET | `/wholesale` | `wholesale.view` | query `ListQuery` | `WholesaleList` | D-54: оптові заявки |
| `wholesale.update` | POST | `/wholesale/{id}` | `wholesale.manage` | `WholesaleUpdateRequest` | `Wholesale` | Статус оптової заявки |
| `wholesale.phone` | POST | `/wholesale/{id}/phone` | `wholesale.view` | `Empty` | `PhoneReveal` | Показати повний телефон оптової заявки (запис в audit, ліміт) |
| `wholesale.detail` | GET | `/wholesale/{id}` | `wholesale.view` | — | `WholesaleDetail` | OD-4.6: заявка, коментарі та історія |
| `wholesale.note` | POST | `/wholesale/{id}/note` | `wholesale.manage` | `NoteRequest` | `Note` | OD-4.6: коментар до оптової заявки |
| `wholesale.order` | POST | `/wholesale/{id}/order` | `wholesale.manage` | `WholesaleOrderRequest` | `Order` | OD-4.6: замовлення із заявки (покупець — із заявки, рядки й сума — сервісом замовлень SITE) |

## Ошибки

Формат: `{ok:false, error:{code, message (укр.), details}, meta:{request_id, csrf}}`. Сообщения — `staff/router.php` (`crmMessages`); внутренние тексты исключений не показываются (CRM-PHP-01).

| HTTP | Коды |
|---|---|
| 400 | INVALID_REQUEST, INVALID_QUERY, INVALID_JSON, VERSION_REQUIRED, IDEMPOTENCY_KEY_REQUIRED, WEAK_PASSWORD, TOKEN_INVALID, REASON_REQUIRED, INVALID_ASSIGNEE, INVALID_PERIOD, TOTP_INVALID (включение) |
| 401 | AUTH_REQUIRED, LOGIN_FAILED, TOTP_REQUIRED, TOTP_INVALID, STEP_UP_REQUIRED, REAUTH_FAILED |
| 403 | PERMISSION_DENIED, ORDER_NOT_ASSIGNED, CSRF_INVALID, HTTPS_REQUIRED, TOTP_ENROLL_REQUIRED |
| 404/405 | NOT_FOUND, METHOD_NOT_ALLOWED |
| 409 | STALE_ORDER, IDEMPOTENCY_CONFLICT, PRICE_CHANGED, LINE_OUT_OF_STOCK, FEATURE_NOT_CONNECTED, ORDER_PAID, SHIPMENT_STARTED, INVOICE_OPEN, PACKING_NOT_ALLOWED, NOT_DELIVERED, TTN_EXISTS, DELIVERY_UNVERIFIED, LAST_OWNER_REQUIRED, REFUND_* , коды домена SITE |
| 413 / 428 / 429 | PAYLOAD_TOO_LARGE / CHECK_REQUIRED / RATE_LIMITED |
| 503 | CRM_DISABLED, STAFF_SCHEMA_REQUIRED, SERVICE_UNAVAILABLE, CRM_SECRET_KEY_MISSING |
