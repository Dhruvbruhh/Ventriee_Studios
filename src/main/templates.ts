import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { workspacePath } from './files'

export type TemplateId = 'empty' | 'static' | 'react-vite' | 'express-api' | 'fastapi'

interface Template { label: string; brief: string; files: Record<string, string> }

/** Small starters, written only into an empty folder. Dependencies install on demand (Preview → Start, or a terminal). */
export const TEMPLATES: Record<Exclude<TemplateId, 'empty'>, Template> = {
  static: {
    label: 'Static website',
    brief: 'A static website: index.html, styles.css and script.js, no build step.',
    files: {
      'index.html': '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>New site</title>\n  <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n  <main>\n    <h1>New site</h1>\n    <p>Describe what to build in Plan, and the studio will take it from here.</p>\n  </main>\n  <script src="script.js"></script>\n</body>\n</html>\n',
      'styles.css': ':root { color-scheme: light dark; font-family: system-ui, sans-serif; }\nbody { margin: 0; }\nmain { max-width: 720px; margin: 10vh auto; padding: 0 16px; }\n',
      'script.js': "document.documentElement.dataset.ready = 'true'\n"
    }
  },
  'react-vite': {
    label: 'React + Vite',
    brief: 'A React single-page app built with Vite. Run `npm install`, then `npm run dev`.',
    files: {
      'package.json': JSON.stringify({ name: 'app', private: true, type: 'module', scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
        dependencies: { react: '^19.3.1', 'react-dom': '^19.3.1' }, devDependencies: { vite: '^8.3.6', '@vitejs/plugin-react': '^6.2.1' } }, null, 2) + '\n',
      'vite.config.js': "import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({ plugins: [react()] })\n",
      'index.html': '<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>App</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="/src/main.jsx"></script>\n</body>\n</html>\n',
      'src/main.jsx': "import { StrictMode } from 'react'\nimport { createRoot } from 'react-dom/client'\nimport App from './App.jsx'\n\ncreateRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)\n",
      'src/App.jsx': "export default function App() {\n  return <main style={{ maxWidth: 720, margin: '10vh auto', padding: '0 16px', fontFamily: 'system-ui' }}>\n    <h1>App</h1>\n    <p>Describe what to build in Plan.</p>\n  </main>\n}\n",
      '.gitignore': 'node_modules\ndist\n'
    }
  },
  'express-api': {
    label: 'Node API (Express)',
    brief: 'A Node.js HTTP API using Express. Run `npm install`, then `npm start`; it listens on PORT or 3000.',
    files: {
      'package.json': JSON.stringify({ name: 'api', private: true, type: 'module', scripts: { start: 'node server.js', dev: 'node --watch server.js' }, dependencies: { express: '^5.1.0' } }, null, 2) + '\n',
      'server.js': "import express from 'express'\n\nconst app = express()\napp.use(express.json())\n\napp.get('/api/health', (_req, res) => res.json({ ok: true }))\n\nconst port = Number(process.env.PORT) || 3000\napp.listen(port, () => console.log(`API listening on http://localhost:${port}`))\n",
      '.gitignore': 'node_modules\n'
    }
  },
  fastapi: {
    label: 'Python API (FastAPI)',
    brief: 'A Python HTTP API using FastAPI. Run `pip install -r requirements.txt`, then `uvicorn main:app --reload`.',
    files: {
      'requirements.txt': 'fastapi\nuvicorn[standard]\n',
      'main.py': 'from fastapi import FastAPI\n\napp = FastAPI()\n\n\n@app.get("/api/health")\ndef health() -> dict:\n    return {"ok": True}\n',
      '.gitignore': '__pycache__/\n.venv/\n'
    }
  }
}

/** Writes a template's files into `root`. Refuses a non-empty folder so nothing of the owner's is overwritten. */
export function applyTemplate(root: string, id: TemplateId): string {
  if (id === 'empty') return ''
  const template = TEMPLATES[id]
  if (!template) throw new Error('Unknown template')
  if (readdirSync(root).length) throw new Error('Templates are only written into an empty folder. Pick an empty folder, or choose "Empty".')
  for (const [path, content] of Object.entries(template.files)) {
    const target = workspacePath(root, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content, { flag: 'wx' })
  }
  return template.brief
}

