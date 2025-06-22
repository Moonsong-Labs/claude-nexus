#!/usr/bin/env bun

import { Client } from 'pg'

async function seedDatabase() {
  const databaseUrl =
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@postgres:5432/claude_proxy'
  const client = new Client({ connectionString: databaseUrl })

  try {
    await client.connect()
    console.log('Connected to database')

    // Clear existing test data
    await client.query(`
      DELETE FROM request_response_logs 
      WHERE domain LIKE 'test-%' 
      OR created_at < NOW() - INTERVAL '7 days'
    `)
    console.log('Cleared old test data')

    // Insert test data if needed
    // For now, we'll just ensure a clean state

    console.log('Database seeding completed successfully')
  } catch (error) {
    console.error('Database seeding failed:', error)
    process.exit(1)
  } finally {
    await client.end()
  }
}

// Run the seeding
seedDatabase()
