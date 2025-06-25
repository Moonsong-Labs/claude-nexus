#!/usr/bin/env bun
/**
 * Test CLI tool prefix detection
 */

import { hashConversationStateWithSystem } from '../../packages/shared/src/utils/conversation-hash'

// Test system prompts
const cliSystemPrompt = `You are an interactive CLI tool that helps users with software engineering tasks. Use the instructions below and the tools available to you to assist the user.

IMPORTANT: Assist with defensive security tasks only. Refuse to create, modify, or improve code that may be used maliciously.

gitStatus: This is the git status at the start of the conversation.
Current branch: main

Status:
M CLAUDE.md

Recent commits:
d4eab14 Fix: Correct subtask grouping in conversation overview (#23)`

const cliSystemPrompt2 = `You are an interactive CLI tool that helps users with software engineering tasks. Use the instructions below and the tools available to you to assist the user.

IMPORTANT: Assist with defensive security tasks only. Refuse to create, modify, or improve code that may be used maliciously.

gitStatus: This is the git status at the start of the conversation.
Current branch: fix/investigate-request-linking

Status:
?? readonly_user_credentials.txt

Recent commits:
91c5299 feat: add --dry-run flags`

// Test messages
const testMessage = {
  role: 'user' as const,
  content: 'Hello world'
}

console.log('Testing CLI tool system prompt detection...\n')

console.log('System prompt 1 (first 100 chars):', cliSystemPrompt.substring(0, 100) + '...')
console.log('System prompt 2 (first 100 chars):', cliSystemPrompt2.substring(0, 100) + '...')

const hash1 = hashConversationStateWithSystem([testMessage], cliSystemPrompt)
const hash2 = hashConversationStateWithSystem([testMessage], cliSystemPrompt2)

console.log('\nHash with system prompt 1:', hash1)
console.log('Hash with system prompt 2:', hash2)
console.log('\nHashes match:', hash1 === hash2 ? 'YES ✅' : 'NO ❌')

if (hash1 === hash2) {
  console.log('\n✅ SUCCESS: CLI tool system prompts with different git status produce identical hashes!')
} else {
  console.log('\n❌ FAILED: CLI tool system prompts still produce different hashes')
}