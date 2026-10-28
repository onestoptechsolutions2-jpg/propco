# PropCo documentation

Start with the guide for your role.

## I use PropCo to manage properties

→ **[User guide](user-guide/README.md)**: step-by-step manuals with screenshots. Sign in, [Chat](user-guide/02-chat.md), [collect rent](user-guide/04-collecting-rent.md), [repairs](user-guide/05-repairs-and-suppliers.md), [owner payouts](user-guide/06-owner-payouts.md), [Books and Insights](user-guide/07-books-and-insights.md), [team and security](user-guide/10-team-and-security.md), [online payments](user-guide/11-settings-and-billing.md), [troubleshooting](user-guide/12-troubleshooting-and-faq.md).

## I want to know what PropCo is

→ **[Product overview](product/README.md)**: who it is for, what it does, plans and pricing, integrations, security in brief, limits and what is next, and a glossary.

## I build or run PropCo

→ **[Developer guide](developer/README.md)**

| Guide | Covers |
|---|---|
| [Getting started](developer/getting-started.md) | Run it locally, demo data, scripts |
| [Architecture](developer/architecture.md) | Containers, repository layout, request flow, design decisions |
| [Data model](developer/data-model.md) | The 38 models, conventions, migrations |
| [Authentication and permissions](developer/auth-and-permissions.md) | Protecting pages and actions, company separation |
| [Background jobs](developer/background-jobs.md) | The worker, message outbox, heartbeats |
| [Online payments](payments.md) | M-Pesa and Flutterwave: setup, flow, security, testing |
| [Testing](developer/testing.md) | The end-to-end suites |
| [Contributing](developer/contributing.md) | Conventions and recipes |
| [Deployment and operations](deployment.md) | Environment variables, migrations, health, backups |

## I work at PropCo and support customers

→ **[Admin console guide](admin-console.md)**: monitor platform health, look after customers, and a "customer says X, do Y" table.

## Keeping the docs current

Docs ship with the code. A feature is not done until its guide is updated, and screenshots are regenerated from demo data with `sh scripts/docs/screenshots.sh` (see [getting started](developer/getting-started.md#demo-data-and-screenshots)).

Other documents: [`../README.md`](../README.md) (repository overview), [`../property-management-platform-spec.md`](../property-management-platform-spec.md) (the original specification).
