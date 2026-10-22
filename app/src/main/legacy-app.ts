// Остановка старой программы VPN Tray 1.0: процесс, автозапуск, ярлык в «Пуске». Её файлы не трогаем.
import { execFile } from 'node:child_process'
import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

function run(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => execFile(cmd, args, { timeout: 15000 }, (err) => resolve(!err)))
}

export async function removeLegacyApp(): Promise<string[]> {
  const done: string[] = []
  if (await run('taskkill', ['/IM', 'VpnTray.exe', '/F'])) done.push('Старая программа VPN Tray остановлена')
  if (await run('reg', ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'VpnTray', '/f']))
    done.push('VPN Tray убрана из автозапуска')
  const lnk = join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'VPN Tray.lnk')
  if (existsSync(lnk)) {
    unlinkSync(lnk)
    done.push('Ярлык VPN Tray убран из меню «Пуск»')
  }
  return done
}
