/**
 * In-app Help Center content. Written as data so the panel stays thin, the copy
 * stays reviewable, and every topic can be validated by tests. This is not
 * parsed from docs/*.md: it is the source of truth for the Help panel.
 */
export const HELP_SECTION_HEADINGS = ['What is it', 'When to use', 'How to configure', 'Which agents use it', 'What can go wrong'] as const
export type HelpSectionHeading = (typeof HELP_SECTION_HEADINGS)[number]

export interface HelpSection {
  heading: HelpSectionHeading
  points: string[]
}

export interface HelpTopic {
  id: string
  title: string
  summary: string
  sections: HelpSection[]
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    summary: 'Ventriee Studios is a local-first studio: plan in chat, hand the brief to a team of AI workers, watch them in the Office, and edit the result in a built-in code editor. Your files stay on your computer.',
    sections: [
      { heading: 'What is it', points: [
        'A desktop app (Windows) for planning and building software with AI agents.',
        'Your projects, chats and history live in your data folder, not in the cloud.',
        'Agents run through the engines you already pay for (Claude, ChatGPT, Gemini, OpenCode) or API keys.',
      ] },
      { heading: 'When to use', points: [
        'First launch: create an account, confirm the email, sign in.',
        'Any time you start a new idea and want a team to help build it.',
      ] },
      { heading: 'How to configure', points: [
        'Create a project: name it, pick a folder, choose a starter (empty, static, React + Vite, Node API, Python API).',
        'Connect an engine in Settings → Subscriptions (CLI login) or Settings → Engines (API key).',
        'Install Git for Source Control and run undo; Node.js for the CLI tools.',
      ] },
      { heading: 'Which agents use it', points: [
        'None until you connect an engine. A project with zero engines can still plan in chat, but nothing can run.',
      ] },
      { heading: 'What can go wrong', points: [
        'The installer is not code-signed yet: Windows SmartScreen may warn, choose More info → Run anyway if you trust the source.',
        'Missing Git or Node.js shows up when you open Source Control or install a CLI subscription.',
        'Starter files are only written into an empty folder.',
      ] },
    ],
  },
  {
    id: 'projects',
    title: 'Projects',
    summary: 'A project is a folder on your PC with its own sessions, plans, runs and history. All agents work inside the active project folder.',
    sections: [
      { heading: 'What is it', points: [
        'Each project bundles a folder, its planning sessions, the code workers produce, and run history.',
        'Starter profiles scaffold common setups: empty folder, static site, React + Vite, Node API, Python API.',
      ] },
      { heading: 'When to use', points: [
        'Start a new project for a new idea or a new client, so contexts stay separate.',
        'Switch projects from the sidebar list anytime.',
      ] },
      { heading: 'How to configure', points: [
        'Sidebar → New project, or the folder button to create another.',
        'Use the Project button (bottom of the sidebar) for per-project settings.',
        'New session (plus button on the project) starts another chat in that project.',
      ] },
      { heading: 'Which agents use it', points: [
        'All agents work inside the active project folder and see its files.',
      ] },
      { heading: 'What can go wrong', points: [
        'Switching projects with unsaved code edits asks before discarding.',
        'Projects and history are not synced to the cloud; back up valuable folders yourself.',
        'Checkpoints and undo live in the app data folder, not in your Git history.',
      ] },
    ],
  },
  {
    id: 'ai-chat',
    title: 'AI Chat',
    summary: 'The Chat workspace is where you talk an idea through with the planner before anything runs. Sessions keep conversations separate, and Create prompt turns one into a brief.',
    sections: [
      { heading: 'What is it', points: [
        'A conversational planning layer: discuss what to build, then turn the chat into a development brief.',
        'Sessions are separate conversations per project (features, pricing, bugs, …).',
        'In any session, type @Session 2 to pull another session\u2019s decisions into the answer.',
      ] },
      { heading: 'When to use', points: [
        'At the start of any feature or idea, before you assign work.',
        'To refine a brief: Create prompt, then Enhance rewrites it into a sharper prompt.',
      ] },
      { heading: 'How to configure', points: [
        'Sidebar → New session, or the plus button in the top bar.',
        'Enhance can run on a free local Ollama model: Settings → Run policy → Prompt optimizer → Model for Enhance.',
      ] },
      { heading: 'Which agents use it', points: [
        'The planner agent answers the chat and drafts prompts.',
        'Enhance uses your chosen model (planner engine, or a local Ollama model if set).',
      ] },
      { heading: 'What can go wrong', points: [
        'Chat alone builds nothing: you must assign tasks to workers.',
        'Without a configured engine the planner cannot reply.',
        'Local enhance needs Ollama running and the model pulled; reopen Settings if it is not listed.',
      ] },
    ],
  },
  {
    id: 'agents',
    title: 'Agents',
    summary: 'Agents are AI workers that execute tasks in your project. The orchestrator breaks a brief into tasks and hires the workers it needs; you can also assign one task per worker yourself.',
    sections: [
      { heading: 'What is it', points: [
        'Workers run with real file access in the project folder and report back as they work.',
        'Office shows each worker at a desk with live output; the Mail tab shows workers messaging each other.',
        'Before every run, a checkpoint of the project is saved so you can review and undo.',
      ] },
      { heading: 'When to use', points: [
        'After a prompt or brief is ready and you want code produced.',
        'When you want to watch progress and intervene mid-run.',
      ] },
      { heading: 'How to configure', points: [
        'Assign: Orchestrator breaks it down (auto-hire) or One task per worker, in order.',
        'Run mode: One at a time, Hybrid (parallel where independent; recommended), or All at once.',
        'Click a worker in the Office for its live output; use Runs to undo the whole run.',
      ] },
      { heading: 'Which agents use it', points: [
        'The orchestrator plans and hires; workers do tasks; the planner drafts the brief they execute.',
      ] },
      { heading: 'What can go wrong', points: [
        'Workers act on your real files: use Git or run checkpoints, and back up valuable projects.',
        'A worker that fails shows why in Office and Runs: retry, change its model, or split the task.',
        'CLI workers need their subscription tool installed and signed in.',
      ] },
    ],
  },
  {
    id: 'code',
    title: 'Code',
    summary: 'The Code workspace is a VS Code-style editor over your project: Explorer, tabs, search, problems, Git, an Agents panel, and Ask agent for questions and proposed edits.',
    sections: [
      { heading: 'What is it', points: [
        'A built-in editor with file tree, tabs, search, problems list and integrated terminal.',
        'Git panel: stage, commit, branch, pull and push with your normal Git login.',
        'Agents panel lists files each worker changed, with diffs and restore from last commit.',
      ] },
      { heading: 'When to use', points: [
        'Reviewing or editing what workers produced, fixing things yourself, exploring diffs.',
        'Asking about selected code: select code (or nothing for the whole file) and use Ask agent or Propose edit.',
      ] },
      { heading: 'How to configure', points: [
        'Ctrl+S saves; Ctrl+Shift+S saves all; Ctrl+P go to file; Ctrl+Shift+F search all files; Ctrl+Shift+P command palette; Ctrl+` terminal.',
        'Propose edit shows a diff; Accept into editor applies it as one undoable edit until you save.',
      ] },
      { heading: 'Which agents use it', points: [
        'Workers change files here; your edits and theirs meet in the same folder.',
        'Ask agent sends code to your planner model\u2019s provider.',
      ] },
      { heading: 'What can go wrong', points: [
        'Problems does not see installed packages, so node_modules imports may show as false errors.',
        'If a worker changes a file you are editing, you choose: compare with disk, reload, or save a copy.',
        'Nothing is saved until you press save; accepted proposals are not written automatically.',
      ] },
    ],
  },
  {
    id: 'terminal',
    title: 'Terminal',
    summary: 'Real PowerShell sessions inside your project folder. Office has two on the left; Code has one in its bottom panel. They run with your own permissions.',
    sections: [
      { heading: 'What is it', points: [
        'Full shells in the project folder: npm, git, ollama, servers, anything you can run.',
        'They keep running when you switch tabs and close on sign-out.',
      ] },
      { heading: 'When to use', points: [
        'Any command or tooling you would run yourself: installs, git, pulling local models, starting dev servers.',
      ] },
      { heading: 'How to configure', points: [
        'Open in the Office side rail or the Code bottom panel; type commands normally.',
      ] },
      { heading: 'Which agents use it', points: [
        'None: terminals are yours. Workers share the same filesystem, so changes show up in both places.',
      ] },
      { heading: 'What can go wrong', points: [
        'Terminals run with your permissions and can do anything you can: be deliberate with destructive commands.',
      ] },
    ],
  },
  {
    id: 'browser',
    title: 'Browser',
    summary: 'Browser automation drives a separate, sandboxed browser window with simple steps: test local apps, check layouts, capture screenshots.',
    sections: [
      { heading: 'What is it', points: [
        'A panel that scripts a real browser against your project (local apps or any URL).',
        'Steps are simple actions: navigate, click, type, look, screenshot.',
      ] },
      { heading: 'When to use', points: [
        'Verifying a UI after workers build it, checking responsive layouts, taking screenshots for review.',
      ] },
      { heading: 'How to configure', points: [
        'Open Browser in the sidebar, add steps, and run them against the project.',
      ] },
      { heading: 'Which agents use it', points: [
        'The browser agent carries out the step list you build.',
      ] },
      { heading: 'What can go wrong', points: [
        'The browser is sandboxed but page content is arbitrary: keep it to URLs and apps you trust.',
        'A misconfigured step can hang: stop or cancel it in the panel.',
      ] },
    ],
  },
  {
    id: 'remote',
    title: 'Remote agents',
    summary: 'Run an agent on a machine you control (a cloud VM, a build server) over SSH. It keeps working after you close Ventriee.',
    sections: [
      { heading: 'What is it', points: [
        'Offloads a worker to another machine you can reach over SSH.',
        'Work continues even when the studio is closed.',
      ] },
      { heading: 'When to use', points: [
        'Long or heavy jobs, machines with better GPUs, or build/CI-style servers.',
      ] },
      { heading: 'How to configure', points: [
        'Open Remote agents in the sidebar, configure the SSH host, and connect.',
        'Make sure the remote machine has the engine and tools the task needs.',
      ] },
      { heading: 'Which agents use it', points: [
        'Any worker you route to the remote host instead of this PC.',
      ] },
      { heading: 'What can go wrong', points: [
        'SSH credentials unlock that machine: keep them scoped to what the agent needs.',
        'A dropped connection can orphan a remote run; check the remote host\u2019s state before rerunning.',
      ] },
    ],
  },
  {
    id: 'skills',
    title: 'Skills',
    summary: 'Skills are folders with a SKILL.md that teach agents how to do a job. Every new worker starts with the ponytail skill: the smallest change that fully solves the task.',
    sections: [
      { heading: 'What is it', points: [
        'A library of instructions agents read before starting work.',
        'The Skills panel lists installed, enabled, disabled and needs-review skills, with a rescan.',
      ] },
      { heading: 'When to use', points: [
        'To standardize behavior across projects: style guides, documentation habits, stack-specific rules.',
      ] },
      { heading: 'How to configure', points: [
        'Open Skills in the sidebar, import or rescan, and toggle skills on or off.',
        'Every skill is scanned for malicious patterns on import and on rescan.',
      ] },
      { heading: 'Which agents use it', points: [
        'Every worker reads the enabled skills that apply before starting.',
      ] },
      { heading: 'What can go wrong', points: [
        'A skill that fails the scan badly is removed and never registered.',
        'A misleading skill steers all workers: review before enabling.',
      ] },
    ],
  },
  {
    id: 'mcp',
    title: 'MCP',
    summary: 'MCP servers give agents extra tools: a browser, a database, GitHub, a filesystem, and more. They are configured in Settings → MCP tools.',
    sections: [
      { heading: 'What is it', points: [
        'Model Context Protocol servers are local programs that expose extra tools to agents.',
        'Example: name filesystem, command npx, arguments -y @modelcontextprotocol/server-filesystem .',
      ] },
      { heading: 'When to use', points: [
        'When agents need capabilities beyond their defaults: querying a database, using a browser, talking to GitHub.',
      ] },
      { heading: 'How to configure', points: [
        'Settings → MCP tools: add a server name, command and arguments.',
        'Codex and Gemini CLI read MCP servers from their own config files instead (e.g. ~/.codex/config.toml).',
      ] },
      { heading: 'Which agents use it', points: [
        'Claude Code workers use the servers you configure here.',
        'Codex and Gemini workers use their own configs, not the studio list.',
      ] },
      { heading: 'What can go wrong', points: [
        'An MCP server runs as a program on your computer: add only ones you trust.',
        'A crashed server shows up as missing tools; check its command and arguments point at a real binary.',
      ] },
    ],
  },
  {
    id: 'resources',
    title: 'Resource library',
    summary: 'One searchable library for everything an agent can use: skills, plugins, MCP servers, workflows, the built-in workers, and external libraries such as GSAP or Drizzle.',
    sections: [
      { heading: 'What is it', points: [
        'A read-only view over the real registries, so a resource is only marked Installed when it actually is.',
        'Library entries are checked against the open project\'s package.json. No project open means nothing can be detected.',
      ] },
      { heading: 'When to use', points: [
        'You know the capability you need ("animated landing page", "payments") but not which tool provides it.',
        'You want to see what is already installed before adding another dependency to the project.',
      ] },
      { heading: 'How to configure', points: [
        'Type a capability in the search box. Results explain which terms matched.',
        'Installed skills, plugins and MCP servers have a button that opens the panel where you manage them.',
        'For a library marked Needs install, the exact install command is shown; run it in the project when you want it.',
      ] },
      { heading: 'Which agents use it', points: [
        'Skills are offered to the workers whose role or configuration binds them.',
        'Plugins and MCP servers must be enabled before a worker can use them; libraries are ordinary project dependencies.',
      ] },
      { heading: 'What can go wrong', points: [
        'A library installed outside package.json (for example a global CLI) still reads as Needs install.',
        'An empty search result means no resource matches those words; try a capability such as "animation" or "database".',
      ] },
    ],
  },
  {
    id: 'workflows',
    title: 'Workflows',
    summary: 'Chain AI, agent runs, commands and checks into a flow you can run by hand or on a schedule.',
    sections: [
      { heading: 'What is it', points: [
        'A visual builder: nodes (AI, agent run, command, check) linked into a pipeline.',
        'Flows can run on demand or on a schedule.',
      ] },
      { heading: 'When to use', points: [
        'Repeatable multi-step processes: lint → test → build, scheduled health checks, release gates.',
      ] },
      { heading: 'How to configure', points: [
        'Open Workflows in the sidebar, add nodes and link them, then run now or schedule.',
      ] },
      { heading: 'Which agents use it', points: [
        'Steps can invoke agents and run commands on this machine.',
      ] },
      { heading: 'What can go wrong', points: [
        'Scheduled flows run unattended: make steps idempotent and safe to repeat.',
        'A failed step should stop the flow rather than silently continue.',
      ] },
    ],
  },
  {
    id: 'voice',
    title: 'Voice assistant',
    summary: 'Talk to Ventriee hands-free. Opens with Ctrl+Alt+V, Esc cuts it off, and it speaks answers back.',
    sections: [
      { heading: 'What is it', points: [
        'A spoken interface to the studio: ask questions and get replies by voice.',
        'The assistant speaks when the agent team starts or stops.',
      ] },
      { heading: 'When to use', points: [
        'While working in other apps, or when your hands are busy with code.',
      ] },
      { heading: 'How to configure', points: [
        'Open with Ctrl+Alt+V or the audio pill; the mic is live while the panel is open.',
        'Pick the voice and TTS settings in Settings → Voice.',
        'Choose who answers: the planner engine (cloud) or a local Ollama model.',
      ] },
      { heading: 'Which agents use it', points: [
        'The planner engine (or the local model you pick) composes the answer.',
      ] },
      { heading: 'What can go wrong', points: [
        'If the mic is denied the assistant cannot hear you.',
        'While it speaks, only a clearly louder voice interrupts.',
      ] },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    summary: 'The Studio settings modal holds every switch: Subscriptions, Engines, Workers, Run policy, MCP tools, Data, Connectors, GitHub, Voice and Appearance.',
    sections: [
      { heading: 'What is it', points: [
        'One place to connect engines, manage keys, set run policy, and tune the app.',
        'Subscriptions: sign in to the CLI tools you already pay for (Claude, ChatGPT, Gemini, OpenCode).',
        'Engines: add API providers with keys (OpenAI, Anthropic, Gemini, OpenRouter, DeepSeek, Mistral, local Ollama/LM Studio).',
      ] },
      { heading: 'When to use', points: [
        'Before first work: connect at least one engine.',
        'Whenever you change providers, models, voice, appearance, or check for updates (Settings → Data).',
      ] },
      { heading: 'How to configure', points: [
        'Open Settings from the bottom of the sidebar and navigate the sections.',
        'After adding a subscription, press Check (sends one tiny request) and Use everywhere to make it the default.',
      ] },
      { heading: 'Which agents use it', points: [
        'Engine and provider choices decide what workers can run.',
        'Run policy controls routing and how tasks are executed.',
      ] },
      { heading: 'What can go wrong', points: [
        'Keys are stored in the OS credential store, not in your files.',
        'A subscription CLI that is not signed in fails at runtime; resolve it in Subscriptions.',
      ] },
    ],
  },
  {
    id: 'models',
    title: 'Models',
    summary: 'Models power the planner and the workers. Use subscriptions (CLI login) or API providers (keys); model routing matches task difficulty to model strength.',
    sections: [
      { heading: 'What is it', points: [
        'The engines behind every agent: subscription CLIs and API providers, plus local models via Ollama.',
        'Model routing: each task is rated low, medium or high, and gets a suitable model.',
      ] },
      { heading: 'When to use', points: [
        'Choosing what to run everywhere, or tuning cost against quality.',
        'Setting up a free local model for prompt enhancement or voice answers.',
      ] },
      { heading: 'How to configure', points: [
        'Settings → Subscriptions or Engines to add providers; press Check to verify one answers.',
        'Settings → Run policy → Model routing: Automatic (Cheapest / Balanced / Best quality) or Manual (set per worker).',
        'For local models, install Ollama, pull a model (e.g. ollama pull qwen3:4b), and pick it in settings.',
      ] },
      { heading: 'Which agents use it', points: [
        'Every agent: the planner, workers, enhance, and the voice assistant all resolve to a model.',
      ] },
      { heading: 'What can go wrong', points: [
        'A CLI that is not signed in fails at runtime; API use is billed by the provider.',
        'Cheap models may underperform on hard tasks: raise the routing quality or set manual models.',
        'Local models need Ollama running; a model needs roughly its download size in free RAM/VRAM.',
      ] },
    ],
  },
]

/** Case-insensitive search over titles, summaries, headings and points. */
export function searchHelp(query: string): HelpTopic[] {
  const q = query.trim().toLowerCase()
  if (!q) return HELP_TOPICS
  return HELP_TOPICS.filter((topic) => {
    const haystack = [topic.title, topic.summary, ...topic.sections.flatMap((s) => [s.heading, ...s.points])].join(' ').toLowerCase()
    return haystack.includes(q)
  })
}
