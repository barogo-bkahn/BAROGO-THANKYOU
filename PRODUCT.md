# 칭찬교환소

## Platform
web, responsive; Slack App Home links to the exchange.

## Users and purpose
Barogo employees exchange personally earned praise points for personal rewards. The five designated People administrators see all employee settlements, balances and orders.

## Confirmed workflow
Quarterly quantitative and qualitative scores are weighted 50:50. Points are credited only after a People administrator approves the settlement. Employees see balance, products and order history on one page; administrators approve and inspect all records on one page. Same colleague once per quarter; no team restriction; one submission per calendar month. No team gifts. No automatic public posts or recipient DMs.

## Stack and constraints
Existing Node ES modules and Supabase service-only RPC. New website uses dependency-free Node, semantic HTML/CSS/JS. Local demo is explicitly isolated with fictional data. Production uses Slack OIDC, server sessions and Supabase private tables. Point conversion and product prices remain unconfirmed and must not become production defaults.

## Brand commitments
칭찬교환소, friendly Korean voice, existing orange People mascot. The user requested immediate development; routine layout and engineering decisions are delegated by that request. No additional design approval round.
