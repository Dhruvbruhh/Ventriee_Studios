# Ventriee Studios — Architecture

## Overview

Ventriee Studios is a local-first, AI-native desktop IDE built with Electron. All project data, code, and agent execution run on the developer's machine. Cloud features (Phase 11) are designed but not yet implemented.

## Process model

```
┌────────────────────────────────────────────────────────┐
│  Renderer process (React 19 + TypeScript)              │
│  Port: N/A (preload bridge only)                       │
│                                                        │
│  store.ts (Zustand)   ←→  window.ventriee (IPC)        │
│  components/panels/editor                              │
└────────────────┬───────────────────────────────────────┘
                 │  contextBridge (preload/index.ts)
┌────────────────▼───────────────────────────────────────┐
│  Main process (Node / Electron)                        │
│  src/main/index.ts — 400+ IPC handlers                 │
│                                                        │
│  Store (SQLite via node:sqlite DatabaseSync)           │
│  Orchestrator (task planner + agent router)            │
│  Worker launcher (spawns CLI agents as child procs)    │
│  IntegrationCredentials (AES-256-GCM)                  │
│  Checkpoints (file-system snapshots)                   │
│  Preview server (per-project dev server proxy)         │
│  Graphify (CodeGraph MCP server, opt-in)               │
└────────────────────────────────────────────────────────┘
         │                      │
  spawns │              SQLite  │
┌────────▼─────────┐   ┌────────▼────────┐
│  CLI workers     │   │  ~/.ventriee/    │
│  claude / codex  │   │  data.sqlite    │
│  gemini / opencode│  │  *.bak snapshots│
│  ollama / custom │   └─────────────────┘
└──────────────────┘
```

## Key source directories

| Path | Purpose |
|---|---|
| `src/main/` | Electron main process |
| `src/main/index.ts` | IPC handler registration (single entry) |
| `src/main/store.ts` | SQLite access layer (Store class) |
| `src/main/db.ts` | DatabaseSync wrapper + append-only MIGRATIONS array |
| `src/main/orchestrator.ts` | Multi-agent task planner and runner |
| `src/main/planning.ts` | Chat → Prompt → Enhance logic |
| `src/main/roles.ts` | 16 agent role templates + PIPELINE constant |
| `src/main/integrationCredentials.ts` | Encrypted credential store |
| `src/main/checkpoints.ts` | Pre-run file snapshots |
| `src/preload/index.ts` | contextBridge — exposes `window.ventriee` |
| `src/shared/types.ts` | All shared TypeScript interfaces |
| `src/shared/ipc.ts` | IPC channel constants + VentrieeApi interface |
| `src/renderer/src/` | React application |
| `src/renderer/src/store.ts` | Zustand renderer state |
| `src/renderer/src/App.tsx` | Root layout + panel router |
| `src/renderer/src/shell.tsx` | Modal, Toast, NewProjectDialog |
| `src/renderer/src/components/` | Shared components |
| `src/renderer/src/panels/` | Slide-in panel screens |
| `src/renderer/src/editor/` | Monaco code workspace |

## State flow

```
Main process mutates SQLite
       │
       └─→ debouncedNotify() fires
                 │
                 └─→ IPC push: onPatch(snapshot)
                           │
                           └─→ Renderer: setSnapshot(snap)
                                     │
                                     └─→ React re-renders
```

The `Snapshot` object (types.ts) is the entire read-side of the app. Every consumer uses `useStore(s => s.snapshot)`. Writes go through `window.ventriee.*` calls which hit main-process IPC handlers that mutate SQLite and fire `debouncedNotify`.

## Database

SQLite via `node:sqlite` (Node 24 built-in — no native bindings needed).

Schema is in `src/main/db.ts` as an append-only `MIGRATIONS` array. Never edit existing entries; only append. Currently 11 migrations.

Key tables: `projects`, `agents`, `tasks`, `sessions`, `messages`, `events`, `memories`, `skills`, `automations`, `jobs`, `conversations`, `kv`, `providers`, `assignments`, `clients`.

## Agent execution

```
User approves prompt
      │
orchestrator.assign(prompt, agentIds)
      │
      ├─→ createJob() — job row in SQLite
      ├─→ planTasks() — task rows from AI planner
      └─→ For each task:
             selectWorker(task) — engine + model
             spawnWorker(task)  — CLI child process or API call
             streamOutput()     — IPC onOutput events to renderer
             recordSession()    — tokens + cost into sessions table
```

Workers are isolated child processes. Each gets a restricted working directory (the project root). No cross-project file access.

## Multi-tenancy note (from AGENTS.md)

This app is single-user (desktop). There is no multi-tenant workspace isolation needed at the application level. The `workspace_id` concept from the ventrieeleads backend does NOT apply here.

## Security

- API keys: AES-256-GCM encrypted in `~/.ventriee/creds.json`
- Worker processes: restricted to project root via `--allowed-paths` on CLI workers
- Credentials never sent to renderer; settings API returns masked values only

## Design system

CSS custom properties in `styles.css`. Key tokens:
- `--surface-1/2/3`: background layers
- `--text-1/2`: foreground
- `--accent`: primary color (default indigo)
- `--line-soft`: borders
- `--fs-xs/sm/base/lg`: type scale
- `--radius`: border radius
- `--s-1` through `--s-8`: spacing scale

## IPC naming convention

`domain:action` — e.g. `project:create`, `agent:start`, `client:list`

All handlers registered in `src/main/index.ts` via the `handle(IPC.channel, fn)` helper.
