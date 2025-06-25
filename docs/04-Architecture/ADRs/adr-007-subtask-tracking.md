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

We will implement **response analysis with message matching** to automatically detect and link sub-tasks.

### Implementation Details

1. **Task Detection**:
   ```typescript
   // Scan response for Task tool invocations
   function extractTaskInvocations(response: any): TaskInvocation[] {
     const invocations = [];
     
     // Check content blocks for tool_use
     if (response.content) {
       for (const block of response.content) {
         if (block.type === 'tool_use' && block.name === 'Task') {
           invocations.push({
             tool_use_id: block.id,
             prompt: block.input.prompt,
             description: block.input.description
           });
         }
       }
     }
     
     return invocations;
   }
   ```

2. **Database Schema**:
   ```sql
   ALTER TABLE api_requests ADD COLUMN is_subtask BOOLEAN DEFAULT FALSE;
   ALTER TABLE api_requests ADD COLUMN parent_task_request_id UUID;
   ALTER TABLE api_requests ADD COLUMN task_tool_invocation JSONB;
   
   CREATE INDEX idx_subtask_parent ON api_requests(parent_task_request_id);
   CREATE INDEX idx_task_invocations ON api_requests USING gin(task_tool_invocation);
   ```

3. **Linking Algorithm**:
   ```typescript
   // 30-second window for matching
   const TASK_MATCH_WINDOW = 30000;
   
   async function linkSubtask(userMessage: string, timestamp: Date) {
     // Find recent Task invocations
     const recentTasks = await findTaskInvocations({
       since: new Date(timestamp - TASK_MATCH_WINDOW),
       matchingPrompt: userMessage
     });
     
     if (recentTasks.length > 0) {
       // Link to most recent matching task
       return {
         is_subtask: true,
         parent_task_request_id: recentTasks[0].request_id
       };
     }
   }
   ```

4. **Visualization Data**:
   ```typescript
   // Enhance conversation data with sub-task info
   interface ConversationNode {
     id: string;
     messages: Message[];
     subtasks: SubTask[];
   }
   
   interface SubTask {
     request_id: string;
     task_number: number;
     description: string;
     message_count: number;
     status: 'running' | 'completed';
   }
   ```

## Consequences

### Positive

- **Zero Client Changes**: Works with all existing Claude clients
- **Complete Visibility**: Full task hierarchy tracking
- **Accurate Token Attribution**: Aggregate usage across task trees
- **Rich Visualizations**: Dashboard shows task relationships
- **Debugging Support**: Trace execution through sub-tasks

### Negative

- **Processing Overhead**: Must parse all responses
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

- Part of PR #13 (conversation tracking enhancement)
- 30-second window chosen based on typical Task execution time
- Dashboard shows sub-tasks as gray boxes with tooltips
- Supports multiple sub-tasks per parent request

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

---

Date: 2024-06-25
Authors: Development Team