import assert from "node:assert/strict"
import type { Profiler, Runtime } from "node:inspector"
import { percentile } from "../../stats.mts"

export const categories = [
  "type-projection",
  "ast",
  "schema-object",
  "make-sync",
  "make-effect",
  "make-option",
  "schema-api",
  "fixture",
  "gc",
  "runtime"
] as const
type Category = typeof categories[number]
type Frame = Runtime.CallFrame

const inFile = (frame: Frame, suffix: string) => frame.url.endsWith(suffix)
const parserFunction = (frame: Frame, name: string) =>
  inFile(frame, "/src/SchemaParser.ts") && frame.functionName === name

// Innermost first. Each sample belongs to exactly one category; parents are
// never added to child costs. The Option adapter includes its own makeEffect.
export function classify(stack: ReadonlyArray<Frame>): Category {
  if (stack[0]?.functionName === "(garbage collector)") return "gc"
  const sync = stack.findIndex((frame) => parserFunction(frame, "make"))
  if (sync >= 0) {
    if (stack.slice(0, sync).some((frame) => parserFunction(frame, "makeConstructorSync"))) return "make-sync"
    return sync > 0 ? "type-projection" : "make-sync"
  }
  if (stack.some((frame) => parserFunction(frame, "makeOption"))) return "make-option"
  if (stack.some((frame) => parserFunction(frame, "makeEffect"))) return "make-effect"
  const centralMake = stack.findIndex((frame) =>
    inFile(frame, "/src/internal/schema/make.ts") && frame.functionName === "make"
  )
  // V8 can inline SchemaParser.make and omit its frame. In these fixtures,
  // central make has no getter-bearing options: its only eager AST/Function
  // subtree is toType, including the WeakMap memoizer in Function.ts.
  if (
    centralMake > 0 &&
    stack.slice(0, centralMake).some((frame) => inFile(frame, "/src/SchemaAST.ts") || inFile(frame, "/src/Function.ts"))
  ) return "type-projection"
  if (stack.some((frame) => inFile(frame, "/src/SchemaAST.ts"))) return "ast"
  if (centralMake >= 0) {
    return "schema-object"
  }
  if (stack.some((frame) => frame.url.includes("/packages/effect/src/"))) return "schema-api"
  if (
    stack.some((frame) => inFile(frame, "/schema-construction/fixtures.mts") || frame.functionName === "constructBatch")
  ) {
    return "fixture"
  }
  return "runtime"
}

export function analyzeProfile(profile: Profiler.Profile) {
  const { nodes, samples, timeDeltas } = profile
  assert.ok(samples && timeDeltas && samples.length === timeDeltas.length)
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const parents = new Map<number, number>()
  for (const node of nodes) for (const child of node.children ?? []) parents.set(child, node.id)
  const stacks = new Map<number, Array<Frame>>()
  for (const node of nodes) {
    const frames: Array<Frame> = []
    const seen = new Set<number>()
    let id: number | undefined = node.id
    while (id !== undefined) {
      assert.ok(!seen.has(id), "Cycle in CPU profile")
      seen.add(id)
      const current = byId.get(id)
      assert.ok(current, "Missing profile node")
      frames.push(current.callFrame)
      id = parents.get(id)
    }
    stacks.set(node.id, frames)
  }
  const inBatch = samples.map((id) =>
    stacks.get(id)!.some((frame) =>
      frame.functionName === "constructBatch" && inFile(frame, "/schema-construction/worker.mts")
    )
  )
  const first = inBatch.indexOf(true)
  const last = inBatch.lastIndexOf(true)
  const counts = Object.fromEntries(categories.map((category) => [category, 0])) as Record<Category, number>
  const sites = new Map<string, { category: Category; frame: Frame; samples: number }>()
  const lineTicks = new Map<string, { category: Category; url: string; line: number; ticks: number }>()
  const sampledNodes = new Set<number>()
  if (first < 0) {
    return { counts, totalSamples: 0, spanUs: 0, excludedSamples: samples.length, sites: [], lineTicks: [] }
  }
  let spanUs = 0
  for (let index = first; index <= last; index++) {
    const stack = stacks.get(samples[index])!
    const category = classify(stack)
    sampledNodes.add(samples[index])
    counts[category]++
    if (index > first) spanUs += timeDeltas[index]
    const frame = stack[0]
    const key = `${category}:${frame.url}:${frame.lineNumber}:${frame.columnNumber}:${frame.functionName}`
    const site = sites.get(key) ?? { category, frame, samples: 0 }
    site.samples++
    sites.set(key, site)
  }
  for (const id of sampledNodes) {
    const node = byId.get(id)!
    const stack = stacks.get(id)!
    if (!stack.some((frame) => frame.functionName === "constructBatch")) continue
    for (const position of node.positionTicks ?? []) {
      const category = classify(stack)
      const url = node.callFrame.url
      const key = `${category}:${url}:${position.line}`
      const entry = lineTicks.get(key) ?? { category, url, line: position.line, ticks: 0 }
      entry.ticks += position.ticks
      lineTicks.set(key, entry)
    }
  }
  return {
    counts,
    totalSamples: last - first + 1,
    spanUs,
    excludedSamples: samples.length - (last - first + 1),
    sites: [...sites.values()].sort((a, b) => b.samples - a.samples),
    lineTicks: [...lineTicks.values()].sort((a, b) => b.ticks - a.ticks)
  }
}

// Resample whole fresh processes, preserving correlation among their samples.
// The point estimate is the mean process share, giving each process equal weight.
export function shareInterval(values: ReadonlyArray<number>, iterations = 10_000) {
  assert.ok(values.length > 0 && values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1))
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  let state = 0x5eed1234
  const draws = new Array(iterations)
  for (let iteration = 0; iteration < iterations; iteration++) {
    let sum = 0
    for (let index = 0; index < values.length; index++) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      sum += values[Math.floor(state / 0x100000000 * values.length)]
    }
    draws[iteration] = sum / values.length
  }
  return { mean, low: percentile(draws, 0.025), high: percentile(draws, 0.975) }
}
