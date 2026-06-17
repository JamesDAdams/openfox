# Auto-Retry Pattern Matching

## Goal

Replace the hardcoded "Disable XML Tool Call Protection" toggle with a user-configurable auto-retry pattern matching system. Users define patterns that, when matched against LLM responses (including mid-stream), trigger automated retries.

## User Experience

In the settings UI, instead of a single toggle, show a table with four columns:

| Active | Field      | Pattern                       | Action |
| ------ | ---------- | ----------------------------- | ------ |
| ☑      | `thinking` | `<!DSML!>`                    | retry  |
| ☑      | `content`  | `I cannot complete this task` | retry  |

- **Active**: checkbox — toggle a pattern on/off without deleting it
- **Field**: dropdown — `thinking`, `content`, or `both`
- **Pattern**: regex string the user types in
- **Action**: currently only `retry` (extensible for future: `stop`, `warn`, etc.)

When a pattern matches, the system auto-injects a "continue" message and re-runs the LLM. The user sees these retries in the chat feed as system-generated messages, clearly labeled with the pattern that matched. The content that triggered the match is preserved and visible in the feed — nothing is silently discarded.

The old "Disable XML Tool Call Protection" toggle is removed entirely. The XML format error detection becomes a built-in default pattern that users can see and optionally deactivate in the table.

## Technical Design

### Config Shape

```ts
// Persisted in the database (not a config file)
agent: {
  retryPatterns: Array<{
    field: 'thinking' | 'content' | 'both'
    pattern: string // regex string
    action: 'retry'
    active: boolean // toggle on/off without losing the pattern
  }>
}
```

### Built-in Defaults

If no patterns are configured, these built-in defaults apply:

- `{ field: 'both', pattern: 'XML tool format', action: 'retry', active: true }` (replaces old xmlFormatError detection)
- `{ field: 'content', pattern: '<functioncall>', action: 'retry', active: true }` (common XML-style tool calls)

### Implementation Sketch

1. **Settings UI**: Table editor component (similar to criteria editor) in the settings panel. Add/remove rows, inline regex validation with visual feedback (green check / red X), and an "active" checkbox per row.

2. **Backend**: `retryPatterns` array stored in the database alongside other settings. Loaded at session start, patterns are compiled and tested on-the-fly in the agent loop — no pre-compilation step needed.

3. **Agent loop — streaming check (early detection)**: After each chunk received from the LLM stream, run active patterns against the accumulated `thinking` and/or `content` so far. On match:
   - Abort the current stream
   - Preserve the accumulated content (do not discard it)
   - Emit a dedicated system message in the chat feed: `"<pattern>" matched your /<pattern>/ auto-retry`
   - Append "continue" message, loop back to re-run the LLM
   - Track retry count per pattern, cap at configurable max (default 5)

   Checking mid-stream catches problems early (e.g., a model generating a malformed XML tool call from the first few tokens) instead of waiting for the full response, saving tokens and time.

4. **EventStore**: New event type `pattern.retry` with `{ pattern: string, field: string, attempt: number, matchedContent: string }`

5. **Cleanup**: Remove `llm.disableXmlProtection` entirely — every reference in code, UI, and system messages. Users configure patterns themselves; they can deactivate the built-in XML pattern via the "active" checkbox if needed.

### Edge Cases

- **Infinite loops**: Max retries per turn (configurable, default 10 total across all patterns)
- **Overlapping patterns**: Multiple patterns can match in one response — all matching patterns' retries are counted against the total limit
- **False positives on partial matches**: A regex like `I cannot` could match mid-word before the model finishes the sentence. Since the action is `retry`, a false positive burns one retry and the model tries again — acceptable.
- **Pattern compilation**: Invalid regex patterns are caught at config load time with a clear error message
- **Performance**: Pattern matching is O(n \* m) where n = patterns, m = response length. For typical usage (< 20 patterns, < 100K chars), this is negligible.
