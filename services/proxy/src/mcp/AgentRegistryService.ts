/**
 * Agent Registry Service
 * Manages Claude Code agents and exposes them as MCP tools
 */

import { logger } from '../middleware/logger.js'
import type { AgentDefinition, AgentInfo } from './types/agents.js'
// import type { Tool } from './types/protocol.js' // TODO: Fix missing Tool type
import { join, resolve, relative } from 'path'
import { readdir, readFile } from 'fs/promises'
import * as yaml from 'yaml'

// Temporary Tool interface definition
interface Tool {
  name: string
  description: string
  inputSchema?: any
}

export class AgentRegistryService {
  private agents = new Map<string, AgentDefinition>()
  private agentsDir: string

  constructor(agentsDir: string = join(process.cwd(), 'agents')) {
    this.agentsDir = agentsDir
    this.loadBuiltInAgents()
    this.loadAgentsFromFiles().catch(err => {
      logger.error('Failed to load agents from files', {
        error: { message: err.message, stack: err.stack },
      })
    })
  }

  /**
   * Load built-in agents
   */
  private loadBuiltInAgents() {
    // Solution Challenger Agent
    this.registerAgent({
      name: 'solution-challenger',
      description:
        'Critically review and challenge proposed solutions, implementations, or architectural decisions. Identifies potential issues, edge cases, performance concerns, and suggests improvements.',
      parameters: {
        type: 'object',
        properties: {
          solution: {
            type: 'string',
            description: 'The solution or implementation to review',
          },
          context: {
            type: 'string',
            description: 'Additional context about the problem being solved',
          },
        },
        required: ['solution'],
      },
      handler: async params => {
        // This would integrate with the actual solution-challenger agent
        // For now, return a placeholder response
        return `Reviewing solution: ${params.solution}\n\nAnalysis in progress...`
      },
    })

    logger.info('Loaded built-in agents', {
      metadata: {
        agentCount: this.agents.size,
        agentNames: Array.from(this.agents.keys()),
      },
    })
  }

  /**
   * Validate that a file path is within the agents directory
   */
  private isPathSafe(filePath: string): boolean {
    const resolvedPath = resolve(filePath)
    const resolvedAgentsDir = resolve(this.agentsDir)
    const relativePath = relative(resolvedAgentsDir, resolvedPath)

    // Path is safe if it doesn't start with .. (outside directory)
    return !relativePath.startsWith('..') && !relativePath.includes('../')
  }

  /**
   * Validate agent definition schema
   */
  private validateAgentDefinition(agentDef: any): boolean {
    if (typeof agentDef !== 'object' || agentDef === null) {
      return false
    }

    // Required fields
    if (typeof agentDef.name !== 'string' || !agentDef.name.trim()) {
      return false
    }

    if (typeof agentDef.description !== 'string' || !agentDef.description.trim()) {
      return false
    }

    // Validate name doesn't contain special characters
    if (!/^[a-zA-Z0-9-_]+$/.test(agentDef.name)) {
      logger.warn('Agent name contains invalid characters', {
        metadata: { name: agentDef.name },
      })
      return false
    }

    // Validate parameters if present
    if (agentDef.parameters) {
      if (
        typeof agentDef.parameters !== 'object' ||
        agentDef.parameters.type !== 'object' ||
        typeof agentDef.parameters.properties !== 'object'
      ) {
        return false
      }
    }

    return true
  }

  /**
   * Load agents from YAML files
   */
  private async loadAgentsFromFiles() {
    try {
      const files = await readdir(this.agentsDir)
      const yamlFiles = files.filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))

      for (const file of yamlFiles) {
        try {
          const filePath = join(this.agentsDir, file)

          // Security: Validate file path
          if (!this.isPathSafe(filePath)) {
            logger.error('Unsafe file path detected', {
              metadata: { file },
            })
            continue
          }

          const content = await readFile(filePath, 'utf-8')

          // Security: Use safe YAML parsing (no custom types)
          const agentDef = yaml.parse(content) as any

          // Validate agent definition
          if (!this.validateAgentDefinition(agentDef)) {
            logger.error('Invalid agent definition', {
              metadata: { file },
            })
            continue
          }

          if (agentDef.name && agentDef.description) {
            // Create a dynamic handler that would interface with Claude Code agents
            const handler = async (params: Record<string, any>) => {
              // This is where we'd integrate with the actual Claude Code agent system
              // For now, return a placeholder that indicates the agent was called
              return `Agent '${agentDef.name}' called with parameters: ${JSON.stringify(params, null, 2)}\n\n[Integration with Claude Code agent system pending]`
            }

            this.registerAgent({
              name: agentDef.name,
              description: agentDef.description,
              parameters: agentDef.parameters,
              handler,
            })

            logger.info('Loaded agent from file', {
              metadata: { file, agentName: agentDef.name },
            })
          }
        } catch (err) {
          logger.error('Failed to load agent file', {
            error: { message: err instanceof Error ? err.message : 'Unknown error' },
            metadata: { file },
          })
        }
      }
    } catch (_err) {
      // Directory might not exist, which is okay
      logger.debug('Agents directory not found or inaccessible', {
        metadata: { agentsDir: this.agentsDir },
      })
    }
  }

  /**
   * Register an agent
   */
  registerAgent(agent: AgentDefinition) {
    this.agents.set(agent.name, agent)
    logger.debug('Registered agent', {
      metadata: { agentName: agent.name },
    })
  }

  /**
   * List all available agents
   */
  listAgents(): AgentInfo[] {
    return Array.from(this.agents.values()).map(agent => ({
      name: agent.name,
      description: agent.description,
      inputSchema: agent.parameters,
    }))
  }

  /**
   * Get agent info
   */
  getAgent(name: string): AgentDefinition | undefined {
    return this.agents.get(name)
  }

  /**
   * Convert agents to MCP tools format
   */
  getToolsForMCP(): Tool[] {
    return Array.from(this.agents.values()).map(agent => ({
      name: agent.name,
      description: agent.description,
      inputSchema: agent.parameters,
    }))
  }

  /**
   * Validate parameters against agent schema
   */
  private validateParameters(agent: AgentDefinition, params: Record<string, any>): string | null {
    if (!agent.parameters) {
      return null // No parameters defined, so any params are valid
    }

    const { properties, required = [] } = agent.parameters

    // Check required parameters
    for (const requiredParam of required) {
      if (!(requiredParam in params)) {
        return `Missing required parameter: ${requiredParam}`
      }
    }

    // Validate parameter types
    for (const [key, value] of Object.entries(params)) {
      if (!properties || !(key in properties)) {
        return `Unknown parameter: ${key}`
      }

      const paramDef = properties[key]
      const expectedType = paramDef.type

      // Basic type validation
      if (expectedType === 'string' && typeof value !== 'string') {
        return `Parameter '${key}' must be a string`
      }
      if (expectedType === 'number' && typeof value !== 'number') {
        return `Parameter '${key}' must be a number`
      }
      if (expectedType === 'boolean' && typeof value !== 'boolean') {
        return `Parameter '${key}' must be a boolean`
      }
      if (expectedType === 'object' && (typeof value !== 'object' || value === null)) {
        return `Parameter '${key}' must be an object`
      }
      if (expectedType === 'array' && !Array.isArray(value)) {
        return `Parameter '${key}' must be an array`
      }
    }

    return null
  }

  /**
   * Execute an agent
   */
  async executeAgent(name: string, params: Record<string, any>): Promise<string> {
    const agent = this.agents.get(name)
    if (!agent) {
      throw new Error(`Agent not found: ${name}`)
    }

    // Validate parameters
    const validationError = this.validateParameters(agent, params)
    if (validationError) {
      throw new Error(`Invalid parameters: ${validationError}`)
    }

    try {
      logger.info('Executing agent', {
        metadata: { agentName: name, params },
      })

      const result = await agent.handler(params)

      logger.info('Agent execution completed', {
        metadata: { agentName: name },
      })

      return result
    } catch (error) {
      logger.error('Agent execution failed', {
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
        metadata: { agentName: name },
      })
      throw error
    }
  }
}
