# CONTRIBUTING.md — Developer Workflow

> [!IMPORTANT]
> **Read this first.** This is the day-to-day workflow for contributing to RoberJ Online Shop. Coding standards and AI-specific rules live in **[CLAUDE.md](./CLAUDE.md)** — read that first if you haven't. This file covers the *process* around a change: branching, commits, review, and verification.

## Before you start

1. Read [README.md](./README.md), [ARCHITECTURE.md](./ARCHITECTURE.md), and [CLAUDE.md](./CLAUDE.md).
2. Confirm the work is in scope — check [README.md → Project Scope / Out of Scope](./README.md#project-scope) and, for anything touching a business rule, the SAD.
3. Check [MODULES.md](./MODULES.md) for the module you're touching, and [DECISIONS.md](./DECISIONS.md) for any ADR that constrains it.
4. If the change matches [CLAUDE.md → Definition of Breaking Change](./CLAUDE.md#definition-of-breaking-change), raise it before starting.

## Local setup

```bash
npm install
cp .env.example .env.local     # fill in your Supabase values
npm run dev
```

See [README.md → Getting Started](./README.md#getting-started) for the full environment variable table.

## Branch naming

```text
<type>/<short-description>
```

| Type | Use for |
|------|---------|
| `feat/` | New functionality (e.g. `feat/checkout-qr-upload`) |
| `fix/` | Bug fixes (e.g. `fix/order-status-badge`) |
| `refactor/` | Non-behavioral restructuring |
| `docs/` | Documentation-only changes |
| `chore/` | Tooling, dependencies, config |
| `spike/` | Explicitly experimental/provisional work (see [DECISIONS.md → ADR-014](./DECISIONS.md#adr-014-stripe-integration-is-a-provisional-spike) for what a spike looked like, and how/why it was retired) |

Keep the description short, kebab-case, and scoped to one module where possible (matches [MODULES.md](./MODULES.md) module names).

## Commit conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<scope>): <short summary>

<optional body — the WHY, not the WHAT>
```

- **type**: `feat`, `fix`, `refactor`, `docs`, `chore`, `style`, `perf`, `test`.
- **scope**: the module (`auth`, `checkout`, `orders`, `products`, `docs`, …) — match [MODULES.md](./MODULES.md) names.
- Reference an ADR or debt item when relevant: `fix(payments): correct pending status transition (see DECISIONS.md ADR-008)`.
- One logical change per commit; prefer several small, reviewable commits over one large one.

## Pull Request checklist

Before opening a PR, confirm:

- [ ] `npm run lint` passes.
- [ ] `npm run typecheck` passes.
- [ ] `npm run build` passes (required for anything beyond a trivial docs/copy change).
- [ ] The actual flow was exercised manually (see [CLAUDE.md → Testing Expectations](./CLAUDE.md#testing-expectations)) — describe how in the PR description.
- [ ] Every item in [CLAUDE.md → Definition of Done](./CLAUDE.md#definition-of-done) is satisfied (loading/error/empty/success states, responsive, typed, authorized).
- [ ] No hardcoded routes, roles, IDs, or URLs — use `src/constants/*`.
- [ ] No duplicated components, actions, or business logic — searched [MODULES.md](./MODULES.md) and the relevant `features/` folder first.
- [ ] If a business rule or schema changed: [DECISIONS.md](./DECISIONS.md) has a new/updated ADR, and if a divergence from the SAD was introduced or resolved, [README.md → Implementation Status](./README.md#implementation-status-target-vs-current) and [ARCHITECTURE.md → Technical Debt Register](./ARCHITECTURE.md#technical-debt-register) are updated in the **same PR**.
- [ ] If the schema changed: a new migration under `supabase/migrations/`, RLS policies included, and `database.types.ts` regenerated (see [CLAUDE.md → Migration Policy](./CLAUDE.md#migration-policy)).

**PR description should state:** what changed, why (link the business requirement or ADR), how it was verified, and any known follow-up (added to the Technical Debt Register, not left implicit).

## Code review expectations

Reviewers check, in this order (mirrors [CLAUDE.md → Decision Priority](./CLAUDE.md#decision-priority)):

1. **Security** — RBAC/RLS respected; no client-trusted role, price, or `payment_status`.
2. **Correctness against the SAD** — no invented or altered business rules.
3. **Architecture fit** — respects the data-flow rule (`Page → Server Action → Service → Supabase`) and module boundaries.
4. **Reuse** — extends existing components/services rather than duplicating.
5. **Definition of Done** — full checklist, not just the happy path.
6. **Readability & consistency** — naming conventions, no dead code, no unexplained complexity.

A PR that changes a business rule, the schema, or a security boundary needs an explicit ADR reference before merge — see [DECISIONS.md → How to read this log](./DECISIONS.md#how-to-read-this-log).

## Documentation update requirements

Documentation is not optional follow-up — it lands **in the same PR** as the code:

| If your PR… | Update… |
|---|---|
| Adds/changes a module's scope, status, or files | [MODULES.md](./MODULES.md) |
| Makes an architectural choice, or reverses one | [DECISIONS.md](./DECISIONS.md) (new ADR, or supersede an existing one) |
| Changes the schema | [ARCHITECTURE.md → Target/Current schema](./ARCHITECTURE.md#target-database-schema), migration file, `database.types.ts` |
| Closes or introduces a target-vs-current gap | [README.md → Implementation Status](./README.md#implementation-status-target-vs-current), [ARCHITECTURE.md → Technical Debt Register](./ARCHITECTURE.md#technical-debt-register) |
| Ships a roadmap phase | [README.md → Current Development Status / Roadmap](./README.md#current-development-status), [CHANGELOG.md](./CHANGELOG.md) |

## Lint, typecheck & testing expectations

```bash
npm run lint       # ESLint (flat config, next/core-web-vitals + next/typescript)
npm run typecheck  # tsc --noEmit, strict mode
npm run build       # production build — the strongest local signal something is wrong
```

There is **no automated test runner** installed today — this is a recorded, deliberate decision, not an oversight (see [DECISIONS.md → ADR-015](./DECISIONS.md#adr-015-no-automated-test-runner-yet)). Until one is adopted:

- Manually exercise the flow you changed in the browser (`npm run dev`).
- For checkout/order/payment changes, also run `scripts/e2e-flow.mjs` if applicable.
- Do **not** add a test framework unilaterally — it requires a new ADR (see [CLAUDE.md → AI Non-Negotiable Rules](./CLAUDE.md#ai-non-negotiable-rules): no new libraries without clear value and approval).

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| App throws `Invalid environment configuration` on startup | Missing/invalid `.env.local` values | `cp .env.example .env.local` and fill in your Supabase keys (see [README.md](./README.md#environment-variables)); restart the dev server. |
| `npm run typecheck` fails after pulling schema changes | `database.types.ts` is stale vs. the migrations you pulled | Regenerate: `npx supabase gen types typescript --project-id <project-id> > src/lib/supabase/database.types.ts`. The generator types every function argument as non-null, so afterwards re-add `| null` on arguments that accept it (`get_buyer_activity_feed.p_before`, `add_cart_item.p_variant_id`, `update_inventory_low_stock_threshold.p_variant_id` / `p_threshold`) and on nullable return columns you rely on (`list_due_return_notifications.deadline_at`); `npm run typecheck` will point at each one. |
| A query returns fewer/no rows than expected, no error thrown | RLS policy is silently filtering rows for your current role | Check the relevant policy in `supabase/migrations/*.sql`; confirm you're testing as the intended role (`current_user_role()`), not accidentally as `anon`. |
| "Only sign in with the wrong role" / dashboard 404s | `DASHBOARD_ROLES` gate (`src/constants/roles.ts`) — you're signed in as `buyer` | Sign in as a `seller`/`admin` profile, or check role via `get_my_profile()`. |
| Image fails to load from Supabase Storage | `next.config.ts` `images.remotePatterns` doesn't match your `NEXT_PUBLIC_SUPABASE_URL` host | Confirm the env var is set before `next dev`/`next build` starts (it's read at config-eval time). |
| Server Action silently "does nothing" | Action returned `fail(...)` but the UI isn't reading `ActionResult` | Check the calling component handles both branches of `ActionResult<T>` (see [ARCHITECTURE.md → API Conventions](./ARCHITECTURE.md#api-conventions)). |
| `proxy.ts` redirect loop between sign-in and a protected page | Session cookie not refreshing, or the route is in both `PROTECTED_ROUTE_PREFIXES` and `AUTH_ROUTES` | Check `src/constants/routes.ts` for an overlap; confirm `updateSupabaseSession` runs before the redirect logic. |

## Deployment & releases

> [!NOTE]
> There is **no CI/CD pipeline or formal release process configured in this repository yet** (no `.github/workflows`, no `vercel.json`). This is stated honestly rather than assumed — do not treat any particular hosting target as configured until it appears in the repo.

- `npm run build` / `npm run start` are the only verified production-build commands today.
- When a deployment pipeline is added, document it here (this section) and in a dedicated `RELEASE_PROCESS.md` if the process grows non-trivial — don't invent one speculatively.

## Issue reporting

- Describe the **module** ([MODULES.md](./MODULES.md) name), the **role** you were acting as, and **expected vs. actual** behavior.
- For security issues, do **not** open a public issue — see [SECURITY.md](./SECURITY.md).
- For a suspected SAD/code divergence not already tracked, check [README.md → Implementation Status](./README.md#implementation-status-target-vs-current) and [ARCHITECTURE.md → Technical Debt Register](./ARCHITECTURE.md#technical-debt-register) first; if it's genuinely new, add it there rather than just filing an issue.

---

### Related documents

- 🤖 **[CLAUDE.md](./CLAUDE.md)** — coding standards, AI rules, Definition of Done.
- 🧭 **[README.md](./README.md)** — business overview and scope.
- 📐 **[ARCHITECTURE.md](./ARCHITECTURE.md)** — technical design.
- 📜 **[DECISIONS.md](./DECISIONS.md)** — why things are built this way.
- 🗂️ **[MODULES.md](./MODULES.md)** — module ownership map.
- 🔒 **[SECURITY.md](./SECURITY.md)** — vulnerability reporting.
