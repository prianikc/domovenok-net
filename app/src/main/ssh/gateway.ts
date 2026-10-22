// Адрес роутера = основной шлюз Windows.
import { execFile } from 'node:child_process'

export function defaultGateway(): Promise<string | null> {
  const ps =
    '(Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Sort-Object RouteMetric | Select-Object -First 1).NextHop'
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-Command', ps], { timeout: 10000 }, (err, out) => {
      const ip = out?.toString().trim()
      resolve(!err && ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip) ? ip : null)
    })
  })
}
