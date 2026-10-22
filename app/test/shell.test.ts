import { describe, expect, it } from 'vitest'
import { shq } from '../src/shared/shell'

describe('shq', () => {
  it('quotes single quotes POSIX-style', () => {
    expect(shq("it's")).toBe("'it'\\''s'")
  })
  it('wraps plain text', () => {
    expect(shq('a b;c')).toBe("'a b;c'")
  })
})
