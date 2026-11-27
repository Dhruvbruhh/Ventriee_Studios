# Ventriee Studios — Feature Status

Last updated: 2026-11-26

## Legend
- ✅ Implemented & wired
- 🟡 Partial / stub
- ❌ Not started

---

## Phase 1 — Core Application Shell
| Feature | Status | Notes |
|---|---|---|
| Electron desktop app | ✅ | electron-vite, electron 45 |
| Collapsible sidebar | ✅ | Ctrl+B toggle |
| Command palette | ✅ | CommandBar.tsx |
| Multi-workspace tabs (Home/Plan/Office/Code) | ✅ | ws-toggle in topbar |
| Resizable panels | ✅ | Sidebar, code sidebar and bottom panel drag-resize; sizes persist |
| Dark theme | ✅ | CSS variables in styles.css |
| Light theme | ✅ | Settings → Appearance: Dark / Light / Match Windows (`settings.theme`) |
| Monaco Editor | ✅ | monaco-editor 0.55.1 |
| File explorer | ✅ | CodeWorkspace/FileTree |
| Terminal (xterm + node-pty) | ✅ | Multiple slots |
| Auto-update | ✅ | electron-updater |

## Phase 2 — Multi-Model AI Provider System
| Feature | Status | Notes |
|---|---|---|
| Anthropic / Claude | ✅ | api-anthropic adapter |
| OpenAI / GPT | ✅ | api-openai adapter |
| Google Gemini | ✅ | api-gemini adapter |
| OpenRouter | ✅ | api-openrouter adapter |
| DeepSeek | ✅ | api-deepseek adapter |
| Mistral | ✅ | api-mistral adapter |
| Ollama (local) | ✅ | api-ollama + cli-ollama |
| LM Studio | ✅ | compatible endpoint |
| Custom OpenAI endpoints | ✅ | api-custom + cli-custom |
| xAI / Groq | ✅ | api-xai + api-groq adapters (OpenAI-compatible, keyed; XAI_API_KEY / GROQ_API_KEY) |
| Add / edit / remove providers | ✅ | SettingsPanel → Engines |
| Model discovery | ✅ | Models fetched per provider |
| Secure credential storage | ✅ | integrationCredentials.ts AES-256-GCM |
| Streaming responses | ✅ | SSE on all API adapters |
| Token / cost tracking | ✅ | sessions table, RunSummary |
| Fallback models | ✅ | Agent runs: routed fallback chain; a failed task escalates to the next model (`routeModels` in `shared/routing.ts`, orchestrator). Planning chat uses the picked model only |
| Intelligent model routing | ✅ | Capability profiles per model + task shape + costPreference (`shared/routing.ts`); profiles are derived from model names, owner overrides in Settings |

## Phase 3 — AI Chat & Prompt Studio
| Feature | Status | Notes |
|---|---|---|
| Persistent conversation history | ✅ | conversations + chat tables |
| Multiple threads | ✅ | Sidebar session list |
| Project context | ✅ | projectId scoped |
| Model selector | ✅ | ModelPicker in chat bar |
| File/image attachments | ✅ | Attachments.tsx |
| Markdown + code rendering | ✅ | RichText.tsx |
| Streaming | ✅ | onChatChunk IPC |
| 6-stage workflow (Chat→Prompt→Enhance→Assign→Execute→Review) | ✅ | Workspace.tsx StageStrip |
| Prompt creation from chat | ✅ | promptCreate IPC |
| Prompt enhancement via optimizer model | ✅ | promptEnhance IPC, Ollama supported |
| Prompt history | ✅ | PromptPanel with version list |
| Reusable templates | ✅ | Templates picker in the chat composer: save the current draft as a named snippet, insert it in any project, delete it (`chat_templates` table, `chatTemplateSave`/`Delete` IPC) |
| Message editing / regeneration | ✅ | Planning chat: edit any of your messages or regenerate the last reply; later turns are replaced (`Store.rewindChat`). Attached images are not resent |
| Conversation export | ✅ | "Export transcript" saves the active session as Markdown (`## You` / `## Assistant (model)` turns); `chatExport` IPC + `shared/transcript.ts`. Empty sessions refuse to export |
| Branching | ✅ | "Branch from here" on any message creates a new session holding the turns up to it; the original is untouched. Sidebar shows "(from Session N)". `chatBranch` IPC + `Store.branchConversation` |

## Phase 4 — Agent Management
| Feature | Status | Notes |
|---|---|---|
| 16 built-in agent roles | ✅ | roles.ts |
| Custom agent builder | ✅ | ProjectPanel agent editor |
| Skills per agent | ✅ | skills field on agents |
| MCP tools per agent | ✅ | passed via --mcp-config |
| Agent task queue | ✅ | tasks table + orchestrator |
| Task dependencies | ✅ | parentId on tasks |
| Agent execution logs | ✅ | events + sessions tables |
| Office floor visualization | ✅ | PixiJS OfficeFloor |
| Agent inspector | ✅ | Inspector.tsx |
| Multi-agent orchestration | ✅ | orchestrator.ts pipeline |
| Human approval gate | ✅ | Deploy-phase tasks pause in `approval` status; approve/reject from Inspector, Rail or SimpleMode (reason optional on reject); stale Inspector taps are a no-op |
| Checkpoint / undo | ✅ | checkpoints service |
| Agent cancellation | ✅ | stop IPC |

## Phase 5 — MCP System
| Feature | Status | Notes |
|---|---|---|
| MCP client (Claude Code --mcp-config) | ✅ | passed to cli-claude workers |
| Add / configure MCP servers | ✅ | SettingsPanel → MCP tools |
| Enable / disable servers | ✅ | enabled flag on McpServer |
| Test connection | ✅ | Settings → MCP tools → Test: stdio and streamable-HTTP handshakes (`mcpInspect.ts`); SSE servers can be used but not tested |
| Browse tools, resources, prompts | ✅ | Listed (all pages) under each server after Test |
| Environment variables / auth headers | ✅ | Per server `env` and `headers`, written into the worker MCP config. Stored encrypted at rest with `safeStorage` (`mcpSecrets.ts`), plaintext values migrated on startup; visible warning when the OS keychain is unavailable |
| Remote (HTTP / SSE) servers | ✅ | `url` + `transport` on McpServer |
| MCP Marketplace | ✅ | Sidebar → Marketplace: search the official registry (registry.modelcontextprotocol.io), featured searches, versions, publisher namespace, install npm / PyPI (uvx) / Docker / remote; installs pinned and switched off |
| Per-agent server access | ✅ | `mcpServers[]` on agent; `writeMcpConfig` filters to that list; picker in Settings → Workers |
| MCP tool-call logs | ✅ | `mcp_tool_calls` table; `mcpToolCalls` IPC; Inspector → MCP tab shows calls for the latest session |
| Reviews | ❌ | The registry has none |
| Secret storage | 🟡 | Server env/header values live in Studio settings (local database), not the OS keychain |

## Phase 6 — Skills System
| Feature | Status | Notes |
|---|---|---|
| Skill install from directory | ✅ | skillScanner.ts |
| Skill enable/disable | ✅ | SkillsPanel.tsx |
| Assign skills to agents | ✅ | skills[] on agent |
| Skill editor | ✅ | In-app SKILL.md editor in SkillsPanel (edit icon per skill) |
| Skill marketplace | ✅ | SkillsPanel → Marketplace tab: featured skills + install from Git URL |
| Custom skill creation UI | ✅ | Create form in SkillsPanel |

## Phase 7 — Plugin System
| Feature | Status | Notes |
|---|---|---|
| Plugin manifest | ✅ | `ventriee-plugin.json` (pluginManifest.ts): id, semver version, minAppVersion, dependencies, contributes |
| Contributions | ✅ | Skills (security-scanned), MCP servers (added off), workflows (added disabled), agent templates, themes, prompt shortcuts (command bar) |
| Install / update / remove | ✅ | From a folder or an https Git URL; preview shows permissions first; update keeps the owner's server on/off + env; removal takes back exactly what was added |
| Dependencies / compatibility | ✅ | Required plugins and versions checked both ways; minAppVersion enforced |
| Sandboxing | ✅ | Declarative only: no plugin code runs; paths must stay inside the plugin folder; theme values limited to colours on known variables |
| Error reporting | ✅ | Per-plugin problems listed in the Marketplace |
| UI extensions / editor enhancements / code tools | ❌ | Would need running plugin code; deliberately not supported |

## Phase 8 — Automation Engine
| Feature | Status | Notes |
|---|---|---|
| Automations CRUD | ✅ | AutomationsPanel.tsx |
| Trigger types | ✅ | Through Workflows: manual, schedule, webhook, file change, git commit, agent run finished / failed |
| Actions (run agent, command, etc.) | ✅ | Through Workflows: agent run, command, AI, HTTP, browser steps, notify, run another workflow |
| Retry policy | ✅ | Per step, up to 3 retries with backoff |
| GitHub PR / issue triggers, build/test-failure triggers | ✅ | Workflows: github_pr (PR list changes) and github_ci (a CI run fails) triggers, polled every 30 s via gh; fires on change only |
| Execution logs | ✅ | events table |
| Enable / disable | ✅ | enabled flag |

## Phase 9 — Visual Workflow Builder
| Feature | Status | Notes |
|---|---|---|
| Node-based editor | ✅ | WorkflowsPanel.tsx: drag steps, drag port-to-port links, click a link to remove |
| Trigger nodes | ✅ | Start step: manual, webhook (127.0.0.1:47615, secret token), file change (filter, own edits ignored), git commit, run finished / failed; plus schedule |
| AI / agent nodes | ✅ | Ask AI (planner engine), Agent team (full run, waits for it) |
| Logic nodes | ✅ | If (yes/no), Wait, Run another workflow, Switch (multi-branch by value), Loop (run N times with optional until), Parallel (concurrent AI prompts), Approval (pause for human OK) |
| Tool nodes | ✅ | Command (input as VENTRIEE_INPUT, never spliced in), HTTP request, Browser steps, Notify |
| Templates | ✅ | Test on every commit, Nightly agent QA, Mobile site check, Webhook summary |
| Workflow execution engine | ✅ | workflows.ts, live per-step status and log, retries, Stop, nesting up to 4 deep |
| Version history | ✅ | `workflow_versions` table; History button in WorkflowsPanel; max 50 snapshots per workflow |
| Approval step | ✅ | Approval node pauses BFS; approve/reject UI in run log; OS notification |

## Phase 10 — Browser Automation
| Feature | Status | Notes |
|---|---|---|
| Browser workspace | ✅ | Sidebar → Browser: a separate sandboxed Electron window (own session, no node, no permissions) driven by a step script, watched live |
| Steps | ✅ | goto, click, type, press, wait, waitfor, scroll, screenshot, text, viewport (responsive checks), expect … contains (expected vs actual), inspect (DOM: interactive elements + selectors) |
| Console / network / downloads | ✅ | Console and network logs per session; downloads saved to Downloads/Ventriee browser |
| Approval for sensitive actions | ✅ | Clicking, typing or pressing keys on a non-local site asks first (once per site per run) |
| Agents | 🟡 | Workflows' Browser step; Claude Code workers can also use the pre-seeded Playwright MCP server (off by default) |
| Tabs | ✅ | `tab new` / `tab <n>` / `tab close` steps; target=_blank links open a new tab in the same window instead of navigating in place |

## Phase 11 — Cloud Agents
| Feature | Status | Notes |
|---|---|---|
| Remote execution | ✅ | Sidebar → Remote agents: SSH provider (remote.ts) behind a `RemoteProvider` interface for other clouds later |
| Workspace / clone / branch | ✅ | Fresh ~/ventriee-workspaces/<id>, shallow clone, `ventriee/<id>` branch, optional push |
| Setup, agent, build/test | ✅ | Setup command, then the agent CLI with the task in $VENTRIEE_TASK |
| Keeps running when the app closes | ✅ | Started detached (nohup + setsid); status polled when the app is open |
| Logs, cancel, artifacts, cleanup | ✅ | Live log tail, cancel (kills the process group), save changes as .patch, delete the workspace |
| Env vars, resource limits | ✅ | Per-run env (base64, never spliced as code); time limit always; memory limit where systemd is available |
| Hosted sandboxes (E2B) | ✅ | E2BProvider in remote.ts; provider toggle in RemotePanel; API key in Settings → Connectors |

## Phase 12 — Code Editor
| Feature | Status | Notes |
|---|---|---|
| Monaco with syntax highlighting | ✅ | |
| File tabs | ✅ | |
| Find / replace | ✅ | Monaco built-in |
| Git diff overlay | ✅ | |
| Inline AI completions | ✅ | completionEngine setting |
| Explain / refactor / fix via AI | ✅ | CodeWorkspace toolbar |
| Checkpoint restore | ✅ | |
| Multiple terminals | ✅ | office-1 / office-2 slots |
| VIM mode | ✅ | monaco-vim |

## Phase 13 — Git
| Feature | Status | Notes |
|---|---|---|
| Status / diff / commit / push / pull | ✅ | gitAction IPC |
| Branch management | ✅ | |
| Stash | ✅ | |
| Blame | ✅ | |
| GitHub sign-in | ✅ | Settings → GitHub: status, install gh, sign in (browser + one-time code via `gh auth login --web`), sign out; the token stays in gh's credential store |
| PR / issue management | ✅ | github.ts: list/view/diff/checkout/review/comment/merge via `gh` |

## Phase 14 — Terminal
| Feature | Status | Notes |
|---|---|---|
| Multiple terminal sessions | ✅ | |
| Shell selection | ✅ | terminalShell setting |
| Process management | ✅ | |
| Environment variables | ✅ | Per-project env vars in Project settings (`projects.envVars`); applied to new terminal sessions for that project (`TerminalService.open` extraEnv). Values that look like secrets are masked in the UI with a show/hide toggle |

## Phase 15 — Usage Analytics
| Feature | Status | Notes |
|---|---|---|
| Per-run cost / tokens | ✅ | RunsPanel |
| Today's spend | ✅ | spendToday IPC |
| Dedicated analytics dashboard | ✅ | AnalyticsPanel.tsx (sidebar → Analytics) |
| Cross-project aggregation | ✅ | By model and by project |
| Date filters | ✅ | 7 / 30 / 90 days / all time |
| Charts | ✅ | Daily cost bars |

## Phase 16 — Design System
| Feature | Status | Notes |
|---|---|---|
| Dark-first CSS design system | ✅ | styles.css with CSS variables |
| Accent customization | ✅ | Settings → Appearance: presets, custom colour, reset; saved as settings.accent |
| Light theme | ✅ | Settings → Appearance |
| Command palette | ✅ | CommandBar |
| Keyboard shortcuts | ✅ | keybindings setting |

## Agency-Specific Features (added this session)
| Feature | Status | Notes |
|---|---|---|
| Client CRM (kanban) | ✅ | ClientsPanel.tsx |
| Project profiles picker | ✅ | shell.tsx ProfilePicker |
| Client → Project link | ✅ | clientId on Project |
| Resource library | ✅ | Registry in `src/shared/resources.ts` merges skills, plugins, MCP servers, workflows, worker roles and a curated library catalogue; states (installed/available/needs install) come from real sources, library state from the open project's `package.json`; natural-language discovery (`discoverResources`) explains its matches. UI: ResourcesPanel.tsx |
| Security review (read-only scan) | ✅ | `src/shared/security.ts` + `src/main/securityScan.ts`: secret patterns (masked), dangerous-code rules, .env hygiene, real `npm audit --json`; Security panel; digest injected into the security worker's prompt; `tests/security.test.ts` |
| Frontend visual QA loop | ✅ | `src/main/visualQa.ts`: after a frontend worker delivers, the sandboxed browser renders the preview at desktop + mobile widths, screenshots both, and checks console errors and empty pages; failures rework the task with specific findings; reviewer receives the rendered-check summary; `tests/visualQa.test.ts` |
| Connectors (Resend/PostHog/Sentry etc.) | ✅ | SettingsPanel → Connectors; passed to CLI agent workers as env vars (`connectorEnv`) |
| Client badge in Plan view | ✅ | Workspace.tsx |
| Team invite by email | ✅ | Team page "Invite member" → invite-member Edge Function (owner/admin verified server-side; account created with an invite email or existing account joined); deploy steps in docs/cloud-setup.md |

## Voice assistant ("Ventriee")
| Feature | Status | Notes |
|---|---|---|
| Floating voice UI | ✅ | VoiceAssistant.tsx; pill bottom-right, Ctrl+Alt+V |
| Modes | ✅ | Hands-free, Push-to-talk, Wake word ("Hey Ventriee" + 8 s follow-up), Text only |
| Voice activity detection | ✅ | voice/audio.ts: adaptive noise floor, min-speech, end-of-turn silence (setting) |
| Noise handling | ✅ | Browser echo cancellation + noise suppression + adaptive VAD floor |
| Speech recognition | 🟡 | Turn-based, not word-streaming: VAD cuts a turn, then Whisper. Fast with a local Whisper server (Settings → Voice); the built-in `whisper` CLI reloads its model each turn (seconds) |
| Hindi / English / Hinglish | ✅ | Whisper prompt keeps Hinglish in Latin script; replies follow the speaker's style |
| Streaming AI → streaming TTS | ✅ | Reply tokens stream; each finished sentence is spoken while the rest is generated |
| TTS | ✅ | System voices (local) or OpenAI voices (prefetched per sentence); voice, speed, volume |
| Interrupt | ✅ | Talk over it (barge-in, raised threshold while speaking), Esc, or Stop |
| Context + history | ✅ | Last 12 turns sent; 40 kept across restarts (localStorage) |
| Local / cloud model | ✅ | Chip in the header; local = Ollama model in Settings → Voice |
| Studio actions | ✅ | Open project, show a view, start/stop an agent run, new session |
| Progress announcements | ✅ | Speaks when a run starts and finishes (and how many tasks failed) |
| Latency measurement | ✅ | Per turn on this machine: transcription, first word, first sound |
| Not verified with a real microphone | ⚠️ | UI and logic tested with a fake mic device and unit tests; real-room accuracy and latency not measured yet |

---

## Still open
- Plugin code (UI extensions, editor enhancements) — kept out on purpose for safety
- Voice: not yet measured with a real microphone
