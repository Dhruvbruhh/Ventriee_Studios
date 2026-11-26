/**
 * Unified resource library (§14). One registry over everything an agent can use:
 * installed skills and plugins, configured MCP servers, workflows, the built-in
 * worker roles, and a curated catalogue of external libraries.
 *
 * The catalogue lives here, not in the renderer, so the panel is a view and the
 * same data can feed the orchestrator, the web dashboard or an agent prompt.
 * Discovery is deterministic keyword + capability matching; it never invents a
 * reason for a result.
 */

export type ResourceKind = 'skill' | 'plugin' | 'mcp' | 'workflow' | 'agent' | 'library'
/** installed = usable now; available = present but disabled; missing = needs installation. */
export type ResourceState = 'installed' | 'available' | 'missing'

export interface Resource {
  id: string
  kind: ResourceKind
  name: string
  description: string
  category: string
  /** Capability tags for discovery (e.g. "animation", "auth"). */
  capabilities: string[]
  state: ResourceState
  /** Documentation / homepage. */
  url?: string
  /** Human-run installation step. Never executed automatically. */
  install?: string
  /** Where the record came from: "skills", "plugin", "mcp", "workflow", "built-in", "catalog". */
  source: string
  version?: string
  /** Worker roles that can use it. */
  agents: string[]
}

export interface ResourceMatch extends Resource {
  /** Short, fact-based explanation of why this matched the query. */
  why: string
  score: number
}

interface CatalogEntry {
  slug: string
  name: string
  description: string
  category: string
  capabilities: string[]
  url: string
  install?: string
  /** Any of these npm packages present in the open project means "installed". */
  packages?: string[]
  /** Package scopes, e.g. "@radix-ui/". */
  prefixes?: string[]
  agents: string[]
}

const FRONTEND = ['designer', 'frontend']
const BUILD = ['backend', 'integration']

export const RESOURCE_CATALOG: CatalogEntry[] = [
  { slug: 'shadcn', name: 'shadcn/ui', category: 'Components', capabilities: ['components', 'design-system', 'frontend', 'accessibility'], description: 'Copy-paste React components. The default for client UIs.', url: 'https://ui.shadcn.com', install: 'npx shadcn@latest init', agents: FRONTEND },
  { slug: 'tailwind', name: 'Tailwind CSS v4', category: 'Components', capabilities: ['components', 'css', 'frontend', 'design-system'], description: 'Utility-first CSS; the same stack this IDE uses.', url: 'https://tailwindcss.com', install: 'npm install tailwindcss @tailwindcss/vite', packages: ['tailwindcss', '@tailwindcss/vite'], agents: FRONTEND },
  { slug: 'radix', name: 'Radix UI', category: 'Components', capabilities: ['components', 'accessibility', 'frontend'], description: 'Unstyled accessible primitives underpinning shadcn.', url: 'https://www.radix-ui.com', install: 'npm install @radix-ui/react-dialog', prefixes: ['@radix-ui/'], agents: FRONTEND },
  { slug: 'gsap', name: 'GSAP', category: 'Animation', capabilities: ['animation', 'motion', 'scroll', 'frontend'], description: 'Timelines, scroll and morph animations.', url: 'https://gsap.com', install: 'npm install gsap', packages: ['gsap', '@gsap/react'], agents: FRONTEND },
  { slug: 'framer-motion', name: 'Motion (Framer Motion)', category: 'Animation', capabilities: ['animation', 'motion', 'frontend'], description: 'Declarative React animations; pairs with shadcn.', url: 'https://motion.dev', install: 'npm install motion', packages: ['motion', 'framer-motion'], agents: FRONTEND },
  { slug: 'lottie', name: 'Lottie', category: 'Animation', capabilities: ['animation', 'motion', 'icons'], description: 'JSON animations for loaders and micro-interactions.', url: 'https://airbnb.io/lottie', install: 'npm install lottie-react', packages: ['lottie-react', 'lottie-web'], agents: FRONTEND },
  { slug: 'better-auth', name: 'Better Auth', category: 'Auth', capabilities: ['auth', 'security', 'backend'], description: 'TypeScript-native authentication.', url: 'https://better-auth.com', install: 'npm install better-auth', packages: ['better-auth'], agents: [...BUILD, 'security'] },
  { slug: 'clerk', name: 'Clerk', category: 'Auth', capabilities: ['auth', 'security'], description: 'Hosted auth with pre-built UI; fastest to ship.', url: 'https://clerk.com', install: 'npm install @clerk/nextjs', prefixes: ['@clerk/'], agents: [...BUILD] },
  { slug: 'drizzle', name: 'Drizzle ORM', category: 'Database', capabilities: ['database', 'orm', 'sql', 'backend'], description: 'SQL-first TypeScript ORM for Postgres or SQLite.', url: 'https://orm.drizzle.team', install: 'npm install drizzle-orm drizzle-kit', packages: ['drizzle-orm'], agents: ['database', 'backend'] },
  { slug: 'tanstack-query', name: 'TanStack Query', category: 'Data', capabilities: ['data-fetching', 'state', 'frontend'], description: 'Server-state caching and data fetching.', url: 'https://tanstack.com/query', install: 'npm install @tanstack/react-query', packages: ['@tanstack/react-query'], agents: FRONTEND },
  { slug: 'zustand', name: 'Zustand', category: 'Data', capabilities: ['state', 'frontend'], description: 'Minimal global state; used by this IDE.', url: 'https://zustand.docs.pmnd.rs', install: 'npm install zustand', packages: ['zustand'], agents: FRONTEND },
  { slug: 'zod', name: 'Zod', category: 'Data', capabilities: ['validation', 'forms', 'backend', 'frontend'], description: 'Runtime schema validation for API inputs and forms.', url: 'https://zod.dev', install: 'npm install zod', packages: ['zod'], agents: [...FRONTEND, ...BUILD] },
  { slug: 'firecrawl', name: 'Firecrawl', category: 'Research', capabilities: ['research', 'scraping', 'content'], description: 'Turn any website into clean LLM-ready markdown.', url: 'https://firecrawl.dev', install: 'npm install @mendable/firecrawl-js', packages: ['@mendable/firecrawl-js'], agents: ['researcher'] },
  { slug: 'crawlee', name: 'Crawlee', category: 'Research', capabilities: ['research', 'scraping'], description: 'Node web-scraping framework for structured extraction.', url: 'https://crawlee.dev', install: 'npm install crawlee', packages: ['crawlee'], agents: ['researcher'] },
  { slug: 'resend', name: 'Resend', category: 'Services', capabilities: ['email', 'backend'], description: 'Transactional and marketing email API.', url: 'https://resend.com', install: 'npm install resend', packages: ['resend'], agents: [...BUILD] },
  { slug: 'posthog', name: 'PostHog', category: 'Services', capabilities: ['analytics', 'monitoring', 'frontend'], description: 'Product analytics and feature flags.', url: 'https://posthog.com', install: 'npm install posthog-js', packages: ['posthog-js', 'posthog-node'], agents: [...FRONTEND, 'monitoring'] },
  { slug: 'sentry', name: 'Sentry', category: 'Services', capabilities: ['monitoring', 'errors', 'backend', 'frontend'], description: 'Error monitoring and performance tracing.', url: 'https://sentry.io', install: 'npm install @sentry/react', prefixes: ['@sentry/'], agents: ['monitoring', 'fixer'] },
  { slug: 'cloudflare-pages', name: 'Cloudflare Pages + Workers', category: 'Deployment', capabilities: ['deployment', 'hosting', 'edge'], description: 'Edge deployment for static and full-stack projects.', url: 'https://pages.cloudflare.com', install: 'npx wrangler pages deploy dist', agents: ['deployment'] },
  { slug: 'vercel', name: 'Vercel', category: 'Deployment', capabilities: ['deployment', 'hosting'], description: 'Zero-config deployment for frontend frameworks.', url: 'https://vercel.com', install: 'npx vercel', packages: ['vercel'], agents: ['deployment'] },
  { slug: 'neon', name: 'Neon', category: 'Database', capabilities: ['database', 'postgres', 'serverless'], description: 'Serverless Postgres; pairs with Drizzle.', url: 'https://neon.tech', install: 'npm install @neondatabase/serverless', packages: ['@neondatabase/serverless'], agents: ['database', 'backend'] },
  { slug: 'upstash', name: 'Upstash Redis', category: 'Database', capabilities: ['database', 'redis', 'queues'], description: 'Serverless Redis for rate limiting and queues.', url: 'https://upstash.com', install: 'npm install @upstash/redis', prefixes: ['@upstash/'], agents: ['backend', 'deployment'] },
  { slug: 'stripe', name: 'Stripe', category: 'Services', capabilities: ['payments', 'billing', 'backend'], description: 'Payments, subscriptions and invoices.', url: 'https://stripe.com/docs', install: 'npm install stripe', packages: ['stripe', '@stripe/stripe-js'], agents: ['backend', 'integration'] },
  { slug: 'phosphor', name: 'Phosphor Icons', category: 'UI', capabilities: ['icons', 'frontend'], description: 'Icon library used across this IDE and its projects.', url: 'https://phosphoricons.com', install: 'npm install @phosphor-icons/react', packages: ['@phosphor-icons/react'], agents: FRONTEND },
  { slug: 'react-hook-form', name: 'React Hook Form', category: 'UI', capabilities: ['forms', 'validation', 'frontend'], description: 'Performant forms with a Zod resolver.', url: 'https://react-hook-form.com', install: 'npm install react-hook-form', packages: ['react-hook-form'], agents: FRONTEND },
  { slug: 'next-seo', name: 'next-seo', category: 'SEO', capabilities: ['seo', 'metadata', 'frontend'], description: 'Meta, Open Graph and structured data for Next.js.', url: 'https://github.com/garmeeh/next-seo', install: 'npm install next-seo', packages: ['next-seo'], agents: ['seo', 'frontend'] },
  { slug: 'vitest', name: 'Vitest', category: 'Testing', capabilities: ['testing', 'quality'], description: 'Fast unit tests for Vite projects.', url: 'https://vitest.dev', install: 'npm install -D vitest', packages: ['vitest'], agents: ['qa', 'fixer', 'reviewer'] },
  { slug: 'playwright', name: 'Playwright', category: 'Testing', capabilities: ['testing', 'browser', 'accessibility', 'quality'], description: 'Browser automation and end-to-end tests.', url: 'https://playwright.dev', install: 'npm install -D @playwright/test', prefixes: ['@playwright/'], agents: ['qa', 'frontend'] }
]

export interface ResourceSources {
  skills: Array<{ id: string; name: string; description: string; enabled: boolean; source?: string }>
  plugins: Array<{ id: string; name: string; description: string; version?: string }>
  mcpServers: Array<{ name: string; enabled: boolean }>
  workflows: Array<{ id: string; name: string; enabled: boolean }>
  agents: Array<{ role: string; name: string; title: string }>
  /** npm dependency names from the open project, or null when no project is open. */
  deps: Set<string> | null
}

/** Dependency names declared in a package.json, or an empty set. */
export function packageNames(pkg: unknown): Set<string> {
  const names = new Set<string>()
  if (!pkg || typeof pkg !== 'object') return names
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const block = (pkg as Record<string, unknown>)[field]
    if (block && typeof block === 'object') for (const name of Object.keys(block)) names.add(name)
  }
  return names
}

function libraryInstalled(entry: CatalogEntry, deps: Set<string>): boolean {
  if (entry.packages?.some((p) => deps.has(p))) return true
  if (entry.prefixes?.length) for (const dep of deps) if (entry.prefixes.some((p) => dep.startsWith(p))) return true
  return false
}

/** Merge every real source into one catalogue with a truthful state. */
export function buildResources(src: ResourceSources): Resource[] {
  const out: Resource[] = []
  for (const s of src.skills) {
    out.push({
      id: `skill:${s.id}`, kind: 'skill', name: s.name, description: s.description,
      category: 'Skills', capabilities: [], state: s.enabled ? 'installed' : 'available',
      source: s.source ?? 'skills', agents: []
    })
  }
  for (const p of src.plugins) {
    out.push({
      id: `plugin:${p.id}`, kind: 'plugin', name: p.name, description: p.description,
      category: 'Plugins', capabilities: [], state: 'installed', source: 'plugin',
      version: p.version, agents: []
    })
  }
  for (const m of src.mcpServers) {
    out.push({
      id: `mcp:${m.name}`, kind: 'mcp', name: m.name, description: 'Model Context Protocol server: tools this agent can call.',
      category: 'MCP', capabilities: ['tools', 'integration'], state: m.enabled ? 'installed' : 'available',
      source: 'mcp', agents: []
    })
  }
  for (const w of src.workflows) {
    out.push({
      id: `workflow:${w.id}`, kind: 'workflow', name: w.name, description: 'Automation in this workspace.',
      category: 'Workflows', capabilities: ['automation'], state: w.enabled ? 'installed' : 'available',
      source: 'workflow', agents: []
    })
  }
  for (const a of src.agents) {
    out.push({
      id: `agent:${a.role}`, kind: 'agent', name: a.title, description: `${a.name}, the built-in ${a.role} worker.`,
      category: 'Workers', capabilities: [a.role, 'agent'], state: 'installed', source: 'built-in', agents: [a.role]
    })
  }
  for (const e of RESOURCE_CATALOG) {
    out.push({
      id: `library:${e.slug}`, kind: 'library', name: e.name, description: e.description,
      category: e.category, capabilities: e.capabilities,
      state: src.deps && libraryInstalled(e, src.deps) ? 'installed' : 'missing',
      url: e.url, install: e.install, source: 'catalog', agents: e.agents
    })
  }
  return out
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'for', 'my', 'me', 'we', 'our', 'i', 'you', 'it', 'that', 'this',
  'build', 'make', 'need', 'want', 'with', 'and', 'or', 'to', 'of', 'in', 'on', 'at',
  'is', 'are', 'be', 'do', 'get', 'add', 'use', 'using', 'some', 'please', 'help',
  'can', 'should', 'would', 'like', 'from', 'into', 'about'
])

/** Plain-language intent to capability tags. Only expands a term, never invents one. */
const SYNONYMS: Record<string, string[]> = {
  animated: ['animation', 'motion'],
  animate: ['animation', 'motion'],
  animation: ['motion'],
  motion: ['animation'],
  website: ['frontend', 'components'],
  site: ['frontend', 'components'],
  landing: ['frontend'],
  ui: ['frontend', 'components', 'design-system'],
  design: ['design-system', 'components'],
  login: ['auth'],
  signin: ['auth'],
  authentication: ['auth'],
  database: ['database', 'orm'],
  sql: ['database'],
  postgres: ['database'],
  form: ['forms'],
  validation: ['validation'],
  chart: ['charts', 'analytics'],
  dashboard: ['analytics', 'charts'],
  payment: ['payments'],
  billing: ['payments'],
  email: ['email'],
  seo: ['seo', 'metadata'],
  deploy: ['deployment'],
  deployment: ['deployment'],
  accessible: ['accessibility'],
  accessibility: ['accessibility'],
  scroll: ['scroll'],
  icon: ['icons'],
  icons: ['icons'],
  test: ['testing'],
  tests: ['testing'],
  testing: ['testing'],
  security: ['security'],
  research: ['research', 'scraping']
}

function words(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOPWORDS.has(w))
}

function searchWords(resource: Resource): Set<string> {
  return new Set(words([resource.name, resource.description, resource.category, ...resource.capabilities].join(' ')))
}

function hit(term: string, haystack: Set<string>): boolean {
  for (const word of haystack) if (word === term || (term.length >= 4 && word.startsWith(term))) return true
  return false
}

/**
 * Rank resources for a natural-language query. Empty query returns everything.
 * An unmatched query returns nothing (with no fabricated "why").
 */
export function discoverResources(resources: Resource[], query: string): ResourceMatch[] {
  const terms = words(query)
  if (!terms.length) return resources.map((r) => ({ ...r, why: '', score: 0 }))

  const expanded = new Map<string, string>()
  for (const term of terms) {
    expanded.set(term, term)
    for (const synonym of SYNONYMS[term] ?? []) expanded.set(synonym, synonym)
  }

  const matches: ResourceMatch[] = []
  for (const resource of resources) {
    const haystack = searchWords(resource)
    const nameWords = new Set(words(resource.name))
    const capWords = new Set(resource.capabilities.flatMap(words))
    let score = 0
    const hits: string[] = []
    for (const term of expanded.keys()) {
      if (!hit(term, haystack)) continue
      hits.push(term)
      if (haystack.has(term) || [...nameWords].some((w) => w.startsWith(term))) score += 5
      if (capWords.has(term)) score += 4
      if (words(resource.category).some((w) => w === term)) score += 2
    }
    if (score === 0) continue
    matches.push({ ...resource, score, why: `Matches ${[...new Set(hits)].slice(0, 3).join(', ')}` })
  }

  const rank: Record<ResourceState, number> = { installed: 0, available: 1, missing: 2 }
  return matches.sort((a, b) => b.score - a.score || rank[a.state] - rank[b.state] || a.name.localeCompare(b.name))
}
