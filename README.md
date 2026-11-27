# Ventriee Studios

**A private, local-first, multi-agent AI creation studio.**

Talk an idea through with an AI planner, turn the conversation into a development prompt,
enhance it, assign it to a team of real CLI agents, and watch them build — in a live office
floor with an always-visible preview of whatever they produce. Project orchestration runs
on your machine. Supabase handles account sign-in; your chosen AI providers may use network
services. No application telemetry or fake workers.

![Office](artifacts/final-app.png)

---

## What it is

Ventriee Studios is a desktop app (Electron) that turns your computer into a small software
studio. It does **not** replace your tools — it orchestrates them:

- **Chat-first planning.** Describe what you want to build. The planner asks questions and
  turns the conversation into a structured development prompt.
- **Prompt builder.** Generate, edit, enhance, compare and restore prompt revisions. Nothing
  runs until you approve a prompt.
- **Assign to agents.** Pick one worker or several, choose a model per worker, or let the
  orchestrator break the prompt into tasks and route models automatically.
- **Real execution.** Workers are real CLI agent sessions (OpenCode, Claude Code, Codex,
  Gemini CLI, Ollama) or direct model APIs. No simulated steps, no fake output.
- **The office.** A live working floor where each worker sits at a desk, shows its current
  task, and streams real stdout. Click a worker to inspect, pause, stop, or send it a
  direct instruction.
- **Always-visible preview.** Web apps, static sites, node services (with an API explorer),
  Python scripts, images and documents preview live as files change.
- **Memory.** Markdown + SQLite memory, shared across projects, workers and sessions, that
  survives restarts.
- **Skills and agents.** Starts plain: a planner and one general agent, no skills. Add your
  own skills and agent types, import them, or install a plugin. Every skill is scanned for
  malicious patterns (SkillSpector-style) before it is installed.
- **Team packs.** A team can keep its own agents and skills in a private Git repository
  (a plugin with an agent catalogue). Paste its address in Settings → Workers → Team pack:
  the app installs it and updates it on every start. Only people with read access get it.

## What you can build with it

Websites, SaaS platforms, web apps, desktop and mobile apps, APIs, backends, databases,
games, automation scripts, AI applications, prototypes, documents, data tools — anything
that can be created with code and real tools. It is not a website builder; it is a general
creation studio.

---

## Install

### Windows

Download the installer from the latest release:

- **`Ventriee Studios-<version>-setup.exe`** — NSIS installer (recommended)
- **`Ventriee Studios-<version>-portable.exe`** — portable, no install needed

Run the installer; it places the app in `%LOCALAPPDATA%\Programs\ventriee-studios` and adds
a desktop shortcut. Your data lives in `%APPDATA%\ventriee-studios` (database + markdown
memory). Delete that folder to start clean; project folders are never touched by the app.

### Linux

From the latest release:

- Download **`ventriee-studios-<version>-linux-x64.tar.gz`** (portable binary, built from Windows)
- Or, if a CI/Linux build is published: the **AppImage** and **`.deb`**

```bash
# portable tarball
tar -xzf ventriee-studios-<version>-linux-x64.tar.gz
./ventriee-studios

# Debian/Ubuntu (from a Linux-built .deb)
sudo dpkg -i ventriee-studios_<version>_amd64.deb
ventriee-studios
```

> Note: AppImage and deb packages require building on Linux (or CI) because they need
> symlink privileges and the `fpm` tool, which Windows cannot provide. The tarball is
> the Linux build produced on Windows.

## Build from source

Requires Node.js 18+ and Git.

```bash
npm install
npm run dev        # development, hot reload
npm run build      # production bundle into out/
npm run dist       # package installers (Windows: nsis + portable; Linux: AppImage + deb)
```

Supabase sign-in is required. Copy `.env.example` to `.env`, set your project URL
and public publishable/anon key, and enable Email authentication using
[the authentication setup guide](docs/supabase-authentication.md).
The app stays locked until configured. Service-role keys never belong in a desktop app.
Sign-in requires a connection to Supabase; project data remains local.

## Getting started (5 minutes)

The full walkthrough (subscriptions, the free local prompt optimizer with Ollama, sessions, run modes, Runs and undo, the code editor, terminals and MCP tools) is in the [user manual](docs/USER-MANUAL.md).

The **Code** workspace adds a Monaco editor with file tabs, Explorer, quick file
navigation, conflict-aware saves, and Source Control for Git diffs, staging,
commits, branches, and remotes. See [Code workspace](docs/code-workspace.md) for
supported features and current validation limits. Language runtimes and advanced
language servers must be installed separately.

1. **Create a project** - give it a name and a folder. The folder is the working
   directory. App file access is checked against project roots; external CLI agents
   require their own sandbox or OS isolation to restrict access outside the project.
2. **Talk it through** — the project opens on the chat stage. Describe the idea; the
   planner asks what it needs. Nothing is queued during this stage.
3. **Create Prompt** — turn the approved conversation into a structured development prompt.
   Edit it, or **Enhance** it into a new revision (the original is kept).
4. **Assign** — choose workers (or let the orchestrator plan), pick their models, and
   assign. Real sessions start.
5. **Watch** — the office floor lights up per session. Click a desk for the live stream,
   task, mail and config. The preview panel starts a dev server as soon as the workspace
   contains something runnable.
6. **Retry, stop, resume** — from a worker's inspector, stop or pause a session, send a
   direct instruction, or retry a failed task.

## Engines

Workers run on the engines you already have installed or configured:

| Kind | Engines |
| --- | --- |
| CLI agents | OpenCode, Claude Code, Codex, Gemini CLI, Ollama, custom executable |
| API providers | OpenAI, Anthropic, Gemini, OpenRouter, DeepSeek, Mistral, Deploy, Inception (Mercury), Ollama, LM Studio, vLLM, any OpenAI-compatible endpoint |

Keys live in the OS credential store, never in project files, logs or the renderer.

## Honest limitations

- Windows is the most-tested platform; Linux builds are packaged (AppImage/deb) but less
  exercised. macOS paths exist but are not verified.
- No interactive PTY terminal in the inspector yet — sessions stream stdout live, and
  interactive CLI prompts are detected and failed fast rather than hanging.
- Git worktrees are not implemented; parallel writers are isolated by per-role directory
  claims instead.
- Cost figures are exact only for providers that report usage; others are estimated and
  labelled as such.
- The installer is not code-signed (SmartScreen may warn on Windows).

## Development

| Command | What it does |
| --- | --- |
| `npm run typecheck` | Strict TypeScript over main/preload and renderer |
| `npm test` | Unit tests (vitest) |
| `npm run smoke` | Boots the built app over CDP, checks the shell renders, fails on console errors |
| `node scripts/workflow-check.mjs` | End-to-end gate: chat → prompt → enhance → assign → real sessions → office → providers → persistence |
| `npm run dist` | Build + package installers |

### Publishing an update

Installed copies update from this repository's GitHub Releases.

1. Raise `version` in `package.json` (installed apps only take a higher version).
2. `npm run dist`. This writes `dist/Ventriee-Studios-<version>-setup.exe`, its `.blockmap`, and `dist/latest.yml`.
3. Publish a release tagged `v<version>` with all three files attached (the updater reads `latest.yml`), for example:
   `gh release create v0.2.0 dist/Ventriee-Studios-0.2.0-setup.exe dist/Ventriee-Studios-0.2.0-setup.exe.blockmap dist/latest.yml dist/Ventriee-Studios-0.2.0-portable.exe --prerelease`
4. Never edit or delete a migration that has shipped; add a new one. The app backs up the database before running new migrations and refuses data from a newer version.

## Credits

- The pixel office engine under `src/renderer/src/office/` — MIT, from
  [munder-difflin](https://github.com/HarnessMD/munder-difflin)
- Office tile art and anime characters — drawn in code, MIT
- Everything else — MIT

## License

MIT. See `LICENSE`.
