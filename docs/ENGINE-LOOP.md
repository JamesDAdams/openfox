# Multi-Turn Agentic Engine Loop

> Exhaustive flow diagram of how a chat turn executes, including compaction.

## Legend

```
──►  control flow (async call)
◄──►  data flow
~~►  event emission to EventStore
╔══╗  entry point
║  ║  function/module
╠══╣  loop construct
┌──┐  decision
└──┘
```

## Top-Level: runChatTurn

```
User sends message
       │
       ▼
╔══════════════════════════════════════════════════════╗
║  runChatTurn(options)                     [orchestrator.ts:150] ║
║                                                   ║
║  1. Mark session as running                       ║
║     ~~► running.changed { isRunning: true }       ║
║                                                   ║
║  2. Dispatch by mode:                             ║
║     │                                             ║
║     ├── mode === 'builder' ──► runBuilderTurn()   ║
║     └── else ──► runGenericAgentTurn(mode)        ║
║                                                   ║
║  3. After turn completes:                         ║
║     ├── Build snapshot from session state          ║
║     ├── ~~► turn.snapshot { messages, criteria,   ║
║     │         contextState, lastModeWithReminder } ║
║     └── Cleanup old events (delete before snapshot)║
║                                                   ║
║  4. finally:                                      ║
║     ~~► running.changed { isRunning: false }      ║
╚══════════════════════════════════════════════════════╝
```

## Turn Setup: runGenericAgentTurn / runBuilderTurn

```
╔══════════════════════════════════════════════════════════╗
║  runGenericAgentTurn(options, turnMetrics, agentId)     ║
║                                              [orchestrator.ts:345] ║
║                                                          ║
║  1. Load all agent definitions                           ║
║                                                          ║
║  2. injectModeReminderIfNeeded()                         ║
║     │                                                    ║
║     │  ┌─ lastModeWithReminder === agentId?              ║
║     │  │   AND currentWindowHasReminder()?               ║
║     │  ├── YES ──► skip (reminder already in window)     ║
║     │  └── NO ──► inject reminder:                      ║
║     │        ~~► message.start { role: 'user',           ║
║     │              messageKind: 'auto-prompt',            ║
║     │              content: '<system-reminder>...',       ║
║     │              contextWindowId: <current>,            ║
║     │              metadata: { type: 'agent' } }          ║
║     │        ~~► message.done                            ║
║     │        ~~► executionState update (no-op in prod)   ║
║                                                          ║
║  3. Resolve agent definition, sub-agents, tools          ║
║  4. Load instructions, skills                            ║
║  5. Resolve cached system prompt                         ║
║                                                          ║
║  6. runTopLevelAgentLoop({ mode: agentId, ... })         ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝

╔══════════════════════════════════════════════════════════╗
║  runBuilderTurn(options, turnMetrics, append)            ║
║                                              [orchestrator.ts:435] ║
║  Same structure as runGenericAgentTurn but:              ║
║  - injectModeReminderIfNeeded with agentId='builder'     ║
║  - injectKickoff callback (BUILDER_KICKOFF_PROMPT)       ║
║  - Tracks stepDoneCalled                                 ║
║  - Filters tool registry (but always returns all tools)  ║
╚══════════════════════════════════════════════════════════╝
```

## Core Agent Loop: runTopLevelAgentLoop

```
╔══════════════════════════════════════════════════════════════════╗
║  runTopLevelAgentLoop(config, turnMetrics)                      ║
║                                                    [agent-loop.ts:108] ║
║                                                                  ║
║  ┌───────────── LOOP (for;;) ──────────────────────────────┐     ║
║  │                                                          │     ║
║  │  1. Check abort signal                                   │     ║
║  │                                                          │     ║
║  │  2. Inject kickoff (only on first iteration)             │     ║
║  │     config.injectKickoff?.()                             │     ║
║  │     [builder: injects "fulfil the N criteria" prompt]    │     ║
║  │                                                          │     ║
║  │  3. Load instructions, injected files                    │     ║
║  │                                                          │     ║
║  │  4. Get conversation messages                            │     ║
║  │     requestMessages = await config.getConversationMessages()│   ║
║  │     │                                                     │     ║
║  │     │  ┌── getConversationMessages()                      │     ║
║  │     │  │  [conversation-history.ts:194]                   │     ║
║  │     │  │  1. eventStore.getEvents(sessionId)              │     ║
║  │     │  │  2. buildContextMessages(events, scope)          │     ║
║  │     │  │     │                                            │     ║
║  │     │  │     ├── scope.type === 'toplevel'                │     ║
║  │     │  │     │   └── buildTopLevelContextMessages()       │     ║
║  │     │  │     │     ├── foldContextState(events, '')       │     ║
║  │     │  │     │     │   └── walks events to find current   │     ║
║  │     │  │     │     │       contextWindowId from:          │     ║
║  │     │  │     │     │       - session.initialized          │     ║
║  │     │  │     │     │       - turn.snapshot                │     ║
║  │     │  │     │     │       - context.compacted            │     ║
║  │     │  │     │     └── buildContextMessagesFromEventHistory│     ║
║  │     │  │     │           (events, currentWindowId)        │     ║
║  │     │  │     │         ├── Find latest turn.snapshot      │     ║
║  │     │  │     │         ├── Extract messages in windowId   │     ║
║  │     │  │     │         └── Replay events after snapshot   │     ║
║  │     │  │     │                                            │     ║
║  │     │  │     └── scope.type === 'subagent'                │     ║
║  │     │  │         └── buildSubAgentContextMessages()       │     ║
║  │     │  │             (filters by subAgentId,              │     ║
║  │     │  │              handles sub-agent compaction)       │     ║
║  │     │  │                                                  │     ║
║  │     │  └── minimalMessagesToRequestContextMessages()      │     ║
║  │     │                                                     │     ║
║  │  5. If retry count > 0: inject continue prompt            │     ║
║  │     ~~► message.start { messageKind: 'correction' }      │     ║
║  │                                                          │     ║
║  │  6. Assemble LLM request                                 │     ║
║  │     ├── If cachedSystemPrompt && !dynamicMode:            │     ║
║  │     │   createAssemblyResult(systemPrompt, messages,      │     ║
║  │   │                          tools)                      │     ║
║  │     └── Else: assembleFreshRequest()                     │     ║
║  │         └── config.assembleRequest(...)                   │     ║
║  │             └── assembleAgentRequest(...)                 │     ║
║  │                 [request-context.ts]                      │     ║
║  │                 ├── buildTopLevelSystemPrompt()           │     ║
║  │                 │   = base prompt + sub-agents section    │     ║
║  │                 ├── Convert messages to MinimalMessage[]  │     ║
║  │                 └── Return { systemPrompt, messages,      │     ║
║  │                               promptContext }            │     ║
║  │                                                          │     ║
║  │  7. Start assistant message                              │     ║
║  │     ~~► message.start { role: 'assistant' }              │     ║
║  │                                                          │     ║
║  │  8. Call LLM                                             │     ║
║  │     streamGen = streamLLMPure({                          │     ║
║  │       systemPrompt, messages, tools, ...                 │     ║
║  │     })                                                   │     ║
║  │     result = await consumeStreamGenerator(streamGen,     │     ║
║  │       (event) => append(event))                          │     ║
║  │     [stream-pure.ts]                                     │     ║
║  │     │  Yields: message.thinking, message.delta,          │     ║
║  │     │          tool.call, tool.preparing, chat.done      │     ║
║  │                                                          │     ║
║  │  9. Post-response handling (one branch per iteration)    │     ║
║  │     │                                                     │     ║
║  │     ├── PATTERN MATCH ───────────────────────────────────┤     ║
║  │     │   result.patternMatch !== undefined                 │     ║
║  │   │   ├── Emit pattern.retry event                      │     ║
║  │     │   ├── Emit correction message                      │     ║
║  │     │   └── continue (retry loop iteration)              │     ║
║  │     │                                                     │     ║
║  │     ├── ABORTED ─────────────────────────────────────────┤     ║
║  │     │   result.aborted === true                           │     ║
║  │     │   ├── Emit partial done events                     │     ║
║  │     │   └── throw 'Aborted'                              │     ║
║  │     │                                                     │     ║
║  │     ├── COMPACTION CHECK ────────────────────────────────┤     ║
║  │     │   (only if loopMode !== 'compaction')              │     ║
║  │     │   shouldCompact(currentTokens, maxTokens, threshold)│     ║
║  │     │   ├── YES ──► maybeAutoCompactContext()            │     ║
║  │     │   │   │       [see COMPACTION sub-diagram]         │     ║
║  │     │   │   │                                            │     ║
║  │     │   │   └── config.injectModeReminder?.()  ← FIX    │     ║
║  │     │   │       [reinjects agent reminder into new window]│    ║
║  │     │   │                                                │     ║
║  │     │   └── NO ──► continue to next check               │     ║
║  │     │                                                     │     ║
║  │     ├── TRUNCATION (finishReason === 'length') ──────────┤     ║
║  │     │   result.finishReason === 'length'                  │     ║
║  │     │   && result.toolCalls.length === 0                 │     ║
║  │     │   ├── If retries < MAX_TRUNCATION_RETRIES:         │     ║
║  │     │   │   ├── Increase maxTokens by 1.5x               │     ║
║  │     │   │   ├── Emit interim done + continue prompt      │     ║
║  │     │   │   └── continue                                 │     ║
║  │     │   └── Else: emit truncated, break                  │     ║
║  │     │                                                     │     ║
║  │     ├── TOOL CALLS ──────────────────────────────────────┤     ║
║  │     │   result.toolCalls.length > 0                      │     ║
║  │     │   │                                                 │     ║
║  │     │   ├── If loopMode === 'compaction':                 │     ║
║  │     │   │   ├── Reject: emit correction with             │     ║
║  │     │   │   │   "Tool calls not possible, produce summary"│     ║
║  │     │   │   └── continue                                 │     ║
║  │     │   │                                                 │     ║
║  │     │   └── Normal mode:                                 │     ║
║  │     │       ├── Emit message.done (with segments)        │     ║
║  │     │       ├── executeTools(assistantMsgId, toolCalls,  │     ║
║  │     │       │               batchContext, append)        │     ║
║  │     │       │   [execute-tools.ts]                       │     ║
║  │     │       │   For each tool call:                      │     ║
║  │     │       │   ├── Resolve tool from registry           │     ║
║  │     │       │   ├── Check permissions (path, danger)     │     ║
║  │     │       │   ├── Execute tool                         │     ║
║  │     │       │   └── ~~► tool.result                      │     ║
║  │     │       ├── Drain queue (asap messages)              │     ║
║  │     │       ├── retryLimiter.reset()                     │     ║
║  │     │       └── continue                                 │     ║
║  │     │                                                     │     ║
║  │     ├── COMPACTION MODE (loopMode === 'compaction') ─────┤     ║
║  │     │   (no tool calls, no truncation)                   │     ║
║  │     │   ├── Extract summary from content/thinking        │     ║
║  │     │   ├── closedWindowId = getCurrentContextWindowId() │     ║
║  │     │   ├── newWindowId = crypto.randomUUID()            │     ║
║  │     │   ├── ~~► context.compacted { closedWindowId,      │     ║
║  │     │   │         newWindowId, beforeTokens, summary }   │     ║
║  │     │   ├── ~~► message.start { content: summary,        │     ║
║  │     │   │         contextWindowId: newWindowId,          │     ║
║  │     │   │         isCompactionSummary: true }            │     ║
║  │     │   ├── ~~► message.done + chat.done                │     ║
║  │     │   └── break (exit compaction loop)                 │     ║
║  │     │                                                     │     ║
║  │     └── NORMAL COMPLETE ─────────────────────────────────┤     ║
║  │         (no patterns, no tools, no compaction,            │     ║
║  │          finishReason === 'stop')                         │     ║
║  │         ├── ~~► message.done + chat.done                 │     ║
║  │         ├── Update last user message with promptContext   │     ║
║  │         └── break (exit loop)                            │     ║
║  │                                                          │     ║
║  └──────────────────────────────────────────────────────────┘     ║
║                                                                  ║
║  Return { returnValueContent, returnValueResult }                ║
╚══════════════════════════════════════════════════════════════════╝
```

## Compaction — Two Paths

### Auto-Compaction (within agent loop)

When the LLM response pushes token count over threshold, the loop appends a
compaction prompt and sets a local `compacting` flag. The next iteration
handles summarization — same agent, same system prompt, same loop.

```
runTopLevelAgentLoop iteration N:
  LLM responds → threshold exceeded
  append compaction prompt to event store
  compacting = true
  continue

runTopLevelAgentLoop iteration N+1 (compacting=true):
  getConversationMessages() → includes compaction prompt
  assembleRequest with SAME agent → KV-cache preserved!
  LLM → summary (tool calls refused)
  emit context.compacted + summary in new window
  injectModeReminder() → agent reminder in new window
  compacting = false
  continue

runTopLevelAgentLoop iteration N+2 (compacting=false):
  getConversationMessages() → new window, HAS reminder
  LLM with agent definition ✓
  ...normal flow...
```

### Manual Compaction (via WebSocket)

When the user clicks "compact now" in the UI, the handler calls `compactContext()`
which makes a direct LLM call (no agent loop) to produce a summary:

```
compactContext()  [auto-compaction.ts]
  1. Append compaction prompt
  2. Get conversation messages (includes prompt)
  3. Call LLM directly with streamLLMPure (no tools)
  4. Extract summary
  5. Emit context.compacted + summary in new window
```

## Context Window Lifecycle

```
session.initialized
  contextWindowId: "win-1"
       │
       ▼
  ┌──────────────────────────────────────────────────┐
  │  Window "win-1" (open)                           │
  │  ├── [message.start] agent reminder (win-1)      │
  │  ├── [message.start] user message (win-1)        │
  │  ├── [message.start] assistant response (win-1)  │
  │  ├── [tool.call/result] (win-1)                  │
  │  └── ...                                         │
  └──────────────────────────────────────────────────┘
       │
       │  context.compacted fires:
       │  closedWindowId: "win-1", newWindowId: "win-2"
       ▼
  ┌──────────────────────────────────────────────────┐
  │  Window "win-1" (CLOSED)                         │
  │  (events preserved but filtered out by           │
  │   buildTopLevelContextMessages)                  │
  └──────────────────────────────────────────────────┘
       │
       ▼
  ┌──────────────────────────────────────────────────┐
  │  Window "win-2" (open)                           │
  │  ├── [message.start] compaction summary (win-2)  │
  │  ├── [message.start] agent reminder (win-2)      │ ← FIX: reinjected
  │  ├── [message.start] user message (win-2)        │
  │  └── ...                                         │
  └──────────────────────────────────────────────────┘
```

## Event Store: Key Event Types

```
session.initialized    { projectId, workdir, contextWindowId }
message.start          { messageId, role, content?, contextWindowId?,
                         messageKind?, isSystemGenerated?, metadata? }
message.delta          { messageId, content }
message.thinking       { messageId, content }
message.done           { messageId, stats?, segments?, partial? }
tool.call              { messageId, toolCall }
tool.result            { messageId, toolCallId, result }
context.compacted      { closedWindowId, newWindowId, beforeTokens,
                         afterTokens, summary, subAgentId? }
context.state          { currentTokens, maxTokens, compactionCount, ... }
turn.snapshot          { mode, messages, criteria, contextState,
                         currentContextWindowId, lastModeWithReminder, ... }
chat.done              { messageId, reason, stats? }
chat.error             { error, recoverable }
mode.changed           { mode, auto, reason? }
running.changed        { isRunning }
```

## Data Flow Summary

```
User Message
    │
    ▼
runChatTurn()
    │
    ├── injectModeReminderIfNeeded() ──► EventStore (reminder message)
    │
    ├── runTopLevelAgentLoop()
    │       │
    │       │  LOOP:
    │       │    │
    │       │    ├── getConversationMessages()
    │       │    │       │
    │       │    │       ├── eventStore.getEvents()
    │       │    │       ├── foldContextState() → currentWindowId
    │       │    │       └── buildContextMessagesFromEventHistory()
    │       │    │               └── filter by windowId
    │       │    │
    │       │    ├── assembleAgentRequest()
    │       │    │       └── buildTopLevelSystemPrompt() + messages + tools
    │       │    │
    │       │    ├── streamLLMPure() ──► LLM API
    │       │    │       │
    │       │    │       └── consumeStreamGenerator() → result
    │       │    │
    │       │    └── Post-response:
    │       │            ├── Pattern retry ──► continue
    │       │            ├── Compaction ──► maybeAutoCompactContext()
    │       │            │                      └── runTopLevelAgentLoop(loopMode='compaction')
    │       │            │                              └── emit context.compacted
    │       │            ├── Truncation ──► continue (bigger maxTokens)
    │       │            ├── Tool calls ──► executeTools() ──► continue
    │       │            └── Complete ──► break
    │       │
    │       └── return { returnValueContent, returnValueResult }
    │
    ├── buildSnapshot() ──► turn.snapshot event
    │
    └── cleanupOldEvents()
```

## Reminder Reinjection After Compaction

After auto-compaction creates a new window, the agent definition reminder must
be reinjected into it. This is handled by `injectModeReminder` callback:

```
Compaction completes → emit context.compacted + summary in new window
config.injectModeReminder?.()
  └── injectModeReminderIfNeeded()
      ├── lastModeWithReminder === agentId? YES
      ├── windowHasReminder()? NO (new window, no reminder yet)
      └── Inject reminder into new window
          ~~► message.start { contextWindowId: newWindowId, ... }
compacting = false
continue  → next iteration sees reminder in new window
```
