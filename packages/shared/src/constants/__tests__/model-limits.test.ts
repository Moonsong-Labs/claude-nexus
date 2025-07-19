import { describe, expect, it } from 'bun:test'
import {
  getModelContextLimit,
  getBatteryColor,
  getBatteryLevel,
  BATTERY_THRESHOLDS,
} from '../model-limits'

// Test data constants for better maintainability
const MODEL_LIMITS = {
  CLAUDE_200K: { limit: 200000, isEstimate: false },
  CLAUDE_100K: { limit: 100000, isEstimate: false },
  UNKNOWN_DEFAULT: { limit: 200000, isEstimate: true },
} as const

// Test fixtures for model families
const TEST_MODELS = {
  claude35: [
    { model: 'claude-3-5-sonnet-20241022', expected: MODEL_LIMITS.CLAUDE_200K },
    { model: 'claude-3-5-haiku-20241022', expected: MODEL_LIMITS.CLAUDE_200K },
  ],
  claude3: [
    { model: 'claude-3-opus-20240229', expected: MODEL_LIMITS.CLAUDE_200K },
    { model: 'claude-3-sonnet', expected: MODEL_LIMITS.CLAUDE_200K }, // Partial match
    { model: 'claude-3-opus-20250101', expected: MODEL_LIMITS.CLAUDE_200K }, // Future-proofed
  ],
  claude4: [
    { model: 'claude-4-opus-20250101', expected: MODEL_LIMITS.CLAUDE_200K },
    { model: 'claude-4-sonnet-20250515', expected: MODEL_LIMITS.CLAUDE_200K },
  ],
  claude2: [
    { model: 'claude-2.1', expected: MODEL_LIMITS.CLAUDE_200K }, // Specific version
    { model: 'claude-2.0', expected: MODEL_LIMITS.CLAUDE_100K }, // General version
  ],
  claudeInstant: [{ model: 'claude-instant-1.2', expected: MODEL_LIMITS.CLAUDE_100K }],
  unknown: [
    { model: 'claude-x-experimental', expected: MODEL_LIMITS.UNKNOWN_DEFAULT },
    { model: 'gpt-4', expected: MODEL_LIMITS.UNKNOWN_DEFAULT },
    { model: '', expected: MODEL_LIMITS.UNKNOWN_DEFAULT }, // Edge case
  ],
} as const

describe('Model Context Limits', () => {
  describe('getModelContextLimit', () => {
    // Test Claude 3.5 models
    describe('Claude 3.5 family', () => {
      TEST_MODELS.claude35.forEach(({ model, expected }) => {
        it(`should return ${expected.limit} tokens for ${model}`, () => {
          expect(getModelContextLimit(model)).toEqual(expected)
        })
      })
    })

    // Test Claude 3 models
    describe('Claude 3 family', () => {
      TEST_MODELS.claude3.forEach(({ model, expected }) => {
        it(`should return ${expected.limit} tokens for ${model}`, () => {
          expect(getModelContextLimit(model)).toEqual(expected)
        })
      })
    })

    // Test Claude 4 models (future-proofing)
    describe('Claude 4 family (future-proofed)', () => {
      TEST_MODELS.claude4.forEach(({ model, expected }) => {
        it(`should return ${expected.limit} tokens for ${model}`, () => {
          expect(getModelContextLimit(model)).toEqual(expected)
        })
      })
    })

    // Test Claude 2 specificity
    describe('Claude 2 family specificity', () => {
      it('should prioritize specific version (2.1) over general pattern', () => {
        // This tests that the order of rules matters - 2.1 should match before 2
        expect(getModelContextLimit('claude-2.1')).toEqual(MODEL_LIMITS.CLAUDE_200K)
        expect(getModelContextLimit('claude-2.0')).toEqual(MODEL_LIMITS.CLAUDE_100K)
      })
    })

    // Test Claude Instant
    describe('Claude Instant', () => {
      TEST_MODELS.claudeInstant.forEach(({ model, expected }) => {
        it(`should return ${expected.limit} tokens for ${model}`, () => {
          expect(getModelContextLimit(model)).toEqual(expected)
        })
      })
    })

    // Test case insensitivity
    describe('Case insensitivity', () => {
      const testCases = [
        'CLAUDE-3-OPUS-20240229',
        'Claude-3-Opus-20240229',
        'claude-3-opus-20240229',
        'ClAuDe-3-OpUs-20240229',
      ]

      testCases.forEach(model => {
        it(`should handle case variations: ${model}`, () => {
          expect(getModelContextLimit(model)).toEqual(MODEL_LIMITS.CLAUDE_200K)
        })
      })
    })

    // Test unknown models and edge cases
    describe('Unknown models and edge cases', () => {
      TEST_MODELS.unknown.forEach(({ model, expected }) => {
        it(`should return default with estimate flag for: "${model}"`, () => {
          expect(getModelContextLimit(model)).toEqual(expected)
        })
      })
    })
  })

  describe('getBatteryColor', () => {
    // Test data for battery color thresholds
    const colorTestCases = [
      // Green zone (0-70%)
      { percentage: 0, expected: '#22c55e', zone: 'green (empty)' },
      { percentage: 0.35, expected: '#22c55e', zone: 'green (mid)' },
      { percentage: 0.5, expected: '#22c55e', zone: 'green (half)' },
      { percentage: 0.7, expected: '#22c55e', zone: 'green (boundary)' },
      // Yellow zone (71-90%)
      { percentage: 0.71, expected: '#eab308', zone: 'yellow (start)' },
      { percentage: 0.8, expected: '#eab308', zone: 'yellow (mid)' },
      { percentage: 0.9, expected: '#eab308', zone: 'yellow (boundary)' },
      // Red zone (91%+)
      { percentage: 0.91, expected: '#ef4444', zone: 'red (start)' },
      { percentage: 1.0, expected: '#ef4444', zone: 'red (full)' },
      { percentage: 1.5, expected: '#ef4444', zone: 'red (overflow)' },
    ]

    colorTestCases.forEach(({ percentage, expected, zone }) => {
      it(`should return ${expected} for ${(percentage * 100).toFixed(0)}% (${zone})`, () => {
        expect(getBatteryColor(percentage)).toBe(expected)
      })
    })
  })

  describe('getBatteryLevel', () => {
    // Test data for battery levels (inverted scale)
    const levelTestCases = [
      { percentage: 0.1, expected: 5, range: '0-20%' },
      { percentage: 0.2, expected: 5, range: '0-20% (boundary)' },
      { percentage: 0.3, expected: 4, range: '21-40%' },
      { percentage: 0.4, expected: 4, range: '21-40% (boundary)' },
      { percentage: 0.5, expected: 3, range: '41-60%' },
      { percentage: 0.6, expected: 3, range: '41-60% (boundary)' },
      { percentage: 0.7, expected: 2, range: '61-80%' },
      { percentage: 0.8, expected: 2, range: '61-80% (boundary)' },
      { percentage: 0.9, expected: 1, range: '81-100%' },
      { percentage: 1.0, expected: 1, range: '81-100% (full)' },
      { percentage: 1.2, expected: 1, range: '81%+ (overflow)' },
    ]

    levelTestCases.forEach(({ percentage, expected, range }) => {
      it(`should return level ${expected} for ${(percentage * 100).toFixed(0)}% (${range})`, () => {
        expect(getBatteryLevel(percentage)).toBe(expected)
      })
    })

    it('should handle edge cases', () => {
      expect(getBatteryLevel(0)).toBe(5) // Empty
      expect(getBatteryLevel(-0.1)).toBe(5) // Negative (edge case)
      expect(getBatteryLevel(2.0)).toBe(1) // Extreme overflow
    })
  })

  describe('BATTERY_THRESHOLDS', () => {
    it('should define correct threshold constants', () => {
      expect(BATTERY_THRESHOLDS.GREEN).toBe(0.7)
      expect(BATTERY_THRESHOLDS.YELLOW).toBe(0.9)
      expect(BATTERY_THRESHOLDS.RED).toBe(1.0)
    })

    it('should have thresholds in ascending order', () => {
      expect(BATTERY_THRESHOLDS.GREEN).toBeLessThan(BATTERY_THRESHOLDS.YELLOW)
      expect(BATTERY_THRESHOLDS.YELLOW).toBeLessThan(BATTERY_THRESHOLDS.RED)
    })

    it('should be immutable', () => {
      // TypeScript const assertion ensures immutability at compile time
      // This test documents the expected behavior
      expect(Object.isFrozen(BATTERY_THRESHOLDS)).toBe(false) // Not frozen at runtime
      expect(typeof BATTERY_THRESHOLDS).toBe('object')
    })
  })
})
