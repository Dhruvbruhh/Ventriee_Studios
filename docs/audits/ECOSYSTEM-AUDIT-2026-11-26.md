# Ventriee AI — Ecosystem vision audit (26 Nov 2026)

Scope: maps the "Master System Build Prompt" (desktop + web + mobile + cloud
multi-tenant ecosystem) against the **actual** repository on `master` at this
date. It does not re-document the desktop feature-by-feature — `FEATURE_STATUS.md`
already does that and is accurate. This answers one question the mega-prompt asks
first: *what exists, what's net-new, and in what order should it be built.*

## TL;DR

The repo is a **mature single-user, local-first Electron IDE** (16 phases built:
editor, multi-model chat, agents, orchestration, MCP, skills, plugins, workflows,
browser automation, SSH/E2B remote execution, voice, Supabase sign-in). ~28k LoC,
148 tests passing, production build passing.

The mega-prompt asks to turn that into a **three-interface, multi-tenant agency
operating system**. Roughly:

- **~40% already exists** — the whole Execution Layer and most of the desktop IDE.
- **~60% is net-new greenfield** — a shared cloud backend, multi-tenant identity
  (orgs/employees/roles/permissions), the web agency dashboard, the mobile app,
  inbound remote device control ("Jarvis"), and the Project Intelligence Engine.

This is a **multi-month, multi-workstream program**, not a single build. Treating
it as "finish the existing app" would be wrong: the desktop is close to done, but
three of the four interfaces don't exist yet.

## Section-by-section classification

Legend: ✅ exists & works · 🟡 partial/foundation present · ❌ net-new.

| Vision section | State | Evidence / gap |
|---|---|---|
| 3A Desktop application (exec env) | ✅ | Electron app, editor, terminal, git, browser, agents, preview |
| 3B Cloud backend (shared coordination) | ❌ | Only client-side Supabase sign-in (`auth.ts`). No server, no shared data model |
| 3C Web application (agency dashboard) | ❌ | No web/ project. Electron renderer only |
| 3D Mobile application | ❌ | No mobile/ project |
| 3E Intelligence layer | 🟡 | `memory.ts` (4 scopes), `planner.ts`, `graphify` CodeGraph MCP. No tree-sitter index, embeddings, or context compiler |
| 3F Execution layer | ✅ | `orchestrator.ts`, worker launcher, `exec.ts`, `files.ts`, `git.ts`, `browserAutomation.ts`, `testrunner.ts` |
| 4 One account, many workspaces | 🟡 | `StudioSession` is one user (userId/email). No organization, personal-vs-org switch, or sharing scope |
| 5 Web owner/admin dashboard | ❌ | Net-new |
| 6 Employee dashboard | ❌ | Net-new |
| 7 Desktop IDE (simple + dev mode) | 🟡 | Dev mode exists (full IDE). No "simple mode" chat-first surface for non-technical users |
| 8 Natural-language project creation | 🟡 | `orchestrator.makePlan` turns a brief into a task plan. No requirements-gathering Q&A, URL research gate, stack recommendation (the side-session branch adds stack recommendation), cost estimate step |
| 9 Dynamic multi-agent system | 🟡 | 16 roles + custom agent builder + orchestration + per-task skills (branch #24). Agents are DB rows, not a versioned registry/manifest with capability requirements, cost limits, approval rules |
| 10 Frontend Master department | 🟡 | A `designer`/`frontend` role + design skills (just installed). No dedicated department pipeline with screenshot-based visual QA loop |
| 11 Security Master | 🟡 | `security` skills + `skillsec.ts` scanner. No security department wired to real SAST/dependency/secret tools as agents |
| 12 Model routing & provider mgmt | 🟡 | `routing.ts` (name-pattern heuristic), `engines.ts` adapters, cost preference. No capability/benchmark profiles, no measured routing, no fallback chain |
| 13 Project Intelligence Engine | ❌→🟡 | `memory.ts` is the seed. No syntax-aware index, semantic retrieval, incremental re-index, or context compiler |
| 14 Resource & skills ecosystem | ✅/🟡 | Skills, plugins, MCP marketplace all real. "Resource registry with manifests + NL discovery across all resource types" is partial |
| 15 MCP & extension system | ✅ | Per-agent MCP access, marketplace, manifests, declarative plugin sandbox |
| 16 Agent execution workspaces | 🟡 | Workers run in the project; remote runs get isolated clones. No per-agent isolated worktree for *local* parallel work (branch #24's work and session notes touch this) |
| 17 Remote execution (Jarvis) | ❌ | `remote.ts` is **outbound** (SSH/E2B run a task elsewhere). No inbound control of *this* desktop from phone/web, no WebSocket, heartbeat, device registry, or command queue |
| 18 Mobile app (Jarvis) | ❌ | Net-new |
| 19 Cloud synchronization | ❌ | No shared DB; all state is local SQLite |
| 20 Security & permission system | 🟡 | Credential encryption, IPC frame checks, CLI sandboxing caveats. No RBAC, org access control, device auth/revocation, audit log |
| 21 Progress & verification | ✅ | Evidence-based task completion, reviewer role, checkpoints — already does what §21 asks |
| 22 Token/cost/performance | ✅ | `spend.ts`, sessions table, AnalyticsPanel |
| 23 Design & UX | ✅/🟡 | Desktop design system exists; web/mobile design systems are net-new |
| 24 Help system | 🟡 | `docs/USER-MANUAL.md` etc. No in-app Help Center |
| 26 Extensibility / registries | 🟡 | Skills/plugins/MCP are registry-like. Agents, model providers, workflows, departments are not yet manifest-driven |

## What this means

1. **Don't rebuild the desktop.** The Execution Layer and IDE are the asset. Most
   §28 rules ("reuse working components", "don't replace the DB/auth") are about
   protecting exactly this.

2. **The real work is a backend + two new clients.** Sections 3B/C/D, 4, 5, 6,
   17, 18, 19, 20 together are a multi-tenant SaaS with a web app, a mobile app,
   and a reverse-tunnel control plane. Each is its own multi-week project with its
   own repo or package. None of it can be "finished in this chat".

3. **The intelligence engine (§13) is the highest-leverage desktop-side upgrade**
   and is mostly independent of the cloud work, so it can proceed in parallel.

## Proposed sequencing (dependency-ordered)

The mega-prompt's Phase 0→12 order is sound. Grounded against this repo:

- **Now (desktop-only, no cloud needed):**
  - **Model routing v2 (§12)** — capability profiles + fallback chain on top of
    `routing.ts`. Small, self-contained, high value. *(A `model-router` skill is
    already installed as interim guidance.)*
  - **Project Intelligence Engine v1 (§13)** — incremental file index + semantic
    retrieval feeding the context given to workers. Independent workstream.
  - **Simple mode (§7)** — a chat-first surface over the existing orchestrator.

- **Foundation for everything multi-user (must come before web/mobile):**
  - **Cloud backend + data model (§3B, §19, §20)** — pick a stack (Supabase is
    already the auth provider; its Postgres + Realtime + RLS is the obvious
    least-new-tech choice). Define orgs, users, roles, projects, tasks, devices,
    audit log. This unblocks §4/5/6/17/18.

- **Then, in parallel once the backend exists:**
  - Web agency dashboard (§5, §6) · Inbound remote control / Jarvis (§17) ·
    Mobile app (§18).

- **Last:** full security hardening pass (§20), help center (§24), release (§12-end).

## Recommended first slice

Start with **Model routing v2** or the **Project Intelligence Engine** — both are
desktop-only, don't need the cloud, build directly on existing code, and each is a
reviewable PR-sized unit. The cloud backend is the other candidate but it's a
larger commitment and a stack decision the owner should make deliberately.

Everything cloud/web/mobile should be run as **separate sessions/repos**, one per
workstream, not crammed into the desktop repo.

## Honest limits of this audit

- Based on `FEATURE_STATUS.md`, `ARCHITECTURE.md`, the file inventory, and targeted
  reads of `auth.ts`, `remote.ts`, `memory.ts`, `routing.ts`, `orchestrator.ts`.
  The existing app was **not** re-run for this pass (the production review of
  2026-11-17 is the last live-run evidence).
- Percentages are rough effort estimates, not measurements.
- `master` is moving (PRs #24, #29, #30 and side-session branches landed recently);
  re-confirm a section before building on it.
