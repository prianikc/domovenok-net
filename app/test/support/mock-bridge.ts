// Подделка window.domovenok для тестов страниц.
import { vi } from 'vitest'

export function mockBridge(answers: Record<string, unknown>): Record<string, ReturnType<typeof vi.fn>> {
  const fns: Record<string, ReturnType<typeof vi.fn>> = {}
  const bridge = new Proxy(
    {},
    {
      get: (_t, k: string) => {
        if (!fns[k]) {
          fns[k] = k.startsWith('on')
            ? vi.fn(() => () => {})
            : vi.fn(async () => {
                const a = answers[k]
                return a instanceof Error ? { ok: false, error: a.message } : { ok: true, data: a ?? null }
              })
        }
        return fns[k]
      }
    }
  )
  ;(window as unknown as { domovenok: unknown }).domovenok = bridge
  return fns
}
