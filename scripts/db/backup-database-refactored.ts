#!/usr/bin/env bun
import { execSync } from 'child_process'
import { parseArgs } from 'util'

/**
 * Database backup script - creates a backup of the Claude Nexus database
 * Refactored version with improved structure and type safety
 */

// ============================================================================
// Type Definitions
// ============================================================================

interface BackupConfig {
  mode: 'database' | 'file'
  sourceDatabaseUrl: string
  sourceDatabaseName: string
  targetName: string
}

interface ParsedArguments {
  file?: string
  name?: string
  help?: boolean
}

// ============================================================================
// Constants
// ============================================================================

const DATABASE_NAME_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/
const MAX_DATABASE_NAME_LENGTH = 63

const HELP_TEXT = `
Database Backup Script

Usage:
  bun run scripts/backup-database.ts              # Creates a new backup database with timestamp
  bun run scripts/backup-database.ts --name=mybackup  # Creates backup with custom name
  bun run scripts/backup-database.ts --file       # Exports to a .sql file with timestamp
  bun run scripts/backup-database.ts --file=backup.sql  # Exports to specific file
  bun run scripts/backup-database.ts --help       # Show this help

Options:
  -n, --name <dbname>    Custom name for the backup database (default: includes timestamp)
  -f, --file [filename]  Export to file instead of creating a backup database
  -h, --help            Show help information

Note: --name and --file options are mutually exclusive
`

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

// ============================================================================
// Argument Parsing
// ============================================================================

function parseArguments(): ParsedArguments {
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
      help: {
        type: 'boolean',
        short: 'h',
      },
    },
    strict: true,
    allowPositionals: true,
  })

  return values as ParsedArguments
}

function validateArguments(args: ParsedArguments): void {
  if (args.file !== undefined && args.name !== undefined) {
    throw new Error(
      '--file and --name options cannot be used together\n' +
        'Use --file to export to a file, or --name to create a backup database'
    )
  }
}

// ============================================================================
// Configuration
// ============================================================================

function createBackupConfig(args: ParsedArguments): BackupConfig {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required')
  }

  const sourceDatabaseName = getDatabaseName(databaseUrl)
  const timestamp = formatTimestamp()

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
    }
  } else {
    const targetName = args.name || `${sourceDatabaseName}_backup_${timestamp}`

    if (args.name) {
      validateDatabaseName(args.name)
    }

    return {
      mode: 'database',
      sourceDatabaseUrl: databaseUrl,
      sourceDatabaseName,
      targetName,
    }
  }
}

// ============================================================================
// Database Operations
// ============================================================================

async function checkDatabaseExists(connectionUrl: string, databaseName: string): Promise<boolean> {
  const postgresUrl = new URL(connectionUrl)
  postgresUrl.pathname = '/postgres'

  try {
    const checkCommand = `psql "${postgresUrl.toString()}" -t -c "SELECT 1 FROM pg_database WHERE datname = '${databaseName}'" | grep -q 1`
    execSync(checkCommand, { stdio: 'pipe', shell: true })
    return true
  } catch {
    return false
  }
}

function createDatabase(connectionUrl: string, databaseName: string): void {
  const postgresUrl = new URL(connectionUrl)
  postgresUrl.pathname = '/postgres'

  const createCommand = `psql "${postgresUrl.toString()}" -c "CREATE DATABASE \\"${databaseName}\\""`
  execSync(createCommand, { stdio: 'inherit' })
}

function copyDatabaseContent(sourceUrl: string, targetDatabaseName: string): void {
  const targetUrl = new URL(sourceUrl)
  targetUrl.pathname = `/${targetDatabaseName}`

  const copyCommand = `pg_dump "${sourceUrl}" --verbose --no-owner --no-privileges | psql "${targetUrl.toString()}"`
  execSync(copyCommand, { stdio: 'inherit', shell: true })
}

// ============================================================================
// Backup Functions
// ============================================================================

async function performFileBackup(config: BackupConfig): Promise<void> {
  console.log(`Starting database backup to file: ${config.targetName}`)
  console.log(`Source database: ${config.sourceDatabaseName}`)

  const dumpCommand = [
    'pg_dump',
    `"${config.sourceDatabaseUrl}"`,
    '--verbose',
    '--no-owner',
    '--no-privileges',
    '--if-exists',
    '--clean',
    `-f ${config.targetName}`,
  ].join(' ')

  execSync(dumpCommand, { stdio: 'inherit' })

  console.log(`✅ Database backup completed successfully!`)
  console.log(`📁 Backup file: ${config.targetName}`)

  // Get file size
  const stats = await Bun.file(config.targetName).size
  console.log(`📊 File size: ${(stats / 1024 / 1024).toFixed(2)} MB`)
}

async function performDatabaseBackup(config: BackupConfig): Promise<void> {
  console.log(`Starting database backup...`)
  console.log(`Source database: ${config.sourceDatabaseName}`)
  console.log(`Backup database: ${config.targetName}`)

  // Check if database already exists (only for custom names)
  if (config.targetName.includes('_backup_')) {
    // Auto-generated name, proceed without checking
  } else {
    const exists = await checkDatabaseExists(config.sourceDatabaseUrl, config.targetName)
    if (exists) {
      const postgresUrl = new URL(config.sourceDatabaseUrl)
      postgresUrl.pathname = '/postgres'

      throw new Error(
        `Database '${config.targetName}' already exists!\n` +
          'The backup will fail. Please choose a different name or delete the existing database.\n' +
          `To delete: psql "${postgresUrl.toString()}" -c "DROP DATABASE \\"${config.targetName}\\""`
      )
    }
  }

  console.log(`Creating backup database...`)
  createDatabase(config.sourceDatabaseUrl, config.targetName)

  console.log(`Copying database content...`)
  copyDatabaseContent(config.sourceDatabaseUrl, config.targetName)

  console.log(`✅ Database backup completed successfully!`)
  console.log(`🗄️  Backup database: ${config.targetName}`)

  // Show connection string for the backup
  const backupUrl = new URL(config.sourceDatabaseUrl)
  backupUrl.pathname = `/${config.targetName}`
  console.log(`🔗 Connection string: ${backupUrl.toString()}`)
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

    // Create configuration
    const config = createBackupConfig(args)

    // Perform backup
    if (config.mode === 'file') {
      await performFileBackup(config)
    } else {
      await performDatabaseBackup(config)
    }
  } catch (error) {
    console.error('❌ Backup failed:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

// Run the script
main().catch(console.error)
