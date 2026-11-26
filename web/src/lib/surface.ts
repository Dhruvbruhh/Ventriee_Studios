// One build is served on three subdomains; the hostname picks what it shows.
//   workspace.ventriee.in → full workspace (default, also localhost)
//   dashboard.ventriee.in → ops/stats for managers
//   app.ventriee.in       → employee portal + desktop download
export type Surface = 'workspace' | 'dashboard' | 'app'

export function surfaceFromHost(host: string, search = ''): Surface {
  // ?surface=… lets you preview any surface on localhost or a *.pages.dev URL.
  const forced = new URLSearchParams(search).get('surface')
  const pick = forced ?? host.split('.')[0]
  return pick === 'dashboard' || pick === 'app' ? pick : 'workspace'
}

export const surface: Surface =
  typeof window === 'undefined' ? 'workspace' : surfaceFromHost(window.location.hostname, window.location.search)

// Releases are published as prereleases, so link the list, not /latest.
export const DESKTOP_DOWNLOAD_URL = 'https://github.com/Dhruvbruhh/Ventriee_Studios/releases'
