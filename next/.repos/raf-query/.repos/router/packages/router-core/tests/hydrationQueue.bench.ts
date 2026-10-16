import { bench, describe } from 'vitest'

const MAX_DYNAMIC_RECORD_CODE_UNITS = 64 * 1024
const SOURCE_SEPARATOR = ';'
const SCRIPT_OPENING_CODE_UNITS = '<script>'.length
const DYNAMIC_CLOSE_CODE_UNITS = 'document.currentScript.remove()</script>'
  .length

function getBatchLength(
  values: ReadonlyArray<string | undefined>,
  head: number,
) {
  let codeUnits = SCRIPT_OPENING_CODE_UNITS + DYNAMIC_CLOSE_CODE_UNITS
  let batchLength = 0
  for (let index = head; index < values.length; index++) {
    const nextCodeUnits =
      codeUnits + SOURCE_SEPARATOR.length + values[index]!.length
    if (batchLength > 0 && nextCodeUnits > MAX_DYNAMIC_RECORD_CODE_UNITS) {
      break
    }
    codeUnits = nextCodeUnits
    batchLength++
    if (codeUnits > MAX_DYNAMIC_RECORD_CODE_UNITS) {
      break
    }
  }
  return batchLength
}

function drainWithSplice(values: Array<string>) {
  let drained = 0
  let consumedCodeUnits = 0
  while (values.length > 0) {
    const batchLength = getBatchLength(values, 0)
    const batch = values.splice(0, batchLength)
    drained += batchLength
    for (const part of batch) {
      consumedCodeUnits += part.length
    }
  }
  return { drained, consumedCodeUnits }
}

function drainWithHead(values: Array<string | undefined>) {
  let head = 0
  let drained = 0
  let consumedCodeUnits = 0
  while (head < values.length) {
    const batchLength = getBatchLength(values, head)
    if (head === 0 && batchLength === values.length) {
      const batch = values
      drained += values.length
      for (const part of batch) {
        consumedCodeUnits += part!.length
      }
      values = []
      head = 0
      continue
    }
    const end = head + batchLength
    const batch = values.slice(head, end)
    for (let index = head; index < end; index++) {
      values[index] = undefined
    }
    drained += batch.length
    for (const part of batch) {
      consumedCodeUnits += part!.length
    }
    head = end
    if (head === values.length) {
      values = []
      head = 0
    } else if (head >= 1024 && head >= values.length - head) {
      values = values.slice(head)
      head = 0
    }
  }
  return { drained, consumedCodeUnits }
}

const source = 'x'.repeat(4 * 1024)
const sources = Array.from({ length: 4_095 }, () => source)
let benchmarkSink: { drained: number; consumedCodeUnits: number } | undefined

const expected = drainWithSplice(sources.slice())
const actual = drainWithHead(sources.slice())
if (
  expected.drained !== sources.length ||
  actual.drained !== sources.length ||
  actual.consumedCodeUnits !== expected.consumedCodeUnits
) {
  throw new Error('Hydration queue benchmark discarded a source')
}

describe('maximum hydration source queue with 4 KiB sources', () => {
  bench('front splice', () => {
    return void (benchmarkSink = drainWithSplice(sources.slice()))
  })

  bench('head index with compaction', () => {
    return void (benchmarkSink = drainWithHead(sources.slice()))
  })
})
