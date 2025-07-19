/**
 * Utility functions for handling system-reminder blocks in messages
 */

/**
 * Regular expression to match system-reminder blocks with optional surrounding whitespace.
 * Pattern matches:
 * - \s* - any preceding whitespace (spaces, tabs, newlines)
 * - <system-reminder> - opening tag (case-insensitive)
 * - [\s\S]*? - any content including newlines (non-greedy)
 * - </system-reminder> - closing tag (case-insensitive)
 * Flags: g (global - match all occurrences), i (case-insensitive)
 */
const SYSTEM_REMINDER_REGEX = /\s*<system-reminder>[\s\S]*?<\/system-reminder>/gi

/**
 * Removes all system-reminder blocks from text content.
 * Handles various formats including those with preceding whitespace.
 *
 * @param text - The text content to process
 * @returns The text with all system-reminder blocks removed
 *
 * @example
 * stripSystemReminder("Hello\n\n<system-reminder>Internal note</system-reminder>\nWorld")
 * // Returns: "Hello\nWorld"
 *
 * stripSystemReminder("Text with <system-reminder>note</system-reminder> inline")
 * // Returns: "Text with  inline"
 */
export function stripSystemReminder(text: string): string {
  // Handle null/undefined inputs gracefully
  if (typeof text !== 'string') {
    return ''
  }

  return text.replace(SYSTEM_REMINDER_REGEX, '')
}

/**
 * Checks if text contains any system-reminder blocks
 *
 * @param text - The text to check
 * @returns True if text contains system-reminder blocks
 */
export function containsSystemReminder(text: string): boolean {
  // Handle null/undefined inputs gracefully
  if (typeof text !== 'string') {
    return false
  }

  // Create a new RegExp instance to avoid stateful global flag issues with test()
  // The 'g' flag is removed here since we only need to check for existence
  return /\s*<system-reminder>[\s\S]*?<\/system-reminder>/i.test(text)
}
