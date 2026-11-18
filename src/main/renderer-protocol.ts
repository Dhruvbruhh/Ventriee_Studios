import { net, protocol } from 'electron'
import { extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { isInside } from './paths'
import { RENDERER_HOST, RENDERER_SCHEME, studioCsp } from '../shared/auth-config'

export function registerRendererProtocol(root: string, authUrl: string | null) {
  protocol.handle(RENDERER_SCHEME, async (request) => {
    const url = new URL(request.url)
    if (url.host !== RENDERER_HOST) return new Response('Not found', { status: 404 })
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })
    let path: string
    try { path = decodeURIComponent(url.pathname) } catch { return new Response('Bad request', { status: 400 }) }
    const target = resolve(root, `.${path}`)
    if (!isInside(root, target)) return new Response('Forbidden', { status: 403 })
    const file = extname(path) ? target : join(root, 'index.html')
    try {
      const response = await net.fetch(pathToFileURL(file).toString())
      const headers = new Headers(response.headers)
      headers.set('Content-Security-Policy', studioCsp(authUrl, false))
      headers.set('X-Content-Type-Options', 'nosniff')
      return new Response(response.body, { status: response.status, headers })
    } catch { return new Response('Not found', { status: 404 }) }
  })
}
