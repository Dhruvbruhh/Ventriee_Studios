import { app, Notification } from 'electron'
// electron-updater is CommonJS; the ESM main bundle can only take its default export.
import updaterPackage, { type UpdateInfo } from 'electron-updater'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { UpdateState } from '../shared/types'

const { autoUpdater } = updaterPackage
const SIX_HOURS = 6 * 60 * 60 * 1000

/** The release page for a version, from the publish settings electron-builder packs next to the app. */
function releaseUrl(version: string): string | undefined {
  const file = join(process.resourcesPath, 'app-update.yml')
  if (!existsSync(file)) return undefined
  const yml = readFileSync(file, 'utf8')
  const owner = /^owner: *(\S+)/m.exec(yml)?.[1]
  const repo = /^repo: *(\S+)/m.exec(yml)?.[1]
  return owner && repo ? `https://github.com/${owner}/${repo}/releases/tag/v${version}` : undefined
}

/**
 * Checks GitHub Releases for a newer version, downloads it in the background and
 * says so; installing waits for the owner (or the next normal quit). User data lives
 * in the app data folder, which the installer never touches, and the database backs
 * itself up before a newer version changes its format.
 */
export class Updater {
  state: UpdateState = { status: 'unsupported', current: app.getVersion() }
  private notified = ''

  constructor(private onChange: (state: UpdateState) => void, private blockedReason: () => string | null) {}

  private set(patch: Partial<UpdateState>) {
    this.state = { current: app.getVersion(), ...patch } as UpdateState
    this.onChange(this.state)
  }

  start() {
    if (!app.isPackaged) { this.set({ status: 'unsupported', message: 'Updates are checked in the installed app, not in development.' }); return }
    // The portable exe cannot replace itself; it only learns about new versions.
    const portable = Boolean(process.env.PORTABLE_EXECUTABLE_DIR)
    autoUpdater.autoDownload = !portable
    autoUpdater.autoInstallOnAppQuit = !portable
    autoUpdater.allowPrerelease = true
    autoUpdater.on('checking-for-update', () => this.set({ status: 'checking' }))
    autoUpdater.on('update-not-available', () => this.set({ status: 'current' }))
    autoUpdater.on('update-available', (info: UpdateInfo) => this.set(portable
      ? { status: 'manual', version: info.version, url: releaseUrl(info.version) }
      : { status: 'downloading', version: info.version, percent: 0 }))
    autoUpdater.on('download-progress', (p) => this.set({ status: 'downloading', version: this.state.version, percent: Math.round(p.percent) }))
    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.set({ status: 'ready', version: info.version })
      if (this.notified !== info.version && Notification.isSupported()) {
        this.notified = info.version
        new Notification({ title: `Ventriee Studios ${info.version} is ready`, body: 'Restart to update now, or it installs the next time you close the app. Your projects and settings stay as they are.' }).show()
      }
    })
    // Offline or GitHub unreachable: say it quietly, keep working, try again later.
    autoUpdater.on('error', (error) => this.set({ status: 'error', version: this.state.version, message: String(error?.message ?? error).split('\n')[0].slice(0, 200) }))
    this.set({ status: 'idle' })
    setTimeout(() => void this.check(), 10_000)
    setInterval(() => void this.check(), SIX_HOURS).unref()
  }

  async check() {
    if (this.state.status === 'unsupported' || this.state.status === 'downloading' || this.state.status === 'ready') return this.state
    try {
      // null means the updater decided it is inactive; say so instead of sitting on "idle".
      const result = await autoUpdater.checkForUpdates()
      if (!result && this.state.status === 'idle') this.set({ status: 'error', message: 'The updater did not run a check.' })
    } catch (error) {
      // Configuration and network failures do not always reach the error event.
      if (this.state.status !== 'error') this.set({ status: 'error', version: this.state.version, message: String((error as Error)?.message ?? error).split('\n')[0].slice(0, 200) })
    }
    return this.state
  }

  install() {
    if (this.state.status !== 'ready') throw new Error('No update has been downloaded yet')
    const reason = this.blockedReason()
    if (reason) throw new Error(reason)
    // Silent install into the same folder, then start the new version.
    setImmediate(() => autoUpdater.quitAndInstall(true, true))
  }
}
