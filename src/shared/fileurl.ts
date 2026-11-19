/** file:// URL of a project file, in the form servers send back (forward slashes, encoded segments). */
export function fileUrl(root: string, path: string): string {
  const full = `${root.replace(/\\/g, '/').replace(/\/$/, '')}/${path}`
  return `file://${full.startsWith('/') ? '' : '/'}${full.split('/').map((seg, i) => (i === 0 && /^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg))).join('/')}`
}
const normalize = (url: string) => decodeURIComponent(url).replace(/^file:\/\/\/?/, '/').replace(/^\/([A-Za-z]):/, (_m, d: string) => `/${d.toLowerCase()}:`).replace(/\\/g, '/')
/** The project-relative path of a server URL, or null for a file outside the project (standard library, packages). */
export function relativePath(root: string, url: string): string | null {
  const base = normalize(fileUrl(root, ''))
  const target = normalize(url)
  return target.startsWith(base) && target.length > base.length ? target.slice(base.length) : null
}
