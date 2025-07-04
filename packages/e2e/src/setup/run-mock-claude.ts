#!/usr/bin/env bun
import { createMockClaudeServer } from './mock-claude.js'

const port = parseInt(process.env.MOCK_PORT || '3101')
createMockClaudeServer(port)

console.log(`🤖 Mock Claude API server running on port ${port}`)
console.log('Press Ctrl+C to stop')
