import { FormField, ModalActions, ErrorBanner } from '../CRUDModal'
import { DropdownMenu } from '../../shared/DropdownMenu'
import { parseAllowedTools, serializeTools } from './tools'

interface AgentFormProps {
  formName: string
  formId: string
  formDescription: string
  formSubagent: boolean
  formTools: string[]
  formColor: string
  formPrompt: string
  formError: string
  saving: boolean
  isReadOnly: boolean
  availableTools: { name: string; actions: string[]; topLevelOnly?: boolean }[]
  onNameChange: (name: string) => void
  onIdChange: (id: string) => void
  onDescriptionChange: (desc: string) => void
  onSubagentChange: (subagent: boolean) => void
  onToolsChange: (tools: string[]) => void
  onColorChange: (color: string) => void
  onPromptChange: (prompt: string) => void
  onSave: () => void
  onCancel: () => void
  onDuplicate: () => void
}

export function AgentForm({
  formName,
  formId,
  formDescription,
  formSubagent,
  formTools,
  formColor,
  formPrompt,
  formError,
  saving,
  isReadOnly,
  availableTools,
  onNameChange,
  onIdChange,
  onDescriptionChange,
  onSubagentChange,
  onToolsChange,
  onColorChange,
  onPromptChange,
  onSave,
  onCancel,
  onDuplicate,
}: AgentFormProps) {
  const granularTools = parseAllowedTools(formTools)
  const filteredTools = availableTools.filter((t) => !(formSubagent && t.topLevelOnly))

  const toggleToolAction = (toolName: string, action: string) => {
    const newGranular = new Map(granularTools)
    const current = newGranular.get(toolName) || new Set()
    const newActions = new Set(current)
    if (newActions.has(action)) {
      newActions.delete(action)
    } else {
      newActions.add(action)
    }
    if (newActions.size === 0) {
      newGranular.set(toolName, new Set())
    } else {
      newGranular.set(toolName, newActions)
    }
    onToolsChange(serializeTools(newGranular))
  }

  const toggleTool = (toolName: string) => {
    const newGranular = new Map(granularTools)
    if (newGranular.has(toolName)) {
      newGranular.delete(toolName)
    } else {
      newGranular.set(toolName, new Set())
    }
    onToolsChange(serializeTools(newGranular))
  }

  return (
    <div className="flex flex-col h-full">
      <div className="space-y-3">
        {formError && <ErrorBanner message={formError} />}

        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Name"
            value={formName}
            onChange={onNameChange}
            placeholder="My Agent"
            readOnly={isReadOnly}
          />
          <FormField
            label="ID"
            value={formId}
            onChange={onIdChange}
            readOnly={true}
            placeholder="my_agent"
            hint="(read-only)"
            mono
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Description"
            value={formDescription}
            onChange={onDescriptionChange}
            placeholder="What this agent does"
            readOnly={isReadOnly}
          />
          <div>
            <label className="block text-xs text-text-secondary mb-1">Type</label>
            <div className="flex items-center gap-3 h-[34px]">
              <button
                onClick={() => !isReadOnly && onSubagentChange(false)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  !formSubagent
                    ? 'bg-accent-primary/25 text-accent-primary'
                    : 'bg-bg-tertiary text-text-muted hover:text-text-secondary'
                } ${isReadOnly ? 'pointer-events-none opacity-60' : ''}`}
              >
                Agent
              </button>
              <button
                onClick={() => !isReadOnly && onSubagentChange(true)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  formSubagent
                    ? 'bg-accent-primary/25 text-accent-primary'
                    : 'bg-bg-tertiary text-text-muted hover:text-text-secondary'
                } ${isReadOnly ? 'pointer-events-none opacity-60' : ''}`}
              >
                Sub-agent
              </button>
              <div className="flex items-center gap-1.5 ml-auto">
                <label className="text-xs text-text-secondary">Color</label>
                <input
                  type="color"
                  value={formColor}
                  onChange={(e) => !isReadOnly && onColorChange(e.target.value)}
                  disabled={isReadOnly}
                  className="w-6 h-6 rounded cursor-pointer border border-border bg-transparent"
                />
              </div>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs text-text-secondary mb-1">Tools</label>
          <div className="flex flex-wrap gap-1.5 p-2 bg-bg-tertiary border border-border rounded max-h-32 overflow-y-auto">
            {filteredTools.map((tool) => {
              const isSelected = granularTools.has(tool.name)
              const hasActions = tool.actions.length > 0
              const selectedActions = granularTools.get(tool.name) || new Set()

              if (!hasActions) {
                return (
                  <button
                    key={tool.name}
                    onClick={() => !isReadOnly && toggleTool(tool.name)}
                    className={`px-1.5 py-0.5 rounded text-xs font-mono transition-colors flex items-center gap-1 ${
                      isSelected
                        ? 'bg-accent-primary/25 text-accent-primary'
                        : 'bg-bg-primary text-text-muted hover:text-text-secondary'
                    } ${isReadOnly ? 'pointer-events-none' : 'cursor-pointer'}`}
                  >
                    <span>{tool.name}</span>
                  </button>
                )
              }

              if (isReadOnly) {
                return (
                  <button
                    key={tool.name}
                    className="px-1.5 py-0.5 rounded text-xs font-mono flex items-center gap-1 bg-bg-primary text-text-muted pointer-events-none opacity-60"
                  >
                    <span>{tool.name}</span>
                    <span className="text-[10px]">*</span>
                  </button>
                )
              }

              return (
                <DropdownMenu
                  key={tool.name}
                  trigger={
                    <button
                      className={`px-1.5 py-0.5 rounded text-xs font-mono transition-colors flex items-center gap-1 ${
                        isSelected ? 'bg-accent-primary/25 text-accent-primary' : 'bg-bg-primary text-text-muted'
                      }`}
                    >
                      <span>{tool.name}</span>
                      {hasActions && (
                        <span
                          className={`text-[10px] ${isSelected && selectedActions.size > 0 ? 'text-accent-primary' : 'text-text-muted'}`}
                        >
                          *
                        </span>
                      )}
                    </button>
                  }
                  minWidth="160px"
                  items={[
                    ...tool.actions.map((action) => ({
                      label: (
                        <label className="flex items-center gap-2 cursor-pointer" htmlFor={`${tool.name}-${action}`}>
                          <input
                            type="checkbox"
                            id={`${tool.name}-${action}`}
                            checked={selectedActions.has(action)}
                            onChange={() => toggleToolAction(tool.name, action)}
                            disabled={isReadOnly}
                            className="w-3 h-3 rounded accent-accent-primary"
                          />
                          <span>{action}</span>
                        </label>
                      ),
                      closeOnClick: false,
                    })),
                    {
                      label: isSelected ? 'Deselect all' : 'Select all',
                      closeOnClick: false,
                      onClick: () => {
                        if (isSelected) {
                          toggleTool(tool.name)
                        } else {
                          const newGranular = new Map(granularTools)
                          newGranular.set(tool.name, new Set(tool.actions))
                          onToolsChange(serializeTools(newGranular))
                        }
                      },
                    },
                  ]}
                />
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-[150px] border-t border-border pt-3 flex flex-col">
        <label className="block text-xs text-text-secondary mb-1">Prompt</label>
        <textarea
          value={formPrompt}
          onChange={(e) => !isReadOnly && onPromptChange(e.target.value)}
          readOnly={isReadOnly}
          placeholder="Instructions for this agent..."
          className={`h-80 w-full px-3 py-2 bg-bg-tertiary border border-border rounded text-sm font-mono resize-y focus:outline-none focus:ring-1 focus:ring-accent-primary ${isReadOnly ? 'opacity-60' : ''}`}
        />
      </div>

      <ModalActions
        onCancel={onCancel}
        onSave={onSave}
        saving={saving}
        saveDisabled={!formName || !formPrompt || isReadOnly}
      />
      {isReadOnly && (
        <div className="flex justify-end mt-2">
          <button
            onClick={onDuplicate}
            className="px-3 py-1.5 rounded bg-accent-primary/20 text-sm text-accent-primary font-medium hover:bg-accent-primary/30 transition-colors"
          >
            Duplicate & Customize
          </button>
        </div>
      )}
    </div>
  )
}
