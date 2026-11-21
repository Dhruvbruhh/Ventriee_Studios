export interface RoleTemplate {
  role: string
  name: string
  title: string
  color: string
  instructions: string
  /** Tasks in this role mutate the project tree, so the scheduler serializes them per project. */
  writesCode: boolean
  /** Skill ids offered to this role by default. The owner can override them per worker. */
  skills: string[]
}

/**
 * Which bundled skills each role is offered by default. Ids must exist in
 * resources/skills; one that is not installed is simply skipped at prompt time.
 * evidence-first-delivery goes to every role that reports work as done.
 * ponytail is mandatory for every worker and is force-injected at prompt time,
 * so it appears here too to keep the defaults honest.
 */
const SKILLS_BY_ROLE: Record<string, string[]> = {
  orchestrator: [
    'evidence-first-delivery', 'ponytail',
    'wayfinder', 'to-spec', 'to-tickets', 'to-questionnaire', 'triage', 'implement-spec',
    'find-skills', 'skill-creator', 'karpathy-guidelines', 'wait-what', 'discernment-nudge',
    // specialist agents (installed as skills; skipped when absent)
    'project-manager-senior', 'project-management-project-shepherd', 'project-management-studio-producer', 'product-manager', 'product-sprint-prioritizer', 'engineering-multi-agent-systems-architect', 'testing-reality-checker'
  ],
  researcher: [
    'evidence-first-delivery', 'ponytail',
    'research', 'web-research-scrapling', 'technical-seo-audit', 'webapp-testing',
    'to-questionnaire', 'ask-matt', 'grill-me', 'grilling', 'grill-with-docs',
    'pdf', 'docx', 'xlsx', 'writing-for-agents', 'writing-fragments', 'writing-shape', 'writing-beats',
    'humanizer', 'lumenfall', 'teach', 'academy-guide',
    // specialist agents (installed as skills; skipped when absent)
    'product-trend-researcher', 'design-ux-researcher', 'product-feedback-synthesizer', 'support-executive-summary-generator', 'marketing-ai-citation-strategist'
  ],
  architect: [
    'evidence-first-delivery', 'ponytail',
    'domain-modeling', 'codebase-design', 'improve-codebase-architecture', 'implement',
    'to-spec', 'to-tickets', 'scaffold-exercises', 'karpathy-guidelines',
    'vercel-react-best-practices', 'mcp-builder', 'claude-api',
    'doc-coauthoring', 'pdf', 'slides', 'theme-factory',
    // specialist agents (installed as skills; skipped when absent)
    'engineering-software-architect', 'engineering-backend-architect', 'engineering-api-platform-engineer', 'security-architect', 'engineering-rapid-prototyper', 'vercel-bootstrap', 'vercel-create-a-backend', 'modern-web-guidance'
  ],
  // design-system is the one skill that names docs/design-system.md, the designer's
  // deliverable. The artifact skills (design, slides, banner-design, canvas-design)
  // were offered too and pulled the worker into shipping an HTML showcase page
  // instead: run #23 wrote 54k characters of docs/design/evidence.html and no doc.
  designer: [
    'evidence-first-delivery', 'ponytail',
    'design-system', 'design', 'design-taste-frontend', 'frontend-design', 'frontend-design-principles',
    'ui-ux-pro-max', 'impeccable', 'hallmark', 'brand', 'brand-guidelines', 'theme-factory',
    'modern-web-design', 'retro', 'cinematic-motion-ui',
    'glassmorphism', 'accessible-animation', 'micro-interaction', 'page-transition-animation',
    'improve-animations', '60fps-animation', 'svg-animation', 'ascii-animation',
    'lightweight-3d-effects', 'web3d-integration-patterns', 'spline-interactive', 'rive-interactive',
    'blender-web-pipeline', 'substance-3d-texturing', 'algorithmic-art',
    'antislop', 'antislop-ui', 'antislop-human', 'antislop-layoutmobile', 'antislop-copywriting', 'antislop-code',
    'ui-styling', 'lottie-animation', 'lottie-animations', 'gsap-web', 'gsap-core',
    // specialist agents (installed as skills; skipped when absent)
    'design-ui-designer', 'design-ux-architect', 'design-brand-guardian', 'design-visual-storyteller', 'design-whimsy-injector', 'design-inclusive-visuals-specialist', 'design-ui-finish-gate-reviewer', 'design-image-prompt-engineer'
  ],
  frontend: [
    'evidence-first-delivery', 'ponytail',
    'frontend-design', 'frontend-design-principles', 'design-taste-frontend', 'ui-ux-pro-max',
    'vercel-react-best-practices', 'ui-styling', 'web-artifacts-builder', 'prototype',
    '60fps-animation', 'gsap-web', 'gsap-core', 'gsap-react', 'gsap-frameworks', 'gsap-plugins',
    'gsap-scrolltrigger', 'gsap-timeline', 'gsap-utils', 'gsap-performance',
    'svg-animation', 'lottie-animation', 'lottie-animations', 'ascii-animation',
    'accessible-animation', 'micro-interaction', 'page-transition-animation', 'improve-animations',
    'animated-component-libraries', 'motion-framer', 'react-spring-physics', 'scroll-reveal-libraries',
    'barba-js', 'locomotive-scroll', 'animejs', 'cinematic-motion-ui', 'modern-web-design',
    'threejs-webgl', 'react-three-fiber', 'playcanvas-engine', 'babylonjs-engine', 'pixijs-2d',
    'spline-interactive', 'rive-interactive', 'aframe-webxr', 'web3d-integration-patterns',
    'lightweight-3d-effects', 'algorithmic-art', 'theme-factory', 'retro',
    'antislop', 'antislop-ui', 'antislop-human', 'antislop-layoutmobile', 'antislop-code',
    'evidence-first-delivery',
    // specialist agents (installed as skills; skipped when absent)
    'engineering-frontend-developer', 'engineering-senior-developer', 'design-ux-architect', 'testing-accessibility-auditor', 'modern-web-guidance', 'engineering-i18n-engineer'
  ],
  integration: [
    'evidence-first-delivery', 'ponytail',
    'vercel-react-best-practices', 'netlify-functions', 'netlify-caching', 'netlify-access-control',
    'mcp-builder', 'claude-api', 'setup-ts-deep-modules', 'migrate-to-shoehorn', 'implement',
    'codebase-design', 'domain-modeling', 'improve-codebase-architecture',
    // specialist agents (installed as skills; skipped when absent)
    'engineering-api-platform-engineer', 'engineering-identity-access-engineer', 'engineering-payments-billing-engineer', 'engineering-realtime-collaboration-engineer', 'vercel-auth', 'vercel-env-vars', 'vercel-routing-middleware', 'vercel-ai-sdk', 'vercel-ai-gateway'
  ],
  backend: [
    'evidence-first-delivery', 'ponytail',
    'claude-api', 'mcp-builder', 'setup-ts-deep-modules', 'migrate-to-shoehorn',
    'domain-modeling', 'codebase-design', 'implement', 'scaffold-exercises',
    'netlify-functions', 'netlify-access-control', 'netlify-caching', 'pdf', 'docx', 'xlsx',
    'karpathy-guidelines', 'setup-pre-commit', 'wizard',
    // specialist agents (installed as skills; skipped when absent)
    'engineering-backend-architect', 'engineering-api-platform-engineer', 'engineering-ai-engineer', 'engineering-rag-pipeline-engineer', 'engineering-privacy-engineer', 'vercel-functions', 'vercel-queues', 'vercel-workflow', 'vercel-storage', 'vercel-runtime-cache', 'build-mcp-server'
  ],
  reviewer: [
    'evidence-first-delivery', 'ponytail',
    'code-review', 'karpathy-guidelines', 'improve', 'improve-codebase-architecture', 'triage',
    'handoff', 'claude-handoff', 'pr', 'git-guardrails-claude-code', 'cordis-styling-nitpicking',
    'tdd',
    // specialist agents (installed as skills; skipped when absent)
    'engineering-code-reviewer', 'engineering-minimal-change-engineer', 'testing-reality-checker', 'security-ai-generated-code-auditor'
  ],
  fixer: [
    'evidence-first-delivery', 'ponytail',
    'diagnosing-bugs', 'fix', 'tdd', 'implement', 'code-review', 'karpathy-guidelines',
    'improve', 'wait-what',
    // specialist agents (installed as skills; skipped when absent)
    'engineering-minimal-change-engineer', 'engineering-code-reviewer', 'testing-test-results-analyzer'
  ],
  qa: [
    'evidence-first-delivery', 'ponytail',
    'webapp-testing', 'tdd', 'record-browser-gif', 'diagnosing-bugs', 'evidence-first-delivery',
    'antislop-human', 'antislop-layoutmobile', 'web-artifacts-builder',
    // specialist agents (installed as skills; skipped when absent)
    'testing-evidence-collector', 'testing-reality-checker', 'testing-api-tester', 'testing-accessibility-auditor', 'testing-performance-benchmarker', 'testing-test-automation-engineer', 'design-persona-walkthrough'
  ],
  seo: [
    'evidence-first-delivery', 'ponytail',
    'web-research-scrapling', 'technical-seo-audit', 'writing-for-agents',
    'writing-beats', 'writing-fragments', 'writing-shape', 'doc-coauthoring',
    'humanizer', 'lumenfall', 'seedance-prompt-en', 'seedance-prompt-zh',
    'antislop-copywriting', 'pdf', 'xlsx', 'to-questionnaire',
    // specialist agents (installed as skills; skipped when absent)
    'marketing-seo-specialist', 'marketing-content-creator', 'marketing-video-optimization-specialist', 'engineering-technical-writer'
  ],
  aeo: [
    'evidence-first-delivery', 'ponytail',
    'web-research-scrapling', 'technical-seo-audit', 'writing-for-agents',
    'writing-beats', 'writing-fragments', 'writing-shape', 'doc-coauthoring',
    'humanizer', 'lumenfall', 'seedance-prompt-en', 'seedance-prompt-zh',
    'antislop-copywriting', 'to-questionnaire',
    // specialist agents (installed as skills; skipped when absent)
    'marketing-aeo-foundations', 'marketing-ai-citation-strategist', 'marketing-agentic-search-optimizer'
  ],
  deployment: [
    'evidence-first-delivery', 'ponytail',
    'netlify-functions', 'netlify-caching', 'netlify-access-control',
    'vercel-react-best-practices', 'setup-pre-commit', 'git-guardrails-claude-code',
    'wizard', 'mcp-builder', 'evidence-first-delivery',
    // specialist agents (installed as skills; skipped when absent)
    'engineering-devops-automator', 'engineering-sre', 'engineering-git-workflow-master', 'vercel-cli', 'vercel-deployments-cicd', 'vercel-domains', 'vercel-env-vars', 'vercel-cdn-caching', 'vercel-firewall'
  ],
  monitoring: [
    'evidence-first-delivery', 'ponytail',
    'webapp-testing', 'record-browser-gif', 'technical-seo-audit', 'improve',
    'slack-gif-creator', 'evidence-first-delivery',
    // specialist agents (installed as skills; skipped when absent)
    'engineering-sre', 'engineering-incident-response-commander', 'support-analytics-reporter', 'testing-performance-benchmarker', 'vercel-tracing', 'vercel-custom-metrics'
  ],
  database: [
    'evidence-first-delivery', 'ponytail',
    'domain-modeling', 'supabase-postgres-best-practices', 'vercel-storage',
    // specialist agents (installed as skills; skipped when absent)
    'engineering-database-optimizer', 'engineering-database-reliability-engineer', 'engineering-data-engineer', 'engineering-privacy-engineer'
  ],
  security: [
    'evidence-first-delivery', 'ponytail',
    'code-review', 'vercel-firewall',
    // specialist agents (installed as skills; skipped when absent)
    'security-ai-generated-code-auditor', 'security-appsec-engineer', 'security-senior-secops', 'security-secrets-credential-engineer',
    'security-architect', 'security-cloud-security-architect', 'engineering-identity-access-engineer', 'engineering-privacy-engineer', 'support-legal-compliance-checker'
  ]
}

/**
 * Skills forced onto every worker regardless of role defaults. The orchestrator
 * unions these into the worker's wanted set at prompt time, so a worker whose
 * skill list is empty or custom still gets them.
 */
export const MANDATORY_SKILLS = ['ponytail'] as const

const R = (t: Omit<RoleTemplate, 'skills'>): RoleTemplate => ({
  ...t,
  skills: [...new Set([...(SKILLS_BY_ROLE[t.role] ?? []), ...MANDATORY_SKILLS])]
})

export const ROLE_TEMPLATES: RoleTemplate[] = [
  R({
    role: 'orchestrator',
    name: 'Ada',
    title: 'Orchestrator',
    color: '#7dd3fc',
    writesCode: false,
    instructions: `You are the studio orchestrator. Convert the owner's brief into a minimal, dependency-ordered plan. Pick the smallest useful team: never schedule a role that adds nothing. Frontend and backend may run in parallel once the API contract is written down. QA tests the integrated app, not assumptions. Every task needs testable acceptance criteria. Escalate scope changes and money decisions to the owner.`
  }),
  R({
    role: 'researcher',
    name: 'Noor',
    title: 'Researcher',
    color: '#a5b4fc',
    writesCode: false,
    instructions: `Research the industry, competitors and references for the project. Produce concise, sourced notes and a requirements brief. Write findings to docs/research.md inside the project. Never invent facts; mark unknowns explicitly.`
  }),
  R({
    role: 'architect',
    name: 'Soren',
    title: 'Product Architect',
    color: '#c4b5fd',
    writesCode: true,
    instructions: `Own system architecture. Read docs/research.md first. In docs/architecture.md write, in this order: (1) Stack recommendation: compare two or three realistic stacks for this brief in a short table (fit, speed to ship, hosting cost, ecosystem, lock-in) and pick one with the reasons; prefer boring, well-supported choices. (2) Folder structure: the full project tree with one line per folder saying what lives there, separating frontend, backend, database, shared types, tests and docs. (3) Data model and the API contract (also in docs/api.md). Then create that folder structure and the minimal config files (package manifest, tsconfig or equivalent, .env.example with no real secrets, .gitignore) so the next workers start from a skeleton that installs and builds. Keep the design as simple as the requirements allow. Justify decisions briefly in docs/decisions.md.`
  }),
  R({
    role: 'designer',
    name: 'Iris',
    title: 'UI/UX Designer',
    color: '#f9a8d4',
    writesCode: true,
    instructions: `Define the visual direction, tokens and component specifications. Write them to docs/design-system.md. Implement styling and layout when asked. Respect accessibility, responsive behaviour and reduced-motion preferences. Avoid generic templated layouts.`
  }),
  R({
    role: 'frontend',
    name: 'Kai',
    title: 'Frontend Developer',
    color: '#5eead4',
    writesCode: true,
    instructions: `Build the client exactly against the agreed API contract and design system. Ship working interactions, real state handling, error states and responsive layouts. Run the typecheck and build before claiming completion.`
  }),
  R({
    role: 'integration',
    name: 'Mira',
    title: 'Integration Developer',
    color: '#67e8f9',
    writesCode: true,
    instructions: `Wire the layers together: auth, request validation, service-to-service calls, error mapping, middleware. Verify the contract from both sides and document it.`
  }),
  R({
    role: 'backend',
    name: 'Dario',
    title: 'Backend Developer',
    color: '#86efac',
    writesCode: true,
    instructions: `Implement business logic, APIs, persistence, security and permissions. Validate every input at the trust boundary, never log secrets, and add tests for non-trivial logic. Run migrations and tests before claiming completion.`
  }),
  R({
    role: 'database',
    name: 'Nadia',
    title: 'Database Engineer',
    color: '#4ade80',
    writesCode: true,
    instructions: `Own the data layer. Turn the data model in docs/architecture.md into a real schema, versioned migrations and seed data in the folders the architect defined, on the database the architecture chose. Add primary keys, foreign keys, NOT NULL and unique constraints that match the business rules, and indexes for the queries the API will run. Enable row-level security or equivalent access rules when the stack supports it. Never store secrets or plain-text passwords, and keep personal data to what the brief needs. Prove it: apply the migrations to a clean database and load the seed data, then record the commands and their output in docs/database.md.`
  }),
  R({
    role: 'reviewer',
    name: 'Vera',
    title: 'Code Reviewer',
    color: '#fca5a5',
    writesCode: false,
    instructions: `Review code against the requirements and the repository's conventions. Look for security holes, data loss, broken edge cases and maintainability problems. Verify claims by reading the code and running the project's checks. Return a strict JSON verdict.`
  }),
  R({
    role: 'fixer',
    name: 'Rook',
    title: 'Bug Fixer',
    color: '#fdba74',
    writesCode: true,
    instructions: `Reproduce the failure first, find the root cause, then make the smallest fix that fully solves it. Add a regression test. Never paper over an error with a wider catch.`
  }),
  R({
    role: 'security',
    name: 'Hex',
    title: 'Security Engineer',
    color: '#f87171',
    writesCode: true,
    instructions: `Audit the built application before review. Check, with file and line evidence: hardcoded secrets or keys in code, config or client bundles (anything public-prefixed such as NEXT_PUBLIC_ or VITE_ ships to every visitor); authentication and authorization on every route and server action, including object-level access (one user reading another user's data); row-level security or access rules on the database; input validation at every trust boundary; injection (SQL, command, path traversal, XSS, SSRF); user input concatenated into LLM prompts or tool calls; CORS, CSP and security headers; cookie flags; rate limiting on auth and expensive endpoints; dependency advisories (run the package manager's audit); errors or logs that leak secrets or personal data. Fix every critical and high finding with the smallest change and re-check it. Write docs/security-review.md with each finding's severity, location, and the fix applied or why it was deferred. Never weaken an existing control to make something work.`
  }),
  R({
    role: 'qa',
    name: 'Juno',
    title: 'QA Engineer',
    color: '#fde68a',
    writesCode: true,
    instructions: `Test the integrated application against the acceptance criteria. Cover critical journeys, error paths, responsiveness and accessibility. Record exact reproduction steps and evidence. Report defects with severity, do not fix silently.`
  }),
  R({
    role: 'seo',
    name: 'Lena',
    title: 'SEO Specialist',
    color: '#a3e635',
    writesCode: true,
    instructions: `Handle technical SEO: metadata, canonical URLs, sitemap, robots.txt, structured data, internal linking and Core Web Vitals. Verify with real output, not assumptions.`
  }),
  R({
    role: 'aeo',
    name: 'Oren',
    title: 'AEO/GEO Specialist',
    color: '#bef264',
    writesCode: true,
    instructions: `Make the site legible to answer engines and generative search: entity consistency, factual page structure, FAQ and schema alignment, crawlable content. Never fabricate claims or statistics.`
  }),
  R({
    role: 'deployment',
    name: 'Sable',
    title: 'Deployment Engineer',
    color: '#f0abfc',
    writesCode: true,
    instructions: `Prepare production builds, run preflight checks, configure hosting and deploy. Verify the live deployment with real requests. Production deployment, spending money and destructive commands require owner approval.`
  }),
  R({
    role: 'monitoring',
    name: 'Tess',
    title: 'Monitoring Engineer',
    color: '#94a3b8',
    writesCode: true,
    instructions: `Check uptime, errors and performance of deployed work. Write your findings as a real file in the workspace (docs/monitoring.md: what you checked, results with timestamps, thresholds, and the next actions) and reference any runbook or scrape config you add. Report concrete findings with timestamps and propose upgrades. Do not run background checks without owner permission.`
  })
]

export const roleByName = (role: string) => ROLE_TEMPLATES.find((r) => r.role === role)

export const PIPELINE = [
  'research',
  'requirements',
  'architecture',
  'design',
  'build',
  'integration',
  'review',
  'qa',
  'fix',
  'seo',
  'deploy',
  'monitor'
] as const

export type Phase = (typeof PIPELINE)[number]
