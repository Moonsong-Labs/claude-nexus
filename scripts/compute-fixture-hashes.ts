#!/usr/bin/env bun

/**
 * compute-fixture-hashes.ts
 *
 * Purpose:
 * Updates hash values in conversation-linking test fixtures when the hashing
 * algorithm changes or when creating new fixtures. This ensures test fixtures
 * remain in sync with the actual hashing implementation.
 *
 * Usage:
 *   # Update a single fixture
 *   bun scripts/compute-fixture-hashes.ts path/to/fixture.json
 *
 *   # Update all fixtures in the default directory
 *   bun scripts/compute-fixture-hashes.ts --all
 *
 *   # Dry run to see what would change
 *   bun scripts/compute-fixture-hashes.ts --all --dry-run
 *
 *   # Verbose output
 *   bun scripts/compute-fixture-hashes.ts --all --verbose
 *
 *   # Show help
 *   bun scripts/compute-fixture-hashes.ts --help
 */

import { hashMessagesOnly, hashSystemPrompt } from '../packages/shared/src/utils/conversation-hash'
import { readFile, writeFile, readdir, cp } from 'fs/promises'
import { join, dirname, basename, relative } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'
import { parseArgs } from 'util'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// TypeScript interfaces for fixture structure
interface ConversationFixture {
  description: string
  type: 'standard' | 'compact' | 'branch' | 'subtask'
  expectedLink: boolean
  expectedSummaryContent?: string
  expectedBranchPattern?: string
  expectedParentTaskRequestId?: string
  parent: ParentData
  child: ChildData
}

interface ParentData {
  request_id: string
  domain: string
  conversation_id: string | null
  branch_id: string | null
  current_message_hash: string | null
  parent_message_hash: string | null
  system_hash: string | null
  body: {
    system?: string | any[]
    messages?: any[]
    [key: string]: any
  }
  response_body: any
}

interface ChildData {
  request_id: string
  domain: string
  body: {
    system?: string | any[]
    messages?: any[]
    [key: string]: any
  }
}

// Runtime validation function
function isValidFixture(obj: any): obj is ConversationFixture {
  if (!obj || typeof obj !== 'object') return false

  // Check required top-level fields
  if (typeof obj.description !== 'string') return false
  if (!['standard', 'compact', 'branch', 'subtask'].includes(obj.type)) return false
  if (typeof obj.expectedLink !== 'boolean') return false

  // Check parent structure
  if (!obj.parent || typeof obj.parent !== 'object') return false
  if (typeof obj.parent.request_id !== 'string') return false
  if (!obj.parent.body || typeof obj.parent.body !== 'object') return false

  // Check child structure
  if (!obj.child || typeof obj.child !== 'object') return false
  if (typeof obj.child.request_id !== 'string') return false
  if (!obj.child.body || typeof obj.child.body !== 'object') return false

  return true
}

// Parse command line arguments
function parseArguments() {
  const { values, positionals } = parseArgs({
    options: {
      all: { type: 'boolean', short: 'a', default: false },
      'dry-run': { type: 'boolean', short: 'd', default: false },
      verbose: { type: 'boolean', short: 'v', default: false },
      backup: { type: 'boolean', short: 'b', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
    allowPositionals: true,
  })

  return {
    all: values.all,
    dryRun: values['dry-run'],
    verbose: values.verbose,
    backup: values.backup,
    help: values.help,
    files: positionals,
  }
}

// Display help message
function showHelp() {
  console.log(`
compute-fixture-hashes.ts - Update hashes in conversation-linking test fixtures

Usage:
  bun scripts/compute-fixture-hashes.ts [options] [file...]

Options:
  -a, --all        Process all fixtures in the default directory
  -d, --dry-run    Show what would be changed without modifying files
  -v, --verbose    Show detailed output
  -b, --backup     Create backups of modified files (.bak extension)
  -h, --help       Show this help message

Examples:
  # Update a single fixture
  bun scripts/compute-fixture-hashes.ts path/to/fixture.json
  
  # Update all fixtures
  bun scripts/compute-fixture-hashes.ts --all
  
  # Dry run with verbose output
  bun scripts/compute-fixture-hashes.ts --all --dry-run --verbose
  
  # Update with backups
  bun scripts/compute-fixture-hashes.ts --all --backup
`)
}

// Process a single fixture file
async function processFixture(
  filePath: string,
  options: { dryRun: boolean; verbose: boolean; backup: boolean }
): Promise<{ path: string; changes: string[]; error?: string }> {
  const changes: string[] = []

  try {
    const content = await readFile(filePath, 'utf-8')
    let fixture: any

    try {
      fixture = JSON.parse(content)
    } catch (e) {
      return { path: filePath, changes, error: `Failed to parse JSON: ${e.message}` }
    }

    // Validate fixture structure
    if (!isValidFixture(fixture)) {
      return { path: filePath, changes, error: 'Invalid fixture structure' }
    }

    let modified = false

    // Compute parent's current message hash
    if (fixture.parent.body.messages) {
      const parentHash = hashMessagesOnly(fixture.parent.body.messages)
      if (fixture.parent.current_message_hash !== parentHash) {
        changes.push(
          `Parent current_message_hash: ${fixture.parent.current_message_hash} → ${parentHash}`
        )
        fixture.parent.current_message_hash = parentHash
        modified = true
      }
    }

    // Compute parent's system hash
    if (fixture.parent.body.system) {
      // Handle both string and array system prompts
      let systemContent = fixture.parent.body.system
      if (Array.isArray(systemContent)) {
        // Extract text from array format (as seen in some fixtures)
        systemContent = systemContent
          .filter((item: any) => item.type === 'text' && item.text)
          .map((item: any) => item.text)
          .join('\n')
      }

      const systemHash = hashSystemPrompt(systemContent)
      if (fixture.parent.system_hash !== systemHash) {
        changes.push(`Parent system_hash: ${fixture.parent.system_hash} → ${systemHash}`)
        fixture.parent.system_hash = systemHash
        modified = true
      }
    }

    // For child, compute and verify parent_message_hash
    if (fixture.child.body.messages && fixture.child.body.messages.length >= 3) {
      // Parent hash is all messages except the last 2
      const parentMessages = fixture.child.body.messages.slice(0, -2)
      const expectedParentHash = hashMessagesOnly(parentMessages)

      if (options.verbose) {
        const matches = expectedParentHash === fixture.parent.current_message_hash
        changes.push(
          `Child's expected parent_message_hash: ${expectedParentHash} (matches: ${matches})`
        )
      }
    }

    // Only write if changes were made and not in dry-run mode
    if (modified && !options.dryRun) {
      // Create backup if requested
      if (options.backup) {
        await cp(filePath, `${filePath}.bak`)
      }

      await writeFile(filePath, JSON.stringify(fixture, null, 2) + '\n')
    }

    return { path: filePath, changes: modified ? changes : [] }
  } catch (error) {
    return { path: filePath, changes, error: error.message }
  }
}

// Get all fixture files from default directory
async function getAllFixtures(): Promise<string[]> {
  const fixturesDir = join(
    __dirname,
    '../packages/shared/src/utils/__tests__/fixtures/conversation-linking'
  )

  if (!existsSync(fixturesDir)) {
    throw new Error(`Fixtures directory not found: ${fixturesDir}`)
  }

  const files = await readdir(fixturesDir)
  return files.filter(f => f.endsWith('.json')).map(f => join(fixturesDir, f))
}

// Main function
async function main() {
  const args = parseArguments()

  if (args.help) {
    showHelp()
    process.exit(0)
  }

  // Determine which files to process
  let filesToProcess: string[] = []

  if (args.all) {
    try {
      filesToProcess = await getAllFixtures()
      console.log(`Found ${filesToProcess.length} fixture files to process\n`)
    } catch (error) {
      console.error(`Error: ${error.message}`)
      process.exit(1)
    }
  } else if (args.files.length > 0) {
    filesToProcess = args.files
  } else {
    console.error('Error: No files specified. Use --all or provide file paths.')
    showHelp()
    process.exit(1)
  }

  // Process all files
  const results = await Promise.all(
    filesToProcess.map(file =>
      processFixture(file, {
        dryRun: args.dryRun,
        verbose: args.verbose,
        backup: args.backup,
      })
    )
  )

  // Display results
  const projectRoot = join(__dirname, '..')
  let totalChanges = 0
  let errors = 0

  for (const result of results) {
    const relativePath = relative(projectRoot, result.path)

    if (result.error) {
      console.error(`❌ ${relativePath}: ${result.error}`)
      errors++
    } else if (result.changes.length > 0) {
      console.log(`📝 ${relativePath}:`)
      result.changes.forEach(change => console.log(`   ${change}`))
      totalChanges++
    } else if (args.verbose) {
      console.log(`✅ ${relativePath}: No changes needed`)
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50))
  if (args.dryRun) {
    console.log('DRY RUN - No files were modified')
  }
  console.log(`Processed: ${results.length} files`)
  console.log(`Modified: ${totalChanges} files`)
  if (errors > 0) {
    console.log(`Errors: ${errors} files`)
  }

  process.exit(errors > 0 ? 1 : 0)
}

// Run the script
main().catch(error => {
  console.error('Unexpected error:', error)
  process.exit(1)
})
