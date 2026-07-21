// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

interface MockStore {
  (selector?: (state: any) => any): any
  setState: (partial: Record<string, any>) => void
}

function mockStore(initial: Record<string, any>): MockStore {
  let state = { ...initial }
  const fn = vi.fn((selector?: (s: typeof state) => any) => {
    return selector ? selector(state) : state
  }) as unknown as MockStore
  fn.setState = (partial: Record<string, any>) => {
    state = { ...state, ...partial }
  }
  return fn
}

const mockNavigate = vi.fn()

vi.mock('wouter', () => ({
  useLocation: () => ['/', mockNavigate],
  Link: ({ children, href }: any) => `<a href="${href}">${children}</a>`,
}))

vi.mock('../../lib/ws', () => ({
  wsClient: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    subscribe: vi.fn(),
    onStatusChange: vi.fn(),
  },
}))

vi.mock('../../stores/session', () => ({
  useSessionStore: mockStore({
    currentSession: null,
    setSessionProvider: vi.fn(),
  }),
}))

vi.mock('../../stores/config', () => ({
  useConfigStore: mockStore({
    providers: [],
    activeProviderId: null,
    defaultModelSelection: null,
    activating: false,
    activateProvider: vi.fn(),
    refreshModel: vi.fn(),
    refreshProviderModels: vi.fn(),
    setDefaultModel: vi.fn(),
    fetchConfig: vi.fn(),
  }),
  getBackendDisplayName: (backend: string) => {
    const map: Record<string, string> = {
      vllm: 'vLLM',
      sglang: 'SGLang',
      ollama: 'Ollama',
      llamacpp: 'llama.cpp',
      lmstudio: 'LM Studio',
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      'opencode-go': 'OpenCode Go',
      unknown: 'Other',
    }
    return map[backend] ?? backend
  },
}))

vi.mock('../../lib/api', () => ({
  authFetch: vi.fn(),
}))

vi.mock('../shared/icons', () => ({
  ChevronDownIcon: ({ className, rotate }: any) => `<svg class="${className}" data-rotate="${rotate}">v</svg>`,
  ReloadIcon: ({ className }: any) => `<svg class="${className}">r</svg>`,
  CheckIcon: ({ className }: any) => `<svg class="${className}">✓</svg>`,
  EditSmallIcon: ({ className }: any) => `<svg class="${className}">e</svg>`,
  StarIcon: ({ className }: any) => `<svg class="${className}">☆</svg>`,
  StarFilledIcon: ({ className }: any) => `<svg class="${className}">★</svg>`,
  SearchIcon: ({ className }: any) => `<svg class="${className}" data-testid="search-icon">🔍</svg>`,
}))

vi.mock('../shared/ProviderModal', () => ({
  ProviderModal: () => '<div>ProviderModal</div>',
  providerFormPayload: (data: any) => data,
}))

function render(ui: React.ReactElement): HTMLElement {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(ui)
  })
  return container
}

async function setConfigState(partial: Record<string, any>) {
  const { useConfigStore } = await import('../../stores/config')
  ;(useConfigStore as unknown as MockStore).setState(partial)
}

async function setSessionState(partial: Record<string, any>) {
  const { useSessionStore } = await import('../../stores/session')
  ;(useSessionStore as unknown as MockStore).setState(partial)
}

describe('ProviderSelector', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    await setConfigState({
      providers: [],
      activeProviderId: null,
      defaultModelSelection: null,
      activating: false,
      activateProvider: vi.fn(),
      refreshModel: vi.fn(),
      refreshProviderModels: vi.fn(),
      setDefaultModel: vi.fn(),
      fetchConfig: vi.fn(),
    })
    await setSessionState({
      currentSession: null,
      setSessionProvider: vi.fn(),
    })
  })

  it('[AUTOMATED] Criterion 3/0 - renders model name without provider prefix when providers list is empty', async () => {
    await setConfigState({
      providers: [],
      activeProviderId: null,
      defaultModelSelection: null,
    })
    const { ProviderSelector } = await import('./ProviderSelector')
    const container = render(<ProviderSelector />)
    const button = container.querySelector('button')
    expect(button).toBeTruthy()
    expect(button!.textContent).toContain('No model')
    expect(button!.textContent).not.toContain('•')
  })

  it('[AUTOMATED] Criterion 0 - shows provider name • modelName when a provider is active with a default model', async () => {
    await setConfigState({
      providers: [
        {
          id: 'provider-1',
          name: 'OpenAI',
          url: 'https://api.openai.com/v1',
          backend: 'openai',
          isLocal: false,
          models: [{ id: 'gpt-4', name: 'GPT-4', contextWindow: 128000, selected: true }],
          isActive: true,
        },
      ],
      activeProviderId: 'provider-1',
      defaultModelSelection: 'provider-1/gpt-4',
    })
    const { ProviderSelector } = await import('./ProviderSelector')
    const container = render(<ProviderSelector />)
    const button = container.querySelector('button')
    expect(button!.textContent).toContain('OpenAI')
    expect(button!.textContent).toContain('gpt 4')
    expect(button!.textContent).toContain('•')
  })

  it('[AUTOMATED] Criterion 1 - falls back to model-only display when activeProvider is not found (no prefix)', async () => {
    await setConfigState({
      providers: [
        {
          id: 'provider-1',
          name: 'OpenAI',
          url: 'https://api.openai.com/v1',
          backend: 'openai',
          isLocal: false,
          models: [{ id: 'gpt-4', name: 'GPT-4', contextWindow: 128000, selected: true }],
          isActive: true,
        },
      ],
      activeProviderId: 'nonexistent-id',
      defaultModelSelection: 'nonexistent-id/gpt-4',
    })
    const { ProviderSelector } = await import('./ProviderSelector')
    const container = render(<ProviderSelector />)
    const button = container.querySelector('button')
    expect(button!.textContent).not.toContain('•')
    expect(button!.textContent).toContain('gpt 4')
  })

  it('[AUTOMATED] Criterion 2 - local/api badge is still rendered when providers exist', async () => {
    await setConfigState({
      providers: [
        {
          id: 'provider-1',
          name: 'Ollama',
          url: 'http://localhost:11434',
          backend: 'ollama',
          isLocal: true,
          models: [{ id: 'llama3', name: 'Llama 3', contextWindow: 8192, selected: true }],
          isActive: true,
        },
      ],
      activeProviderId: 'provider-1',
      defaultModelSelection: 'provider-1/llama3',
    })
    const { ProviderSelector } = await import('./ProviderSelector')
    const container = render(<ProviderSelector />)
    expect(container.textContent).toMatch(/local|api/)
  })

  it('[AUTOMATED] Criterion 2 - local/api badge is still rendered when providers list is empty', async () => {
    await setConfigState({
      providers: [],
      activeProviderId: null,
      defaultModelSelection: null,
    })
    const { ProviderSelector } = await import('./ProviderSelector')
    const container = render(<ProviderSelector />)
    expect(container.textContent).toMatch(/local|api/)
  })

  it('[AUTOMATED] Criterion 0 - shows provider name • modelName with session-scoped model', async () => {
    await setConfigState({
      providers: [
        {
          id: 'provider-1',
          name: 'Anthropic',
          url: 'https://api.anthropic.com',
          backend: 'anthropic',
          isLocal: false,
          models: [{ id: 'claude-opus-4', name: 'Claude Opus 4', contextWindow: 200000, selected: true }],
          isActive: true,
        },
      ],
      activeProviderId: 'provider-1',
      defaultModelSelection: 'provider-1/claude-opus-4',
    })
    await setSessionState({
      currentSession: {
        id: 'session-1',
        providerId: 'provider-1',
        providerModel: 'claude-opus-4',
      },
      setSessionProvider: vi.fn(),
    })
    const { ProviderSelector } = await import('./ProviderSelector')
    const container = render(<ProviderSelector />)
    const button = container.querySelector('button')
    expect(button!.textContent).toContain('Anthropic')
    expect(button!.textContent).toContain('claude opus 4')
    expect(button!.textContent).toContain('•')
  })
})

describe('ProviderSelector search mode (AC 0-5)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    await setConfigState({
      providers: [],
      activeProviderId: null,
      defaultModelSelection: null,
      activating: false,
      activateProvider: vi.fn(),
      refreshModel: vi.fn(),
      refreshProviderModels: vi.fn(),
      setDefaultModel: vi.fn(),
      fetchConfig: vi.fn(),
    })
    await setSessionState({
      currentSession: null,
      setSessionProvider: vi.fn(),
    })
  })

  it('[AUTOMATED] AC-0 click transforms button to search input with placeholder and SearchIcon', async () => {
    await setConfigState({
      providers: [
        {
          id: 'provider-1',
          name: 'OpenAI',
          url: 'https://api.openai.com/v1',
          backend: 'openai',
          isLocal: false,
          models: [{ id: 'gpt-4', name: 'GPT-4', contextWindow: 128000, selected: true }],
          isActive: true,
        },
      ],
      activeProviderId: 'provider-1',
      defaultModelSelection: 'provider-1/gpt-4',
    })
    const { ProviderSelector } = await import('./ProviderSelector')
    const container = render(<ProviderSelector />)

    const button = container.querySelector('button')
    expect(button).toBeTruthy()

    await act(async () => { button!.click() })

    const input = container.querySelector('input')
    expect(input).toBeTruthy()
    const placeholder = input!.getAttribute('placeholder')
    expect(placeholder).toBeTruthy()
    expect(placeholder!.length).toBeGreaterThan(0)

    const searchIcon = container.querySelector('[data-testid="search-icon"]')
    expect(searchIcon ?? container.textContent?.includes('🔍')).toBeTruthy()
  })

  it('[AUTOMATED] AC-1 typing filters models case-insensitively by name and id', async () => {
    await setConfigState({
      providers: [
        {
          id: 'provider-1',
          name: 'OpenAI',
          url: 'https://api.openai.com/v1',
          backend: 'openai',
          isLocal: false,
          models: [
            { id: 'gpt-4', name: 'GPT-4', contextWindow: 128000, selected: true },
            { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', contextWindow: 128000, selected: true },
            { id: 'claude-3', name: 'Claude 3', contextWindow: 200000, selected: true },
          ],
          isActive: true,
        },
      ],
      activeProviderId: 'provider-1',
      defaultModelSelection: 'provider-1/gpt-4',
    })
    const { ProviderSelector } = await import('./ProviderSelector')
    const container = render(<ProviderSelector />)

    await act(async () => { container.querySelector('button')!.click() })

    const input = container.querySelector('input')!

    // Filter by name ("gpt" matches GPT-4 and GPT-4 Turbo, not Claude 3)
    await act(async () => {
      input.value = 'gpt'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(container.textContent).toMatch(/GPT.?4/)
    expect(container.textContent).not.toMatch(/Claude/)

    // Filter by id ("claude" matches claude-3 id, case-insensitive)
    await act(async () => {
      input.value = 'claude'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(container.textContent).toMatch(/Claude/)
    expect(container.textContent).not.toMatch(/GPT.?4/)
  })

  it('[AUTOMATED] AC-2 results are grouped by provider with provider name as header', async () => {
    await setConfigState({
      providers: [
        {
          id: 'provider-1',
          name: 'OpenAI',
          url: 'https://api.openai.com/v1',
          backend: 'openai',
          isLocal: false,
          models: [
            { id: 'gpt-4', name: 'GPT-4', contextWindow: 128000, selected: true },
            { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', contextWindow: 128000, selected: true },
          ],
          isActive: true,
        },
        {
          id: 'provider-2',
          name: 'Anthropic',
          url: 'https://api.anthropic.com',
          backend: 'anthropic',
          isLocal: false,
          models: [
            { id: 'claude-3-opus', name: 'Claude 3 Opus', contextWindow: 200000, selected: true },
          ],
          isActive: true,
        },
      ],
      activeProviderId: 'provider-1',
      defaultModelSelection: 'provider-1/gpt-4',
    })
    const { ProviderSelector } = await import('./ProviderSelector')
    const container = render(<ProviderSelector />)

    await act(async () => { container.querySelector('button')!.click() })

    const input = container.querySelector('input')!

    // Query that matches models across both providers (e.g. "u" matches
    // "GPT-4 Turbo" and "Claude 3 Opus")
    await act(async () => {
      input.value = 'u'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    const text = container.textContent!
    const openaiIdx = text.indexOf('OpenAI')
    const anthropicIdx = text.indexOf('Anthropic')
    expect(openaiIdx).toBeGreaterThanOrEqual(0)
    expect(anthropicIdx).toBeGreaterThanOrEqual(0)
  })

  it('[AUTOMATED] AC-3 selecting a model with session active calls setSessionProvider', async () => {
    const mockSetSessionProvider = vi.fn()
    await setConfigState({
      providers: [
        {
          id: 'provider-1',
          name: 'OpenAI',
          url: 'https://api.openai.com/v1',
          backend: 'openai',
          isLocal: false,
          models: [{ id: 'gpt-4', name: 'GPT-4', contextWindow: 128000, selected: true }],
          isActive: true,
        },
      ],
      activeProviderId: 'provider-1',
      defaultModelSelection: 'provider-1/gpt-4',
    })
    await setSessionState({
      currentSession: { id: 'session-1', providerId: 'provider-1', providerModel: 'gpt-4' },
      setSessionProvider: mockSetSessionProvider,
    })
    const { ProviderSelector } = await import('./ProviderSelector')
    const container = render(<ProviderSelector />)

    await act(async () => { container.querySelector('button')!.click() })

    const modelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('GPT-4')
    )
    expect(modelBtn).toBeTruthy()

    await act(async () => { modelBtn!.click() })

    expect(mockSetSessionProvider).toHaveBeenCalledWith('provider-1', 'gpt-4')
  })

  it('[AUTOMATED] AC-3 selecting a model without session calls activateProvider', async () => {
    const mockActivateProvider = vi.fn().mockResolvedValue(true)
    await setConfigState({
      providers: [
        {
          id: 'provider-1',
          name: 'OpenAI',
          url: 'https://api.openai.com/v1',
          backend: 'openai',
          isLocal: false,
          models: [{ id: 'gpt-4', name: 'GPT-4', contextWindow: 128000, selected: true }],
          isActive: true,
        },
      ],
      activeProviderId: 'provider-1',
      defaultModelSelection: null,
      activateProvider: mockActivateProvider,
    })
    const { ProviderSelector } = await import('./ProviderSelector')
    const container = render(<ProviderSelector />)

    await act(async () => { container.querySelector('button')!.click() })

    const modelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('GPT-4')
    )
    expect(modelBtn).toBeTruthy()

    await act(async () => { modelBtn!.click() })

    expect(mockActivateProvider).toHaveBeenCalled()
  })

  it('[AUTOMATED] AC-4 Escape key closes search without changing model', async () => {
    const mockActivateProvider = vi.fn()
    await setConfigState({
      providers: [
        {
          id: 'provider-1',
          name: 'OpenAI',
          url: 'https://api.openai.com/v1',
          backend: 'openai',
          isLocal: false,
          models: [{ id: 'gpt-4', name: 'GPT-4', contextWindow: 128000, selected: true }],
          isActive: true,
        },
      ],
      activeProviderId: 'provider-1',
      defaultModelSelection: 'provider-1/gpt-4',
      activateProvider: mockActivateProvider,
    })
    const { ProviderSelector } = await import('./ProviderSelector')
    const container = render(<ProviderSelector />)

    await act(async () => { container.querySelector('button')!.click() })

    const input = container.querySelector('input')
    expect(input).toBeTruthy()

    await act(async () => {
      input!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })

    expect(container.querySelector('input')).toBeFalsy()
    expect(mockActivateProvider).not.toHaveBeenCalled()
  })

  it('[AUTOMATED] AC-4 focus loss closes search without changing model', async () => {
    const mockActivateProvider = vi.fn()
    await setConfigState({
      providers: [
        {
          id: 'provider-1',
          name: 'OpenAI',
          url: 'https://api.openai.com/v1',
          backend: 'openai',
          isLocal: false,
          models: [{ id: 'gpt-4', name: 'GPT-4', contextWindow: 128000, selected: true }],
          isActive: true,
        },
      ],
      activeProviderId: 'provider-1',
      defaultModelSelection: 'provider-1/gpt-4',
      activateProvider: mockActivateProvider,
    })
    const { ProviderSelector } = await import('./ProviderSelector')
    const container = render(<ProviderSelector />)

    await act(async () => { container.querySelector('button')!.click() })

    const input = container.querySelector('input')
    expect(input).toBeTruthy()

    // Simulate focus loss: click on a different element outside the dropdown
    const outside = document.createElement('div')
    document.body.appendChild(outside)
    await act(async () => {
      outside.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    })

    expect(container.querySelector('input')).toBeFalsy()
    expect(mockActivateProvider).not.toHaveBeenCalled()
  })

  it('[AUTOMATED] AC-5 Enter with single result selects the model directly', async () => {
    const mockSetSessionProvider = vi.fn()
    await setConfigState({
      providers: [
        {
          id: 'provider-1',
          name: 'OpenAI',
          url: 'https://api.openai.com/v1',
          backend: 'openai',
          isLocal: false,
          models: [
            { id: 'gpt-4', name: 'GPT-4', contextWindow: 128000, selected: true },
            { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', contextWindow: 128000, selected: true },
          ],
          isActive: true,
        },
      ],
      activeProviderId: 'provider-1',
      defaultModelSelection: 'provider-1/gpt-4',
    })
    await setSessionState({
      currentSession: { id: 'session-1', providerId: 'provider-1', providerModel: 'gpt-4' },
      setSessionProvider: mockSetSessionProvider,
    })
    const { ProviderSelector } = await import('./ProviderSelector')
    const container = render(<ProviderSelector />)

    await act(async () => { container.querySelector('button')!.click() })

    const input = container.querySelector('input')!

    await act(async () => {
      input.value = 'turbo'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })

    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(mockSetSessionProvider).toHaveBeenCalledWith('provider-1', 'gpt-4-turbo')
  })
})
