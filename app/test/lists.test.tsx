// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Lists } from '../src/renderer/src/pages/Lists'
import { mockBridge } from './support/mock-bridge'

afterEach(cleanup)

const presets = [
  { id: 'youtube', title: 'YouTube', enabled: true, updated: 0, domains: 15, subnets: 0, sample: ['a.com', 'b.com', 'c.com'] }
]

describe('Lists', () => {
  it('shows preset samples and how many more there are', async () => {
    mockBridge({ presets, mine: { domains: [], ips: [] } })
    render(<Lists />)
    expect(await screen.findByText('a.com, b.com, c.com … и ещё 12')).toBeTruthy()
  })

  it('normalizes a site before sending it', async () => {
    const fns = mockBridge({ presets, mine: { domains: [], ips: [] } })
    render(<Lists />)
    fireEvent.change(await screen.findByPlaceholderText('Например: youtube.com'), {
      target: { value: 'https://www.YouTube.com/x' }
    })
    fireEvent.click(screen.getAllByText('Добавить')[0])
    await waitFor(() => expect(fns.addMine).toHaveBeenCalledWith('domain', 'youtube.com'))
  })

  it('refuses junk and explains why', async () => {
    const fns = mockBridge({ presets, mine: { domains: [], ips: [] } })
    render(<Lists />)
    fireEvent.change(await screen.findByPlaceholderText('Например: youtube.com'), { target: { value: 'a.com;reboot' } })
    fireEvent.click(screen.getAllByText('Добавить')[0])
    expect(await screen.findByText('Это не похоже на адрес сайта')).toBeTruthy()
    expect(fns.addMine?.mock.calls.length ?? 0).toBe(0)
  })

  it('reports presets that failed to update', async () => {
    mockBridge({ presets, mine: { domains: [], ips: [] }, updatePresets: { updated: [], failed: ['youtube'] } })
    render(<Lists />)
    fireEvent.click(await screen.findByText('Обновить'))
    expect(await screen.findByText('Не удалось обновить: YouTube. Используются прежние списки.')).toBeTruthy()
  })
})
