import type { DomovenokApi } from '../shared/ipc'

declare global {
  interface Window {
    domovenok: DomovenokApi & { pathForFile(f: File): string }
  }
}
