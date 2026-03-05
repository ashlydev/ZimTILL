# Backlog

## P0

| Story | Priority | Effort | Dependencies |
|---|---|---|---|
| As an owner, I can add staff with roles and pin login. | P0 | M | Role/User permissions middleware |
| As a merchant, I can revoke a lost device. | P0 | M | Device management APIs + UI |
| As a merchant, I can restore data to a new phone. | P0 | L | Backup service + encryption |
| As a merchant, I can export core reports. | P0 | S | Report service formatting |

## P1

| Story | Priority | Effort | Dependencies |
|---|---|---|---|
| As a merchant, I can import products from CSV. | P1 | M | File parser + validation |
| As a merchant, I can print branded PDF receipts. | P1 | M | PDF template + asset pipeline |
| As a merchant, I can track supplier purchase orders. | P1 | L | Supplier and PO domain models |
| As a merchant, I can use barcode scanning for products. | P1 | M | Camera permissions and scanner module |

## P2

| Story | Priority | Effort | Dependencies |
|---|---|---|---|
| As platform admin, I can view all merchants and plans. | P2 | L | Admin auth + web dashboard |
| As platform owner, I can enforce subscription plan limits. | P2 | L | Billing + feature gate middleware |
| As merchant, I can run multi-branch operations. | P2 | L | Branch-level stock model and sync strategy |
| As merchant, I can publish an online catalog and checkout. | P2 | L | Web catalog + payment + inventory sync |

## Notes

- Keep V1 sync protocol immutable where possible.
- New entities should include standard metadata fields (`id`, `merchantId`, timestamps, soft delete, `version`, `lastModifiedByDeviceId`).
- Every P0 item must include migration and rollback plan before release.
