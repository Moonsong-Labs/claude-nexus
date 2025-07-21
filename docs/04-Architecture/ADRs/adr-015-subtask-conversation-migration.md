# ADR-015: Subtask Conversation ID Migration

## Status

Implemented

## Context

With the architectural evolution described in ADR-007, we moved from a two-phase subtask detection system to a single-phase system entirely within ConversationLinker. This change included a significant improvement: subtasks now inherit their parent task's conversation_id rather than having separate conversation IDs.

This creates a data consistency challenge:

- Existing subtasks in the database have separate conversation IDs
- New subtasks will inherit parent conversation IDs
- Dashboard visualization expects consistent conversation structures
- Historical data needs to be migrated for consistency

## Decision Drivers

- **Data Consistency**: All subtasks should follow the same conversation ID pattern
- **Dashboard Experience**: Users should see unified conversation trees
- **Backward Compatibility**: Migration should not break existing functionality
- **Performance**: Migration should handle large datasets efficiently
- **Reversibility**: Should be able to rollback if issues arise

## Considered Options

1. **Leave Historical Data As-Is**
   - Description: Only apply new rules to new subtasks
   - Pros: No migration risk, simpler
   - Cons: Inconsistent dashboard experience, complex code to handle both patterns

2. **Migrate All at Once**
   - Description: Single migration to update all subtasks
   - Pros: Consistent data, clean implementation
   - Cons: Potentially long-running migration, risk of data issues

3. **Gradual Migration**
   - Description: Migrate in batches over time
   - Pros: Lower risk, can monitor impacts
   - Cons: Complex implementation, temporary inconsistency

4. **On-Read Migration**
   - Description: Migrate data as it's accessed
   - Pros: No bulk migration needed
   - Cons: Performance impact on reads, never fully migrated

## Decision

We will implement **Option 2: Migrate All at Once** using a dedicated migration script (008-subtask-updates-and-task-indexes.ts).

### Implementation Details

1. **Migration Strategy**:

   ```sql
   -- Update subtasks to inherit parent conversation IDs
   WITH parent_conversations AS (
     SELECT
       child.request_id AS subtask_id,
       parent.conversation_id AS parent_conversation_id
     FROM api_requests child
     INNER JOIN api_requests parent ON
       child.parent_task_request_id = parent.request_id
     WHERE child.is_subtask = true
       AND parent.conversation_id IS NOT NULL
   )
   UPDATE api_requests
   SET conversation_id = parent_conversations.parent_conversation_id
   ```

2. **Branch ID Normalization**:

   ```sql
   -- Ensure consistent subtask_N branch naming
   WITH subtask_numbering AS (
     SELECT
       request_id,
       ROW_NUMBER() OVER (
         PARTITION BY parent_task_request_id
         ORDER BY timestamp
       ) as subtask_number
     FROM api_requests
     WHERE is_subtask = true
   )
   UPDATE api_requests
   SET branch_id = 'subtask_' || subtask_number
   ```

3. **Safety Measures**:
   - Run in a transaction for atomicity
   - Check for orphaned subtasks before migration
   - Report statistics before and after
   - Provide rollback capability

## Consequences

### Positive

- **Unified Conversations**: All related messages in one tree
- **Cleaner Dashboard**: Better visualization of task hierarchies
- **Simplified Code**: One pattern to handle, not two
- **Performance**: Fewer conversation queries needed
- **Better Analytics**: Easier to aggregate metrics per conversation

### Negative

- **Migration Risk**: Potential for data issues during migration
- **Downtime**: May need to pause writes during migration
- **Storage**: Larger conversation trees in memory
- **Rollback Complexity**: Harder to separate after merging

### Risks and Mitigations

- **Risk**: Migration fails mid-way
  - **Mitigation**: Use database transaction for atomicity
  - **Mitigation**: Test on staging environment first

- **Risk**: Performance impact on large datasets
  - **Mitigation**: Run during low-traffic period
  - **Mitigation**: Add progress logging

- **Risk**: Breaking existing subtask queries
  - **Mitigation**: Update all queries to handle new structure
  - **Mitigation**: Test dashboard thoroughly post-migration

## Implementation Notes

- Migration runs as part of the standard migration sequence
- Idempotent design allows safe re-runs
- Includes orphaned subtask detection and reporting
- Preserves all existing relationships via parent_task_request_id
- Compatible with rebuild-conversations.ts script

## Rollback Strategy

The migration includes a rollback function that:

1. Resets subtask conversation_ids to NULL
2. Resets branch_ids to 'main'
3. Preserves parent_task_request_id for relationship tracking

Note: Rollback is simplified and doesn't restore original conversation IDs.

## Verification

Post-migration verification:

```sql
-- Check subtasks have matching parent conversation IDs
SELECT COUNT(*) as matching_conversations
FROM api_requests child
JOIN api_requests parent ON child.parent_task_request_id = parent.request_id
WHERE child.is_subtask = true
  AND child.conversation_id = parent.conversation_id;

-- Check branch naming consistency
SELECT COUNT(*) as proper_branches
FROM api_requests
WHERE is_subtask = true
  AND branch_id LIKE 'subtask_%';
```

## Links

- [ADR-007: Sub-task Detection and Tracking](adr-007-subtask-tracking.md)
- [ADR-012: Database Schema Evolution Strategy](adr-012-database-schema-evolution.md)
- [Migration Script](../../../scripts/db/migrations/008-subtask-updates-and-task-indexes.ts)

---

Date: 2025-01-07
Implemented: 2025-01-07
Authors: Development Team
