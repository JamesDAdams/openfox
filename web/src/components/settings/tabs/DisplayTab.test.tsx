/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DisplayTab } from './DisplayTab'
import { SETTINGS_KEYS } from '../../../lib/resources'

const mockSettings: Record<string, string> = {}
const mockSetSetting = vi.fn().mockImplementation((key: string, value: string) => {
  mockSettings[key] = value
  return Promise.resolve()
})

vi.mock('../../../hooks/useSetting', () => ({
  useSetting: (key: string, fallback = '') => ({ value: mockSettings[key] ?? fallback, loading: false }),
}))

vi.mock('../../../lib/resources', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/resources')>()
  return {
    ...actual,
    setSetting: (...args: [string, string]) => mockSetSetting(...args),
  }
})

vi.mock('../ThemeEditor', () => ({
  ThemeEditor: () => <div data-testid="theme-editor">ThemeEditor</div>,
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

  it('renders the Model Selector section with height select and collapse checkbox', () => {
    render(<DisplayTab />)

    expect(screen.getByText('Model Selector')).toBeTruthy()
    expect(screen.getByText('Dropdown size')).toBeTruthy()
    expect(screen.getByText('Collapse providers by default')).toBeTruthy()
    expect(screen.getByText('Collapse favorites by default')).toBeTruthy()

    const select = screen.getByDisplayValue('Default') as HTMLSelectElement
    expect(select.value).toBe('default')

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(checkboxes.length).toBe(2)
    checkboxes.forEach((checkbox) => expect(checkbox.checked).toBe(false))
  })

  it('updates the dropdown size setting when changed', async () => {
    const user = userEvent.setup()
    render(<DisplayTab />)

    const select = screen.getByDisplayValue('Default') as HTMLSelectElement
    await user.selectOptions(select, 'full_height')

    expect(mockSetSetting).toHaveBeenCalledWith(SETTINGS_KEYS.DISPLAY_MODEL_SELECTOR_HEIGHT, 'full_height')
  })

  it('updates the collapse providers setting when checkbox is toggled', async () => {
    const user = userEvent.setup()
    render(<DisplayTab />)

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    const collapseProviders = checkboxes.find((c) =>
      c.closest('label')?.textContent?.includes('Collapse providers by default'),
    )!
    await user.click(collapseProviders)

    expect(mockSetSetting).toHaveBeenCalledWith(SETTINGS_KEYS.DISPLAY_COLLAPSE_PROVIDERS_BY_DEFAULT, 'true')
  })

  it('updates the collapse favorites setting when checkbox is toggled', async () => {
    const user = userEvent.setup()
    render(<DisplayTab />)

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    const collapseFavorites = checkboxes.find((c) =>
      c.closest('label')?.textContent?.includes('Collapse favorites by default'),
    )!
    await user.click(collapseFavorites)

    expect(mockSetSetting).toHaveBeenCalledWith(SETTINGS_KEYS.DISPLAY_COLLAPSE_FAVORITES_BY_DEFAULT, 'true')
  })
})
