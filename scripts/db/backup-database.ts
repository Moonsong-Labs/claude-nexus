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
 *   bun run scripts/backup-database.ts --since="1 day"  # Backup only data from last day
 */

function formatTimestamp(): string {
  const now = new Date()
  return now.toISOString().replace(/T/, '_').replace(/:/g, '-').replace(/\..+/, '')
}

function getDatabaseName(connectionString: string): string {
  const url = new URL(connectionString)
  return url.pathname.substring(1)
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

  if (values.help) {
    console.log(`
Database Backup Script

Usage:
  bun run scripts/backup-database.ts              # Creates a new backup database with timestamp
  bun run scripts/backup-database.ts --name=mybackup  # Creates backup with custom name
  bun run scripts/backup-database.ts --file       # Exports to a .sql file with timestamp
  bun run scripts/backup-database.ts --file=backup.sql  # Exports to specific file
  bun run scripts/backup-database.ts --since="1 day"  # Backup only last day's data
  bun run scripts/backup-database.ts --since="2 hours" --file  # Export last 2 hours to file
  bun run scripts/backup-database.ts --help       # Show this help

Options:
  -n, --name <dbname>    Custom name for the backup database (default: includes timestamp)
  -f, --file [filename]  Export to file instead of creating a backup database
  -s, --since <time>     Only backup data newer than this time (e.g., '1 hour', '2 days', '2024-01-01')
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
      if (values.since) {
        const sinceTimestamp = parseSinceParameter(values.since)
        console.log(`Filtering data since: ${sinceTimestamp}`)
      }

      // Use pg_dump with connection string directly
      let dumpCommand: string

      if (values.since) {
        // For filtered backups, we need to use a custom approach
        // pg_dump doesn't support WHERE clauses directly, so we'll create a custom dump
        const sinceTimestamp = parseSinceParameter(values.since)
        console.log(`\nNote: Creating filtered backup with data since ${sinceTimestamp}`)
        console.log(`This will only include table structure and filtered data.\n`)

        // First dump the schema only
        const schemaDumpCommand = [
          'pg_dump',
          `"${databaseUrl}"`,
          '--verbose',
          '--schema-only',
          '--no-owner',
          '--no-privileges',
          '--if-exists',
          '--clean',
          `-f ${filename}.schema`,
        ].join(' ')

        execSync(schemaDumpCommand, { stdio: 'inherit' })

        // Then use COPY commands to export filtered data
        const dataDumpCommand = `psql "${databaseUrl}" -c "\\copy (SELECT * FROM api_requests WHERE timestamp >= '${sinceTimestamp}') TO '${filename}.data' WITH (FORMAT csv, HEADER true)"`
        execSync(dataDumpCommand, { stdio: 'inherit', shell: true })

        // Combine schema and data
        const combineCommand = `cat ${filename}.schema > ${filename} && echo "\\\\copy api_requests FROM '${filename}.data' WITH (FORMAT csv, HEADER true);" >> ${filename} && rm ${filename}.schema ${filename}.data`
        execSync(combineCommand, { stdio: 'inherit', shell: true })

        console.log(`\n✅ Filtered database backup completed!`)
      } else {
        // Full backup
        dumpCommand = [
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
      }

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
      if (values.since) {
        const sinceTimestamp = parseSinceParameter(values.since)
        console.log(`Filtering data since: ${sinceTimestamp}`)
      }

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

      if (values.since) {
        // For filtered backups, we need a different approach
        const sinceTimestamp = parseSinceParameter(values.since)
        console.log(`\nNote: Creating filtered backup with data since ${sinceTimestamp}`)

        // First, dump and restore the schema only
        console.log(`Copying database schema...`)
        const schemaCommand = `pg_dump "${databaseUrl}" --schema-only --verbose --no-owner --no-privileges | psql "${backupUrl.toString()}"`
        execSync(schemaCommand, { stdio: 'inherit', shell: true })

        // Then copy filtered data for each table that has a timestamp column
        console.log(`Copying filtered data...`)

        // Copy api_requests with timestamp filter
        const copyApiRequestsCommand = `psql "${databaseUrl}" -c "\\copy (SELECT * FROM api_requests WHERE timestamp >= '${sinceTimestamp}') TO STDOUT" | psql "${backupUrl.toString()}" -c "\\copy api_requests FROM STDIN"`
        execSync(copyApiRequestsCommand, { stdio: 'inherit', shell: true })

        // Copy streaming_chunks for the filtered requests
        const copyStreamingChunksCommand = `psql "${databaseUrl}" -c "\\copy (SELECT sc.* FROM streaming_chunks sc JOIN api_requests ar ON sc.request_id = ar.request_id WHERE ar.timestamp >= '${sinceTimestamp}') TO STDOUT" | psql "${backupUrl.toString()}" -c "\\copy streaming_chunks FROM STDIN"`
        try {
          execSync(copyStreamingChunksCommand, { stdio: 'inherit', shell: true })
        } catch (e) {
          console.log(`Note: streaming_chunks table might not exist or be empty`)
        }

        console.log(`✅ Filtered database backup completed!`)
      } else {
        // Full backup
        const backupCommand = `pg_dump "${databaseUrl}" --verbose --no-owner --no-privileges | psql "${backupUrl.toString()}"`
        execSync(backupCommand, { stdio: 'inherit', shell: true })
      }

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
