import { describe, it, expect } from 'bun:test'

describe('Notification Message Formatting', () => {
  it('should format tool messages with proper indentation', () => {
    // Simulate the formatting logic from NotificationService
    const formatToolMessage = (toolName: string, description: string) => {
      return `    :wrench: ${toolName}${description ? ` - ${description}` : ''}`
    }

    // Test various tool formats
    const testCases = [
      {
        tool: { name: 'Read', input: { file_path: '/home/user/project/src/index.ts' } },
        expected: '    :wrench: Read - Reading file: src/index.ts',
      },
      {
        tool: {
          name: 'TodoWrite',
          input: {
            todos: [
              { status: 'pending' },
              { status: 'pending' },
              { status: 'in_progress' },
              { status: 'completed' },
            ],
          },
        },
        expected: '    :wrench: TodoWrite - Tasks: 2 pending, 1 in progress, 1 completed',
      },
      {
        tool: { name: 'Bash', input: { command: 'npm test' } },
        expected: '    :wrench: Bash - Running: npm test',
      },
    ]

    testCases.forEach(({ tool, expected }) => {
      let description = ''

      // Replicate the logic from NotificationService
      switch (tool.name) {
        case 'Read':
          if (tool.input.file_path) {
            const pathParts = tool.input.file_path.split('/')
            const fileName = pathParts.slice(-2).join('/')
            description = `Reading file: ${fileName}`
          }
          break
        case 'TodoWrite':
          if (tool.input.todos) {
            const todos = tool.input.todos
            const pending = todos.filter((t: any) => t.status === 'pending').length
            const inProgress = todos.filter((t: any) => t.status === 'in_progress').length
            const completed = todos.filter((t: any) => t.status === 'completed').length

            const statusParts = []
            if (pending > 0) {statusParts.push(`${pending} pending`)}
            if (inProgress > 0) {statusParts.push(`${inProgress} in progress`)}
            if (completed > 0) {statusParts.push(`${completed} completed`)}

            if (statusParts.length > 0) {
              description = `Tasks: ${statusParts.join(', ')}`
            }
          }
          break
        case 'Bash':
          if (tool.input.command) {
            const command =
              tool.input.command.length > 50
                ? tool.input.command.substring(0, 50) + '...'
                : tool.input.command
            description = `Running: ${command}`
          }
          break
      }

      const formatted = formatToolMessage(tool.name, description)
      expect(formatted).toBe(expected)

      // Verify indentation
      expect(formatted.startsWith('    :wrench:')).toBe(true)
    })
  })

  it('should build complete conversation message with indented tools', () => {
    const userContent = 'Please help me fix the bug'
    const claudeContent = "I'll help you fix that bug. Let me examine the code."
    const tools = [
      { name: 'Read', description: 'Reading file: src/main.ts' },
      { name: 'Edit', description: 'Editing file: src/main.ts' },
      { name: 'Bash', description: 'Running: npm test' },
    ]

    // Build the conversation message
    let conversationMessage = ''
    conversationMessage += `:bust_in_silhouette: User: ${userContent}\n`
    conversationMessage += `:robot_face: Claude: ${claudeContent}\n`

    // Add indented tools
    tools.forEach(tool => {
      conversationMessage += `    :wrench: ${tool.name} - ${tool.description}\n`
    })

    // Verify the structure
    const lines = conversationMessage.trim().split('\n')
    expect(lines).toHaveLength(5)
    expect(lines[0]).toBe(':bust_in_silhouette: User: Please help me fix the bug')
    expect(lines[1]).toBe(
      ":robot_face: Claude: I'll help you fix that bug. Let me examine the code."
    )
    expect(lines[2]).toBe('    :wrench: Read - Reading file: src/main.ts')
    expect(lines[3]).toBe('    :wrench: Edit - Editing file: src/main.ts')
    expect(lines[4]).toBe('    :wrench: Bash - Running: npm test')

    // Verify all tool lines are indented
    const toolLines = lines.filter(line => line.includes(':wrench:'))
    toolLines.forEach(line => {
      expect(line.startsWith('    ')).toBe(true)
    })
  })
})
