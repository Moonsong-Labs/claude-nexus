#!/usr/bin/env bun

/**
 * build-production.ts
 *
 * Production build script for Claude Nexus Dashboard Service.
 *
 * This script performs optimized production builds with:
 * - Source code minification and bundling
 * - Source map generation for debugging
 * - Public asset copying
 * - Production-ready package.json generation
 * - Executable entry point wrapper
 * - Build size reporting
 *
 * Key differences from build-bun.ts:
 * - Includes source maps for production debugging
 * - Copies public assets (static files, images, etc.)
 * - Creates minimal package.json with only runtime dependencies
 * - Generates entry wrapper with proper error handling
 * - Reports detailed build statistics
 *
 * Used by: Docker builds, CI/CD pipelines, production deployments
 */

import { $ } from 'bun'
import { existsSync, mkdirSync, rmSync, writeFileSync, cpSync, statSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import packageJson from '../package.json' assert { type: 'json' }

const __dirname = dirname(fileURLToPath(import.meta.url))

console.log('🏗️  Building Claude Nexus Dashboard Service for Production...')

// Generate prompt assets first (skip in Docker where file already exists)
if (!process.env.DOCKER_BUILD) {
  console.log('📝 Generating prompt assets...')
  await $`cd ${join(__dirname, '../../..')} && bun scripts/generate-prompt-assets.ts`
}

const distDir = join(__dirname, '..', 'dist')
const srcDir = join(__dirname, '..', 'src')
const publicDir = join(__dirname, '..', 'public')

try {
  // Clean dist directory
  if (existsSync(distDir)) {
    rmSync(distDir, { recursive: true, force: true })
  }
  mkdirSync(distDir, { recursive: true })

  console.log('📦 Bundling with optimizations...')

  // Build with Bun - production optimizations
  await $`bun build ${join(srcDir, 'main.ts')} \
    --outdir ${distDir} \
    --target node \
    --minify \
    --sourcemap \
    --external pg`

  // Copy public assets
  if (existsSync(publicDir)) {
    console.log('📁 Copying public assets...')
    cpSync(publicDir, join(distDir, 'public'), { recursive: true })
  }

  // Create a minimal package.json for production
  const pkgJson = {
    name: packageJson.name,
    version: packageJson.version,
    type: 'module',
    main: 'main.js',
    dependencies: {
      // Only include runtime dependencies that weren't bundled
      // pg is marked as external in the build, so it needs to be included
      pg: packageJson.dependencies?.pg || '^8.13.1',
    },
  }

  writeFileSync(join(distDir, 'package.json'), JSON.stringify(pkgJson, null, 2))

  // Create entry point wrapper
  const entryWrapper = `#!/usr/bin/env node
// Production entry point for Claude Nexus Dashboard
process.env.NODE_ENV = 'production';

import('./main.js').catch(err => {
  console.error('Failed to start dashboard service:', err);
  process.exit(1);
});
`

  writeFileSync(join(distDir, 'index.js'), entryWrapper)
  await $`chmod +x ${join(distDir, 'index.js')}`

  // Generate size report using cross-platform methods
  const mainFilePath = join(distDir, 'main.js')
  const mainStats = statSync(mainFilePath)
  const mainSizeMB = (mainStats.size / 1024 / 1024).toFixed(2)

  // Calculate total directory size
  const getTotalSize = (dir: string): number => {
    const files = readdirSync(dir)
    let totalSize = 0

    for (const file of files) {
      const filePath = join(dir, file)
      const stats = statSync(filePath)

      if (stats.isDirectory()) {
        totalSize += getTotalSize(filePath)
      } else {
        totalSize += stats.size
      }
    }

    return totalSize
  }

  const totalSize = getTotalSize(distDir)
  const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2)

  console.log('✅ Build completed successfully!')
  console.log(`📦 Output: ${distDir}`)
  console.log(`📊 Bundle size: ${mainSizeMB}MB (main.js)`)
  console.log(`📁 Total size: ${totalSizeMB}MB`)
} catch (error) {
  console.error('❌ Build failed:', error)
  // Provide more context if available
  if (error instanceof Error) {
    console.error('Error details:', error.message)
    if (error.stack) {
      console.error('Stack trace:', error.stack)
    }
  }
  process.exit(1)
}
