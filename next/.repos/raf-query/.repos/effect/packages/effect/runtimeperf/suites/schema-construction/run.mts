import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import { basename, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { aggregate, analyzePairs, median } from "../../stats.mts"
import { caseNames } from "./fixtures.mts"
import { analyzeProfile, categories, shareInterval } from "./profile.mts"

const [outputArgument = "tmp/schema-construction", roundsArgument = "24", countArgument = "1000", namesArgument] =
  process.argv.slice(2)
const rounds = Number(roundsArgument)
const count = Number(countArgument)
assert.ok(Number.isSafeInteger(rounds) && rounds > 0)
assert.ok(Number.isSafeInteger(count) && count > 1)
const names = namesArgument ? namesArgument.split(",") : caseNames
assert.ok(names.length > 0 && names.every((name) => caseNames.includes(name)) && new Set(names).size === names.length)
const root = process.cwd()
const output = resolve(outputArgument)
const worker = fileURLToPath(new URL("./worker.mts", import.meta.url))
const git = (...args: Array<string>) => execFileSync("git", args, { encoding: "utf8" }).trim()
const revision = git("rev-parse", "HEAD")
const sourceTree = git("rev-parse", "HEAD:packages/effect/src")
assert.equal(
  git("status", "--porcelain", "--untracked-files=all", "--", "packages/effect/src"),
  "",
  "Source must be clean"
)
const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex")
const harnessFiles = ["fixtures.mts", "worker.mts", "profile.mts", "run.mts"].map((name) =>
  fileURLToPath(new URL(name, import.meta.url))
)
const hashes = Object.fromEntries(
  [...harnessFiles, "packages/effect/runtimeperf/stats.mts", "pnpm-lock.yaml"].map((path) => [path, sha256(path)])
)
const intervals = [0, 100, 500]
// All six permutations balance both absolute order and pair order.
const orders = [[0, 100, 500], [500, 100, 0], [100, 0, 500], [500, 0, 100], [0, 500, 100], [100, 500, 0]]
const runWorker = (args: Array<string>) =>
  JSON.parse(execFileSync(process.execPath, [worker, ...args], {
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024
  }))
mkdirSync(output, { recursive: false })
mkdirSync(join(output, "profiles"))
mkdirSync(join(output, "harness"))
for (const file of [...harnessFiles, "packages/effect/runtimeperf/stats.mts"]) {
  copyFileSync(file, join(output, "harness", basename(file)))
}
const report = {
  complete: false,
  environment: {
    date: new Date().toISOString(),
    node: process.version,
    v8: process.versions.v8,
    arch: process.arch,
    platform: process.platform,
    release: os.release(),
    cpu: os.cpus()[0]?.model,
    execArgv: process.execArgv,
    nodeOptions: process.env.NODE_OPTIONS ?? ""
  },
  source: { revision, sourceTree, hashes, status: git("status", "--short") },
  measurement: { rounds, count, names, intervals, orders, warmup: false, bootstrapIterations: 10_000 },
  validations: [] as Array<unknown>,
  results: [] as Array<any>,
  summaries: [] as Array<any>
}
const save = () => writeFileSync(join(output, "results.json"), JSON.stringify(report, null, 2))
try {
  for (const name of names) report.validations.push(runWorker(["validate", name]))
  save()
  for (let round = 0; round < rounds; round++) {
    const rotation = round % names.length
    for (const name of [...names.slice(rotation), ...names.slice(0, rotation)]) {
      for (const interval of orders[round % orders.length]) {
        const profilePath = interval > 0 ? join(output, "profiles", `${name}-${round}-${interval}.cpuprofile`) : ""
        const sample = runWorker(["measure", name, String(count), String(interval), profilePath])
        assert.equal(sample.name, name)
        assert.equal(sample.count, count)
        assert.equal(sample.interval, interval)
        assert.ok(Number.isFinite(sample.elapsedMs) && sample.elapsedMs > 0)
        report.results.push({
          round,
          ...sample,
          ...(profilePath ? { profile: analyzeProfile(JSON.parse(readFileSync(profilePath, "utf8"))) } : {})
        })
      }
    }
    save()
    process.stderr.write(`construction round ${round + 1}/${rounds} complete\n`)
  }
  assert.equal(git("rev-parse", "HEAD"), revision, "HEAD changed during measurement")
  assert.equal(git("status", "--porcelain", "--untracked-files=all", "--", "packages/effect/src"), "", "Source changed")
  for (const [path, hash] of Object.entries(hashes)) {
    assert.equal(sha256(path), hash, `${path} changed during measurement`)
  }
  assert.equal(report.results.length, rounds * names.length * intervals.length)
  for (const name of names) {
    const baseline = report.results.filter((sample) => sample.name === name && sample.interval === 0)
    report.summaries.push({
      name,
      baselineMs: aggregate(baseline.map((sample) => sample.elapsedMs)),
      profiles: intervals.filter((interval) => interval > 0).map((interval) => {
        const samples = report.results.filter((sample) => sample.name === name && sample.interval === interval)
        const observed = samples.filter((sample) => sample.profile.totalSamples > 0)
        assert.deepEqual(samples.map((sample) => sample.round), baseline.map((sample) => sample.round))
        const sites = new Map<string, any>()
        for (const sample of samples) {
          for (const site of sample.profile.sites) {
            const frame = site.frame
            const key = `${site.category}:${frame.url}:${frame.lineNumber}:${frame.columnNumber}:${frame.functionName}`
            const existing = sites.get(key) ?? { ...site, samples: 0 }
            existing.samples += site.samples
            sites.set(key, existing)
          }
        }
        return {
          interval,
          elapsedMs: aggregate(samples.map((sample) => sample.elapsedMs)),
          overhead: analyzePairs(baseline.map((sample) => sample.elapsedMs), samples.map((sample) => sample.elapsedMs)),
          sampleCount: samples.reduce((sum, sample) => sum + sample.profile.totalSamples, 0),
          observedProcesses: observed.length,
          sparseProcesses: samples.filter((sample) => sample.profile.totalSamples < 10).length,
          medianSpanCoverage: median(samples.map((sample) => sample.profile.spanUs / 1000 / sample.elapsedMs)),
          shares: Object.fromEntries(categories.map((category) => [
            category,
            observed.length > 0
              ? shareInterval(observed.map((sample) => sample.profile.counts[category] / sample.profile.totalSamples))
              : null
          ])),
          topSites: [...sites.values()].sort((a, b) => b.samples - a.samples).slice(0, 20)
        }
      })
    })
  }
  report.complete = true
} finally {
  save()
}
process.stdout.write(`${join(output, "results.json")}\n`)
