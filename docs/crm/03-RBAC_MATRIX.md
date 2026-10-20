# CRM РУБІЖ — RBAC-матрица (этап 4)

> Сгенерировано `dev/crm-contract-gen.mjs` из `contracts/crm/crm-api.json`. Не редактировать вручную. Проверка: `tests/crm-stage4-rbac.test.mjs` (каждый маршрут × каждая роль: разрешено → не 401/403/5xx; запрещено → 403; без входа → 401; сессия покупателя → 401).

Права, выполняемые только OWNER независимо от таблицы: `payment.refund.execute`, `payment.manual_reconcile`, `payment.review`, `settings.system`, `staff.manage`, `supplier.manage`, `export.full`, `shipment.resolve_unknown`, `shipment.manual_deliver`, `inventory.return`, `site.speed.view` (`staff/auth.php`, `crmPermit`). MANAGER меняет только свои и неназначенные заказы (403 `ORDER_NOT_ASSIGNED`); платежи видит только своих заказов. WAREHOUSE не получает денежных полей (`crmRedactOrder`). Повторный вход (step-up ≤ 15 мин) — столбец «↻».

## Права × роли

| Право | Власник | Менеджер | Склад | Підтримка | Бухгалтер |
|---|:-:|:-:|:-:|:-:|:-:|
| `dashboard.view` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `dashboard.finance` | ✓ | — | — | — | ✓ |
| `dashboard.managers` | ✓ | — | — | — | — |
| `order.view` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `order.create` | ✓ | ✓ | — | — | — |
| `order.assign.self` | ✓ | ✓ | — | — | — |
| `order.assign.any` | ✓ | ✓ | — | — | — |
| `order.confirm` | ✓ | ✓ | — | — | — |
| `order.cancel` | ✓ | ✓ | — | — | — |
| `order.problem` | ✓ | ✓ | ✓ | — | — |
| `order.packing` | ✓ | ✓ | — | — | — |
| `order.complete` | ✓ | ✓ | — | — | — |
| `order.delivery.edit` | ✓ | ✓ | — | — | — |
| `order.line.supplier` | ✓ | ✓ | ✓ | — | — |
| `order.amount.view` | ✓ | ✓ | — | ✓ | ✓ |
| `order.finance.view` | ✓ | ✓ | — | — | ✓ |
| `refund.view` | ✓ | — | — | — | ✓ |
| `note.create` | ✓ | ✓ | ✓ | ✓ | — |
| `customer.view` | ✓ | ✓ | — | ✓ | ✓ |
| `customer.phone.full` | ✓ | ✓ | — | ✓ | — |
| `customer.edit` | ✓ | ✓ | — | — | — |
| `payment.view` | ✓ | ✓ | — | — | ✓ |
| `payment.invoice.create` | ✓ | ✓ | — | — | — |
| `payment.invoice.accept` | ✓ | — | — | — | ✓ |
| `order.invoice.pdf` | ✓ | ✓ | — | — | ✓ |
| `payment.review` | ✓ | — | — | — | — |
| `payment.manual_reconcile` | ✓ | — | — | — | — |
| `payment.refund.execute` | ✓ | — | — | — | — |
| `shipment.view` | ✓ | ✓ | ✓ | ✓ | — |
| `shipment.manage` | ✓ | ✓ | ✓ | — | — |
| `shipment.resolve_unknown` | ✓ | — | — | — | — |
| `shipment.manual_deliver` | ✓ | — | — | — | — |
| `return.view` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `return.create` | ✓ | ✓ | — | ✓ | — |
| `return.review` | ✓ | ✓ | — | — | — |
| `return.receive` | ✓ | ✓ | ✓ | — | — |
| `product.view` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `supplier.view` | ✓ | ✓ | ✓ | — | — |
| `supplier.manage` | ✓ | — | — | — | — |
| `task.view` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `task.manage` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `notification.view` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `audit.view` | ✓ | ✓ | — | — | ✓ |
| `report.view` | ✓ | — | — | — | ✓ |
| `export.orders` | ✓ | ✓ | — | — | ✓ |
| `export.finance` | ✓ | — | — | — | ✓ |
| `export.customers` | ✓ | ✓ | — | — | — |
| `export.full` | ✓ | — | — | — | — |
| `staff.assignees` | ✓ | ✓ | — | — | — |
| `staff.manage` | ✓ | — | — | — | — |
| `settings.personal` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `settings.system` | ✓ | — | — | — | — |
| `search` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `order.search.contact` | ✓ | ✓ | — | ✓ | ✓ |
| `wholesale.view` | ✓ | ✓ | — | — | — |
| `wholesale.manage` | ✓ | ✓ | — | — | — |
| `inventory.return` | ✓ | — | — | — | — |
| `site.speed.view` | ✓ | — | — | — | — |

## Поля × роли (видит / не видит)

Проверка: `tests/crm-stage4-fields.test.mjs` — каждое поле × каждая роль по живому ответу Staff API. WAREHOUSE видит объявленную стоимость только как поле формы ТТН (в данных не отдаётся).

| Поле | Право | Власник | Менеджер | Склад | Підтримка | Бухгалтер |
|---|---|:-:|:-:|:-:|:-:|:-:|
| Сума замовлення («Разом») (`order.total`) | `order.amount.view` | видит | видит | — | видит | видит |
| Статус оплати (оплачено / очікує / неуспішно / прострочено) (`order.payment_status`) | `order.amount.view` | видит | видит | — | видит | видит |
| Ціни й суми рядків, знижка, вартість товарів (`order.line_prices`) | `order.finance.view` | видит | видит | — | — | видит |
| Рахунки MonoPay, посилання на оплату, суми оплат (`order.invoices`) | `order.finance.view` | видит | видит | — | — | видит |
| Сума донату із замовлення (`order.donation`) | `order.finance.view` | видит | видит | — | — | видит |
| Повернення коштів і їх суми в картці замовлення (`order.refunds`) | `refund.view` | видит | — | — | — | видит |
| Суми в заявках на повернення (`return.refund_amounts`) | `refund.view` | видит | — | — | — | видит |
| Оголошена вартість і вартість доставки (поза формою ТТН) (`shipment.declared_value`) | `order.finance.view` | видит | видит | — | — | видит |
| Сума оплат клієнта (`customer.paid_total`) | `order.finance.view` | видит | видит | — | — | видит |
| Виручка й середній чек на «Огляді» (`dashboard.revenue`) | `order.finance.view` | видит | видит | — | — | видит |
| Валовий прибуток, маржа, собівартість (`dashboard.gross_profit`) | `dashboard.finance` | видит | — | — | — | видит |
| Розділ «Платежі», події MonoPay (`payments.section`) | `payment.view` | видит | видит | — | — | видит |
| Аналітика (`analytics`) | `report.view` | видит | — | — | — | видит |
| Реквізити й системні налаштування (`settings.system`) | `settings.system` | видит | — | — | — | — |

## Эндпоинты × роли

| Метод | Путь | Право | ↻ | Версия | Ключ | Власник | Менеджер | Склад | Підтримка | Бухгалтер |
|---|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| GET | `/auth/session` | — |  |  |  | публ. | публ. | публ. | публ. | публ. |
| POST | `/auth/login` | — |  |  |  | публ. | публ. | публ. | публ. | публ. |
| POST | `/auth/logout` | — |  |  |  | сесія | сесія | сесія | сесія | сесія |
| POST | `/auth/reauth` | — |  |  |  | сесія | сесія | сесія | сесія | сесія |
| POST | `/auth/totp/setup` | — |  |  |  | сесія | сесія | сесія | сесія | сесія |
| POST | `/auth/totp/enable` | — |  |  |  | сесія | сесія | сесія | сесія | сесія |
| POST | `/auth/token/accept` | — |  |  |  | публ. | публ. | публ. | публ. | публ. |
| GET | `/me` | — |  |  |  | сесія | сесія | сесія | сесія | сесія |
| POST | `/me/preferences` | `settings.personal` |  |  |  | 200 | 200 | 200 | 200 | 200 |
| POST | `/me/password` | `settings.personal` |  |  |  | 200 | 200 | 200 | 200 | 200 |
| GET | `/me/sessions` | `settings.personal` |  |  |  | 200 | 200 | 200 | 200 | 200 |
| POST | `/me/sessions/revoke-others` | `settings.personal` |  |  |  | 200 | 200 | 200 | 200 | 200 |
| GET | `/dashboard` | `dashboard.view` |  |  |  | 200 | 200 | 200 | 200 | 200 |
| GET | `/orders` | `order.view` |  |  |  | 200 | 200 | 200 | 200 | 200 |
| GET | `/orders/counters` | `order.view` |  |  |  | 200 | 200 | 200 | 200 | 200 |
| GET | `/orders/export` | `export.orders` |  |  |  | 200 | 200 | 403 | 403 | 200 |
| POST | `/orders` | `order.create` |  |  | ✓ | 200 | 200 | 403 | 403 | 403 |
| POST | `/orders/bulk/assign` | `order.assign.any` |  |  | ✓ | 200 | 200 | 403 | 403 | 403 |
| GET | `/orders/{id}` | `order.view` |  |  |  | 200 | 200 | 200 | 200 | 200 |
| POST | `/orders/{id}/assign` | `order.assign.self` |  | ✓ | ✓ | 200 | 200 | 403 | 403 | 403 |
| POST | `/orders/{id}/confirm` | `order.confirm` |  | ✓ | ✓ | 200 | 200 | 403 | 403 | 403 |
| POST | `/orders/{id}/resolve-item` | `order.confirm` |  | ✓ | ✓ | 200 | 200 | 403 | 403 | 403 |
| POST | `/orders/{id}/lines/{line}/stock` | `order.confirm` |  | ✓ | ✓ | 200 | 200 | 403 | 403 | 403 |
| POST | `/orders/{id}/lines/{line}/replace` | `order.confirm` |  | ✓ | ✓ | 200 | 200 | 403 | 403 | 403 |
| POST | `/orders/{id}/lines/{line}/remove` | `order.confirm` |  | ✓ | ✓ | 200 | 200 | 403 | 403 | 403 |
| POST | `/orders/{id}/lines/{line}/supplier` | `order.line.supplier` |  | ✓ | ✓ | 200 | 200 | 200 | 403 | 403 |
| POST | `/orders/{id}/invoice` | `payment.invoice.create` |  | ✓ | ✓ | 200 | 200 | 403 | 403 | 403 |
| POST | `/orders/{id}/cancel` | `order.cancel` |  | ✓ | ✓ | 200 | 200 | 403 | 403 | 403 |
| POST | `/orders/{id}/problem` | `order.problem` |  | ✓ | ✓ | 200 | 200 | 200 | 403 | 403 |
| POST | `/orders/{id}/packing` | `order.packing` |  | ✓ | ✓ | 200 | 200 | 403 | 403 | 403 |
| POST | `/orders/{id}/complete` | `order.complete` |  | ✓ | ✓ | 200 | 200 | 403 | 403 | 403 |
| POST | `/orders/{id}/delivery` | `order.delivery.edit` |  | ✓ | ✓ | 200 | 200 | 403 | 403 | 403 |
| POST | `/orders/{id}/note` | `note.create` |  |  | ✓ | 200 | 200 | 200 | 200 | 403 |
| POST | `/orders/{id}/shipments` | `shipment.manage` |  | ✓ | ✓ | 200 | 200 | 200 | 403 | 403 |
| POST | `/orders/{id}/shipments/manual` | `shipment.manage` |  | ✓ | ✓ | 200 | 200 | 200 | 403 | 403 |
| GET | `/orders/{id}/invoice-pdf` | `order.invoice.pdf` |  |  |  | 200 | 200 | 403 | 403 | 200 |
| POST | `/orders/{id}/accept-invoice-payment` | `payment.invoice.accept` | ↻ | ✓ | ✓ | 200 | 403 | 403 | 403 | 200 |
| POST | `/orders/{id}/reconcile-not-created` | `payment.manual_reconcile` | ↻ | ✓ | ✓ | 200 | 403 | 403 | 403 | 403 |
| POST | `/orders/{id}/manual-reconcile` | `payment.manual_reconcile` | ↻ | ✓ | ✓ | 200 | 403 | 403 | 403 | 403 |
| GET | `/customers` | `customer.view` |  |  |  | 200 | 200 | 403 | 200 | 200 |
| GET | `/customers/export` | `export.customers` |  |  |  | 200 | 200 | 403 | 403 | 403 |
| POST | `/customers/export-full` | `export.full` | ↻ |  |  | 200 | 403 | 403 | 403 | 403 |
| GET | `/customers/{cid}` | `customer.view` |  |  |  | 200 | 200 | 403 | 200 | 200 |
| POST | `/customers/{cid}/phone` | `customer.phone.full` |  |  |  | 200 | 200 | 403 | 200 | 403 |
| POST | `/customers/{cid}/profile` | `customer.edit` |  |  | ✓ | 200 | 200 | 403 | 403 | 403 |
| POST | `/customers/{cid}/note` | `note.create` |  |  | ✓ | 200 | 200 | 200 | 200 | 403 |
| GET | `/payments` | `payment.view` |  |  |  | 200 | 200 | 403 | 403 | 200 |
| GET | `/payments/export` | `export.finance` |  |  |  | 200 | 403 | 403 | 403 | 200 |
| GET | `/payments/review` | `payment.review` |  |  |  | 200 | 403 | 403 | 403 | 403 |
| POST | `/payments/review/{rid}/check` | `payment.review` |  |  | ✓ | 200 | 403 | 403 | 403 | 403 |
| POST | `/payments/review/{rid}/resolve` | `payment.review` |  |  | ✓ | 200 | 403 | 403 | 403 | 403 |
| GET | `/payments/{id}` | `payment.view` |  |  |  | 200 | 200 | 403 | 403 | 200 |
| POST | `/payments/{id}/refund` | `payment.refund.execute` | ↻ | ✓ | ✓ | 200 | 403 | 403 | 403 | 403 |
| GET | `/shipments` | `shipment.view` |  |  |  | 200 | 200 | 200 | 200 | 403 |
| GET | `/shipments/{id}` | `shipment.view` |  |  |  | 200 | 200 | 200 | 200 | 403 |
| POST | `/shipments/{id}/create` | `shipment.manage` |  | ✓ | ✓ | 200 | 200 | 200 | 403 | 403 |
| POST | `/shipments/{id}/refresh` | `shipment.manage` |  | ✓ | ✓ | 200 | 200 | 200 | 403 | 403 |
| POST | `/shipments/{id}/reconcile` | `shipment.manage` |  | ✓ | ✓ | 200 | 200 | 200 | 403 | 403 |
| POST | `/shipments/{id}/cancel` | `shipment.manage` |  | ✓ | ✓ | 200 | 200 | 200 | 403 | 403 |
| POST | `/shipments/{id}/resolve` | `shipment.resolve_unknown` | ↻ | ✓ | ✓ | 200 | 403 | 403 | 403 | 403 |
| POST | `/shipments/{id}/deliver-manually` | `shipment.manual_deliver` | ↻ | ✓ | ✓ | 200 | 403 | 403 | 403 | 403 |
| POST | `/shipments/{id}/notify` | `shipment.manage` |  |  | ✓ | 200 | 200 | 200 | 403 | 403 |
| POST | `/shipments/{id}/note` | `note.create` |  |  | ✓ | 200 | 200 | 200 | 200 | 403 |
| GET | `/returns` | `return.view` |  |  |  | 200 | 200 | 200 | 200 | 200 |
| POST | `/returns` | `return.create` |  | ✓ | ✓ | 200 | 200 | 403 | 200 | 403 |
| GET | `/returns/{id}` | `return.view` |  |  |  | 200 | 200 | 200 | 200 | 200 |
| POST | `/returns/{id}/transition` | `return.receive` |  |  | ✓ | 200 | 200 | 200 | 403 | 403 |
| POST | `/returns/{id}/note` | `note.create` |  |  | ✓ | 200 | 200 | 200 | 200 | 403 |
| GET | `/products` | `product.view` |  |  |  | 200 | 200 | 200 | 200 | 200 |
| GET | `/products/{pid}` | `product.view` |  |  |  | 200 | 200 | 200 | 200 | 200 |
| GET | `/suppliers` | `supplier.view` |  |  |  | 200 | 200 | 200 | 403 | 403 |
| GET | `/suppliers/{code}` | `supplier.view` |  |  |  | 200 | 200 | 200 | 403 | 403 |
| POST | `/suppliers/{code}/sender` | `supplier.manage` | ↻ |  | ✓ | 200 | 403 | 403 | 403 | 403 |
| GET | `/tasks` | `task.view` |  |  |  | 200 | 200 | 200 | 200 | 200 |
| POST | `/tasks` | `task.manage` |  |  | ✓ | 200 | 200 | 200 | 200 | 200 |
| POST | `/tasks/{id}` | `task.manage` |  |  | ✓ | 200 | 200 | 200 | 200 | 200 |
| GET | `/notifications` | `notification.view` |  |  |  | 200 | 200 | 200 | 200 | 200 |
| POST | `/notifications/read` | `notification.view` |  |  |  | 200 | 200 | 200 | 200 | 200 |
| GET | `/views` | `order.view` |  |  |  | 200 | 200 | 200 | 200 | 200 |
| POST | `/views` | `order.view` |  |  | ✓ | 200 | 200 | 200 | 200 | 200 |
| POST | `/views/{id}/delete` | `order.view` |  |  |  | 200 | 200 | 200 | 200 | 200 |
| GET | `/staff/assignees` | `staff.assignees` |  |  |  | 200 | 200 | 403 | 403 | 403 |
| GET | `/staff` | `staff.manage` |  |  |  | 200 | 403 | 403 | 403 | 403 |
| POST | `/staff/invite` | `staff.manage` | ↻ |  | ✓ | 200 | 403 | 403 | 403 | 403 |
| POST | `/staff/{sid}` | `staff.manage` | ↻ |  | ✓ | 200 | 403 | 403 | 403 | 403 |
| POST | `/staff/{sid}/reset-password` | `staff.manage` | ↻ |  | ✓ | 200 | 403 | 403 | 403 | 403 |
| POST | `/staff/{sid}/logout` | `staff.manage` | ↻ |  | ✓ | 200 | 403 | 403 | 403 | 403 |
| GET | `/audit` | `audit.view` |  |  |  | 200 | 200 | 403 | 403 | 200 |
| GET | `/analytics` | `report.view` |  |  |  | 200 | 403 | 403 | 403 | 200 |
| GET | `/site-speed` | `site.speed.view` |  |  |  | 200 | 403 | 403 | 403 | 403 |
| GET | `/reports` | `dashboard.view` |  |  |  | 200 | 200 | 200 | 200 | 200 |
| GET | `/settings` | `settings.personal` |  |  |  | 200 | 200 | 200 | 200 | 200 |
| POST | `/settings/system` | `settings.system` |  |  | ✓ | 200 | 403 | 403 | 403 | 403 |
| PUT | `/settings/senders/{code}` | `supplier.manage` | ↻ |  |  | 200 | 403 | 403 | 403 | 403 |
| POST | `/settings/staff` | `staff.manage` | ↻ |  |  | 200 | 403 | 403 | 403 | 403 |
| PUT | `/settings/staff/{sid}` | `staff.manage` | ↻ |  |  | 200 | 403 | 403 | 403 | 403 |
| GET | `/search` | `search` |  |  |  | 200 | 200 | 200 | 200 | 200 |
| GET | `/wholesale` | `wholesale.view` |  |  |  | 200 | 200 | 403 | 403 | 403 |
| POST | `/wholesale/{id}` | `wholesale.manage` |  |  | ✓ | 200 | 200 | 403 | 403 | 403 |
| POST | `/wholesale/{id}/phone` | `wholesale.view` |  |  |  | 200 | 200 | 403 | 403 | 403 |
| GET | `/wholesale/{id}` | `wholesale.view` |  |  |  | 200 | 200 | 403 | 403 | 403 |
| POST | `/wholesale/{id}/note` | `wholesale.manage` |  |  | ✓ | 200 | 200 | 403 | 403 | 403 |
| POST | `/wholesale/{id}/order` | `wholesale.manage` |  |  | ✓ | 200 | 200 | 403 | 403 | 403 |
