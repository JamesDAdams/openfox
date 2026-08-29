/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PluginSettingsModal } from './PluginSettingsModal'

const mockFetch = vi.fn()
vi.mock('../../lib/api', () => ({
  authFetch: (...args: Parameters<typeof fetch>) => mockFetch(...args),
}))

function createJsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('PluginSettingsModal', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders settings fields and saves changes', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        hasSpec: true,
        spec: {
          title: 'ChatGPT Plugin Settings',
          description: 'Configure API settings',
          fields: [
            { key: 'apiKey', label: 'API Key', type: 'password', required: true },
            { key: 'enableStream', label: 'Stream Responses', type: 'boolean', defaultValue: true },
          ],
        },
        values: { enableStream: true },
      }),
    )

    const onClose = vi.fn()
    render(
      <PluginSettingsModal isOpen={true} onClose={onClose} pluginName="openfox-chatgpt" pluginDisplayName="ChatGPT" />,
    )

    await waitFor(() => {
      expect(screen.getByText('ChatGPT Plugin Settings')).toBeDefined()
    })
    expect(screen.getByText('Configure API settings')).toBeDefined()
    expect(screen.getByText('API Key')).toBeDefined()

    const passwordInput = screen.getByLabelText('API Key *') as HTMLInputElement
    expect(passwordInput.value).toBe('')

    await userEvent.setup().type(passwordInput, 'sk-456')

    mockFetch.mockResolvedValueOnce(
      createJsonResponse({ success: true, values: { apiKey: 'sk-456', enableStream: true } }),
    )

    const saveButton = screen.getByRole('button', { name: 'Save Settings' })
    await userEvent.setup().click(saveButton)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/plugins/openfox-chatgpt/settings',
        expect.objectContaining({
          method: 'POST',
        }),
      )
    })
  })

  it('blocks save when a required field is empty', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        hasSpec: true,
        spec: {
          title: 'Required Plugin Settings',
          fields: [{ key: 'apiKey', label: 'API Key', type: 'password', required: true }],
        },
        values: {},
      }),
    )

    render(
      <PluginSettingsModal isOpen={true} onClose={vi.fn()} pluginName="openfox-req" pluginDisplayName="Required" />,
    )

    await waitFor(() => {
      expect(screen.getByText('Required Plugin Settings')).toBeDefined()
    })

    const saveButton = screen.getByRole('button', { name: 'Save Settings' })
    await userEvent.setup().click(saveButton)

    await waitFor(() => {
      expect(screen.getByText('API Key is required')).toBeDefined()
    })
    expect(mockFetch).not.toHaveBeenCalledWith(
      '/api/plugins/openfox-req/settings',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('renders custom UI iframe when customUiUrl is set', async () => {
    mockFetch.mockResolvedValueOnce(
      createJsonResponse({
        hasSpec: true,
        spec: {
          title: 'Custom Plugin Settings',
          customUiUrl: 'http://localhost:3000/plugin-ui',
        },
        values: {},
      }),
    )

    render(
      <PluginSettingsModal isOpen={true} onClose={vi.fn()} pluginName="openfox-custom" pluginDisplayName="Custom" />,
    )

    await waitFor(() => {
      expect(screen.getByTitle('Custom Custom UI')).toBeDefined()
    })
  })
})
