// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Profiles } from '../src/renderer/src/pages/Profiles'
import { mockBridge } from './support/mock-bridge'

afterEach(cleanup)

const list = { active: 'old', profiles: [{ name: 'old', type: 'awg' }, { name: 'new', type: 'wg' }] }

describe('Profiles', () => {
  it('tells when it fell back to the previous profile', async () => {
    mockBridge({ profiles: list, useProfile: { profile: 'old', healthy: true, rolledBack: true } })
    render(<Profiles />)
    fireEvent.click((await screen.findAllByText('Подключить'))[0])
    expect(await screen.findByText('Профиль new не подключился, вернулся на old')).toBeTruthy()
  })

  it('does not allow deleting the active profile', async () => {
    mockBridge({ profiles: list })
    render(<Profiles />)
    const buttons = await screen.findAllByText('Удалить')
    expect((buttons[0] as HTMLButtonElement).disabled).toBe(true)
    expect((buttons[1] as HTMLButtonElement).disabled).toBe(false)
  })

  it('shows the router message for an admin profile string', async () => {
    mockBridge({
      profiles: list,
      importProfileString: new Error('Это админский профиль — его поддержка появится в разделе «Сервер»')
    })
    render(<Profiles />)
    fireEvent.change(await screen.findByPlaceholderText('Вставьте строку vpn://'), { target: { value: 'vpn://x' } })
    fireEvent.click(screen.getByText('Добавить'))
    expect(await screen.findByText('Это админский профиль — его поддержка появится в разделе «Сервер»')).toBeTruthy()
  })
})
