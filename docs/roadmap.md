# Product Roadmap

## V1 (Implemented)

- Single-owner merchant account
- Offline-first Products, Customers, Orders, Payments, Inventory, Reports
- WhatsApp order sharing templates
- Sync push/pull + idempotency
- Paynow initiate/status/webhook
- Sideloadable APK distribution path + optional PWA web install

## V1.1 (2-4 weeks)

- Staff accounts: OWNER / MANAGER / CASHIER
- Multi-device management and revoke
- Cloud backup + restore flow
- Rich receipts (PDF, logo, QR)
- Improved conflict merge (field-level for selected entities)
- CSV bulk product import

## V1.2

- Customer ledger, credit notes, refunds
- Supplier and purchase orders
- Barcode/QR scanning
- Multiple price lists
- SMS receipts integration interface

## V2

- Platform admin dashboard
- Subscription billing and plan limits
- Advanced analytics and exports
- Financial/accounting integrations
- Customer mini-portal

## V3

- Restaurant mode
- Delivery mode
- E-commerce mode
- Multi-branch stock transfers and reporting

## Acceptance Criteria Across Phases

- Maintain backward-compatible sync payload contracts
- Tenant-safe data boundaries for all endpoints
- Feature flags gate incomplete capabilities
- Device and audit models remain additive (no breaking migration assumptions)
