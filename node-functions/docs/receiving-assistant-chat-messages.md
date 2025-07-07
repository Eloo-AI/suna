# How Frontend Receives Assistant Chat Messages

## Overview

The Suna frontend uses **Server-Sent Events (SSE)** with **EventSource** for real-time streaming of assistant messages. This document details the complete flow from receiving messages to displaying them in the UI.

## 1. Real-Time Streaming Architecture

### Technology Stack
- **Server-Sent Events (SSE)** with `EventSource` API
- **React Query** for message caching and state management
- **Custom hooks** for stream management

### Key Components
- `useAgentStream` hook: Manages streaming connections
- `streamAgent` function: Sets up EventSource connections
- `ThreadContent` component: Renders messages and handles display logic

### Stream Setup
**File:** `frontend/src/lib/api.ts`
```typescript
export const streamAgent = (agentRunId: string, callbacks: {...}) => {
  const setupStream = async () => {
    const eventSource = new EventSource(`${API_URL}/thread/stream/${agentRunId}`);
    // Handle streaming events
  };
}
```

## 2. Message Filtering Pipeline

### Database-Level Filtering
**File:** `frontend/src/lib/api.ts` (lines 590-598)

Messages filtered out at query time:
- `cost` - Usage/billing tracking messages
- `summary` - Thread summary metadata

```typescript
.neq('type', 'cost')
.neq('type', 'summary')
```

### Stream-Level Filtering
**File:** `frontend/src/hooks/useAgentStream.ts` (lines 60-61)

Additional filtering during stream processing:
- `status` - Internal system status updates

```typescript
.filter((msg) => msg.type !== 'status')
```

### Message Types Displayed
- ✅ `user` - User messages with attachments
- ✅ `assistant` - AI responses (text + tool calls)
- ✅ `tool` - Tool execution results
- ✅ `browser_state` - Browser screenshots/state
- ❌ `cost` - Filtered out
- ❌ `summary` - Filtered out
- ❌ `status` - Filtered out

## 3. XML Tag Processing During Streaming

### Hidden XML Tags
**File:** `frontend/src/components/thread/content/ThreadContent.tsx` (lines 22-55)

During streaming, these XML tags are hidden and replaced with interactive tool buttons:

```typescript
const HIDE_STREAMING_XML_TAGS = new Set([
    // File operations
    'execute-command', 'create-file', 'delete-file', 'full-file-rewrite', 'str-replace',
    
    // Browser automation
    'browser-click-element', 'browser-close-tab', 'browser-drag-drop',
    'browser-get-dropdown-options', 'browser-go-back', 'browser-input-text',
    'browser-navigate-to', 'browser-scroll-down', 'browser-scroll-to-text',
    'browser-scroll-up', 'browser-select-dropdown-option', 'browser-send-keys',
    'browser-switch-tab', 'browser-wait',
    
    // Other tools
    'deploy', 'ask', 'complete', 'crawl-webpage', 'web-search',
    'see-image', 'call-mcp-tool',
    'execute_data_provider_call', 'execute_data_provider_endpoint',
]);
```

### Tag Detection Logic
**File:** `frontend/src/components/thread/content/ThreadContent.tsx` (lines 720-734)

```typescript
for (const tag of HIDE_STREAMING_XML_TAGS) {
    const openingTagPattern = `<${tag}`;
    const index = streamingTextContent.indexOf(openingTagPattern);
    if (index !== -1) {
        detectedTag = tag;
        tagStartIndex = index;
        break;
    }
}
```

## 4. Message Display Logic

### Message Grouping
**File:** `frontend/src/components/thread/content/ThreadContent.tsx` (lines 395-450)

Messages are grouped by sender:
- **User groups**: Single user message per group
- **Assistant groups**: Multiple related messages (assistant + tool + browser_state) grouped together

### Content Rendering
**File:** `frontend/src/components/thread/content/ThreadContent.tsx` (lines 71-259)

The `renderMarkdownContent` function processes assistant messages:

1. **Debug mode**: Shows raw content
2. **New XML format**: Handles `<function_calls>` blocks
3. **Legacy XML format**: Processes individual XML tags
4. **Markdown content**: Renders text as markdown
5. **Tool calls**: Converts XML to interactive buttons

### Tool Call Button Generation
**File:** `frontend/src/components/thread/content/ThreadContent.tsx` (lines 144-164)

XML tool calls become clickable buttons:

```typescript
<button
    onClick={() => handleToolClick(messageId, toolName)}
    className="inline-flex items-center gap-1.5 py-1 px-1 text-xs text-muted-foreground bg-muted hover:bg-muted/80 rounded-md transition-colors cursor-pointer"
>
    <IconComponent className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
    <span className="font-mono text-xs text-foreground">{getUserFriendlyToolName(toolName)}</span>
</button>
```

## 5. Streaming States and Indicators

### Streaming Indicators
During active streaming:
- **Typing cursor**: Animated cursor for text content
- **Tool indicators**: Animated "Using Tool..." badges for tool calls
- **Loading states**: Shimmer effects and spinners

### Stream Status Management
**File:** `frontend/src/hooks/useAgentStream.ts`

Stream states:
- `idle` - No active streaming
- `connecting` - Establishing connection
- `streaming` - Actively receiving data
- `completed` - Stream finished successfully
- `stopped` - Stream manually stopped
- `error` - Stream encountered error

## 6. Special Message Handling

### Ask Tool Messages
**File:** `frontend/src/components/thread/content/ThreadContent.tsx`

Special handling for user interaction prompts:
- Extracts text content and attachments
- Renders with file attachment UI
- Supports both old and new XML formats

### File Attachments
User messages support file attachments with:
- File preview capabilities
- Grid layout for multiple files
- Integration with sandbox file system

### Agent Information
Assistant messages include agent metadata:
- Agent name and avatar
- Custom agent styling
- Fallback to default "Suna" branding

## 7. Performance Optimizations

### React Query Integration
- Message caching and deduplication
- Automatic refetching on stream completion
- Background updates and stale-while-revalidate

### File Preloading
- Preload file attachments for better UX
- Cached file content for quick access
- Lazy loading for large files

### Stream Cleanup
- Proper EventSource cleanup on unmount
- Memory leak prevention
- Connection management

## 8. Error Handling

### Stream Errors
- Network disconnections
- Server errors
- Billing/quota errors (402 status)

### Message Processing Errors
- Malformed JSON handling
- XML parsing fallbacks
- Content validation

### User Feedback
- Toast notifications for errors
- Loading states during recovery
- Graceful degradation

## Key Files Reference

| File | Purpose |
|------|---------|
| `frontend/src/lib/api.ts` | Message fetching and stream setup |
| `frontend/src/hooks/useAgentStream.ts` | Stream management hook |
| `frontend/src/components/thread/content/ThreadContent.tsx` | Message display and rendering |
| `frontend/src/components/thread/content/PlaybackControls.tsx` | Playback mode for message replay |
| `frontend/src/components/thread/tool-views/xml-parser.ts` | XML tool call parsing |

## Summary

The frontend receives assistant messages through a sophisticated real-time streaming system that:

1. **Filters irrelevant messages** at multiple levels (database, stream, display)
2. **Hides implementation details** (XML tags) while preserving functionality
3. **Groups related messages** for better conversation flow
4. **Provides real-time feedback** during streaming with appropriate indicators
5. **Handles various content types** (text, tool calls, file attachments, browser states)
6. **Maintains performance** through caching and optimizations

This architecture ensures a smooth, responsive chat experience while handling complex AI interactions and tool usage. 