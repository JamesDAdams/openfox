// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { SessionSidebar } from './SessionSidebar'

vi.mock('../../stores/session', () => ({
  useSessionStore: vi.fn(() => ({
    currentSession: null,
  })),
}))

describe('SessionSidebar', () => {
  it('shows Criteria section header', () => {
    const html = renderToStaticMarkup(<SessionSidebar messages={[]} />)

    expect(html).toContain('Criteria')
  })

  it('shows Criteria section in sidebar', () => {
    const html = renderToStaticMarkup(<SessionSidebar messages={[]} />)

    expect(html).toContain('Criteria')
  })
})
