// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmModal } from './ConfirmModal'

afterEach(() => {
  cleanup()
})

describe('ConfirmModal', () => {
  it('renders title and message', () => {
    render(
      <ConfirmModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete item?"
        message="This will permanently delete the item."
        confirmLabel="Delete"
        confirmVariant="danger"
      />,
    )

    expect(screen.getByText('Delete item?')).toBeDefined()
    expect(screen.getByText('This will permanently delete the item.')).toBeDefined()
    expect(screen.getByText('Delete')).toBeDefined()
    expect(screen.getByText('Cancel')).toBeDefined()
  })

  it('does not render when isOpen is false', () => {
    render(
      <ConfirmModal
        isOpen={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete item?"
        message="This will permanently delete the item."
      />,
    )

    expect(screen.queryByText('Delete item?')).toBeNull()
  })

  it('calls onConfirm when confirm button is clicked', async () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={onConfirm}
        title="Delete item?"
        message="This will permanently delete the item."
        confirmLabel="Delete"
        confirmVariant="danger"
      />,
    )

    await userEvent.setup().click(screen.getByRole('button', { name: 'Delete' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when cancel button is clicked', async () => {
    const onClose = vi.fn()
    render(
      <ConfirmModal
        isOpen={true}
        onClose={onClose}
        onConfirm={vi.fn()}
        title="Delete item?"
        message="This will permanently delete the item."
      />,
    )

    await userEvent.setup().click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('disables buttons when disabled prop is true', () => {
    render(
      <ConfirmModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete item?"
        message="This will permanently delete the item."
        disabled={true}
      />,
    )

    const confirmButton = screen.getByRole('button', { name: 'Confirm' })
    const cancelButton = screen.getByRole('button', { name: 'Cancel' })
    expect(confirmButton).toBeDisabled()
    expect(cancelButton).toBeDisabled()
  })

  it('renders with ReactNode message', () => {
    render(
      <ConfirmModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete Project"
        message={
          <>
            Delete <span className="font-semibold">My Project</span>?
          </>
        }
      />,
    )

    expect(screen.getByText('My Project')).toBeDefined()
  })

  it('uses default label and variant when not specified', () => {
    render(
      <ConfirmModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Test"
        message="Test message"
      />,
    )

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDefined()
  })

  it('renders with danger variant', () => {
    render(
      <ConfirmModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        title="Delete?"
        message="Confirm deletion"
        confirmLabel="Delete"
        confirmVariant="danger"
      />,
    )

    expect(screen.getByRole('button', { name: 'Delete' })).toBeDefined()
  })
})
