// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SpeedChart, smoothPath } from '../src/renderer/src/components/SpeedChart'

describe('SpeedChart', () => {
  it('draws two open lines without fill', () => {
    const { container } = render(
      <SpeedChart points={[{ vpn: 1, direct: 2 }, { vpn: 5, direct: 1 }, { vpn: 3, direct: 4 }]} height={90} />
    )
    const paths = container.querySelectorAll('path')
    expect(paths).toHaveLength(2)
    for (const p of paths) {
      expect(p.getAttribute('fill')).toBe('none')
      expect(p.getAttribute('d')?.trim().endsWith('Z')).toBe(false)
    }
    expect(paths[0].getAttribute('stroke')).toBe('#6cc58a')
    expect(paths[1].getAttribute('stroke')).toBe('#58a6ff')
  })

  it('renders an empty chart without errors', () => {
    const { container } = render(<SpeedChart points={[]} height={40} />)
    expect(container.querySelector('svg')).not.toBeNull()
  })
})

describe('smoothPath', () => {
  it('draws curves through the points instead of straight segments', () => {
    const d = smoothPath([[0, 10], [10, 0], [20, 10]])
    expect(d.startsWith('M0 10')).toBe(true)
    expect(d).toContain('C')
    expect(d).not.toContain('L')
    expect(d.trim().endsWith('20 10')).toBe(true)
  })
})
