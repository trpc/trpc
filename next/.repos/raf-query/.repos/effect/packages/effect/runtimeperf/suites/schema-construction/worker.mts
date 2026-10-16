import assert from "node:assert/strict"
import { writeFileSync } from "node:fs"
import { Session } from "node:inspector/promises"
import { fixture, validate } from "./fixtures.mts"

const [mode, name, countArgument = "1000", intervalArgument = "0", profilePath] = process.argv.slice(2)
if (mode === "validate") {
  validate(name)
  process.stdout.write(JSON.stringify({ validated: name }))
} else {
  assert.equal(mode, "measure")
  const count = Number(countArgument)
  const interval = Number(intervalArgument)
  assert.ok(Number.isSafeInteger(count) && count > 0)
  assert.ok(Number.isSafeInteger(interval) && interval >= 0)
  const { build } = fixture(name)
  const roots = new Array(count)
  // This frame delimits the construction samples. Inspector and hrtime clocks
  // have different origins on some platforms, so they must not be compared.
  function constructBatch() {
    const start = process.hrtime.bigint()
    for (let index = 0; index < count; index++) roots[index] = build(index)
    return Number(process.hrtime.bigint() - start) / 1e6
  }
  const session = new Session()
  try {
    if (interval > 0) {
      assert.ok(profilePath)
      session.connect()
      await session.post("Profiler.enable")
      await session.post("Profiler.setSamplingInterval", { interval })
      await session.post("Profiler.start")
    }
    const elapsedMs = constructBatch()
    if (interval > 0) {
      const { profile } = await session.post("Profiler.stop")
      writeFileSync(profilePath, JSON.stringify(profile))
    }
    // Do not prepare a decoder, traverse ASTs, or warm the construction path
    // before timing. Full semantic validation runs in separate processes.
    assert.equal(roots.length, count)
    for (const root of roots) assert.equal(typeof root, "function")
    assert.notEqual(roots[0], count > 1 ? roots[count - 1] : undefined)
    process.stdout.write(JSON.stringify({ name, count, interval, elapsedMs, profilePath }))
  } finally {
    session.disconnect()
  }
}
