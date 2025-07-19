import { describe, test, expect } from 'bun:test'
import { stripSystemReminder, containsSystemReminder } from '../system-reminder.js'

describe('stripSystemReminder', () => {
  test('removes system-reminder with no preceding whitespace', () => {
    const input = 'Hello<system-reminder>Internal note</system-reminder>World'
    const expected = 'HelloWorld'
    expect(stripSystemReminder(input)).toBe(expected)
  })

  test('removes system-reminder with two newlines before', () => {
    const input = 'Hello\n\n<system-reminder>Internal note</system-reminder>\nWorld'
    const expected = 'Hello\nWorld'
    expect(stripSystemReminder(input)).toBe(expected)
  })

  test('removes system-reminder with various whitespace before', () => {
    const testCases = [
      {
        input: 'Hello \n<system-reminder>note</system-reminder>World',
        expected: 'HelloWorld',
        desc: 'space and newline',
      },
      {
        input: 'Hello\t\n<system-reminder>note</system-reminder>World',
        expected: 'HelloWorld',
        desc: 'tab and newline',
      },
      {
        input: 'Hello   <system-reminder>note</system-reminder>World',
        expected: 'HelloWorld',
        desc: 'multiple spaces',
      },
      {
        input: 'Hello\r\n\r\n<system-reminder>note</system-reminder>World',
        expected: 'HelloWorld',
        desc: 'Windows line endings',
      },
    ]

    testCases.forEach(({ input, expected }) => {
      expect(stripSystemReminder(input)).toBe(expected)
    })
  })

  test('removes multiple system-reminder blocks', () => {
    const input = `First<system-reminder>note1</system-reminder>Middle
    
<system-reminder>note2</system-reminder>End`
    const expected = 'FirstMiddleEnd'
    expect(stripSystemReminder(input)).toBe(expected)
  })

  test('handles multi-line content within system-reminder', () => {
    const input = `Text before
<system-reminder>
This is a
multi-line
system reminder
with various content
</system-reminder>
Text after`
    const expected = `Text before
Text after`
    expect(stripSystemReminder(input)).toBe(expected)
  })

  test('handles case-insensitive matching', () => {
    const input = 'Hello<SYSTEM-REMINDER>note</SYSTEM-REMINDER>World'
    const expected = 'HelloWorld'
    expect(stripSystemReminder(input)).toBe(expected)
  })

  test('handles empty system-reminder blocks', () => {
    const input = 'Hello<system-reminder></system-reminder>World'
    const expected = 'HelloWorld'
    expect(stripSystemReminder(input)).toBe(expected)
  })

  test('preserves text without system-reminder', () => {
    const input = 'This is normal text without any system reminders'
    expect(stripSystemReminder(input)).toBe(input)
  })

  test('preserves legitimate text containing the tag name', () => {
    // Only removes when there's a complete tag pair
    const input = 'The text "<system-reminder>" is used for internal notes'
    expect(stripSystemReminder(input)).toBe(input)
  })

  test('removes system-reminder at start of text', () => {
    const input = '<system-reminder>Starting note</system-reminder>Rest of text'
    const expected = 'Rest of text'
    expect(stripSystemReminder(input)).toBe(expected)
  })

  test('removes system-reminder at end of text', () => {
    const input = 'Start of text<system-reminder>Ending note</system-reminder>'
    const expected = 'Start of text'
    expect(stripSystemReminder(input)).toBe(expected)
  })

  test('handles system-reminder spanning entire text', () => {
    const input = '<system-reminder>This is the entire content</system-reminder>'
    const expected = ''
    expect(stripSystemReminder(input)).toBe(expected)
  })
})

describe('containsSystemReminder', () => {
  test('detects system-reminder in text', () => {
    expect(containsSystemReminder('Hello<system-reminder>note</system-reminder>World')).toBe(true)
  })

  test('detects case-insensitive system-reminder', () => {
    expect(containsSystemReminder('Hello<SYSTEM-REMINDER>note</SYSTEM-REMINDER>World')).toBe(true)
  })

  test('returns false when no system-reminder present', () => {
    expect(containsSystemReminder('This is normal text')).toBe(false)
  })

  test('returns false for incomplete tags', () => {
    expect(containsSystemReminder('Text with <system-reminder> but no closing tag')).toBe(false)
  })

  test('handles null input', () => {
    // @ts-expect-error Testing runtime behavior with invalid input
    expect(containsSystemReminder(null)).toBe(false)
  })

  test('handles undefined input', () => {
    // @ts-expect-error Testing runtime behavior with invalid input
    expect(containsSystemReminder(undefined)).toBe(false)
  })

  test('handles non-string input', () => {
    // @ts-expect-error Testing runtime behavior with invalid input
    expect(containsSystemReminder(123)).toBe(false)
  })
})

describe('stripSystemReminder edge cases', () => {
  test('handles null input', () => {
    // @ts-expect-error Testing runtime behavior with invalid input
    expect(stripSystemReminder(null)).toBe('')
  })

  test('handles undefined input', () => {
    // @ts-expect-error Testing runtime behavior with invalid input
    expect(stripSystemReminder(undefined)).toBe('')
  })

  test('handles non-string input', () => {
    // @ts-expect-error Testing runtime behavior with invalid input
    expect(stripSystemReminder(123)).toBe('')
  })
})
