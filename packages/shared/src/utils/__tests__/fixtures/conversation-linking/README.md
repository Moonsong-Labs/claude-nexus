# Conversation Linking Test Fixtures

This directory contains JSON files that represent parent-child request pairs for testing the conversation linking logic in `ConversationLinker`.

## Overview

These fixtures test the core functionality of conversation tracking, message linking, and branch detection in the Claude Nexus Proxy. Each fixture simulates real conversation scenarios to ensure robust conversation management.

## Available Fixtures

### 01-simple-start.json

**Description:** Simple conversation start and continuation - user says 'hi' then 'ho'  
**Type:** standard  
**Structure:**

```
User: hi → Assistant: Hello! → User: ho
```

**Tests:** Basic message linking in a linear conversation

### 02-branching.json

**Description:** Tests creating a new branch when returning to an earlier message  
**Type:** branch  
**Structure:**

```
A → B → C
  ↘
    D (branch)
```

**Tests:** Branch detection when conversation diverges from an earlier point

### 03-re-branching.json

**Description:** Tests handling of multiple branches from the same parent  
**Type:** branch  
**Tests:** Multiple branch creation and management

### 04-compact.json

**Description:** Tests compact conversation continuation after context overflow  
**Type:** compact  
**Structure:**

```
Original conversation → Compact summary → Continued conversation
```

**Tests:** Linking conversations through context compaction

### 05-compact-follow-up.json

**Description:** Tests follow-up messages in a compact conversation  
**Type:** compact  
**Tests:** Maintaining conversation continuity after compaction

### 06-compact-weird.json

**Description:** Tests edge cases in compact conversation handling  
**Type:** compact  
**Tests:** Unusual compact conversation scenarios

### 07-duplicated-tools.json

**Description:** Tests handling of duplicated tool invocations  
**Type:** standard  
**Tests:** Deduplication of tool_use and tool_result messages

### 08-tool-response-linking.json

**Description:** Tests conversation linking with tool usage  
**Type:** standard  
**Tests:** Proper linking when conversations include tool interactions

### 09-general-linking.json

**Description:** Tests general conversation linking scenarios  
**Type:** standard  
**Tests:** Various standard conversation patterns

### 11-proxy-linking.json

**Description:** Tests proxy-specific conversation linking  
**Type:** standard  
**Tests:** Proxy-related conversation scenarios

## File Format

Each JSON fixture follows this structure:

```json
{
  "description": "Brief description of the test case",
  "type": "standard|compact|branch|summarization",
  "expectedLink": true|false,
  "expectedParentHash": "hash-value",
  "expectedBranchPattern": "regex-pattern",  // Optional - for branch tests
  "expectedSummaryContent": "content to match",  // Optional - for compact tests
  "parent": {
    "request_id": "uuid",
    "domain": "domain.com",
    "conversation_id": "uuid",
    "branch_id": "main|branch_*",
    "current_message_hash": "hash",
    "parent_message_hash": "hash|null",
    "system_hash": "hash|null",
    "body": {
      "messages": [
        {
          "role": "user|assistant",
          "content": "string|array"
        }
      ],
      "system": "system prompt"
    },
    "response_body": {
      "content": [...]  // Optional - for compact detection
    }
  },
  "child": {
    "request_id": "uuid",
    "domain": "domain.com",
    "body": {
      "messages": [...],
      "system": "system prompt"
    }
  },
  "existingChild": {
    // Optional - for branch detection tests
    "conversation_id": "uuid",
    "branch_id": "branch_*"
  }
}
```

## Test Types

### standard

Regular conversation continuation where messages link sequentially.

**Example scenario:**

- User sends initial message
- Assistant responds
- User sends follow-up
- Messages link parent → child

### compact

Handles context overflow scenarios where conversations are compacted and continued.

**Example scenario:**

- Long conversation exceeds context limit
- System creates compact summary
- Conversation continues with summary context
- New messages link to original conversation

### branch

Creates new branches when returning to earlier conversation points.

**Example scenario:**

- User has conversation A → B → C
- User returns to point B
- New message D creates branch: A → B → D
- Original path A → B → C remains intact

### summarization

Special handling for conversation summarization requests that ignore system hash differences.

**Example scenario:**

- System requests conversation summary
- System prompt changes for summarization
- Links are maintained despite system hash mismatch

## Usage in Tests

These fixtures are loaded and tested in `conversation-linker.test.ts`:

```typescript
describe('ConversationLinker - JSON File Tests', () => {
  const fixturesDir = join(__dirname, 'fixtures', 'conversation-linking')

  test('should correctly link conversations from JSON fixtures', async () => {
    const files = await fs.readdir(fixturesDir)
    const jsonFiles = files.filter(f => f.endsWith('.json'))

    for (const file of jsonFiles) {
      const fixture = await loadFixture(file)
      const result = await linker.linkConversation(fixture.child)
      // Assertions based on fixture expectations
    }
  })
})
```

## How to Contribute

### Adding a New Test Fixture

1. **Choose the next available number** (e.g., if `11-proxy-linking.json` exists, use `12-your-test.json`)

2. **Create the JSON file** following the schema above

3. **Required fields:**
   - `description`: Clear explanation of what's being tested
   - `type`: One of `standard`, `compact`, `branch`, or `summarization`
   - `expectedLink`: Boolean indicating if linking should succeed
   - `parent`: Complete parent request data
   - `child`: Child request to be linked

4. **Generate realistic data:**
   - Use actual UUIDs for IDs
   - Calculate real message hashes using SHA-256
   - Include complete message arrays
   - Match response_body content to actual Claude responses

5. **Update this README:**
   - Add your fixture to the "Available Fixtures" section
   - Include structure diagram if helpful
   - Document what specific behavior it tests

6. **Validate your JSON:**

   ```bash
   # Ensure valid JSON syntax
   jq . your-fixture.json > /dev/null
   ```

7. **Run the tests:**
   ```bash
   bun test conversation-linker.test.ts
   ```

### Best Practices

- Keep fixtures focused on testing one specific behavior
- Use descriptive file names that indicate the test purpose
- Include edge cases and failure scenarios
- Document any special setup or assumptions
- Ensure message hashes are correctly calculated

## Maintenance

To validate all fixture files:

```bash
# Check JSON syntax for all fixtures
find . -name "*.json" -exec jq empty {} \; -print
```

To regenerate message hashes for testing:

```bash
# Use the ConversationLinker's hash generation logic
bun run scripts/generate-message-hash.ts "your message content"
```
