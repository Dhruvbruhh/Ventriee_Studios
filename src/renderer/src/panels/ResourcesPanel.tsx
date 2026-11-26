import { useState } from 'react'
import { Modal } from '../shell'

type Resource = { name: string; url: string; description: string; category: string }

const RESOURCES: Resource[] = [
  // UI & Components
  { name: 'shadcn/ui', url: 'https://ui.shadcn.com', description: 'Copy-paste React components. Standard for all client UIs.', category: 'Components' },
  { name: 'Tailwind CSS v4', url: 'https://tailwindcss.com', description: 'Utility-first CSS — same stack as this app.', category: 'Components' },
  { name: 'Radix UI', url: 'https://www.radix-ui.com', description: 'Unstyled accessible primitives underpinning shadcn.', category: 'Components' },
  // Animation
  { name: 'GSAP', url: 'https://gsap.com', description: 'The go-to for scroll, morph and timeline animations.', category: 'Animation' },
  { name: 'Framer Motion', url: 'https://www.framer.com/motion', description: 'Declarative React animations; pairs with shadcn.', category: 'Animation' },
  { name: 'Lottie Web', url: 'https://airbnb.io/lottie', description: 'JSON-based animation; use for loaders and micro-interactions.', category: 'Animation' },
  // Auth
  { name: 'Better Auth', url: 'https://better-auth.com', description: 'TypeScript-native auth. Preferred for all new projects.', category: 'Auth' },
  { name: 'Clerk', url: 'https://clerk.com', description: 'Hosted auth with pre-built UI; fastest to ship.', category: 'Auth' },
  // Data
  { name: 'Drizzle ORM', url: 'https://orm.drizzle.team', description: 'SQL-first TypeScript ORM. Use with Postgres or SQLite.', category: 'Database' },
  { name: 'React Query (TanStack)', url: 'https://tanstack.com/query', description: 'Server-state caching; standard data-fetching layer.', category: 'Data' },
  { name: 'Zustand', url: 'https://zustand-demo.pmnd.rs', description: 'Minimal global state — same lib used in this IDE.', category: 'Data' },
  { name: 'Zod', url: 'https://zod.dev', description: 'Runtime schema validation for API inputs and forms.', category: 'Data' },
  // Scraping / Research
  { name: 'Firecrawl', url: 'https://firecrawl.dev', description: 'Turn any website into clean LLM-ready markdown.', category: 'Scraping' },
  { name: 'Crawlee', url: 'https://crawlee.dev', description: 'Node web scraping framework for structured extraction.', category: 'Scraping' },
  // Outbound services
  { name: 'Resend', url: 'https://resend.com', description: 'Email API — transactional and marketing.', category: 'Services' },
  { name: 'PostHog', url: 'https://posthog.com', description: 'Open-source product analytics and feature flags.', category: 'Services' },
  { name: 'Sentry', url: 'https://sentry.io', description: 'Error monitoring and performance tracing.', category: 'Services' },
  { name: 'Cloudflare Pages + Workers', url: 'https://pages.cloudflare.com', description: 'Edge deployment for full-stack projects.', category: 'Deployment' },
  { name: 'Vercel', url: 'https://vercel.com', description: 'Zero-config Next.js deployment.', category: 'Deployment' },
  { name: 'Neon', url: 'https://neon.tech', description: 'Serverless Postgres — pairs with Drizzle.', category: 'Database' },
  { name: 'Upstash Redis', url: 'https://upstash.com', description: 'Serverless Redis for rate limiting and queues.', category: 'Database' },
  { name: 'Stripe', url: 'https://stripe.com/docs', description: 'Payments API — subscriptions, one-time, invoices.', category: 'Services' },
  { name: 'Phosphor Icons', url: 'https://phosphoricons.com', description: 'Icon library used in this IDE — consistent across projects.', category: 'UI' },
  { name: 'React Hook Form', url: 'https://react-hook-form.com', description: 'Performant forms with Zod resolver support.', category: 'UI' },
  { name: 'next-seo', url: 'https://github.com/garmeeh/next-seo', description: 'Meta, OG and structured data for Next.js.', category: 'SEO' },
]

const CATEGORIES = Array.from(new Set(RESOURCES.map((r) => r.category))).sort()

export function ResourcesPanel({ onClose }: { onClose: () => void }) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('All')

  const filtered = RESOURCES.filter((r) => {
    const q = search.toLowerCase()
    const matchSearch = !q || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)
    const matchCat = category === 'All' || r.category === category
    return matchSearch && matchCat
  })

  return (
    <Modal title="Resource Library" subtitle="Tools and libraries used across agency projects." onClose={onClose}>
      <div className="resources-toolbar">
        <input className="input" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ flex: 1 }} />
        <select className="select" value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: 160 }}>
          <option value="All">All categories</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="resources-grid">
        {filtered.map((r) => (
          <div key={r.name} className="resource-card">
            <div className="resource-card-header">
              <span className="resource-card-name">{r.name}</span>
              <span className="resource-card-cat dim">{r.category}</span>
            </div>
            <div className="resource-card-desc dim">{r.description}</div>
            <div className="resource-card-foot">
              <a className="btn btn-sm" href={r.url} target="_blank" rel="noreferrer" onClick={(e) => { e.preventDefault(); window.ventriee.openExternal(r.url) }}>Open ↗</a>
            </div>
          </div>
        ))}
        {filtered.length === 0 ? <div className="dim text-sm" style={{ gridColumn: '1/-1', padding: '16px 0' }}>No resources match your search.</div> : null}
      </div>
    </Modal>
  )
}
