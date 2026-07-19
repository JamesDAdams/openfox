import { ConfirmModal } from './shared/ConfirmModal'

interface DeleteProjectConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  projectName: string
  onConfirm: () => void
}

export function DeleteProjectConfirmationModal({
  isOpen,
  onClose,
  projectName,
  onConfirm,
}: DeleteProjectConfirmationModalProps) {
  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  return (
    <ConfirmModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={handleConfirm}
      title="Delete Project"
      confirmLabel="Delete"
      confirmVariant="danger"
      message={
        <>
          This will permanently delete the project{' '}
          <span className="font-semibold text-text-primary">{projectName}</span> and all its sessions from OpenFox. The
          project files on disk will remain untouched.
        </>
      }
    />
  )
}
