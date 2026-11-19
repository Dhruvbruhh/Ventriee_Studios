# Ventriee Studios user manual

Ventriee Studios is a desktop studio where you plan software in chat, turn the plan into a prompt, hand it to a team of AI workers, watch them work in the Office, and edit the result yourself in a built-in code editor. Your project files stay on your computer.

## 1. First start

1. Install and open Ventriee Studios (Windows 10/11, 64-bit). The installer is not code-signed yet, so Windows SmartScreen may warn: choose **More info → Run anyway** if you trust the source.
2. **Create an account** with your email and a password, confirm the email Supabase sends you, then **Sign in**.
3. **New project**: give it a name, pick a folder, and choose what to start from (empty folder, static website, React + Vite, Node API or Python API). Starter files are only written into an empty folder.

Install [Git](https://git-scm.com) for Source Control and run undo, and [Node.js](https://nodejs.org) to install the CLI tools below.

## 2. Connect the AI you already pay for

Open **Settings → Subscriptions**. Each subscription works through its vendor's own command-line tool; Ventriee never sees your password.

| Subscription | Tool | What to do |
|---|---|---|
| Claude Pro / Max | Claude Code | **Install** (if missing) → **Sign in** → type `/login`, pick your Claude account, finish in the browser |
| ChatGPT Plus / Pro | Codex CLI | **Install** → **Sign in** → choose *Sign in with ChatGPT* |
| Google account | Gemini CLI | **Install** → **Sign in** → choose *Login with Google* |
| Many providers | OpenCode | **Install** → **Sign in** → pick a provider |

Then press **Check** (sends one tiny request to prove it answers) and **Use everywhere** to make it the default for planning and for new workers.

Prefer API keys? **Settings → Engines** takes keys for OpenAI, Anthropic, Gemini, OpenRouter, DeepSeek, Mistral and others. Keys are stored in the Windows credential store. API use is billed by the provider.

## 3. A free local model for prompt enhancement

**Enhance** rewrites your prompt into a sharper brief. It can run on a small model on your own PC, free and private, using Ollama.

1. Download and install Ollama from <https://ollama.com/download>. It runs in the background after install.
2. Open a terminal (Office has two, or **Code → Terminal**) and download a model. A small, capable choice:
   ```
   ollama pull qwen3:4b
   ```
   On a weaker PC use `ollama pull llama3.2:3b` (about 2 GB). With a good GPU, `qwen3:8b` gives better results. A model needs roughly its download size in free RAM or VRAM.
3. Check it works: `ollama run qwen3:4b "say hi"`.
4. In Ventriee: **Settings → Run policy → Prompt optimizer → Model for Enhance**, pick the Ollama model. Reopen Settings if it is not listed yet; Ollama must be running.

Leave it unset to enhance with your planner model instead. **Use planner** switches back.

## 4. Plan → prompt → enhance → assign → build

1. **Plan** tab: describe the idea and talk it through with the planner. Nothing runs yet.
2. **Sessions**: **+ New session** starts another chat for the same project (for example one for features, one for pricing). In any session, type `@Session 2` to bring Session 2's conversation into the answer, such as *"@Session 2 what did we decide about login?"*.
3. **Create prompt** turns the current session into a development brief. Edit it freely; every change is kept as a version.
4. **Enhance** improves it (on your local model if you set one up).
5. **Assign**:
   - *Orchestrator breaks it down*: the planner splits the work into tasks and hires the workers it needs. You can leave the team empty and let it choose.
   - *One task per worker, in order*: no planning step.
   - **How tasks run**: *One at a time*, *Hybrid* (parallel where independent, chained where one task needs another; recommended) or *All at once*.
6. **Office** shows each worker at a desk with what it is doing. Click a worker for its live output, and use the **Mail** tab to see workers talking to each other.

**Workers talk to each other.** Workers running on CLI tools get a mailbox file (`.ventriee/mail/<name>.md`, ignored by Git) and can message a teammate who is running at the same time; API-model workers send messages when they finish. Every message appears in **Mail**.

**Cheaper models for easy tasks.** The planner rates each task low, medium or high. In **Settings → Run policy → Model routing → Automatic**, each task gets a model to match, small and cheap for low, strong for high, guided by *When routing automatically* (Cheapest / Balanced / Best quality). Manual uses exactly the model you set on each worker.

**Every worker uses the ponytail skill**: the smallest change that fully solves the task.

## 5. Runs: cost and undo

The **Runs** button in the top bar lists every run with sessions, tokens, time and cost by model and by worker. Cost appears only when the engine reports it; subscription CLIs usually do not.

Before each run, Ventriee saves a **checkpoint** of the project folder in its own data folder (not in your Git history). **Review undo** shows exactly what the run changed, and **Undo this run** puts those files back and removes files it created. Dependency folders such as `node_modules` are not snapshotted.

## 6. Code: your own editor

The **Code** tab is a VS Code-style editor:

- **Explorer**, tabs, and **Ctrl+S** to save (**Ctrl+Shift+S** saves all). If a worker changed a file you are editing, your draft is kept and you choose: compare with disk, reload, or save a copy.
- **Ctrl+P** go to file · **Ctrl+Shift+F** search all files · **Ctrl+Shift+P** command palette · **Ctrl+`** terminal.
- **Problems** lists errors the editor detects in open files. It does not see installed packages, so imports from `node_modules` may show as errors.
- **Git**: stage, commit, branch, pull and push with your normal Git login.
- **Agents**: files each worker changed, with a diff and **restore from last commit** (Git projects only).
- **Ask agent**: select code (or nothing, for the whole file) and ask a question, or **Propose edit** to get a change shown as a diff. **Accept into editor** applies it as one undoable edit; nothing is saved until you save. The code you send goes to your planner model's provider.

## 7. Terminals

Office has two terminals on the left, and Code has one in its bottom panel. They are real PowerShell sessions started in your project folder, running with your own permissions, so they can do anything you could. They keep running when you switch tabs and close on sign-out.

## 8. Side chat

The spark button in the top bar opens a side chat for anything: what to do next, ideas, how something works. It knows your project's state but cannot start work or change files.

## 9. MCP tools

**Settings → MCP tools** adds MCP servers (for example a browser, database or GitHub server) that Claude Code workers can use. Example: name `filesystem`, command `npx`, arguments `-y @modelcontextprotocol/server-filesystem .`. Codex and Gemini CLI read MCP servers from their own config files (`~/.codex/config.toml`, `~/.gemini/settings.json`). An MCP server runs as a program on your computer, so add only ones you trust.

## 10. Good to know

- Workers and terminals act on your real files. Use Git or the run checkpoints, and back up valuable projects.
- Projects and history live in `%APPDATA%\Ventriee Studios` on this PC. They are not synced to the cloud; sign-in is the only online account feature.
- A worker that fails shows why in the Office and in Runs. Retry, change its model, or split the task.
