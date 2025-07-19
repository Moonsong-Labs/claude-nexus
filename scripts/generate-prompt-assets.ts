#!/usr/bin/env bun

/**
 * Generates prompt-assets.ts from the markdown and JSON files
 * This ensures prompt templates are embedded in the build rather than loaded at runtime
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import type { ConversationAnalysis } from '../packages/shared/src/types/ai-analysis.js'
import type { Message } from '../packages/shared/src/prompts/truncation.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const PROMPTS_DIR = join(__dirname, '..', 'packages', 'shared', 'src', 'prompts', 'analysis')
const OUTPUT_FILE = join(PROMPTS_DIR, 'prompt-assets.ts')

// Type definitions for the examples structure
interface AnalysisExample {
  transcript: Message[]
  expectedOutput: ConversationAnalysis
}

interface PromptAssets {
  systemPrompt: string
  examples: AnalysisExample[]
}

function escapeForTemplate(str: string): string {
  // Escape backticks and dollar signs for template literals
  return str.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$')
}

function generatePromptAssets() {
  console.log('🔨 Generating prompt assets...')

  const versions = ['v1'] // Add more versions as needed
  const assets: Record<string, PromptAssets> = {}

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
  let content = `/**
 * @file Embedded prompt assets for AI conversation analysis
 * @generated
 * 
 * DO NOT EDIT! THIS FILE IS AUTO-GENERATED.
 * This file is generated during build to avoid runtime filesystem access.
 * 
 * To make changes:
 * 1. Edit the source files in 'packages/shared/src/prompts/analysis/v1/'
 * 2. Run 'bun run scripts/generate-prompt-assets.ts' to regenerate
 * 
 * Generated on: ${new Date().toISOString()}
 */

import type { Message } from '../truncation.js'
import type { ConversationAnalysis } from '../../types/ai-analysis.js'

/**
 * Structure for analysis examples used in prompts
 */
export interface AnalysisExample {
  /** The conversation transcript to analyze */
  transcript: Message[]
  /** The expected analysis output for this conversation */
  expectedOutput: ConversationAnalysis
}

/**
 * Structure for prompt assets
 */
export interface PromptAssets {
  /** The system prompt template with placeholders */
  systemPrompt: string
  /** Example conversations with expected analysis outputs */
  examples: AnalysisExample[]
}

/**
 * Embedded prompt assets for AI conversation analysis
 * Organized by version (currently only 'v1' is available)
 */
export const PROMPT_ASSETS: Record<string, PromptAssets> = {\n`

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
