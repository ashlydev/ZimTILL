# Rollout Plan

## Pilot Phase (Week 1)

- 5-10 Zimbabwean SMEs
- Validate:
  - offline ordering
  - WhatsApp share quality
  - partial payment flows
  - Paynow completion rates

## Controlled Launch (Weeks 2-4)

- Expand to 50 merchants
- Enable support channel and issue triage cadence
- Track metrics:
  - daily active merchants
  - sync success rate
  - outbox backlog depth
  - Paynow success/failure ratios

## Broad Launch (Month 2)

- Side-load APK distribution via website + WhatsApp
- Publish optional PWA installer page
- Weekly releases with backward-compatible sync contracts

## Support SOP

- Critical issues: same-day hotfix
- Data correctness issues: request sync logs + device id + merchant id
- Fallback: manual CSV export from API (planned V1.1)
