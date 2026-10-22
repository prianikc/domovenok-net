// Большое окно (двойной клик) и мини-окно над треем (одиночный клик).
import { BrowserWindow, screen, shell, type Rectangle } from 'electron'
import { join } from 'node:path'
import { is } from '@electron-toolkit/utils'

const BG = '#0f1419'

export class Windows {
  main?: BrowserWindow
  mini?: BrowserWindow
  quitting = false

  constructor(private onVisibility: (visible: boolean) => void) {}

  private load(w: BrowserWindow, view: 'main' | 'mini'): void {
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) void w.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#${view}`)
    else void w.loadFile(join(__dirname, '../renderer/index.html'), { hash: view })
  }

  private webPreferences() {
    return { preload: join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true }
  }

  private visibilityChanged = (): void => {
    this.onVisibility(!!(this.main?.isVisible() || this.mini?.isVisible()))
  }

  openMain(tab?: string): void {
    if (!this.main) {
      this.main = new BrowserWindow({
        width: 640,
        height: 760,
        minWidth: 560,
        minHeight: 600,
        show: false,
        backgroundColor: BG,
        autoHideMenuBar: true,
        titleBarStyle: 'hidden',
        titleBarOverlay: { color: '#161b22', symbolColor: '#e6edf3', height: 36 },
        webPreferences: this.webPreferences()
      })
      this.main.webContents.setWindowOpenHandler(({ url }) => {
        void shell.openExternal(url)
        return { action: 'deny' }
      })
      this.main.on('close', (e) => {
        if (this.quitting) return
        e.preventDefault()
        this.main?.hide()
      })
      this.main.on('show', this.visibilityChanged)
      this.main.on('hide', this.visibilityChanged)
      this.load(this.main, 'main')
      this.main.once('ready-to-show', () => this.main?.show())
    } else {
      this.main.show()
    }
    this.main.focus()
    if (tab) this.send('navigate', tab)
  }

  toggleMini(trayBounds: Rectangle): void {
    if (this.mini?.isVisible()) return this.mini.hide()
    if (!this.mini) {
      this.mini = new BrowserWindow({
        width: 300,
        height: 380,
        show: false,
        frame: false,
        resizable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        backgroundColor: BG,
        webPreferences: this.webPreferences()
      })
      this.mini.on('blur', () => this.mini?.hide())
      this.mini.on('show', this.visibilityChanged)
      this.mini.on('hide', this.visibilityChanged)
      this.load(this.mini, 'mini')
    }
    const area = screen.getDisplayNearestPoint({ x: trayBounds.x, y: trayBounds.y }).workArea
    const [w, h] = this.mini.getSize()
    const x = Math.min(Math.max(trayBounds.x + trayBounds.width / 2 - w / 2, area.x + 8), area.x + area.width - w - 8)
    const y = trayBounds.y > area.y + area.height / 2 ? area.y + area.height - h - 8 : area.y + 8
    this.mini.setPosition(Math.round(x), Math.round(y))
    this.mini.show()
    this.mini.focus()
  }

  closeMini(): void {
    this.mini?.hide()
  }

  send(event: string, value: unknown): void {
    for (const w of [this.main, this.mini]) if (w && !w.isDestroyed()) w.webContents.send(`dn:${event}`, value)
  }
}
