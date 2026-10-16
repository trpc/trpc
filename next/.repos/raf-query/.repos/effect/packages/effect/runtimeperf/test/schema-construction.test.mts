import assert from "node:assert/strict"
import type { Profiler, Runtime } from "node:inspector"
import { describe, it } from "node:test"
import { analyzeProfile, classify, shareInterval } from "../suites/schema-construction/profile.mts"

const frame = (functionName: string, file = ""): Runtime.CallFrame => ({
  functionName,
  url: file ? `file:///repo/packages/effect/${file}` : "",
  scriptId: "1",
  lineNumber: 0,
  columnNumber: 0
})
const make = frame("make", "src/internal/schema/make.ts")
const sync = frame("make", "src/SchemaParser.ts")
const effect = frame("makeEffect", "src/SchemaParser.ts")
const option = frame("makeOption", "src/SchemaParser.ts")
const ast = frame("Objects", "src/SchemaAST.ts")

describe("schema construction attribution", () => {
  it("attributes the type traversal to the maker, without counting it again as AST construction", () => {
    assert.equal(classify([ast, sync, make]), "type-projection")
    assert.equal(classify([frame("", "src/Function.ts"), sync, make]), "type-projection")
    assert.equal(classify([ast, make]), "type-projection")
    assert.equal(classify([frame("", "src/Function.ts"), make]), "type-projection")
    assert.equal(classify([ast, frame("Struct", "src/Schema.ts")]), "ast")
    assert.equal(classify([sync, make]), "make-sync")
    assert.equal(classify([frame("makeConstructorSync", "src/SchemaParser.ts"), sync, make]), "make-sync")
  })
  it("keeps the second effect maker inside the Option adapter", () => {
    assert.equal(classify([effect, option, make]), "make-option")
    assert.equal(classify([effect, make]), "make-effect")
    assert.equal(classify([make]), "schema-object")
  })
  it("excludes profiler setup and includes GC only between construction samples", () => {
    const node = (id: number, callFrame: Runtime.CallFrame, children: Array<number> = []): Profiler.ProfileNode => ({
      id,
      callFrame,
      children
    })
    const profile: Profiler.Profile = {
      startTime: 1000,
      endTime: 2000,
      nodes: [
        node(1, frame("(root)"), [2, 3, 4]),
        node(2, frame("dispatch")),
        node(3, frame("constructBatch", "runtimeperf/suites/schema-construction/worker.mts"), [5]),
        node(4, frame("(garbage collector)")),
        node(5, make)
      ],
      samples: [2, 4, 5, 4, 5, 2, 4],
      timeDeltas: [100, 100, 100, 100, 100, 100, 100]
    }
    const result = analyzeProfile(profile)
    assert.equal(result.totalSamples, 3)
    assert.equal(result.excludedSamples, 4)
    assert.equal(result.spanUs, 200)
    assert.equal(result.counts["schema-object"], 2)
    assert.equal(result.counts.gc, 1)
    assert.equal(Object.values(result.counts).reduce((a, b) => a + b, 0), result.totalSamples)
    assert.equal(analyzeProfile({ ...profile, samples: [2], timeDeltas: [100] }).totalSamples, 0)
  })
  it("retains zero shares and uses reproducible process-level intervals", () => {
    assert.deepEqual(shareInterval([0, 0], 100), { mean: 0, low: 0, high: 0 })
    assert.deepEqual(shareInterval([0.2, 0.5, 0.8], 100), shareInterval([0.2, 0.5, 0.8], 100))
    assert.equal(shareInterval([0, 1], 100).mean, 0.5)
    assert.throws(() => shareInterval([]), /assert|false/i)
  })
})
