#!/usr/bin/env bun
import { execSync } from 'child_process'
import { parseArgs } from 'util'

/**
 * Database backup script - creates a backup of the Claude Nexus database
 *
 * Usage:
 *   bun run scripts/backup-database.ts              # Creates a new backup database with timestamp
 *   bun run scripts/backup-database.ts --name=mybackup  # Creates backup with custom name
 *   bun run scripts/backup-database.ts --file       # Exports to a .sql file
 *   bun run scripts/backup-database.ts --file=backup.sql  # Exports to specific file
 */

function formatTimestamp(): string {
  const now = new Date()
  return now.toISOString().replace(/T/, '_').replace(/:/g, '-').replace(/\..+/, '')
}

function getDatabaseName(connectionString: string): string {
  const url = new URL(connectionString)
  return url.pathname.substring(1)
}

async function backupDatabase() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required')
    process.exit(1)
  }

  // Parse command line arguments
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

  if (values.help) {
    console.log(`
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
`)
    process.exit(0)
  }

  // Validate mutually exclusive options
  if (values.file !== undefined && values.name !== undefined) {
    console.error('Error: --file and --name options cannot be used together')
    console.error('Use --file to export to a file, or --name to create a backup database')
    process.exit(1)
  }

  const dbName = getDatabaseName(databaseUrl)
  const timestamp = formatTimestamp()

  try {
    if (values.file !== undefined) {
      // File backup mode
      const filename =
        typeof values.file === 'string' && values.file
          ? values.file
          : `claude_nexus_backup_${timestamp}.sql`

      console.log(`Starting database backup to file: ${filename}`)
      console.log(`Source database: ${dbName}`)

      // Use pg_dump with connection string directly
      const dumpCommand = [
        'pg_dump',
        `"${databaseUrl}"`,
        '--verbose',
        '--no-owner',
        '--no-privileges',
        '--if-exists',
        '--clean',
        `-f ${filename}`,
      ].join(' ')

      execSync(dumpCommand, { stdio: 'inherit' })

      console.log(`✅ Database backup completed successfully!`)
      console.log(`📁 Backup file: ${filename}`)

      // Get file size
      const stats = await Bun.file(filename).size
      console.log(`📊 File size: ${(stats / 1024 / 1024).toFixed(2)} MB`)
    } else {
      // Database backup mode
      const backupDbName = values.name || `${dbName}_backup_${timestamp}`

      // Validate database name if custom name provided
      if (values.name) {
        // Basic validation for PostgreSQL database names
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(values.name)) {
          console.error('Error: Invalid database name. Database names must:')
          console.error('- Start with a letter or underscore')
          console.error('- Contain only letters, numbers, and underscores')
          process.exit(1)
        }
        if (values.name.length > 63) {
          console.error('Error: Database name too long (max 63 characters)')
          process.exit(1)
        }
      }

      console.log(`Starting database backup...`)
      console.log(`Source database: ${dbName}`)
      console.log(`Backup database: ${backupDbName}`)

      // First, check if custom database name already exists
      if (values.name) {
        console.log(`Checking if database '${backupDbName}' already exists...`)
        const postgresCheckUrl = new URL(databaseUrl)
        postgresCheckUrl.pathname = '/postgres'

        try {
          const checkCommand = `psql "${postgresCheckUrl.toString()}" -t -c "SELECT 1 FROM pg_database WHERE datname = '${backupDbName}'" | grep -q 1`
          execSync(checkCommand, { stdio: 'pipe', shell: true })

          console.error(`\n⚠️  Warning: Database '${backupDbName}' already exists!`)
          console.error(
            'The backup will fail. Please choose a different name or delete the existing database.'
          )
          console.error(
            `To delete: psql "${postgresCheckUrl.toString()}" -c "DROP DATABASE \\"${backupDbName}\\""`
          )
          process.exit(1)
        } catch {
          // Database doesn't exist, we can proceed
        }
      }

      // Create the backup database using the postgres database
      console.log(`Creating backup database...`)
      const postgresUrl = new URL(databaseUrl)
      postgresUrl.pathname = '/postgres'
      const createDbCommand = `psql "${postgresUrl.toString()}" -c "CREATE DATABASE \\"${backupDbName}\\""`

      execSync(createDbCommand, { stdio: 'inherit' })

      // Then use pg_dump and psql to copy the database
      console.log(`Copying database content...`)
      const backupUrl = new URL(databaseUrl)
      backupUrl.pathname = `/${backupDbName}`

      const backupCommand = `pg_dump "${databaseUrl}" --verbose --no-owner --no-privileges | psql "${backupUrl.toString()}"`

      execSync(backupCommand, { stdio: 'inherit', shell: true })

      console.log(`✅ Database backup completed successfully!`)
      console.log(`🗄️  Backup database: ${backupDbName}`)

      // Show connection string for the backup
      console.log(`🔗 Connection string: ${backupUrl.toString()}`)
    }
  } catch (error) {
    console.error('❌ Backup failed:', error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

// Run backup
backupDatabase().catch(console.error)
