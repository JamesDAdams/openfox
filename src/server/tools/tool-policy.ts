export const ALWAYS_ALLOWED = new Set(['step_done'])

export const ALWAYS_ALLOWED_FOR_SUBAGENTS = new Set(['return_value'])

/** Tools that only make sense for top-level agents, not sub-agents. */
export const TOP_LEVEL_ONLY_TOOLS = new Set(['call_sub_agent'])

/**
 * Compute the effective set of tool names available to an agent.
 * Combines explicit allowedTools with always-allowed tools for the given type.
 * Granular action suffixes (e.g. "session_metadata:get,add") are stripped —
 * only base tool names are returned.
 */
export function computeEffectiveTools(allowedTools: string[], type: 'agent' | 'sub-agent'): Set<string> {
  const tools = new Set<string>()
  for (const entry of allowedTools) {
    const baseName = entry.includes(':') ? entry.split(':')[0]! : entry
    // return_value is reserved for sub-agents; exclude from top-level agents
    if (baseName === 'return_value' && type === 'agent') continue
    tools.add(baseName)
  }
  const alwaysAllowed = type === 'sub-agent' ? ALWAYS_ALLOWED_FOR_SUBAGENTS : ALWAYS_ALLOWED
  for (const tool of alwaysAllowed) {
    tools.add(tool)
  }
  return tools
}
