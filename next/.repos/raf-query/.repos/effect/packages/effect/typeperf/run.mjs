import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const args = process.argv.slice(2)
const update = args.includes("--update")
const help = args.includes("--help") || args.includes("-h")
const targets = args.filter((arg) => arg !== "--update" && arg !== "--help" && arg !== "-h")

if (help) {
  console.log(`Usage: pnpm typeperf [suite[/fixture]] [--update]

Options:
  --update  Write exact measured deltas to thresholds.json
`)
  process.exit(0)
}

if (targets.length > 1) {
  console.error(`Expected at most one target, got: ${targets.join(", ")}`)
  process.exit(1)
}

const typeperfDir = dirname(fileURLToPath(import.meta.url))
const effectDir = resolve(typeperfDir, "..")
const repoRoot = resolve(effectDir, "../..")
const tmpDir = join(repoRoot, "tmp", "typeperf", "effect")
const configPath = join(typeperfDir, "config.json")
const effectTsconfigPath = join(effectDir, "tsconfig.json")

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"))

const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

const toAbsolute = (path) => resolve(typeperfDir, path)

const sanitize = (name) => name.replace(/[^a-zA-Z0-9._-]/g, "-")

const writeTempTsconfig = (suiteName, subjectName, sourcePath) => {
  mkdirSync(tmpDir, { recursive: true })
  const id = sanitize(`${suiteName}-${subjectName}`)
  const tsconfigPath = join(tmpDir, `${id}.json`)
  const tsBuildInfoPath = join(tmpDir, `${id}.tsbuildinfo`)
  writeJson(tsconfigPath, {
    extends: effectTsconfigPath,
    files: [sourcePath],
    include: [],
    compilerOptions: {
      noEmit: true,
      declaration: false,
      declarationMap: false,
      sourceMap: false,
      plugins: [],
      rootDir: effectDir,
      incremental: false,
      composite: false,
      tsBuildInfoFile: tsBuildInfoPath
    }
  })
  return tsconfigPath
}

const readMetric = (output, label, metric) => {
  const match = output.match(new RegExp(`^${metric}:\\s+(\\d+)$`, "m"))
  if (!match) {
    throw new Error(`Could not read ${metric} from compiler output for ${label}`)
  }
  return Number(match[1])
}

const readDiagnostics = (output, label) => ({
  instantiations: readMetric(output, label, "Instantiations"),
  types: readMetric(output, label, "Types"),
  symbols: readMetric(output, label, "Symbols")
})

const measure = (suiteName, subjectName, sourcePath) => {
  const tsconfigPath = writeTempTsconfig(suiteName, subjectName, sourcePath)
  const result = spawnSync("pnpm", ["exec", "tsc", "-p", tsconfigPath, "--extendedDiagnostics", "--noEmit"], {
    cwd: effectDir,
    encoding: "utf8"
  })
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    process.stderr.write(output)
    throw new Error(`Compiler failed for ${suiteName}/${subjectName}`)
  }
  return readDiagnostics(output, `${suiteName}/${subjectName}`)
}

const subtractDiagnostics = (total, baseline) => ({
  instantiations: total.instantiations - baseline.instantiations,
  types: total.types - baseline.types,
  symbols: total.symbols - baseline.symbols
})

const formatNumber = (n) => n.toLocaleString("en-US")

const printTable = (rows) => {
  const table = [
    ["suite", "fixture", "instDelta", "instMax", "typesDelta", "typesMax", "symbolsDelta", "status"],
    ...rows.map((row) => [
      row.suite,
      row.fixture,
      formatNumber(row.delta.instantiations),
      row.maxInstantiationsDelta === undefined ? "-" : formatNumber(row.maxInstantiationsDelta),
      formatNumber(row.delta.types),
      row.maxTypesDelta === undefined ? "-" : formatNumber(row.maxTypesDelta),
      formatNumber(row.delta.symbols),
      row.status
    ])
  ]
  const widths = table[0].map((_, index) => Math.max(...table.map((row) => row[index].length)))
  for (const [index, row] of table.entries()) {
    const line = row.map((cell, cellIndex) => cell.padEnd(widths[cellIndex])).join("  ")
    console.log(line)
    if (index === 0) {
      console.log(widths.map((width) => "-".repeat(width)).join("  "))
    }
  }
}

const config = readJson(configPath)
const selectedTarget = targets[0]
const [selectedSuiteName, selectedFixtureName] = selectedTarget === undefined ? [] : selectedTarget.split("/")

if (selectedTarget !== undefined && (selectedSuiteName === "" || selectedFixtureName === "")) {
  console.error(`Invalid target: ${selectedTarget}`)
  process.exit(1)
}

const rows = []
let failed = false
let matchedTarget = false

for (const suite of config.suites) {
  if (selectedSuiteName !== undefined && suite.name !== selectedSuiteName) {
    continue
  }
  matchedTarget = selectedFixtureName === undefined
  const baselinePath = toAbsolute(suite.baseline)
  const thresholdsPath = toAbsolute(suite.thresholds)
  const thresholds = existsSync(thresholdsPath) ? readJson(thresholdsPath) : {}
  const baseline = measure(suite.name, "baseline", baselinePath)

  for (const fixture of suite.fixtures) {
    if (selectedFixtureName !== undefined && fixture.name !== selectedFixtureName) {
      continue
    }
    matchedTarget = true
    const fixturePath = toAbsolute(fixture.file)
    const total = measure(suite.name, fixture.name, fixturePath)
    const delta = subtractDiagnostics(total, baseline)
    const threshold = thresholds[fixture.name]
    const maxInstantiationsDelta = typeof threshold?.maxInstantiationsDelta === "number"
      ? threshold.maxInstantiationsDelta
      : undefined
    const maxTypesDelta = typeof threshold?.maxTypesDelta === "number" ? threshold.maxTypesDelta : undefined
    let status

    if (update) {
      thresholds[fixture.name] = {
        maxInstantiationsDelta: delta.instantiations,
        maxTypesDelta: delta.types
      }
      status = "updated"
    } else {
      const missing = [
        maxInstantiationsDelta === undefined ? "instantiations" : undefined,
        maxTypesDelta === undefined ? "types" : undefined
      ].filter((metric) => metric !== undefined)
      const exceeded = [
        maxInstantiationsDelta !== undefined && delta.instantiations > maxInstantiationsDelta
          ? "instantiations"
          : undefined,
        maxTypesDelta !== undefined && delta.types > maxTypesDelta ? "types" : undefined
      ].filter((metric) => metric !== undefined)

      if (missing.length > 0) {
        status = `missing:${missing.join(",")}`
        failed = true
      } else if (exceeded.length > 0) {
        status = `fail:${exceeded.join(",")}`
        failed = true
      } else {
        status = "ok"
      }
    }

    rows.push({
      suite: suite.name,
      fixture: fixture.name,
      delta,
      maxInstantiationsDelta: update ? delta.instantiations : maxInstantiationsDelta,
      maxTypesDelta: update ? delta.types : maxTypesDelta,
      status
    })
  }

  if (update) {
    writeJson(thresholdsPath, thresholds)
    console.log(`Updated ${relative(repoRoot, thresholdsPath)}`)
  }
}

if (!matchedTarget) {
  const availableTargets = config.suites.flatMap((suite) => [
    suite.name,
    ...suite.fixtures.map((fixture) => `${suite.name}/${fixture.name}`)
  ])
  console.error(`Unknown typeperf target: ${selectedTarget}`)
  console.error(`Available targets:\n${availableTargets.map((target) => `  - ${target}`).join("\n")}`)
  process.exit(1)
}

printTable(rows)

if (failed) {
  process.exit(1)
}
