import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { describe, it } from "node:test"
import { pathToFileURL } from "node:url"
import { loadRegistry, scenarioBatchSize } from "../utils.mts"

describe("runtimeperf registry", () => {
  it("uses the Effect calibration for every implementation in a scenario", () => {
    const zod = { implementation: "zod4-compiled" }
    const effect = { implementation: "effect" }
    assert.equal(scenarioBatchSize([zod, effect], new Map([
      [zod, { batchSize: 4_096 }],
      [effect, { batchSize: 256 }]
    ])), 256)
  })

  it("uses unique fixture targets and valid implementations", () => {
    const { fixtures } = loadRegistry()
    assert.equal(new Set(fixtures.map((fixture) => fixture.target)).size, fixtures.length)
    for (const fixture of fixtures) {
      assert.ok([
        "effect",
        "effect-aot",
        "effect-jit",
        "fast-check-v4",
        "valibot",
        "zod4",
        "zod4-compiled",
        "zod4-jitless",
        "zod4-validate"
      ].includes(fixture.implementation))
    }
  })

  it("pairs every Arbitrary scenario across the native and fast-check implementations", () => {
    const { fixtures } = loadRegistry()
    const scenarios = Map.groupBy(
      fixtures.filter((fixture) => fixture.suite === "arbitrary"),
      (fixture) => fixture.scenario
    )
    assert.equal(scenarios.size, 33)
    for (const fixtures of scenarios.values()) {
      assert.deepEqual(fixtures.map((fixture) => fixture.implementation).sort(), ["effect", "fast-check-v4"])
      const metadata = (fixture) => ({
        export: fixture.export,
        family: fixture.family,
        operation: fixture.operation,
        path: fixture.path,
        scenario: fixture.scenario,
        size: fixture.size,
        tier: fixture.tier
      })
      assert.deepEqual(metadata(fixtures[0]), metadata(fixtures[1]))
    }
  })

  it("keeps the focused Schema diagnostics Effect-only", () => {
    const { fixtures } = loadRegistry()
    const diagnostics = fixtures.filter((fixture) => fixture.suite === "schema")
    assert.ok(diagnostics.length > 0)
    assert.equal(diagnostics.every((fixture) => fixture.implementation === "effect"), true)
  })

  it("includes the complete effect@beta Schema Benchmarks matrix", () => {
    const { fixtures } = loadRegistry()
    assert.deepEqual(
      fixtures
        .filter((fixture) => fixture.suite === "schema-benchmarks" && fixture.implementation === "effect")
        .map((fixture) => fixture.name)
        .sort(),
      [
        "codec-typed-decode",
        "codec-typed-encode",
        "codec-unknown-decode",
        "codec-unknown-encode",
        "initialization-decoder",
        "initialization-schema",
        "parsing-all-invalid",
        "parsing-all-valid",
        "parsing-first-invalid",
        "parsing-first-valid",
        "standard-all-invalid",
        "standard-all-valid",
        "standard-first-invalid",
        "standard-first-valid",
        "validation-invalid",
        "validation-valid"
      ]
    )
  })

  it("includes the complete Valibot and Zod Schema Benchmarks matrices", () => {
    const { fixtures } = loadRegistry()
    const names = (implementation) =>
      fixtures
        .filter((fixture) => fixture.suite === "schema-benchmarks" && fixture.implementation === implementation)
        .map((fixture) => fixture.name)
        .sort()
    assert.deepEqual(names("valibot"), [
      "initialization-schema-valibot",
      "parsing-all-invalid-valibot",
      "parsing-all-valid-valibot",
      "parsing-first-invalid-valibot",
      "parsing-first-valid-valibot",
      "standard-all-invalid-valibot",
      "standard-all-valid-valibot",
      "validation-invalid-valibot",
      "validation-valid-valibot"
    ])
    assert.deepEqual(names("zod4"), [
      "codec-typed-decode-zod4",
      "codec-typed-encode-zod4",
      "initialization-schema-zod4",
      "parsing-all-invalid-zod4",
      "parsing-all-valid-zod4",
      "standard-all-invalid-zod4",
      "standard-all-valid-zod4"
    ])
  })

  it("uses Zod 4 standard and jitless safeParse for the zod4 fixtures", async () => {
    const { fixtures } = loadRegistry()
    const zodFiles = new Set(
      fixtures
        .filter((fixture) => fixture.suite === "schema-benchmarks" && fixture.implementation === "zod4")
        .map((fixture) => fixture.fixturePath)
    )
    assert.ok(zodFiles.size > 0)
    for (const path of zodFiles) {
      const source = await readFile(path, "utf8")
      assert.match(source, /from "zod\/v4"/)
      assert.doesNotMatch(source, /from "zod\/v4-mini"/)
      assert.match(source, /jitless:\s*true/)
    }
  })

  it("uses strict Zod compilation for the compiler comparison fixtures", async () => {
    const { fixtures } = loadRegistry()
    const compiled = fixtures.filter((fixture) =>
      fixture.suite === "compiler-rebuild" && fixture.implementation === "zod4-compiled"
    )
    assert.equal(compiled.length, 19)
    const paths = new Set(compiled.map((fixture) => fixture.fixturePath))
    assert.equal(paths.size, 1)
    const source = await readFile([...paths][0], "utf8")
    assert.match(source, /from "\.\/zod-cases\.ts"/)
    const shared = await readFile(new URL("../suites/compiler-rebuild/fixtures/zod-cases.ts", import.meta.url), "utf8")
    assert.match(shared, /from "zod\/v4"/)
    assert.match(shared, /z\.compile\(value\.schema, \{ strict: true \}\)/)
  })

  it("uses interpreted Zod for the jitless compiler comparison fixtures", async () => {
    const { fixtures } = loadRegistry()
    const jitless = fixtures.filter((fixture) =>
      fixture.suite === "compiler-rebuild" && fixture.implementation === "zod4-jitless"
    )
    assert.equal(jitless.length, 11)
    const paths = new Set(jitless.map((fixture) => fixture.fixturePath))
    assert.equal(paths.size, 1)
    const source = await readFile(new URL("../suites/compiler-rebuild/fixtures/zod-cases.ts", import.meta.url), "utf8")
    assert.match(source, /z\.validate\(value\.schema, input, \{ jitless: true \}\)/)
    assert.match(source, /value\.schema\.parse\(input, \{ jitless: true \}\)/)
  })

  it("loads, runs and validates every fixture export", async () => {
    const { fixtures } = loadRegistry()
    const modules = new Map()
    for (const fixture of fixtures) {
      let module = modules.get(fixture.fixturePath)
      if (module === undefined) {
        module = await import(pathToFileURL(fixture.fixturePath))
        modules.set(fixture.fixturePath, module)
      }
      assert.equal(typeof module[fixture.export], "function", fixture.target)
      const runtimeCase = module[fixture.export]()
      const result = runtimeCase.run()
      assert.equal(typeof result?.then, "undefined", fixture.target)
      runtimeCase.validate(result)
    }
  })
})
