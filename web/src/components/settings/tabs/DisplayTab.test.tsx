/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DisplayTab } from './DisplayTab'

const mockSettings: Record<string, string> = {}
const mockGetSetting = vi.fn().mockResolvedValue('')
const mockSetSetting = vi.fn()

vi.mock('../useSettingsStore', () => ({
  useSettingsStoreState: () => ({
    settings: mockSettings,
    loading: {},
    getSetting: mockGetSetting,
    setSetting: mockSetSetting,
  }),
}))

describe('DisplayTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(mockSettings).forEach((k) => delete mockSettings[k])
  })

  it('renders fullscreen slash commands toggle with proper description', () => {
    render(<DisplayTab />)
    expect(screen.getByText('Fullscreen slash commands view')).toBeTruthy()
    expect(
      screen.getByText('Choose whether the commands view uses default sizing or fills the available screen height.'),
    ).toBeTruthy()
  })
})
