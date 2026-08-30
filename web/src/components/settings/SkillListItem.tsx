import type { SkillInfo } from '../../lib/skills-actions'
import { Toggle } from '../shared/Toggle'
import { CRUDListItemSimple } from './CRUDListItem'
import { formatTokens } from '../../lib/mcp-utils'

interface SkillListItemProps {
  skill: SkillInfo
  isBuiltIn: boolean
  isConfirmingDelete: boolean
  onView: () => void
  onEdit?: () => void
  onDuplicate: () => void
  onDelete?: () => void
  onToggle: () => void
  readOnly?: boolean
}

export function SkillListItem({
  skill,
  isBuiltIn,
  isConfirmingDelete,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
  onToggle,
  readOnly = false,
}: SkillListItemProps) {
  return (
    <CRUDListItemSimple
      id={skill.id}
      name={skill.name}
      description={skill.description}
      extraBadge={
        skill.estimatedTokens !== undefined && skill.estimatedTokens > 0 ? (
          <span className="text-xs text-text-muted">{formatTokens(skill.estimatedTokens)} tokens</span>
        ) : undefined
      }
      isBuiltIn={isBuiltIn}
      isConfirmingDelete={isConfirmingDelete}
      onView={onView}
      onEdit={readOnly ? undefined : onEdit}
      onDuplicate={onDuplicate}
      onDelete={readOnly ? undefined : onDelete}
      actions={<Toggle enabled={skill.enabled} onClick={onToggle} label={`Activation for ${skill.name}`} />}
    />
  )
}
