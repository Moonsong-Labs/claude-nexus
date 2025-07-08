#!/usr/bin/env bun

/**
 * Generates prompt-assets.ts from the markdown and JSON files
 * This ensures prompt templates are embedded in the build rather than loaded at runtime
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const PROMPTS_DIR = join(__dirname, '..', 'packages', 'shared', 'src', 'prompts', 'analysis')
const OUTPUT_FILE = join(PROMPTS_DIR, 'prompt-assets.ts')

function escapeForTemplate(str: string): string {
  // Escape backticks and dollar signs for template literals
  return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$')
}

function generatePromptAssets() {
  console.log('🔨 Generating prompt assets...')

  const versions = ['v1'] // Add more versions as needed
  const assets: Record<string, { systemPrompt: string; examples: any[] }> = {}

  for (const version of versions) {
    const versionDir = join(PROMPTS_DIR, version)

    try {
      // Read system prompt
      const systemPrompt = readFileSync(join(versionDir, 'system-prompt.md'), 'utf-8')

      // Read examples
      const examplesJson = readFileSync(join(versionDir, 'examples.json'), 'utf-8')
      const examples = JSON.parse(examplesJson)

      assets[version] = {
        systemPrompt,
        examples,
      }

      console.log(`✅ Loaded assets for version: ${version}`)
    } catch (error) {
      console.error(`❌ Failed to load assets for version ${version}:`, error)
      process.exit(1)
    }
  }

  // Generate TypeScript file
  let content = `// Generated file containing embedded prompt assets
// This file is generated during build to avoid runtime filesystem access
// Run 'bun run scripts/generate-prompt-assets.ts' to regenerate

export const PROMPT_ASSETS: Record<string, { systemPrompt: string; examples: any[] }> = {\n`

  for (const [version, data] of Object.entries(assets)) {
    content += `  ${version}: {\n`
    content += `    systemPrompt: \`${escapeForTemplate(data.systemPrompt)}\`,\n`
    content += `    examples: ${JSON.stringify(data.examples, null, 6)
      .split('\n')
      .map((line, i) => (i === 0 ? line : '    ' + line))
      .join('\n')}\n`
    content += `  },\n`
  }

  content = content.slice(0, -2) + '\n}\n'

  writeFileSync(OUTPUT_FILE, content)
  console.log(`✅ Generated ${OUTPUT_FILE}`)
}

generatePromptAssets()
