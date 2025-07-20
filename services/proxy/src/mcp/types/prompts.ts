/**
 * Prompt-specific types for MCP server
 */

/**
 * Format for YAML prompt files used by the MCP server.
 * These files are loaded from the filesystem and served via the MCP protocol.
 */
export interface YamlPromptFormat {
  /**
   * The name of the prompt as displayed in the MCP client.
   * Note: In practice, this is overridden by the filename (without extension).
   * For example, a file named 'feature.yaml' will be available as '/feature'.
   */
  name: string

  /**
   * Optional description of the prompt's purpose and usage.
   * This helps users understand when and how to use the prompt.
   */
  description?: string

  /**
   * The Handlebars template string that defines the prompt.
   * Supports variables using {{variable}} syntax and conditionals
   * using {{#if condition}}...{{/if}} blocks.
   *
   * @example
   * ```
   * You are {{role}}.
   * {{#if context}}
   * Context: {{context}}
   * {{/if}}
   * ```
   */
  template: string
}
