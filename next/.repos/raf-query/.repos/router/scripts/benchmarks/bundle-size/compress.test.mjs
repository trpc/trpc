import assert from 'node:assert/strict'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import zlib, { brotliCompressSync, gzipSync } from 'node:zlib'
import { measureFileSizes } from './compress.mjs'

// Independent reference: compress both lists separately, as the CLI did before.
function legacySizes(baseDir, fileList) {
  const result = { rawBytes: 0, gzipBytes: 0, brotliBytes: 0, files: [] }
  for (const file of fileList) {
    const content = fs.readFileSync(path.join(baseDir, file))
    const sizes = {
      file,
      rawBytes: content.byteLength,
      gzipBytes: gzipSync(content).byteLength,
      brotliBytes: brotliCompressSync(content).byteLength,
    }
    result.rawBytes += sizes.rawBytes
    result.gzipBytes += sizes.gzipBytes
    result.brotliBytes += sizes.brotliBytes
    result.files.push(sizes)
  }
  return result
}

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-compress-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  for (const [file, content] of Object.entries({
    'entry.js': 'import "./shared.mjs"; console.log("héllo 🌍");\n'.repeat(30),
    'shared.mjs': 'export const shared = "shared chunk";\n'.repeat(100),
    'lazy.js': 'export default "lazy route";\n'.repeat(20),
    'empty.js': '',
  })) {
    fs.writeFileSync(path.join(dir, file), content)
  }
  return dir
}

test('matches legacy per-chunk compression and initial totals exactly', (t) => {
  const dir = fixture(t)
  const all = ['entry.js', 'shared.mjs', 'lazy.js', 'empty.js']
  for (const initial of [
    [],
    ['entry.js'],
    ['shared.mjs', 'entry.js'],
    all,
    ['empty.js'],
  ]) {
    assert.deepEqual(measureFileSizes(dir, all, initial), {
      sizes: legacySizes(dir, all),
      initialSizes: legacySizes(dir, initial),
    })
  }
  assert.deepEqual(measureFileSizes(dir, [], []), {
    sizes: legacySizes(dir, []),
    initialSizes: legacySizes(dir, []),
  })
})

test('preserves list order and multiplicity, including initial-only files', (t) => {
  const dir = fixture(t)
  const all = ['lazy.js', 'entry.js', 'entry.js']
  const initial = ['shared.mjs', 'entry.js', 'entry.js']
  assert.deepEqual(measureFileSizes(dir, all, initial), {
    sizes: legacySizes(dir, all),
    initialSizes: legacySizes(dir, initial),
  })
})

test('remeasures changed files on subsequent calls and propagates read errors', (t) => {
  const dir = fixture(t)
  const files = ['entry.js']
  const before = measureFileSizes(dir, files, files)
  fs.writeFileSync(path.join(dir, 'entry.js'), 'export default "rebuilt"')
  const after = measureFileSizes(dir, files, files)
  assert.notDeepEqual(after, before)
  assert.deepEqual(after, {
    sizes: legacySizes(dir, files),
    initialSizes: legacySizes(dir, files),
  })
  assert.throws(() => measureFileSizes(dir, files, ['missing.js']), {
    code: 'ENOENT',
  })
})

test('reports gzip and brotli separately without changing measured output', (t) => {
  const dir = fixture(t)
  const all = ['entry.js', 'shared.mjs', 'lazy.js']
  const initial = ['entry.js', 'shared.mjs']
  const timings = []
  const result = measureFileSizes(dir, all, initial, (phase, durationMs) => {
    timings.push({ phase, durationMs })
  })
  assert.deepEqual(result, measureFileSizes(dir, all, initial))
  assert.deepEqual(
    timings.map(({ phase }) => phase),
    ['gzip', 'brotli'],
  )
  for (const { durationMs } of timings) {
    assert.ok(Number.isFinite(durationMs) && durationMs >= 0)
  }
})

test('reads and compresses each distinct file only once per measurement', (t) => {
  const dir = fixture(t)
  const all = ['entry.js', 'shared.mjs', 'lazy.js', 'entry.js']
  const initial = ['shared.mjs', 'entry.js', 'empty.js', 'entry.js']
  const expected = {
    sizes: legacySizes(dir, all),
    initialSizes: legacySizes(dir, initial),
  }
  const read = t.mock.method(fs, 'readFileSync')
  const gzip = t.mock.method(zlib, 'gzipSync')
  const brotli = t.mock.method(zlib, 'brotliCompressSync')
  syncBuiltinESMExports()
  t.after(() => {
    t.mock.restoreAll()
    syncBuiltinESMExports()
  })

  for (let measurement = 1; measurement <= 2; measurement++) {
    assert.deepEqual(measureFileSizes(dir, all, initial), expected)
    for (const operation of [read, gzip, brotli]) {
      assert.equal(operation.mock.callCount(), 4 * measurement)
    }
  }
})

test('reports completed compression time when a later file cannot be read', (t) => {
  const dir = fixture(t)
  let now = 10
  t.mock.method(performance, 'now', () => now++)
  const timings = []
  assert.throws(
    () =>
      measureFileSizes(dir, ['entry.js', 'missing.js'], [], (...entry) => {
        timings.push(entry)
      }),
    { code: 'ENOENT' },
  )
  assert.deepEqual(timings, [
    ['gzip', 1],
    ['brotli', 1],
  ])
})

for (const codec of ['gzipSync', 'brotliCompressSync']) {
  test(`reports time spent in failed ${codec} and preserves the original exception`, (t) => {
    const dir = fixture(t)
    const failure = new Error('codec failed')
    let now = 20
    t.mock.method(performance, 'now', () => now++)
    t.mock.method(zlib, codec, () => {
      throw failure
    })
    syncBuiltinESMExports()
    t.after(() => {
      t.mock.restoreAll()
      syncBuiltinESMExports()
    })

    const timings = []
    assert.throws(
      () =>
        measureFileSizes(dir, ['entry.js'], [], (...entry) => {
          timings.push(entry)
        }),
      (error) => error === failure,
    )
    assert.deepEqual(timings, [
      ['gzip', 1],
      ['brotli', codec === 'gzipSync' ? 0 : 1],
    ])
  })
}
