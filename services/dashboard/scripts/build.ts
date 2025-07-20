#!/usr/bin/env bun

/**
 * build.ts
 *
 * Unified build script for Claude Nexus Dashboard Service.
 *
 * This script handles both development and production builds:
 *
 * Development mode (--dev flag):
 * - Fast builds without minification
 * - Inline source maps for easier debugging
 * - Skips production-only optimizations
 *
 * Production mode (default):
 * - Source code minification and bundling
 * - External source map generation
 * - Public asset copying
 * - Production-ready package.json generation
 * - Executable entry point wrapper
 * - Build size reporting
 *
 * Usage:
 *   bun run build.ts          # Production build
 *   bun run build.ts --dev    # Development build
 *
 * Used by: Docker builds, CI/CD pipelines, development workflow
 */

import { $ } from 'bun'
import { existsSync, mkdirSync, rmSync, writeFileSync, cpSync, statSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import packageJson from '../package.json' assert { type: 'json' }

const __dirname = dirname(fileURLToPath(import.meta.url))

// Parse command line arguments
const isDev = process.argv.includes('--dev')
const buildMode = isDev ? 'Development' : 'Production'

console.log(`🏗️  Building Claude Nexus Dashboard Service for ${buildMode}...`)

// Generate prompt assets first (skip in Docker where file already exists)
// Only needed for production builds
if (!process.env.DOCKER_BUILD && !isDev) {
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

  console.log(`📦 Bundling with ${isDev ? 'development' : 'production'} optimizations...`)

  // Build with Bun - conditional optimizations based on mode
  const buildCommand = [
    'bun',
    'build',
    join(srcDir, 'main.ts'),
    '--outdir',
    distDir,
    '--target',
    'node',
    '--external',
    'pg',
  ]

  if (isDev) {
    // Development: faster builds, inline sourcemaps for debugging
    buildCommand.push('--sourcemap=inline')
  } else {
    // Production: minified code, external sourcemaps
    buildCommand.push('--minify', '--sourcemap')
  }

  await $`${buildCommand}`

  // Copy public assets (always needed)
  if (existsSync(publicDir)) {
    console.log('📁 Copying public assets...')
    cpSync(publicDir, join(distDir, 'public'), { recursive: true })
  }

  if (isDev) {
    // Development mode: simple package.json copy for faster builds
    console.log('📄 Copying package.json for development...')
    await $`cp ${join(__dirname, '..', 'package.json')} ${distDir}/`

    // Make the main file executable
    await $`chmod +x ${join(distDir, 'main.js')}`
  } else {
    // Production mode: create minimal package.json and entry wrapper
    console.log('📄 Creating production package.json...')
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
    console.log('🚀 Creating production entry point...')
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
  }

  console.log('✅ Build completed successfully!')
  console.log(`📦 Output: ${distDir}`)

  // Size reporting for production builds only
  if (!isDev) {
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

    console.log(`📊 Bundle size: ${mainSizeMB}MB (main.js)`)
    console.log(`📁 Total size: ${totalSizeMB}MB`)
  }
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
