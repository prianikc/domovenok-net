import { describe, expect, it } from 'vitest'
import { APP_NAME, REPO, ROUTER_VERSION } from '../src/shared/config'

describe('config', () => {
  it('names the app ДомовёнокNET', () => {
    expect(APP_NAME).toBe('ДомовёнокNET')
  })

  it('keeps the repository as owner/name', () => {
    expect(REPO).toMatch(/^[^/]+\/[^/]+$/)
    expect(ROUTER_VERSION).toBe('2.0.0')
  })
})
