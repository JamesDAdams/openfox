import { formatDateTime } from '../lib/format-date'
import { BranchIcon, CopyIcon } from '../components/shared/icons'
import { useT } from './useT'
import type { Message } from '@shared/types.js'
import type { ContextMenuItem } from '../components/shared/ContextMenu'

export function useMessageContextMenu(message: Message, onCopy: () => void, onFork: () => void): ContextMenuItem[] {
  const t = useT()
  return [
    {
      label: formatDateTime(message.timestamp),
      info: true,
    },
    {
      label: t({ en: 'Copy', fr: 'Copier' }),
      icon: <CopyIcon className="w-4 h-4" />,
      onClick: () => void onCopy(),
    },
    {
      label: t({ en: 'Fork session from here', fr: 'Dupliquer la session à partir d’ici' }),
      icon: <BranchIcon className="w-4 h-4" />,
      onClick: () => void onFork(),
    },
  ]
}
