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

  it('sends the whole pasted list and reports what happened', async () => {
    const fns = mockBridge({
      presets,
      mine: { domains: [], ips: [] },
      addMineList: { domains: 2, ips: 1, existed: 1, bad: [] }
    })
    render(<Lists />)
    const field = await screen.findByPlaceholderText(/nexusmods/)
    fireEvent.change(field, { target: { value: '*.nexusmods.com\nnexus-cdn.com\n104.16.0.0/12' } })
    fireEvent.click(screen.getByText('Добавить'))
    await waitFor(() => expect(fns.addMineList).toHaveBeenCalledWith('*.nexusmods.com\nnexus-cdn.com\n104.16.0.0/12'))
    expect(await screen.findByText('Добавлено сайтов: 2, IP и подсетей: 1. Уже были: 1.')).toBeTruthy()
    expect((field as HTMLTextAreaElement).value).toBe('')
  })

  it('leaves what it did not understand in the field', async () => {
    mockBridge({
      presets,
      mine: { domains: [], ips: [] },
      addMineList: { domains: 1, ips: 0, existed: 0, bad: ['localhost', 'a.com`x`'] }
    })
    render(<Lists />)
    const field = await screen.findByPlaceholderText(/nexusmods/)
    fireEvent.change(field, { target: { value: 'a.com localhost a.com`x`' } })
    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true })
    expect(await screen.findByText('Добавлено сайтов: 1. Не понял: 2 — оставил в поле, поправьте.')).toBeTruthy()
    expect((field as HTMLTextAreaElement).value).toBe('localhost\na.com`x`')
  })

  it('shows both lists under one field', async () => {
    mockBridge({ presets, mine: { domains: ['nexusmods.com'], ips: ['1.2.3.0/24'] } })
    render(<Lists />)
    expect(await screen.findByText('nexusmods.com')).toBeTruthy()
    expect(screen.getByText('1.2.3.0/24')).toBeTruthy()
  })

  it('reports presets that failed to update', async () => {
    mockBridge({ presets, mine: { domains: [], ips: [] }, updatePresets: { updated: [], failed: ['youtube'] } })
    render(<Lists />)
    fireEvent.click(await screen.findByText('Обновить'))
    expect(await screen.findByText('Не удалось обновить: YouTube. Используются прежние списки.')).toBeTruthy()
  })
})
