# ADR-007: Sub-task Detection and Tracking

## Status

Accepted

## Context

Claude's Task tool (agent spawning) allows AI assistants to create sub-agents for complex tasks. These sub-tasks appear as separate conversations, making it difficult to:

- Understand the relationship between parent and child tasks
- Track token usage across an entire task hierarchy
- Visualize complex multi-agent workflows
- Debug issues in nested task execution

We needed a way to automatically detect and link these sub-tasks to provide better visibility into agent-based workflows.

## Decision Drivers

- **Automatic Detection**: No changes to client code required
- **Accurate Linking**: Reliably connect sub-tasks to parents
- **Performance**: Minimal overhead on request processing
- **Visualization**: Enable dashboard to show task hierarchies
- **Flexibility**: Support various agent patterns

## Considered Options

1. **Client-Side Annotation**
   - Description: Clients explicitly mark sub-tasks
   - Pros: 100% accurate, explicit relationships
   - Cons: Requires client changes, breaks existing code

2. **Response Analysis**
   - Description: Parse responses for Task tool invocations
   - Pros: Works with existing clients, automatic
   - Cons: Parsing overhead, potential false positives

3. **Message Content Matching**
   - Description: Match task prompts to new conversations
   - Pros: No client changes, works retroactively
   - Cons: Timing windows, potential mismatches

4. **Correlation Headers**
   - Description: Use custom headers for task relationships
   - Pros: Explicit, no parsing needed
   - Cons: Requires client support

## Decision

We implemented **single-phase subtask detection** entirely within the ConversationLinker component:

- SQL-based retrieval of Task tool invocations from the database
- Complete subtask detection during conversation linking
- Subtasks inherit parent conversation ID with unique branch naming (e.g., `subtask_1`, `subtask_2`)

### Evolution Summary

The system evolved from a two-phase approach (where subtasks got separate conversation IDs) to the current single-phase architecture. This change was driven by the need for:

- Unified conversation trees in the dashboard
- Simpler implementation with single responsibility
- Better persistence across proxy restarts

### Implementation Architecture

The current single-phase implementation leverages:

1. **SubtaskQueryExecutor Pattern** (see [ADR-014](./adr-014-subtask-query-executor-pattern.md)):
   - Dependency injection of database query capability into ConversationLinker
   - Optimized SQL queries using PostgreSQL's `@>` containment operator
   - 24-hour lookback window with 30-second matching precision

2. **Conversation Inheritance**:
   - Subtasks inherit parent's `conversation_id`
   - Sequential branch naming: `subtask_1`, `subtask_2`, etc.
   - Parent-child relationships tracked via `parent_task_request_id`

3. **Database Schema**:

   ```sql
   -- Core subtask tracking columns
   ALTER TABLE api_requests ADD COLUMN is_subtask BOOLEAN DEFAULT FALSE;
   ALTER TABLE api_requests ADD COLUMN parent_task_request_id UUID;
   ALTER TABLE api_requests ADD COLUMN task_tool_invocation JSONB;

   -- Optimized indexes for subtask queries
   CREATE INDEX idx_subtask_parent ON api_requests(parent_task_request_id);
   CREATE INDEX idx_task_invocations ON api_requests USING gin(response_body);
   ```

For implementation details, refer to:

- [`packages/shared/src/utils/conversation-linker.ts`](../../../packages/shared/src/utils/conversation-linker.ts)
- [`services/proxy/src/storage/storage-adapter.ts`](../../../services/proxy/src/storage/storage-adapter.ts)

## Consequences

### Positive

- **Zero Client Changes**: Works with all existing Claude clients
- **Complete Visibility**: Full task hierarchy tracking
- **Accurate Token Attribution**: Aggregate usage across task trees
- **Rich Visualizations**: Dashboard shows task relationships
- **Debugging Support**: Trace execution through sub-tasks
- **Clean Architecture**: Separation of concerns between components

### Negative

- **Processing Overhead**: Must parse responses for Task tool invocations
- **Timing Sensitivity**: 30-second window may miss slow tasks
- **Storage Increase**: Additional JSONB data per request
- **Potential Mismatches**: Similar prompts could link incorrectly

### Risks and Mitigations

- **Risk**: False positive task linking
  - **Mitigation**: Exact prompt matching required
  - **Mitigation**: Time window limits false matches

- **Risk**: Missed sub-tasks due to timing
  - **Mitigation**: Configurable time window
  - **Mitigation**: Manual linking API for corrections

- **Risk**: Performance impact from JSON parsing
  - **Mitigation**: Parse only tool_use blocks
  - **Mitigation**: GIN index for efficient queries

## Implementation Notes

- Re-implemented in November 2024 after initial removal
- Evolved to single-phase architecture in January 2025
- 30-second matching window within 24-hour lookback period
- Dashboard shows sub-tasks as gray boxes with tooltips
- Supports multiple sub-tasks per parent request
- Subtasks inherit parent conversation_id with unique branch naming

## Dashboard Visualization

1. **Tree View**:
   - Parent tasks show sub-task count
   - Sub-tasks appear as connected nodes
   - Tooltips show task descriptions

2. **Metrics**:
   - Total sub-tasks in conversation
   - Aggregate token usage
   - Task completion status

3. **Navigation**:
   - Click sub-task to view conversation
   - Hover for task prompt preview

## Migration from Two-Phase to Single-Phase

The architecture evolved in January 2025 to address limitations of the original two-phase approach:

### Key Changes

1. **Conversation ID Inheritance**: Subtasks now inherit parent conversation IDs instead of getting separate ones
2. **Single-Phase Detection**: All logic consolidated in ConversationLinker
3. **SQL-Based Retrieval**: Direct database queries replace in-memory caching

See [ADR-015](./adr-015-subtask-conversation-migration.md) for details on migrating historical data.

### Lessons Learned

- Two-phase separation created unnecessary complexity
- Separate conversation IDs fragmented the user experience
- SQL-based approach provides better persistence and reliability

## Future Enhancements

1. **Configurable Time Window**: Per-domain task matching windows
2. **Task Status Tracking**: Monitor running/completed/failed states
3. **Recursive Task Trees**: Support sub-tasks spawning sub-tasks
4. **Task Templates**: Recognize common task patterns
5. **Performance Metrics**: Task execution time analysis

## Links

- [PR #13: Conversation and sub-task tracking](https://github.com/your-org/claude-nexus-proxy/pull/13)
- [Dashboard Guide](../../02-User-Guide/dashboard-guide.md#sub-task-visualization)
- [API Reference](../../02-User-Guide/api-reference.md#subtasks)

## Revision History

- 2024-06-25: Initial implementation with two-phase architecture
- 2024-11: Re-implemented after initial removal
- 2025-01-07: Evolved to single-phase architecture
- 2025-01-21: Refactored ADR to focus on current architecture

---

Date: 2024-06-25 (Initial)
Updated: 2025-01-21
Authors: Development Team
