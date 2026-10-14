@AGENTS.md

# CLAUDE.md — Working Agreement for AI Assistants & Developers

> [!IMPORTANT]
> **Read this first.** This file is the operating manual for anyone — human or AI — writing code in this repository. It defines how to work, what standards to uphold, and what must never change.
>
> **The line `@AGENTS.md` at the very top is load-bearing.** It imports the Next.js 16 ground rules (this is a modified Next.js; read `node_modules/next/dist/docs/` before writing framework code). **Never remove it and never duplicate its content here.**
>
> Before coding, also read **[README.md](./README.md)** (business + scope) and **[ARCHITECTURE.md](./ARCHITECTURE.md)** (technical design). The **Software Architecture Document (SAD)** is the authoritative business spec; when the code disagrees with the SAD on a business rule, the SAD wins — see the [Implementation Status table](./README.md#implementation-status-target-vs-current).
>
> For deeper context beyond this file: **[MODULES.md](./MODULES.md)** (what exists, per module), **[DECISIONS.md](./DECISIONS.md)** (why it's built this way, as ADRs), **[CONTRIBUTING.md](./CONTRIBUTING.md)** (the PR/review workflow this file's standards feed into).

---

## AI Startup Checklist

Complete **every** box before writing code. Do not skip ahead.

```text
□ Read README.md                     (business, scope, roadmap, target-vs-current)
□ Read CLAUDE.md                     (this file — standards & workflow)
□ Read ARCHITECTURE.md               (system design, schema, RBAC, flows)
□ Understand the requested module    (purpose + boundaries in the docs)
□ Search for reusable components     (src/components, feature components)
□ Search for services                (src/lib/supabase/queries.ts)
□ Search for existing types          (feature types, src/types, database.types.ts)
□ Search for existing Server Actions (features/**/actions/*.actions.ts)
□ Search for RBAC                    (requireRole/requireSessionUser, RLS, proxy.ts)
□ Check the database schema          (supabase/migrations, database.types.ts)
→ Only then write code.
```

> [!WARNING]
> If a requirement is ambiguous, or would require changing a **business rule** or introducing a **breaking change**, **stop and ask** before implementing. Do not invent business rules.

---

## AI Development Workflow

1. **Clarify the requirement** against the SAD and README scope. Confirm it is in scope (not in [Out of Scope](./README.md#out-of-scope)).
2. **Locate before creating.** Search for existing components, services, types, actions, and constants to reuse or extend. Reuse beats rewrite.
3. **Follow the layers.** `Page → Server Action → Service (queries.ts) → Supabase`. Put logic where it belongs (see [Architecture Principles](#architecture-principles)).
4. **Validate & authorize.** Zod at the boundary; `requireSessionUser` / `requireRole` before mutating; rely on RLS underneath.
5. **Build the full feature**, not a happy path (see [Definition of Done](#definition-of-done)).
6. **Verify.** Run `npm run lint` and `npm run typecheck` (and `npm run build` for non-trivial work). Exercise the flow.
7. **Document divergence.** If you must deviate from the target, record it in the [Technical Debt Register](./ARCHITECTURE.md#technical-debt-register).

---

## Coding Standards

Apply these always:

- **SOLID** — single responsibility per module/component/function; depend on abstractions (the service layer), not on Supabase directly.
- **DRY** — never duplicate business logic, components, or API/action code. Extract and reuse.
- **KISS** — the simplest solution that meets the requirement wins.
- **Clean Architecture** — dependencies point inward: UI → actions → service → data. Inner layers know nothing about outer ones.
- **Separation of Concerns** — presentation, orchestration, business logic, and data access are distinct layers.
- **Reusable components** — compose from `src/components/ui`; do not fork one-off variants.
- **TypeScript strict** — no `any` escapes, no ignored errors, no non-null assertions to silence the compiler.

---

## Architecture Principles

These are **permanent** and apply to every change:

| Principle | In practice |
|-----------|-------------|
| **Marketplace-first** | Features serve the unified three-shop catalog experience. |
| **Server-first** | Default to Server Components; add `"use client"` only when interactivity requires it. |
| **Role-based** | Every protected capability checks role; never assume the proxy already did. |
| **Supabase-first** | Auth/DB/Storage are Supabase; RLS is the primary authorization boundary. |
| **Service layer** | `src/lib/supabase/queries.ts` is the **only** place that calls `.from()` / `.rpc()`. |
| **Reusable components** | Business-agnostic UI lives in `src/components`; domains compose it. |
| **Rule-based recommendation** | Guided Product Selection uses explicit rules, never AI/ML. |
| **Manual payment verification** | COD + QR receipt upload; no payment gateway in scope. |
| **Responsive by default** | Mobile-first; four async states everywhere. |

**Where logic belongs:**

- **Pages** orchestrate only — compose features, pass data down. Never query the DB.
- **Components** present only — receive data/callbacks as props. No business logic, no Supabase.
- **Server Actions** validate, authorize, delegate, revalidate. No inline SQL.
- **Service layer** owns all database access, mappers, and caching.
- **Database queries are reusable** — add to `queries.ts`, don't scatter them.

---

## Repository Conventions

- **No hardcoding.** Routes come from `src/constants/routes.ts`, roles from `src/constants/roles.ts`, statuses from `src/constants/status.ts`, query keys from `src/constants/query-keys.ts`. No literal IDs or URLs in code.
- **Env only through `src/config/env.ts`.** Never read `process.env` elsewhere.
- **Middleware is `src/proxy.ts`**, not `middleware.ts` (Next.js 16 convention).
- **Domain models are camelCase**; DB rows are snake_case in `database.types.ts`. Convert with mappers in `queries.ts`.
- **Money is integer cents.** Never floats for currency.
- **Barrels (`index.ts`)** define each feature's public surface; import across features via barrels, not internals.
- **Migrations** are transactional, idempotent, and additive; regenerate `database.types.ts` after each.

---

## Folder Responsibilities

| Folder | Responsibility | May import |
|--------|----------------|------------|
| `src/app` | Routes only; pages orchestrate | features, components, lib, constants |
| `src/components` | Shared, business-agnostic UI | lib/utils, constants, types |
| `src/features/<name>` | One business domain (actions/components/hooks/schemas/types) | lib, components, constants, own barrel |
| `src/lib/supabase` | Supabase clients + the service layer (`queries.ts`) | database.types, config |
| `src/lib/utils` | Pure helpers (cn, currency, date, result) | — |
| `src/hooks` | Shared React hooks | lib |
| `src/providers` | App-wide providers | lib, features |
| `src/config` | Validated env + site config | zod |
| `src/constants` | Routes, roles, statuses, keys | — |
| `src/types` | Shared cross-cutting types | — |
| `src/proxy.ts` | Session refresh + route guards | lib/supabase/session, constants |

---

## Module Boundaries

- A feature **owns** its `actions / components / hooks / schemas / types / constants`.
- Features **do not** reach into another feature's internals. Share via `src/lib`, `src/components`, or the target feature's `index.ts` barrel.
- **All DB access** funnels through `src/lib/supabase/queries.ts`. A feature never calls Supabase directly.
- The **cart** is intentionally client-side (localStorage + `useReducer`); only checkout commits it server-side.
- Reserved/stub features (`assistant`, `dashboard`, `inventory`, `notifications`, `reports`) must be built to their SAD purpose — do not repurpose them.

---

## Naming Conventions

| Kind | Convention | Example |
|------|-----------|---------|
| Components | `PascalCase` | `ProductCard`, `CheckoutForm` |
| Component files | `PascalCase.tsx` | `OrderTimeline.tsx` |
| Hooks | `useCamelCase` | `useCart`, `useDebouncedValue` |
| Server Actions | `verbNounAction` | `placeOrderAction`, `signInAction` |
| Action files | `<domain>.actions.ts` | `order.actions.ts` |
| Zod schemas | `camelCaseSchema` | `checkoutSchema` |
| Schema files | `<domain>.schema.ts` | `auth.schema.ts` |
| Types / Interfaces | `PascalCase` | `OrderSummary`, `ActionResult` |
| Domain models | `camelCase` fields | `order.totalCents` |
| DB tables & columns | `snake_case` | `order_items`, `price_cents` |
| Enums (DB) | `snake_case` type + values | `order_status`, `payment_status` |
| API routes / route handlers | `kebab-case` paths | `/auth/callback` |
| Folders | `kebab-case` (features `lowercase`) | `features/checkout`, `product-filters` |
| Constants | `UPPER_SNAKE_CASE` | `USER_ROLES`, `PROTECTED_ROUTE_PREFIXES` |
| Route helpers | `camelCase` in `ROUTES` | `ROUTES.orderDetail(id)` |

---

## Security Standards

> For vulnerability reporting and the full security-model summary, see **[SECURITY.md](./SECURITY.md)**. The rules below are what to uphold while writing code; SECURITY.md is what to do if you find they weren't.

Always:

- **Authentication** — via Supabase Auth; sessions refreshed in `proxy.ts`.
- **Authorization** — `requireSessionUser` / `requireRole` in actions; RLS as the primary boundary.
- **RBAC** — enforce Guest / Customer / Shop Owner / Administrator boundaries in depth.
- **Input validation** — Zod at every action boundary; never trust `formData` or query params.
- **Protected routes** — keep `PROTECTED_ROUTE_PREFIXES` accurate; guard sensitive layouts server-side.
- **Secure file uploads** — validate type/size; store in Supabase Storage; for QR receipts, keep payments `pending` until manual verification.
- **Error hygiene** — map raw provider errors to friendly copy; never leak internals or enable account enumeration.

Never:

- ❌ Expose secrets or read `process.env` outside `src/config/env.ts`.
- ❌ Bypass authentication or authorization.
- ❌ Trust the client for `payment_status`, role, or `buyer_id` (always derived server-side).
- ❌ Use the service-role key from client code or unprotected paths.

---

## Performance Standards

- **Prefer Server Components** where interactivity isn't required.
- **Lazy-load heavy client components** (galleries, editors) with `dynamic`/`Suspense`.
- **Optimize queries** — select only needed columns (literal column lists), index foreign keys, avoid N+1.
- **Cache request-shared reads** with React `cache()` and revalidate deliberately.
- **Avoid unnecessary re-renders** — stable props/keys, memoize where it measurably helps.
- **Images** through the configured Supabase remote patterns; size responsibly.

---

## Testing Expectations

> [!NOTE]
> There is **no test runner installed** today (no Jest/Vitest/Playwright). Automated coverage is limited to the Node scripts in `scripts/` (`e2e-flow.mjs`, `e2e-stripe.mjs`). Pure logic (no framework imports) can be unit-tested with Node's built-in runner: `npm run test:unit` (see `scripts/test-product-save-flow.mjs`).

- At minimum, every change must pass **`npm run lint`** and **`npm run typecheck`**; run **`npm run build`** for non-trivial work.
- **Exercise the actual flow** you changed (drive the UI / run the relevant `scripts/*.mjs`), not just typecheck.
- Do **not** add a heavyweight test framework without clear justification and approval (see [AI Non-Negotiable Rules](#ai-non-negotiable-rules)). If you do, wire it into `package.json` scripts and document it here.

---

## Definition of Done

A feature is **not complete** until it includes:

- ✔ **UI** — responsive, accessible, consistent with the component library.
- ✔ **API / Server Action** — returning `ActionResult<T>`.
- ✔ **Validation** — Zod at the boundary.
- ✔ **Error handling** — mapped, friendly messages.
- ✔ **Loading state**.
- ✔ **Empty state**.
- ✔ **Success feedback**.
- ✔ **Responsive design** — mobile → desktop.
- ✔ **TypeScript types** — no `any`, no ignored errors.
- ✔ **Role-based authorization** — guarded at action + relying on RLS.
- ✔ **Reusable components** — composed, not duplicated.
- ✔ **Documentation** — update the relevant doc/section and, if diverging, the [Technical Debt Register](./ARCHITECTURE.md#technical-debt-register).
- ✔ **Verified** — lint + typecheck (+ build) green; flow exercised.

---

## Repository Governance

Who decides what, and where it's recorded:

| Question | Authority | Recorded in |
|---|---|---|
| Is this business requirement in scope? | The SAD | [README.md → Project Scope](./README.md#project-scope) |
| Why was this architectural approach chosen? | Prior art / precedent | [DECISIONS.md](./DECISIONS.md) (ADR) |
| What owns this data/behavior? | The module boundary | [MODULES.md](./MODULES.md) |
| Is this change safe to merge as-is? | Code review, against this file | [CONTRIBUTING.md → Code review expectations](./CONTRIBUTING.md#code-review-expectations) |
| Is this a breaking change? | [Definition of Breaking Change](#definition-of-breaking-change) | Raised before implementation, not after |
| Is this gap acceptable to leave open? | The Technical Debt Register | [ARCHITECTURE.md → Technical Debt Register](./ARCHITECTURE.md#technical-debt-register) |

**Ownership model:** modules are owned by their purpose, not by a person — see [MODULES.md](./MODULES.md) for what each module is responsible for and what it may depend on. A change that reaches across a module boundary (per [Module Boundaries](#module-boundaries)) needs a stronger justification in review than one contained within a single module.

**No silent authority.** No single document — including this one — outranks the [Documentation Hierarchy](./README.md#documentation-hierarchy). If a decision genuinely can't be resolved by reading the docs, that's a signal to add or update an ADR in [DECISIONS.md](./DECISIONS.md), not to guess.

---

## Decision Priority

When implementation choices exist, prioritize in this order:

1. **Security**
2. **Maintainability**
3. **Scalability**
4. **Reliability**
5. **Performance**
6. **User Experience**
7. **Developer Experience**
8. **Visual Polish**

---

## AI Decision Rules

When multiple implementations are possible:

1. **Reuse existing code.**
2. **Preserve the architecture** (layers, boundaries, service layer).
3. **Preserve business rules** (SAD is authoritative).
4. **Prefer maintainability** over cleverness.
5. **Avoid unnecessary libraries.**
6. **Avoid duplication.**
7. **Ask before making breaking changes.**

---

## Project Philosophy

When several approaches work, always prefer:

- **Readable** code
- **Reusable** code
- **Maintainable** code
- **Scalable** architecture
- **Consistency** over cleverness

> Optimize for **long-term maintainability**, not short-term speed. Consistency beats novelty.

---

## AI Non-Negotiable Rules

**Never:**

- ❌ Duplicate components
- ❌ Duplicate APIs / Server Actions
- ❌ Duplicate business logic
- ❌ Hardcode IDs
- ❌ Hardcode URLs
- ❌ Bypass RBAC
- ❌ Bypass authentication
- ❌ Ignore TypeScript errors
- ❌ Ignore loading states
- ❌ Ignore error handling
- ❌ Ignore empty states
- ❌ Ignore responsive design
- ❌ Create giant files (> 500 lines) without strong justification
- ❌ Introduce new libraries without clear value and approval
- ❌ Change business rules (the SAD is authoritative)

---

## Definition of Breaking Change

Treat a change as **breaking** — and **ask before proceeding** — if it:

- Alters a **business rule**, scope item, or role permission defined by the SAD.
- Changes the **database schema** in a non-additive way, or removes/renames a column/table in use.
- Modifies the **public surface** of a feature barrel, a Server Action signature, or `ActionResult` shape.
- Changes **auth, RBAC, RLS**, or route protection (`proxy.ts`, `PROTECTED_ROUTE_PREFIXES`).
- Introduces a **new dependency** or removes an existing one.
- Reworks the **data-flow layering** or the service-layer contract.
- Touches **payment logic** or the money representation.

Additive, backward-compatible changes that keep lint/typecheck/build green are **not** breaking.

---

## Migration Policy

- One concern per migration; **transactional and idempotent**; **additive** wherever possible.
- Name with a sortable timestamp prefix, matching the existing `supabase/migrations/` convention.
- Preserve the security model: `SECURITY DEFINER` helpers + per-operation **RLS**, least-privilege grants, no `DELETE` on financial rows.
- After **every** schema change, regenerate types:
  ```bash
  npx supabase gen types typescript --project-id <project-id> > src/lib/supabase/database.types.ts
  ```
- Never edit a released migration to change its meaning — add a new one.

---

## Architecture Evolution Policy

The code is **converging toward the SAD**. When you close a gap:

- Follow the ordered strategy in [ARCHITECTURE.md → Architecture Evolution Strategy](./ARCHITECTURE.md#architecture-evolution-strategy).
- Keep every intermediate state **building and type-checking**.
- Update the [Implementation Status table](./README.md#implementation-status-target-vs-current) and [Technical Debt Register](./ARCHITECTURE.md#technical-debt-register) in the same change.
- Retire spikes deliberately — e.g. remove Stripe artifacts when the target **COD + QR + manual verification** path lands. Do not expand the Stripe spike as if it were sanctioned scope.

---

## Repository Glossary

| Term | Meaning |
|------|---------|
| **SAD** | Software Architecture Document — the authoritative business specification. |
| **Guest / Customer / Shop Owner / Administrator** | The four SAD roles. In code today: unauthenticated / `buyer` / `seller` / `admin`. |
| **Guided Product Selection** | Rule-based recommendation assistant. **Not** AI. |
| **Service layer** | `src/lib/supabase/queries.ts` — the sole database-access module. |
| **Server Action** | A `"use server"` function; RoberJ's "API layer". Returns `ActionResult<T>`. |
| **`ActionResult<T>`** | Discriminated success/failure envelope returned by every action. |
| **proxy.ts** | Next.js 16 middleware; refreshes the session and guards routes. |
| **RLS** | Row-Level Security — the primary authorization boundary in PostgreSQL. |
| **DEFINER helper** | `SECURITY DEFINER` SQL function (`current_user_role`, `is_admin`) used inside RLS. |
| **`create_order`** | The sanctioned checkout RPC — atomic stock decrement + order creation. |
| **Spike** | Experimental code outside official scope (e.g. the Stripe integration). |
| **Four states** | loading / error / empty / success — required on every async surface. |
| **ADR** | Architecture Decision Record — one entry in [DECISIONS.md](./DECISIONS.md): context, options, decision, consequences. |
| **Module** | A self-contained business domain under `src/features/`, documented in [MODULES.md](./MODULES.md). Not a person or team — see [Repository Governance](#repository-governance). |
| **Technical debt** | A tracked, intentional gap vs. the SAD target — see [ARCHITECTURE.md → Technical Debt Register](./ARCHITECTURE.md#technical-debt-register). Not a euphemism for undocumented shortcuts. |

---

## Prompt Engineering Notes

For AI assistants operating in this repo:

- **Ground every task** in README + ARCHITECTURE + CLAUDE before proposing code; cite the specific rule/section you're following.
- **Prefer targeted searches** (barrels, `queries.ts`, `constants/*`) over broad guesses; confirm a thing exists before importing it.
- **Name the layer** you're editing (page / action / service / component) and keep the change within that layer.
- **Surface divergence explicitly.** If the SAD and code disagree, state it, follow the SAD for business rules, and note the debt.
- **Confirm before breaking.** For anything matching [Definition of Breaking Change](#definition-of-breaking-change), ask first.
- **Report verification honestly** — show lint/typecheck output; if a step was skipped, say so.
- **Respect `@AGENTS.md`.** This is a modified Next.js 16; read `node_modules/next/dist/docs/` before writing framework code.

---

### Related documents

- 🧭 **[README.md](./README.md)** — business overview, scope, roadmap, repository map.
- 📐 **[ARCHITECTURE.md](./ARCHITECTURE.md)** — system design, schema, RBAC, sequence diagrams.
- 📜 **[DECISIONS.md](./DECISIONS.md)** — architecture decision records (ADRs).
- 🗂️ **[MODULES.md](./MODULES.md)** — per-module ownership, status, and files.
- 🛠️ **[CONTRIBUTING.md](./CONTRIBUTING.md)** — developer workflow, PR checklist, troubleshooting.
- 🔒 **[SECURITY.md](./SECURITY.md)** — vulnerability reporting and security model.
- 🗓️ **[CHANGELOG.md](./CHANGELOG.md)** — what shipped and when.
- 📋 **[AGENTS.md](./AGENTS.md)** — Next.js 16 framework ground rules (imported at the top of this file).
