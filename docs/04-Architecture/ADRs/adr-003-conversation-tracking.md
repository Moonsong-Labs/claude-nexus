# ADR-003: Conversation Tracking with Message Hashing

## Status

Accepted

## Context

Claude API conversations consist of a series of messages between users and the assistant. To provide meaningful analytics and visualization in our dashboard, we need to track which messages belong to the same conversation and detect when conversations branch (similar to git branches). The challenge is that the Claude API doesn't provide conversation IDs, and requests can be resumed from any point in the message history.

## Decision Drivers

- **Automatic Tracking**: No client-side changes required
- **Branch Detection**: Support conversation branching like git
- **Performance**: Minimal overhead on request processing
- **Reliability**: Consistent tracking despite message format variations
- **Compatibility**: Work with all Claude API features

## Considered Options

1. **Client-Provided IDs**
   - Description: Require clients to send conversation IDs
   - Pros: Simple implementation, explicit tracking
   - Cons: Requires client changes, breaks API compatibility

2. **Session-Based Tracking**
   - Description: Use session cookies or tokens
   - Pros: Works with existing HTTP mechanisms
   - Cons: Doesn't work with API clients, loses context on session end

3. **Message Content Hashing**
   - Description: Generate hashes of messages to create parent-child relationships
   - Pros: Automatic, supports branching, no client changes
   - Cons: Requires message normalization, hash computation overhead

## Decision

We will use **message content hashing** to automatically track conversations and detect branches.

### Implementation Details

1. **Message Normalization**:

```typescript
import type { ContentBlock } from '../types/claude'

function normalizeContent(content: string | ContentBlock[]): string {
  if (typeof content === 'string') {
    return content
  }
  return content
    .filter(block => !block.text?.startsWith('<system-reminder>'))
    .map(block => block.text || '')
    .join('\n')
}
```

2. **Hash Generation**:

```typescript
import { createHash } from 'crypto'
import type { ClaudeMessage } from '../types/claude'

function generateMessageHash(message: ClaudeMessage): string {
  const normalized = normalizeContent(message.content)
  return createHash('sha256').update(`${message.role}:${normalized}`).digest('hex')
}
```

3. **Conversation Linking**:

```typescript
interface LinkingResult {
  conversationId: string | null
  parentRequestId: string | null
  branchId: string
  currentMessageHash: string
  parentMessageHash: string | null
  systemHash: string | null
}

// For each request:
const messages = request.messages
const currentHash = generateMessageHash(messages[messages.length - 1])
const parentHash = messages.length > 1 ? generateMessageHash(messages[messages.length - 2]) : null

// Find or create conversation
const conversation =
  (await findConversationByParentHash(parentHash)) || (await createNewConversation())

// Detect branching
if (parentHash && conversationHasMultipleChildren(parentHash)) {
  // This is a branch point
  markAsBranch(parentHash)
}
```

4. **Database Schema** ([Migration 001](../../../scripts/db/migrations/001-add-conversation-tracking.ts)):

```sql
ALTER TABLE api_requests
ADD COLUMN IF NOT EXISTS current_message_hash CHAR(64),
ADD COLUMN IF NOT EXISTS parent_message_hash CHAR(64),
ADD COLUMN IF NOT EXISTS conversation_id UUID,
ADD COLUMN IF NOT EXISTS branch_id VARCHAR(255) DEFAULT 'main',
ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_message_hashes
ON api_requests(parent_message_hash, current_message_hash);
```

## Consequences

### Positive

- **Zero Client Changes**: Works with existing Claude API clients
- **Automatic Branch Detection**: Identifies when conversations diverge
- **Consistent Tracking**: Handles both string and array message formats
- **System Message Filtering**: Ignores system reminders for consistent hashing
- **Visual Representation**: Enables tree-like conversation visualization

### Negative

- **Hash Computation**: Small performance overhead per request
- **Storage Requirements**: Additional 128+ bytes per request
- **Normalization Complexity**: Must handle all content format variations

### Risks and Mitigations

- **Risk**: Hash collisions could link unrelated conversations
  - **Mitigation**: Use SHA-256 for extremely low collision probability

- **Risk**: Message format changes could break hashing
  - **Mitigation**: Comprehensive normalization and format detection

- **Risk**: Performance impact on high-volume systems
  - **Mitigation**: Hash computation is fast, can be made async if needed

## Implementation References

- [Message Hashing Implementation](../../../packages/shared/src/utils/conversation-hash.ts)
- [Conversation Linking Service](../../../packages/shared/src/utils/conversation-linker.ts)
- [Database Migration](../../../scripts/db/migrations/001-add-conversation-tracking.ts)
- [Database Schema Documentation](../../03-Operations/database.md)

## Evolution and Enhancements

### Dual Hash System

The implementation evolved to handle system prompt changes gracefully. The original design included system prompts in conversation hashes, which broke conversation linking when system prompts changed between sessions (e.g., git status updates in Claude Code, context compaction).

**Current Implementation:**

1. **Separate Message Hash**: `hashMessagesOnly()` - Hashes only the message content for conversation linking
2. **Separate System Hash**: `hashSystemPrompt()` - Hashes only the system prompt for tracking context changes
3. **Dual Hash Return**: `extractMessageHashes()` returns three values:
   - `currentMessageHash` - Message-only hash for linking
   - `parentMessageHash` - Parent message hash for branching
   - `systemHash` - System prompt hash for context tracking

This separation allows conversations to maintain links even when system prompts change, while still tracking context changes independently. The implementation is backward compatible with existing data through [Migration 006](../../../scripts/db/migrations/006-split-conversation-hashes.ts).

### Temporal Awareness

To support accurate historical rebuilds and prevent future data from affecting past conversation linking, timestamps are mandatory for key query methods:

1. **`getMaxSubtaskSequence(conversationId, beforeTimestamp)`**: Only considers subtasks that existed before the specified time
2. **`findConversationByParentHash(parentHash, beforeTimestamp)`**: Only considers conversations that existed before the specified time
3. **Cache keys include timestamps**: `${conversationId}_${timestamp.toISOString()}` to prevent cross-temporal cache pollution

This ensures that historical rebuilds accurately reflect the state at any given point in time, which is critical for systems that need to analyze or reconstruct past conversation states.

## Notes

This approach has proven effective in production, enabling powerful conversation analytics without requiring any changes to client applications. The branch detection feature has been particularly valuable for understanding how users explore different conversation paths.

### Future Considerations

- Conversation merging detection
- Semantic similarity for fuzzy matching
- Conversation templates and patterns
- System prompt change visualization in dashboard

---

**Date**: 2024-02-01  
**Last Updated**: 2025-01-19  
**Authors**: Development Team
