# Thoughts Sidebar Design

## Summary

Replace the current inline chain-of-thought expansion in `mcp-client` chat with a compact message-level trigger that opens a right-side thoughts panel.

The chat transcript should stay clean and answer-focused. Detailed inspection moves into the sidebar, where tool calls are shown as expandable rows with args and result content.

## Goals

- Keep assistant messages readable by removing large inline chain-of-thought blocks.
- Preserve a lightweight signal in chat that the assistant thought and used tools.
- Show tool execution details in a dedicated right-side panel tied to the selected assistant message.
- Let users expand each tool call to inspect arguments and results.
- Reuse the existing chain-of-thought summary building logic as much as possible.

## Non-Goals

- Do not show full raw reasoning text in the main chat transcript.
- Do not introduce a second reasoning summary inside the sidebar.
- Do not change the underlying message part parsing contract unless required for display.
- Do not redesign the overall chat shell beyond what is needed to support the right-side panel.

## User Experience

### In-chat summary

For assistant messages that contain chain-of-thought data:

- show a compact trigger row in the message body
- include a short label such as `Thought for 45s`
- optionally include a subtle tool-count hint if it improves scanability
- do not render the existing large inline reasoning/tool timeline

Clicking the summary row opens the thoughts sidebar for that specific message.

### Thoughts sidebar

The right side of the chat area should host a panel labeled `Thoughts`.

The panel should:

- open when the user clicks a message's thought summary
- close with an explicit close button
- show only tool calls for the selected message
- render tool calls in execution order
- allow each tool call row to expand and collapse independently

Each expanded tool call should show:

- tool name
- status
- arguments payload
- result payload

The first version should favor clarity over density. Raw JSON can be shown in preformatted blocks if needed, using existing code-style surfaces where available.

## Interaction Model

### Message selection

The sidebar is message-scoped, not global to the whole session. Selecting a different thought summary swaps the sidebar content to that message.

Recommended state shape:

```ts
type SelectedThoughtState = {
  messageId: string;
} | null;
```

This state should live in the chat container that already maps assistant messages so the selected message can drive the sidebar content.

### Open and close behavior

- Click summary row: open sidebar for that message
- Click another summary row while open: keep sidebar open and replace content
- Click close button: clear selected message and hide sidebar

### Streaming behavior

If the selected message is still streaming:

- keep the sidebar open
- allow tool rows to update as new parts arrive
- keep the chat summary row stable so layout does not jump

## Data Model and Rendering

Existing `buildChainOfThoughtSummary(...)` already produces:

- `reasoningText`
- `toolSteps`
- `hasChainOfThought`

This design should continue to use that derived structure.

The main rendering change is presentational:

- chat uses only a compact trigger when `hasChainOfThought` is true
- sidebar consumes `toolSteps`
- `reasoningText` is not rendered in either the main chat body or the sidebar body for this design

If a tool step lacks args or result, its expanded state should omit empty sections rather than showing blank containers.

## Component Design

Recommended additions:

- `ThoughtSummaryTrigger`
  - compact clickable row rendered inside an assistant message
- `ThoughtsSidebar`
  - right-side panel shell with header and close action
- `ThoughtToolCallItem`
  - expandable row for a single tool call
- `ThoughtToolCallDetails`
  - args/result body for expanded rows

Recommended update:

- `PlaygroundChat`
  - hold selected message state
  - render the sidebar alongside the chat column
  - replace the current inline chain-of-thought content usage with the summary trigger

The existing `ChainOfThought` component can either be adapted into the new summary trigger pattern or retired from this flow if it becomes more awkward than helpful.

## Layout

The chat screen should become a two-pane layout only when a thought message is selected:

- primary pane: existing chat content
- secondary pane: right thoughts panel

When closed, the chat should return to full width.

On smaller screens, the panel may need to behave like an overlay drawer instead of a permanently docked split pane, but desktop behavior is the primary target for this change.

## Accessibility

- The summary trigger must be keyboard reachable and clearly labeled.
- The sidebar close button must have an accessible name.
- Expand/collapse controls for tool rows must expose expanded state.
- Args/result sections should preserve readable formatting and wrapping for long content.

## Error Handling

- If a selected message has `hasChainOfThought` but no tool steps, the sidebar should show an empty state rather than failing.
- If tool args or result payloads are malformed or unserializable, render a safe fallback string.
- If the selected message disappears due to regeneration or edit flow, clear the sidebar selection.

## Testing Plan

Add tests first for the presentation behavior around the existing summary builder output:

1. messages with chain-of-thought render a compact summary trigger instead of inline details
2. clicking a summary trigger opens the sidebar for the corresponding message
3. the sidebar renders tool calls only and omits reasoning text
4. tool call rows expand to show args and result
5. rows omit empty args/result sections
6. switching between message summaries replaces sidebar content
7. closing the sidebar clears selection and restores full-width chat layout

## Risks and Mitigations

### Layout complexity in `PlaygroundChat`

Risk:

- the current message rendering path may mix layout and message content tightly

Mitigation:

- keep selection state at the top level
- isolate sidebar rendering into a dedicated component

### Overly noisy payload rendering

Risk:

- args and result payloads may dominate the sidebar visually

Mitigation:

- keep rows collapsed by default
- use compact headers and bounded code-style detail panels

### Streaming updates causing visual churn

Risk:

- the selected message may update frequently while streaming

Mitigation:

- keep the sidebar selection message-id based
- avoid remounting the sidebar shell when content updates

## Rollout

This can ship as a focused UI improvement inside `mcp-client` because it reuses existing chain-of-thought parsing and changes only how the information is presented.
