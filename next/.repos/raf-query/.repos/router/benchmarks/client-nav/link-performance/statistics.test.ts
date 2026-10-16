import { expect, test } from 'vitest'
import { classify, mean, summarizeRatios } from './statistics'

test('summarizes multiplicative paired changes across process replicas', () => {
  const result = summarizeRatios([0.9, 0.9, 0.9, 0.9])
  expect(result.changePercent).toBeCloseTo(-10)
  expect(result.low95).toBeCloseTo(-10)
  expect(result.high95).toBeCloseTo(-10)
  expect(result.replicas).toBe(4)
})

test('does not turn opposite noisy runs into a conclusive result', () => {
  const result = summarizeRatios([0.9, 1.1, 0.95, 1.05])
  expect(result.low95).toBeLessThan(0)
  expect(result.high95).toBeGreaterThan(0)
  expect(classify(result, result)).toBe('inconclusive')
})

test('requires CPU and wall time to corroborate a direction', () => {
  const slower = summarizeRatios([1.08, 1.09, 1.08, 1.09])
  const faster = summarizeRatios([0.9, 0.91, 0.9, 0.91])
  expect(classify(slower, slower)).toBe('slower')
  expect(classify(faster, faster)).toBe('faster')
  expect(classify(slower, faster)).toBe('inconclusive')
  expect(classify(summarizeRatios([1, 1, 1]), summarizeRatios([1, 1, 1]))).toBe(
    'within-2%',
  )
})

test('rejects incomplete or invalid sampling data', () => {
  expect(() => summarizeRatios([1])).toThrow()
  expect(() => summarizeRatios([0, 1])).toThrow()
  expect(() => summarizeRatios([NaN, 1])).toThrow()
  expect(() => mean([])).toThrow()
  expect(() => mean([Infinity])).toThrow()
})
