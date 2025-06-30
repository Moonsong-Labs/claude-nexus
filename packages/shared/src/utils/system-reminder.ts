/**
 * Utility functions for handling system-reminder blocks in messages
 */

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
  // Pattern matches:
  // - \s* - any preceding whitespace (spaces, tabs, newlines)
  // - <system-reminder> - opening tag
  // - [\s\S]*? - any content including newlines (non-greedy)
  // - </system-reminder> - closing tag
  // Flags: g (global), i (case-insensitive)
  return text.replace(/\s*<system-reminder>[\s\S]*?<\/system-reminder>/gi, '')
}

/**
 * Checks if text contains any system-reminder blocks
 *
 * @param text - The text to check
 * @returns True if text contains system-reminder blocks
 */
export function containsSystemReminder(text: string): boolean {
  return /<system-reminder>[\s\S]*?<\/system-reminder>/i.test(text)
}
