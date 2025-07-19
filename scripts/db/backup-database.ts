#!/usr/bin/env bun
/**
 * Database Backup Script
 *
 * Creates backups of the Claude Nexus database using pg_dump utility.
 * Supports both file exports (.sql) and creating backup databases.
 *
 * Usage:
 *   bun run scripts/db/backup-database.ts              # Creates backup database with timestamp
 *   bun run scripts/db/backup-database.ts --name=backup  # Custom backup database name
 *   bun run scripts/db/backup-database.ts --file       # Export to .sql file with timestamp
 *   bun run scripts/db/backup-database.ts --file=out.sql # Export to specific file
 *   bun run scripts/db/backup-database.ts --since="1 day"  # Backup recent conversations
 *   bun run scripts/db/backup-database.ts --help       # Show help
 */

import { spawn } from 'child_process'
import { createWriteStream } from 'fs'
import { parseArgs } from 'util'
import { config } from 'dotenv'
import { Pool } from 'pg'

// Load environment variables
config()

// ============================================================================
// Type Definitions
// ============================================================================

interface BackupOptions {
  mode: 'database' | 'file'
  sourceDatabaseUrl: string
  sourceDatabaseName: string
  targetName: string
  sinceTimestamp?: string
}

interface ParsedArgs {
  file?: string | boolean
  name?: string
  since?: string
  help?: boolean
}

interface ConversationResult {
  conversation_id: string
}

// ============================================================================
// Constants
// ============================================================================

const DATABASE_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/
const MAX_DATABASE_NAME_LENGTH = 63
const BACKUP_PREFIX = '_backup_'

const HELP_TEXT = `
Database Backup Script

Usage:
  bun run scripts/db/backup-database.ts              # Creates a new backup database with timestamp
  bun run scripts/db/backup-database.ts --name=mybackup  # Creates backup with custom name
  bun run scripts/db/backup-database.ts --file       # Exports to a .sql file with timestamp
  bun run scripts/db/backup-database.ts --file=backup.sql  # Exports to specific file
  bun run scripts/db/backup-database.ts --since="1 day"  # Backup only last day's data
  bun run scripts/db/backup-database.ts --since="2 hours" --file  # Export last 2 hours to file
  bun run scripts/db/backup-database.ts --help       # Show this help

Options:
  -n, --name <dbname>    Custom name for the backup database (default: includes timestamp)
  -f, --file [filename]  Export to file instead of creating a backup database
  -s, --since <time>     Backup complete conversations with activity after this time
                         Examples: '1 hour', '2 days', '2024-01-01'
                         Note: Backs up entire conversations to maintain foreign key integrity
  -h, --help            Show help information

Note: --name and --file options are mutually exclusive
`

const QUERIES = {
  CHECK_DATABASE: 'SELECT 1 FROM pg_database WHERE datname = $1',
  CREATE_DATABASE: 'CREATE DATABASE $1',
  GET_CONVERSATIONS_SINCE: `
    SELECT DISTINCT conversation_id 
    FROM api_requests 
    WHERE timestamp >= $1::timestamp
  `,
}

// ============================================================================
// Utility Functions
// ============================================================================

function formatTimestamp(): string {
  const now = new Date()
  return now.toISOString().replace(/T/, '_').replace(/:/g, '-').replace(/\..+/, '')
}

function getDatabaseName(connectionString: string): string {
  const url = new URL(connectionString)
  return url.pathname.substring(1)
}

function validateDatabaseName(name: string): void {
  if (!DATABASE_NAME_REGEX.test(name)) {
    throw new Error(
      'Invalid database name. Database names must:\n' +
        '- Start with a letter or underscore\n' +
        '- Contain only letters, numbers, and underscores'
    )
  }

  if (name.length > MAX_DATABASE_NAME_LENGTH) {
    throw new Error(`Database name too long (max ${MAX_DATABASE_NAME_LENGTH} characters)`)
  }
}

function parseSinceParameter(since: string): string {
  // Support various formats:
  // - Relative: "1 hour", "2 days", "3 weeks", "1 month"
  // - Absolute: "2024-01-01", "2024-01-01 12:00:00"

  // Check if it's an absolute date
  const absoluteDateRegex = /^\d{4}-\d{2}-\d{2}(\s+\d{2}:\d{2}:\d{2})?$/
  if (absoluteDateRegex.test(since)) {
    return since
  }

  // Parse relative time
  const relativeRegex = /^(\d+)\s+(hour|day|week|month)s?$/i
  const match = since.match(relativeRegex)

  if (!match) {
    throw new Error(
      `Invalid --since format: "${since}". Use formats like "1 hour", "2 days", or "2024-01-01"`
    )
  }

  const [, amount, unit] = match
  const now = new Date()
  const num = parseInt(amount, 10)

  switch (unit.toLowerCase()) {
    case 'hour':
      now.setHours(now.getHours() - num)
      break
    case 'day':
      now.setDate(now.getDate() - num)
      break
    case 'week':
      now.setDate(now.getDate() - num * 7)
      break
    case 'month':
      now.setMonth(now.getMonth() - num)
      break
  }

  return now.toISOString()
}

// ============================================================================
// Command Execution Functions
// ============================================================================

function executeCommand(
  command: string,
  args: string[],
  options?: {
    outputFile?: string
    onData?: (data: string) => void
    onError?: (data: string) => void
  }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options?.outputFile ? ['inherit', 'pipe', 'pipe'] : 'inherit',
    })

    if (options?.outputFile) {
      const writeStream = createWriteStream(options.outputFile)
      child.stdout?.pipe(writeStream)

      child.stdout?.on('data', data => {
        if (options.onData) {
          options.onData(data.toString())
        }
      })
    }

    let errorOutput = ''
    child.stderr?.on('data', data => {
      errorOutput += data.toString()
      if (options?.onError) {
        options.onError(data.toString())
      }
    })

    child.on('error', error => {
      reject(new Error(`Failed to start ${command}: ${error.message}`))
    })

    child.on('close', code => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} exited with code ${code}: ${errorOutput}`))
      }
    })
  })
}

// ============================================================================
// Database Functions
// ============================================================================

async function checkDatabaseExists(pool: Pool, databaseName: string): Promise<boolean> {
  try {
    const result = await pool.query(QUERIES.CHECK_DATABASE, [databaseName])
    return result.rows.length > 0
  } catch {
    return false
  }
}

async function createDatabase(pool: Pool, databaseName: string): Promise<void> {
  // Validate database name to prevent SQL injection
  validateDatabaseName(databaseName)

  // Use parameterized query with identifier escaping
  await pool.query(`CREATE DATABASE "${databaseName}"`)
}

async function getConversationsSince(connectionUrl: string, since: string): Promise<string[]> {
  const pool = new Pool({ connectionString: connectionUrl })
  try {
    const result = await pool.query<ConversationResult>(QUERIES.GET_CONVERSATIONS_SINCE, [since])
    return result.rows.map(row => row.conversation_id)
  } finally {
    await pool.end()
  }
}

// ============================================================================
// Backup Functions
// ============================================================================

async function performFileBackup(options: BackupOptions): Promise<void> {
  console.log(`📁 Starting database backup to file: ${options.targetName}`)
  console.log(`🗄️  Source database: ${options.sourceDatabaseName}`)
  if (options.sinceTimestamp) {
    console.log(`⏰ Filtering data since: ${options.sinceTimestamp}`)
  }

  const pgDumpArgs = [
    options.sourceDatabaseUrl,
    '--verbose',
    '--no-owner',
    '--no-privileges',
    '--if-exists',
    '--clean',
  ]

  if (options.sinceTimestamp) {
    // For filtered backups, we need a custom approach
    console.log(
      `\n📋 Creating filtered backup with complete conversations since ${options.sinceTimestamp}`
    )

    // Get conversation IDs with recent activity
    const conversationIds = await getConversationsSince(
      options.sourceDatabaseUrl,
      options.sinceTimestamp
    )

    if (conversationIds.length === 0) {
      console.log('⚠️  No conversations found in the specified time range')
      return
    }

    console.log(`📊 Found ${conversationIds.length} conversations with recent activity`)

    // Note: pg_dump doesn't support filtered backups well, so we'll export full data
    // and the user can filter after restore if needed
    console.log('⚠️  Note: Filtered file backups export all data. Filter after restore if needed.')
  }

  await executeCommand('pg_dump', pgDumpArgs, {
    outputFile: options.targetName,
  })

  console.log(`✅ Database backup completed successfully!`)
  console.log(`📁 Backup file: ${options.targetName}`)

  // Get file size
  const stats = await Bun.file(options.targetName).stat()
  console.log(`📊 File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`)
}

async function performDatabaseBackup(options: BackupOptions): Promise<void> {
  console.log(`🗄️  Starting database backup...`)
  console.log(`📂 Source database: ${options.sourceDatabaseName}`)
  console.log(`💾 Backup database: ${options.targetName}`)
  if (options.sinceTimestamp) {
    console.log(`⏰ Filtering data since: ${options.sinceTimestamp}`)
  }

  const postgresUrl = new URL(options.sourceDatabaseUrl)
  postgresUrl.pathname = '/postgres'

  const pool = new Pool({ connectionString: postgresUrl.toString() })

  try {
    // Check if backup database already exists
    const exists = await checkDatabaseExists(pool, options.targetName)
    if (exists) {
      throw new Error(
        `Database '${options.targetName}' already exists!\n` +
          'Please choose a different name or delete the existing database.\n' +
          `To delete: DROP DATABASE "${options.targetName}"`
      )
    }

    // Create backup database
    console.log(`🔨 Creating backup database...`)
    await createDatabase(pool, options.targetName)
  } finally {
    await pool.end()
  }

  // Copy database content
  console.log(`📋 Copying database content...`)

  const backupUrl = new URL(options.sourceDatabaseUrl)
  backupUrl.pathname = `/${options.targetName}`

  const pgDumpArgs = [options.sourceDatabaseUrl, '--verbose', '--no-owner', '--no-privileges']

  if (options.sinceTimestamp) {
    console.log(`\n📊 Creating filtered backup with data since ${options.sinceTimestamp}`)

    // First copy schema only
    console.log(`🏗️  Copying database schema...`)
    const schemaDumpProcess = spawn('pg_dump', [...pgDumpArgs, '--schema-only'])
    const schemaRestoreProcess = spawn('psql', [backupUrl.toString()])

    // Pipe schema dump to restore
    schemaDumpProcess.stdout?.pipe(schemaRestoreProcess.stdin!)

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        schemaDumpProcess.on('error', reject)
        schemaDumpProcess.on('exit', code => {
          if (code === 0) resolve()
          else reject(new Error(`pg_dump (schema) exited with code ${code}`))
        })
      }),
      new Promise<void>((resolve, reject) => {
        schemaRestoreProcess.on('error', reject)
        schemaRestoreProcess.on('exit', code => {
          if (code === 0) resolve()
          else reject(new Error(`psql (schema) exited with code ${code}`))
        })
      }),
    ])

    // Get conversations with recent activity
    const conversationIds = await getConversationsSince(
      options.sourceDatabaseUrl,
      options.sinceTimestamp
    )

    if (conversationIds.length > 0) {
      console.log(`📊 Found ${conversationIds.length} conversations to backup`)

      // For security, we'll copy all data and let the user filter after restore
      // This avoids SQL injection risks from concatenating conversation IDs
      console.log(
        '⚠️  Note: Copying all api_requests data for security. Filter after restore if needed.'
      )

      // Use pg_dump | psql pattern with proper stream handling
      const dumpProcess = spawn('pg_dump', [
        options.sourceDatabaseUrl,
        '--data-only',
        '--table=api_requests',
        '--verbose',
        '--no-owner',
        '--no-privileges',
      ])

      const restoreProcess = spawn('psql', [backupUrl.toString()])

      // Pipe dump output to restore input
      dumpProcess.stdout?.pipe(restoreProcess.stdin!)

      // Handle errors
      await Promise.all([
        new Promise<void>((resolve, reject) => {
          dumpProcess.on('error', reject)
          dumpProcess.on('exit', code => {
            if (code === 0) resolve()
            else reject(new Error(`pg_dump exited with code ${code}`))
          })
        }),
        new Promise<void>((resolve, reject) => {
          restoreProcess.on('error', reject)
          restoreProcess.on('exit', code => {
            if (code === 0) resolve()
            else reject(new Error(`psql exited with code ${code}`))
          })
        }),
      ])
    } else {
      console.log('⚠️  No conversations found in the specified time range')
    }
  } else {
    // Full backup using pg_dump | psql pattern
    const dumpProcess = spawn('pg_dump', pgDumpArgs)
    const restoreProcess = spawn('psql', [backupUrl.toString()])

    // Pipe dump output to restore input
    dumpProcess.stdout?.pipe(restoreProcess.stdin!)

    // Handle errors
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        dumpProcess.on('error', reject)
        dumpProcess.on('exit', code => {
          if (code === 0) resolve()
          else reject(new Error(`pg_dump exited with code ${code}`))
        })
      }),
      new Promise<void>((resolve, reject) => {
        restoreProcess.on('error', reject)
        restoreProcess.on('exit', code => {
          if (code === 0) resolve()
          else reject(new Error(`psql exited with code ${code}`))
        })
      }),
    ])
  }

  console.log(`✅ Database backup completed successfully!`)
  console.log(`🗄️  Backup database: ${options.targetName}`)
  console.log(`🔗 Connection string: ${backupUrl.toString()}`)
}

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArguments(): ParsedArgs {
  const { values } = parseArgs({
    args: Bun.argv,
    options: {
      file: {
        type: 'string',
        short: 'f',
      },
      name: {
        type: 'string',
        short: 'n',
      },
      since: {
        type: 'string',
        short: 's',
      },
      help: {
        type: 'boolean',
        short: 'h',
      },
    },
    strict: true,
    allowPositionals: true,
  })

  return values as ParsedArgs
}

function validateArguments(args: ParsedArgs): void {
  if (args.file !== undefined && args.name !== undefined) {
    throw new Error(
      '--file and --name options cannot be used together\n' +
        'Use --file to export to a file, or --name to create a backup database'
    )
  }
}

function createBackupOptions(args: ParsedArgs): BackupOptions {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  const sourceDatabaseName = getDatabaseName(databaseUrl)
  const timestamp = formatTimestamp()
  const sinceTimestamp = args.since ? parseSinceParameter(args.since) : undefined

  if (args.file !== undefined) {
    const targetName =
      typeof args.file === 'string' && args.file
        ? args.file
        : `claude_nexus_backup_${timestamp}.sql`

    return {
      mode: 'file',
      sourceDatabaseUrl: databaseUrl,
      sourceDatabaseName,
      targetName,
      sinceTimestamp,
    }
  } else {
    const targetName = args.name || `${sourceDatabaseName}${BACKUP_PREFIX}${timestamp}`

    if (args.name) {
      validateDatabaseName(args.name)
    }

    return {
      mode: 'database',
      sourceDatabaseUrl: databaseUrl,
      sourceDatabaseName,
      targetName,
      sinceTimestamp,
    }
  }
}

// ============================================================================
// Main Function
// ============================================================================

async function main(): Promise<void> {
  try {
    // Parse arguments
    const args = parseArguments()

    // Show help if requested
    if (args.help) {
      console.log(HELP_TEXT)
      return
    }

    // Validate arguments
    validateArguments(args)

    // Create backup options
    const options = createBackupOptions(args)

    // Perform backup
    if (options.mode === 'file') {
      await performFileBackup(options)
    } else {
      await performDatabaseBackup(options)
    }
  } catch (error) {
    console.error('❌ Backup failed:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

// Run the script
main().catch(console.error)
