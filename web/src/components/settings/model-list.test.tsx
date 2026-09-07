// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { fireEvent } from '@testing-library/react'
import { ModelEntryRow, getVisibleModels, type ModelWithConfig } from './model-list'
import type { Provider } from '../../stores/config'

function renderRow(
  modelConfig: ModelWithConfig,
  opts?: { onSelectEffort?: (p: string, m: string, e: string) => void; reasoningEfforts?: string[] },
) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <ModelEntryRow
        providerId="provider-1"
        modelConfig={modelConfig}
        isActive={false}
        highlighted={false}
        onModelClick={vi.fn()}
        reasoningEfforts={opts?.reasoningEfforts}
        onSelectEffort={opts?.onSelectEffort ?? vi.fn()}
      />,
    )
  })
  return { container, root }
}

function cleanup({ container, root }: { container: HTMLElement; root: ReturnType<typeof createRoot> }) {
  act(() => root.unmount())
  container.remove()
}

describe('ModelEntryRow vision indicator', () => {
  it('shows an eye indicator for a vision model', () => {
    const rendered = renderRow({ id: 'vision-model', contextWindow: 200000, source: 'backend', supportsVision: true })
    try {
      expect(rendered.container.querySelector('[data-vision]')).not.toBeNull()
    } finally {
      cleanup(rendered)
    }
  })

  it('does not show an eye indicator for a non-vision model', () => {
    const rendered = renderRow({ id: 'text-model', contextWindow: 200000, source: 'backend', supportsVision: false })
    try {
      expect(rendered.container.querySelector('[data-vision]')).toBeNull()
    } finally {
      cleanup(rendered)
    }
  })
})

describe('ModelEntryRow small-context warning', () => {
  it('shows a warning indicator for a small-context model', () => {
    const rendered = renderRow({ id: 'small-model', contextWindow: 8192, source: 'backend' })
    try {
      expect(rendered.container.querySelector('[data-small-context]')).not.toBeNull()
    } finally {
      cleanup(rendered)
    }
  })

  it('does not show a warning indicator for an adequate-context model', () => {
    const rendered = renderRow({ id: 'big-model', contextWindow: 32768, source: 'backend' })
    try {
      expect(rendered.container.querySelector('[data-small-context]')).toBeNull()
    } finally {
      cleanup(rendered)
    }
  })
})

describe('ModelEntryRow mode chips', () => {
  it('renders reasoning-effort chips for a merged mode model', () => {
    const rendered = renderRow(
      { id: 'gemini-3.6-flash', contextWindow: 1048576, source: 'backend' },
      { reasoningEfforts: ['low', 'medium', 'high'] },
    )
    try {
      const chipRow = rendered.container.querySelector('[aria-label="Reasoning efforts for gemini-3.6-flash"]')
      const chips = Array.from(chipRow?.querySelectorAll('button') ?? []).map((b) => b.textContent?.trim())
      expect(chips).toEqual(['low', 'medium', 'high'])
    } finally {
      cleanup(rendered)
    }
  })

  it('does not render chips when no reasoning efforts are set', () => {
    const rendered = renderRow({ id: 'plain-model', contextWindow: 1048576, source: 'backend' })
    try {
      const chipRow = rendered.container.querySelector('[aria-label^="Reasoning efforts"]')
      expect(chipRow).toBeNull()
    } finally {
      cleanup(rendered)
    }
  })

  it('calls onSelectEffort with the clicked level', () => {
    const onSelectEffort = vi.fn()
    const rendered = renderRow(
      { id: 'gemini-3.6-flash', contextWindow: 1048576, source: 'backend' },
      { onSelectEffort, reasoningEfforts: ['low', 'high'] },
    )
    try {
      const chipRow = rendered.container.querySelector('[aria-label="Reasoning efforts for gemini-3.6-flash"]')
      const high = Array.from(chipRow?.querySelectorAll('button') ?? []).find((b) => b.textContent?.trim() === 'high')
      act(() => high?.click())
      expect(onSelectEffort).toHaveBeenCalledWith('provider-1', 'gemini-3.6-flash', 'high')
    } finally {
      cleanup(rendered)
    }
  })
})

describe('ModelEntryRow pricing display', () => {
  it('shows pricing popover on mouse enter when pricing metadata is present on modelConfig', () => {
    const rendered = renderRow({
      id: 'gpt-4o',
      contextWindow: 128000,
      source: 'backend',
      pricing: {
        input: 2.5,
        output: 10,
        cacheRead: 1.25,
        cacheWrite: 3.75,
      },
    })
    try {
      expect(document.body.querySelector('[data-pricing-popover]')).toBeNull()
      const row = rendered.container.firstElementChild as HTMLElement
      act(() => {
        fireEvent.mouseEnter(row)
      })
      const popover = document.body.querySelector('[data-pricing-popover]')
      expect(popover).not.toBeNull()
      expect(popover?.textContent).toContain('Input:')
      expect(popover?.textContent).toContain('$2.5 / 1M')
      expect(popover?.textContent).toContain('Output:')
      expect(popover?.textContent).toContain('$10 / 1M')
      expect(popover?.textContent).toContain('Cache read:')
      expect(popover?.textContent).toContain('$1.25 / 1M')
      expect(popover?.textContent).toContain('Cache write:')
      expect(popover?.textContent).toContain('$3.75 / 1M')

      act(() => {
        fireEvent.mouseLeave(row)
      })
      expect(document.body.querySelector('[data-pricing-popover]')).toBeNull()
    } finally {
      cleanup(rendered)
    }
  })

  it('does not show pricing popover when pricing is undefined', () => {
    const rendered = renderRow({
      id: 'plain-model',
      contextWindow: 128000,
      source: 'backend',
    })
    try {
      const row = rendered.container.firstElementChild as HTMLElement
      act(() => {
        fireEvent.mouseEnter(row)
      })
      expect(document.body.querySelector('[data-pricing-popover]')).toBeNull()
    } finally {
      cleanup(rendered)
    }
  })
})

describe('getVisibleModels mode derivation', () => {
  it('derives reasoningEfforts from a merged model modes', () => {
    const provider = {
      id: 'omni',
      name: 'Omni',
      url: 'https://omniroute.example/v1',
      backend: 'openai',
      models: [
        {
          id: 'gemini-3.6-flash',
          name: 'Gemini 3.6 Flash',
          contextWindow: 1048576,
          source: 'backend',
          modes: [
            { level: 'low', apiModelId: 'gemini-3.6-flash-low' },
            { level: 'high', apiModelId: 'gemini-3.6-flash-high' },
          ],
        },
      ],
      isActive: false,
      createdAt: '',
    } as unknown as Provider
    const visible = getVisibleModels(provider)
    expect(visible[0]?.reasoningEfforts).toEqual(['low', 'high'])
  })
})
