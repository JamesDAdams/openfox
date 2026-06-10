// @vitest-environment happy-dom
import { renderToStaticMarkup } from 'react-dom/server'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { describe, it, vi, expect, beforeEach, afterEach } from 'vitest'
import { Modal } from './SelfContainedModal'

describe('Modal', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  it('renders label as button', () => {
    const html = renderToStaticMarkup(<Modal label="Open">Content</Modal>)
    expect(html).toContain('>Open<')
  })

  it('renders label with className', () => {
    const html = renderToStaticMarkup(
      <Modal label="Open" className="my-class">
        Content
      </Modal>,
    )
    expect(html).toContain('class="my-class"')
  })

  it('renders label as span when not string', () => {
    const html = renderToStaticMarkup(<Modal label={<span>Click here</span>}>Content</Modal>)
    expect(html).toContain('Click here')
  })

  it('should call close when Escape key is pressed', () => {
    const onClose = vi.fn()
    const root = createRoot(container)
    flushSync(() => {
      root.render(
        <Modal isOpen onClose={onClose} closeOnEscape>
          Content
        </Modal>,
      )
    })

    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
    root.unmount()
  })

  it('should stop propagation of Escape key event', () => {
    const onClose = vi.fn()
    const parentHandler = vi.fn()
    const root = createRoot(container)

    flushSync(() => {
      root.render(
        <div onKeyDown={parentHandler}>
          <Modal isOpen onClose={onClose} closeOnEscape>
            Content
          </Modal>
        </div>,
      )
    })

    container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(parentHandler).not.toHaveBeenCalled()
    root.unmount()
  })
})
