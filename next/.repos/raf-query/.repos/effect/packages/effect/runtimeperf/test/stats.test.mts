import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { aggregate, analyzePairs, bootstrapMedianLogRatio, median, percentile } from "../stats.mts"

describe("runtimeperf stats", () => {
  it("calculates medians and percentiles", () => {
    assert.equal(median([3, 1, 2]), 2)
    assert.equal(median([4, 1, 3, 2]), 2.5)
    assert.equal(percentile([1, 2, 3, 4, 5], 0.5), 3)
  })

  it("aggregates raw observations", () => {
    assert.deepEqual(aggregate([10, 12, 14]), {
      median: 12,
      min: 10,
      max: 14,
      mad: 2
    })
  })

  it("classifies improvements, regressions and parity", () => {
    const options = { iterations: 1_000, seed: 1 }
    assert.equal(analyzePairs([100, 101, 99], [80, 81, 79], options).status, "improvement")
    assert.equal(analyzePairs([100, 101, 99], [120, 121, 119], options).status, "regression")
    assert.equal(analyzePairs([100, 101, 99], [100, 101, 99], options).status, "inconclusive")
  })

  it("keeps exact percentage thresholds inconclusive", () => {
    const options = { iterations: 100, seed: 1 }
    assert.equal(analyzePairs([100, 100, 100], [98, 98, 98], options).status, "inconclusive")
    assert.equal(analyzePairs([100, 100, 100], [105, 105, 105], options).status, "inconclusive")
  })

  it("is deterministic for a fixed seed", () => {
    const first = bootstrapMedianLogRatio([0.8, 0.9, 1], { iterations: 1_000, seed: 42 })
    const second = bootstrapMedianLogRatio([0.8, 0.9, 1], { iterations: 1_000, seed: 42 })
    assert.deepEqual(first, second)
  })

  it("rejects invalid input", () => {
    assert.throws(() => median([]), /non-empty/)
    assert.throws(() => percentile([1], 2), /between 0 and 1/)
    assert.throws(() => bootstrapMedianLogRatio([0]), /finite positive/)
    assert.throws(() => analyzePairs([1], [1, 2]), /same number/)
  })
})
