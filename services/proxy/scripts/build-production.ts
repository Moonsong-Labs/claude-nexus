#!/usr/bin/env bun

import { $ } from 'bun'
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

console.log('🏗️  Building Claude Nexus Proxy Service for Production...')

const distDir = join(__dirname, '..', 'dist')
const srcDir = join(__dirname, '..', 'src')
const pkgPath = join(__dirname, '..', 'package.json')

// Read package.json for dynamic values
const sourcePkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
// Also read root package.json for workspace dependencies
const rootPkgPath = join(__dirname, '..', '..', '..', 'package.json')
const rootPkg = existsSync(rootPkgPath) ? JSON.parse(readFileSync(rootPkgPath, 'utf-8')) : {}

try {
  // Clean dist directory
  if (existsSync(distDir)) {
    rmSync(distDir, { recursive: true, force: true })
  }
  mkdirSync(distDir, { recursive: true })

  console.log('📦 Bundling with optimizations...')

  // Build with Bun - production optimizations
  // - --target node: Optimize for Node.js runtime
  // - --minify: Reduce bundle size
  // - --sourcemap: Enable debugging in production
  // - --external: Keep these as external dependencies to reduce bundle size
  // Use forward slashes for cross-platform compatibility in shell commands
  const mainPath = join(srcDir, 'main.ts').replace(/\\/g, '/')
  const outPath = distDir.replace(/\\/g, '/')

  await $`bun build ${mainPath} \
    --outdir ${outPath} \
    --target node \
    --minify \
    --sourcemap \
    --external pg \
    --external @slack/webhook`

  // Verify build output
  const mainJsPath = join(distDir, 'main.js')
  if (!existsSync(mainJsPath)) {
    throw new Error('Build failed: main.js was not created')
  }

  // Create a minimal package.json for production
  // Extract only the runtime dependencies that are marked as external
  const externalDeps = ['pg', '@slack/webhook']
  const productionDeps: Record<string, string> = {}

  for (const dep of externalDeps) {
    // Check both local and root dependencies (for monorepo)
    if (sourcePkg.dependencies?.[dep]) {
      productionDeps[dep] = sourcePkg.dependencies[dep]
    } else if (rootPkg.dependencies?.[dep]) {
      productionDeps[dep] = rootPkg.dependencies[dep]
    }
  }

  const pkgJson = {
    name: sourcePkg.name || '@claude-nexus/proxy',
    version: sourcePkg.version || '2.0.0',
    type: 'module',
    main: 'main.js',
    dependencies: productionDeps,
  }

  writeFileSync(join(distDir, 'package.json'), JSON.stringify(pkgJson, null, 2))

  // Create entry point wrapper for better error handling
  const entryWrapper = `#!/usr/bin/env node
// Production entry point for Claude Nexus Proxy
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set production environment
process.env.NODE_ENV = 'production';

// Import and run main
import('./main.js').catch(err => {
  console.error('Failed to start proxy service:', err);
  process.exit(1);
});
`

  writeFileSync(join(distDir, 'index.js'), entryWrapper)
  await $`chmod +x ${join(distDir, 'index.js')}`

  // Generate size report using cross-platform methods
  const sizeOutput = await $`du -sh ${distDir}`.text()
  const size = sizeOutput.split('\t')[0]

  // Use Bun's file API for cross-platform file size
  const mainFile = Bun.file(mainJsPath)
  const mainSizeBytes = mainFile.size
  const mainSizeMB = (mainSizeBytes / 1024 / 1024).toFixed(2)

  console.log('✅ Build completed successfully!')
  console.log(`📦 Output: ${distDir}`)
  console.log(`📊 Bundle size: ${mainSizeMB}MB (main.js)`)
  console.log(`📁 Total size: ${size}`)
} catch (error) {
  console.error('❌ Build failed:', error)
  // Provide more context about the failure
  if (error instanceof Error) {
    console.error('Error details:', error.message)
    if (error.stack) {
      console.error('Stack trace:', error.stack)
    }
  }
  process.exit(1)
}
