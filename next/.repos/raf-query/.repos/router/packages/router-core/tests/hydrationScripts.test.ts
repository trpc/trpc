import { createHash } from 'node:crypto'
import { describe, expect, test, vi } from 'vitest'
import {
  HydrationScriptOutputState,
  MAX_HYDRATION_OUTPUT_CHUNK_BYTES,
  createHydrationScripts,
} from '../src/ssr/hydrationScripts'
import type { HydrationScriptOutput } from '../src/ssr/hydrationScripts'

const decoder = new TextDecoder()
const encoder = new TextEncoder()

function getBoundarySource() {
  const scripts = createHydrationScripts(undefined, [])
  const source = scripts.takeInitialHydrationScriptTags()!.boundary.children!
  scripts.cleanup()
  return source
}

const HYDRATION_SCRIPT_BOUNDARY_SOURCE = getBoundarySource()

function createReadyOutput(nonce?: string) {
  const scripts = createHydrationScripts(nonce, ['boot()'])
  const initial = scripts.takeInitialHydrationScriptTags()!
  const output = scripts.claimOutput()
  scripts.liftBarrier()
  return { scripts, initial, output }
}

function drainChunks(output: HydrationScriptOutput) {
  const chunks: Array<Uint8Array> = []
  while (
    output.state === HydrationScriptOutputState.Ready ||
    output.state === HydrationScriptOutputState.Active
  ) {
    chunks.push(output.pullChunk())
  }
  return chunks
}

function decodeChunks(chunks: ReadonlyArray<Uint8Array>) {
  let text = ''
  for (const chunk of chunks) {
    text += decoder.decode(chunk, { stream: true })
  }
  return text + decoder.decode()
}

async function flushMicrotasks() {
  await Promise.resolve()
}

describe('hydration script ownership', () => {
  test('takes initial sources before the output is claimed', () => {
    const scripts = createHydrationScripts(undefined, ['first()', 'second()'])
    const initial = scripts.takeInitialHydrationScriptTags()!

    expect(initial.before[0]).toMatchObject({
      attrs: { 'data-tsr-stream-part': '' },
    })
    expect(initial.before[0]!.children).toMatch(/^first\(\);second\(\);/)
    expect(initial.boundary.children).toBe(HYDRATION_SCRIPT_BOUNDARY_SOURCE)
    expect(initial.boundary.attrs).not.toHaveProperty('id')

    const output = scripts.claimOutput()
    expect(output.state).toBe(HydrationScriptOutputState.Waiting)
    scripts.cleanup()
  })

  test('supports taking initial tags through the ServerSsr callback', () => {
    const scripts = createHydrationScripts(undefined, ['boot()'])
    const takeInitialHydrationScriptTags =
      scripts.takeInitialHydrationScriptTags

    expect(takeInitialHydrationScriptTags()?.before[0]?.children).toMatch(
      /^boot\(\);/,
    )
    scripts.cleanup()
  })

  test('notifies the subscriber and pulls late records', () => {
    const scripts = createHydrationScripts(undefined, [])
    scripts.takeInitialHydrationScriptTags()
    const output = scripts.claimOutput()
    const onChange = vi.fn()
    const unsubscribe = output.subscribe(onChange)

    scripts.liftBarrier()
    scripts.pushSource('late()')

    expect(onChange).toHaveBeenCalledOnce()
    expect(decoder.decode(output.pullChunk())).toContain('late()')
    unsubscribe()
    scripts.cleanup()
  })

  test('skipInitialTake releases initial sources as late records', () => {
    const scripts = createHydrationScripts(undefined, ['boot()'])
    const output = scripts.claimOutput()
    scripts.pushSource('late()')
    scripts.liftBarrier()
    expect(output.state).toBe(HydrationScriptOutputState.Waiting)

    scripts.skipInitialTake()

    expect(output.state).toBe(HydrationScriptOutputState.Ready)
    expect(decoder.decode(output.pullChunk())).toBe(
      '<script>boot();late();document.currentScript.remove()</script>',
    )
    expect(scripts.takeInitialHydrationScriptTags()).toBeUndefined()
    scripts.cleanup()
  })

  test('empty initial output keeps only the stream boundary', () => {
    const scripts = createHydrationScripts(undefined, [])
    const initial = scripts.takeInitialHydrationScriptTags()!

    expect(initial.before).toEqual([])
    expect(initial.boundary).toEqual({
      tag: 'script',
      attrs: { nonce: undefined },
      children: HYDRATION_SCRIPT_BOUNDARY_SOURCE,
    })
    scripts.cleanup()
  })

  test('does not append cleanup to a large initial source', () => {
    const source = 'x'.repeat(20 * 1024)
    const scripts = createHydrationScripts(undefined, [source])
    const initial = scripts.takeInitialHydrationScriptTags()!

    expect(initial.before).toHaveLength(2)
    expect(initial.before[0]).toEqual({
      tag: 'script',
      attrs: { nonce: undefined, 'data-tsr-stream-part': '' },
      children: source,
    })
    expect(initial.before[1]).toMatchObject({
      tag: 'script',
      attrs: { nonce: undefined, 'data-tsr-stream-part': '' },
      children: expect.stringContaining('document.currentScript'),
    })
    scripts.cleanup()
  })

  test('does not move pending initial sources into an early claimant', () => {
    const scripts = createHydrationScripts(undefined, ['boot()'])
    const output = scripts.claimOutput()

    scripts.pushSource('beforeScripts()')
    scripts.liftBarrier()
    expect(output.state).toBe(HydrationScriptOutputState.Waiting)

    const initial = scripts.takeInitialHydrationScriptTags()!
    expect(
      initial.before.some((tag) => tag.children?.includes('beforeScripts()')),
    ).toBe(true)
    expect(output.state).toBe(HydrationScriptOutputState.Waiting)
    scripts.cleanup()
  })

  test('releases initial source accounting when tags take ownership', () => {
    const sources = Array.from({ length: 4_096 }, (_, index) => `${index}`)
    const scripts = createHydrationScripts(undefined, sources)
    expect(scripts.takeInitialHydrationScriptTags()).toBeDefined()
    const output = scripts.claimOutput()
    scripts.liftBarrier()

    for (const source of sources) {
      scripts.pushSource(source)
    }

    expect(output.state).toBe(HydrationScriptOutputState.Ready)
    expect(output.error).toBeUndefined()
    scripts.cleanup()
  })

  test('transfers buffered sources in order only after the barrier lifts', async () => {
    const scripts = createHydrationScripts(undefined, ['boot()'])
    scripts.takeInitialHydrationScriptTags()
    const output = scripts.claimOutput()

    scripts.pushSource('first()')
    scripts.pushSource('second()')
    await flushMicrotasks()
    expect(output.state).toBe(HydrationScriptOutputState.Waiting)

    scripts.liftBarrier()
    expect(output.state).toBe(HydrationScriptOutputState.Ready)
    expect(decodeChunks(drainChunks(output))).toBe(
      '<script>first();second();document.currentScript.remove()</script>',
    )
    scripts.cleanup()
  })

  test('emits exact nonce, separators, cleanup, boundary, and closing protocol', async () => {
    const nonce = `a&"'<>`
    const { scripts, initial, output } = createReadyOutput(nonce)

    expect(initial.before).toEqual([
      {
        tag: 'script',
        attrs: { nonce, 'data-tsr-stream-part': '' },
        children:
          "boot();{let s=document.currentScript,p;while((p=s.previousElementSibling)&&p.hasAttribute('data-tsr-stream-part'))p.remove();s.remove()}",
      },
    ])
    expect(initial.boundary).toEqual({
      tag: 'script',
      attrs: { nonce },
      children: HYDRATION_SCRIPT_BOUNDARY_SOURCE,
    })

    scripts.pushSource('first()')
    scripts.pushSource('second()')
    await flushMicrotasks()
    expect(decodeChunks(drainChunks(output))).toBe(
      '<script nonce="a&#38;&#34;&#39;&#60;&#62;">first();second();document.currentScript.remove()</script>',
    )
    scripts.cleanup()
  })

  test.each([
    {
      name: 'plain continuation',
      initial: false,
      wrap: false,
      expected: 'value()',
    },
    {
      name: 'initial router value',
      initial: true,
      wrap: false,
      expected: '$_TSR.router=value()',
    },
    {
      name: 'wrapped continuation',
      initial: false,
      wrap: true,
      expected: '$_TSR.p(()=>value())',
    },
    {
      name: 'wrapped initial router value',
      initial: true,
      wrap: true,
      expected: '$_TSR.p(()=>$_TSR.router=value())',
    },
  ])('frames $name serialization exactly', ({ initial, wrap, expected }) => {
    const { scripts, output } = createReadyOutput()

    scripts.pushSerializedSource('value()', initial, wrap)

    expect(decodeChunks(drainChunks(output))).toBe(
      `<script>${expected};document.currentScript.remove()</script>`,
    )
    scripts.cleanup()
  })
})

describe('hydration script encoding', () => {
  test('uses one direct chunk for a small record', async () => {
    const { scripts, output } = createReadyOutput()
    scripts.pushSource('small()')
    await flushMicrotasks()

    const chunks = drainChunks(output)
    expect(chunks).toHaveLength(1)
    expect(decodeChunks(chunks)).toBe(
      '<script>small();document.currentScript.remove()</script>',
    )
    scripts.cleanup()
  })

  test('can produce a record that is exactly one maximum-sized chunk', async () => {
    const prefix = '<script>'
    const suffix = ';document.currentScript.remove()</script>'
    const source = 'x'.repeat(
      MAX_HYDRATION_OUTPUT_CHUNK_BYTES - prefix.length - suffix.length,
    )
    const { scripts, output } = createReadyOutput()
    scripts.pushSource(source)
    await flushMicrotasks()

    const chunks = drainChunks(output)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toHaveLength(MAX_HYDRATION_OUTPUT_CHUNK_BYTES)
    expect(decodeChunks(chunks)).toBe(prefix + source + suffix)
    scripts.cleanup()
  })

  test.each([
    ['CJK', '漢字語'.repeat(30_000)],
    ['emoji', '🦄🚀'.repeat(30_000)],
  ])(
    'encodes a large %s record without corrupting UTF-8',
    async (_, source) => {
      const { scripts, output } = createReadyOutput()
      scripts.pushSource(source)
      scripts.pushSource('tail()')
      await flushMicrotasks()

      const chunks = drainChunks(output)
      expect(
        Math.max(...chunks.map((chunk) => chunk.byteLength)),
      ).toBeLessThanOrEqual(MAX_HYDRATION_OUTPUT_CHUNK_BYTES)
      expect(decodeChunks(chunks)).toBe(
        `<script>${source};document.currentScript.remove()</script>` +
          '<script>tail();document.currentScript.remove()</script>',
      )
      scripts.cleanup()
    },
  )

  test('drains one 17 MiB record incrementally without retaining the response', async () => {
    const source = 'x'.repeat(17 * 1024 * 1024)
    const expectedHash = createHash('sha256')
      .update('<script>')
      .update(source)
      .update(';document.currentScript.remove()</script>')
      .digest('hex')
    const { scripts, output } = createReadyOutput()
    scripts.pushSource(source)
    await flushMicrotasks()

    const actualHash = createHash('sha256')
    let outputBytes = 0
    let maximumChunkBytes = 0
    while (
      output.state === HydrationScriptOutputState.Ready ||
      output.state === HydrationScriptOutputState.Active
    ) {
      const chunk = output.pullChunk()
      actualHash.update(chunk)
      outputBytes += chunk.byteLength
      maximumChunkBytes = Math.max(maximumChunkBytes, chunk.byteLength)
    }

    expect(outputBytes).toBe(
      encoder.encode('<script>').byteLength +
        source.length +
        encoder.encode(';document.currentScript.remove()</script>').byteLength,
    )
    expect(actualHash.digest('hex')).toBe(expectedHash)
    expect(maximumChunkBytes).toBeLessThanOrEqual(
      MAX_HYDRATION_OUTPUT_CHUNK_BYTES,
    )
    expect(output.state).toBe(HydrationScriptOutputState.Waiting)
    scripts.cleanup()
  })

  test('keeps a large record Active until its closing tag drains', async () => {
    const { scripts, output } = createReadyOutput()
    scripts.pushSource('x'.repeat(MAX_HYDRATION_OUTPUT_CHUNK_BYTES * 2))
    await flushMicrotasks()

    expect(output.state).toBe(HydrationScriptOutputState.Ready)
    const first = output.pullChunk()
    expect(first.byteLength).toBeLessThanOrEqual(
      MAX_HYDRATION_OUTPUT_CHUNK_BYTES,
    )
    expect(output.state).toBe(HydrationScriptOutputState.Active)

    drainChunks(output)
    expect(output.state).toBe(HydrationScriptOutputState.Waiting)
    scripts.cleanup()
  })

  test('closes one multi-chunk source before draining the next independent source', async () => {
    const { scripts, output } = createReadyOutput()
    const first = `first("${'a'.repeat(MAX_HYDRATION_OUTPUT_CHUNK_BYTES * 2)}")`
    const second = `second("${'b'.repeat(
      MAX_HYDRATION_OUTPUT_CHUNK_BYTES * 2,
    )}")`

    try {
      scripts.pushSource(first)
      scripts.pushSource(second)
      await flushMicrotasks()

      const recordDecoder = new TextDecoder()
      let firstRecord = ''
      while (
        (output.state === HydrationScriptOutputState.Ready ||
          output.state === HydrationScriptOutputState.Active) &&
        !firstRecord.includes('</script>')
      ) {
        firstRecord += recordDecoder.decode(output.pullChunk(), {
          stream: true,
        })
      }
      firstRecord += recordDecoder.decode()

      expect(firstRecord).toContain('first("')
      expect(firstRecord).not.toContain('second("')
      expect(output.state).toBe(HydrationScriptOutputState.Ready)

      const secondRecord = decodeChunks(drainChunks(output))
      expect(secondRecord).toContain('second("')
      expect(secondRecord).not.toContain('first("')
      expect(output.state).toBe(HydrationScriptOutputState.Waiting)
    } finally {
      scripts.cleanup()
    }
  })

  test('splits sources whose combined framed record exceeds the record budget', async () => {
    const { scripts, output } = createReadyOutput()
    const first = `first("${'a'.repeat(40 * 1024)}")`
    const second = `second("${'b'.repeat(40 * 1024)}")`

    try {
      scripts.pushSource(first)
      scripts.pushSource(second)
      await flushMicrotasks()

      const firstRecord = decodeChunks([output.pullChunk()])
      expect(firstRecord).toContain(first)
      expect(firstRecord).not.toContain(second)
      expect(output.state).toBe(HydrationScriptOutputState.Ready)

      const secondRecord = decodeChunks([output.pullChunk()])
      expect(secondRecord).toContain(second)
      expect(secondRecord).not.toContain(first)
      expect(output.state).toBe(HydrationScriptOutputState.Waiting)
    } finally {
      scripts.cleanup()
    }
  })

  test('preserves FIFO when sources append after queue compaction', () => {
    const { scripts, output } = createReadyOutput()
    const initialSources = Array.from({ length: 1_200 }, (_, index) => {
      const prefix = `r${index.toString().padStart(4, '0')}:`
      return prefix + 'x'.repeat(1024 - prefix.length)
    })
    const appendedSources = Array.from({ length: 16 }, (_, offset) => {
      const index = initialSources.length + offset
      const prefix = `r${index.toString().padStart(4, '0')}:`
      return prefix + 'x'.repeat(1024 - prefix.length)
    })

    try {
      for (const source of initialSources) {
        scripts.pushSource(source)
      }

      const chunks = Array.from({ length: 17 }, () => output.pullChunk())
      expect(output.state).toBe(HydrationScriptOutputState.Ready)

      for (const source of appendedSources) {
        scripts.pushSource(source)
      }
      scripts.finish()
      chunks.push(...drainChunks(output))

      const text = decodeChunks(chunks)
      const markers = Array.from(text.matchAll(/r(\d{4}):/g), (match) =>
        Number(match[1]),
      )
      expect(markers).toEqual(
        [...initialSources, ...appendedSources].map((_, index) => index),
      )
      expect(output.state).toBe(HydrationScriptOutputState.Done)
    } finally {
      scripts.cleanup()
    }
  })

  test('reuses source-part capacity after queue compaction', () => {
    const { scripts, output } = createReadyOutput()
    const source = 'x'.repeat(1024)

    try {
      for (let index = 0; index < 4_096; index++) {
        scripts.pushSource(source)
      }

      for (let record = 0; record < 33; record++) {
        output.pullChunk()
      }
      expect(output.state).toBe(HydrationScriptOutputState.Ready)

      for (let index = 0; index < 2_079; index++) {
        scripts.pushSource(source)
      }
      expect(output.state).toBe(HydrationScriptOutputState.Ready)
      expect(output.error).toBeUndefined()

      scripts.pushSource(source)
      expect(output.state).toBe(HydrationScriptOutputState.Failed)
      expect((output.error as Error).message).toContain('source-part count')
    } finally {
      scripts.cleanup()
    }
  })

  test('a mostly-empty final chunk does not pin the full output buffer', () => {
    const { scripts, output } = createReadyOutput()
    scripts.pushSource(`big("${'x'.repeat(80 * 1024)}")`)
    scripts.finish()

    const chunks = drainChunks(output)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      // No chunk may retain more than twice its own bytes through its
      // backing ArrayBuffer; small tails must be copied out of the 64 KiB
      // output buffer.
      expect(chunk.buffer.byteLength).toBeLessThanOrEqual(chunk.byteLength * 2)
    }
  })
})

describe('disabled hydration', () => {
  test('makes the fast path reservable without a take or a boundary', () => {
    vi.useFakeTimers()
    try {
      const scripts = createHydrationScripts(undefined)
      scripts.disableHydration()

      expect(scripts.isInitialTaken()).toBe(true)
      expect(scripts.takeInitialHydrationScriptTags()).toBeUndefined()
      expect(scripts.reserveFastPath()).toBe(true)

      // Late producer activity is inert: no sources, no timers.
      scripts.pushSource('late()')
      scripts.startSerializationTimeout(10)
      scripts.finish()
      expect(vi.getTimerCount()).toBe(0)

      scripts.cleanup()
    } finally {
      vi.useRealTimers()
    }
  })

  test('is safe after cleanup', () => {
    const scripts = createHydrationScripts(undefined)
    scripts.disableHydration()
    scripts.cleanup()
    expect(() => scripts.disableHydration()).not.toThrow()
  })

  test('rejects disabling after the initial take', () => {
    const scripts = createHydrationScripts(undefined, ['boot()'])
    scripts.takeInitialHydrationScriptTags()
    expect(() => scripts.disableHydration()).toThrow(
      'hydration output is already committed',
    )
    scripts.cleanup()
  })

  test('rejects disabling after the output channel was claimed', () => {
    const scripts = createHydrationScripts(undefined, ['boot()'])
    scripts.claimOutput()
    expect(() => scripts.disableHydration()).toThrow(
      'hydration output is already committed',
    )
    scripts.cleanup()
  })
})

describe('hydration script completion and failure', () => {
  test('enqueues $_TSR.e() before it reports Done', () => {
    const { scripts, output } = createReadyOutput()
    const observedStates: Array<number> = []
    output.subscribe(() => observedStates.push(output.state))

    scripts.pushSource('value()')
    scripts.finish()
    expect(output.state).toBe(HydrationScriptOutputState.Ready)

    const text = decodeChunks(drainChunks(output))
    expect(text).toBe(
      '<script>value();$_TSR.e();document.currentScript.remove()</script>',
    )
    expect(output.state).toBe(HydrationScriptOutputState.Done)
    expect(observedStates).toContain(HydrationScriptOutputState.Ready)
    scripts.cleanup()
  })

  test('reports the source-part guard synchronously', () => {
    const { scripts, output } = createReadyOutput()
    const notifications: Array<number> = []
    output.subscribe(() => {
      notifications.push(output.state)
    })

    let pushed = 0
    while (
      output.state !== HydrationScriptOutputState.Failed &&
      pushed < 10_000
    ) {
      scripts.pushSource(`${pushed++}`)
    }

    expect(pushed).toBeLessThan(10_000)
    expect(output.state).toBe(HydrationScriptOutputState.Failed)
    expect((output.error as Error).message).toContain('source-part count')
    expect(
      notifications.filter(
        (value) => value === HydrationScriptOutputState.Failed,
      ),
    ).toHaveLength(1)
    scripts.cleanup()
  })

  test('applies the source-part guard before the initial take', () => {
    const scripts = createHydrationScripts(undefined, [])

    try {
      for (let index = 0; index <= 4_096; index++) {
        scripts.pushSource(`${index}`)
      }

      const output = scripts.claimOutput()
      expect(output.state).toBe(HydrationScriptOutputState.Failed)
      expect((output.error as Error).message).toContain('source-part count')
      expect(scripts.takeInitialHydrationScriptTags()).toBeUndefined()
    } finally {
      scripts.cleanup()
    }
  })

  test('applies the source-part guard to constructor sources', () => {
    const sources = Array.from({ length: 4_097 }, (_, index) => `${index}`)
    const scripts = createHydrationScripts(undefined, sources)

    try {
      const output = scripts.claimOutput()
      expect(output.state).toBe(HydrationScriptOutputState.Failed)
      expect((output.error as Error).message).toContain('source-part count')
      expect(scripts.takeInitialHydrationScriptTags()).toBeUndefined()
    } finally {
      scripts.cleanup()
    }
  })

  test('reports the regular backlog guard synchronously', () => {
    const { scripts, output } = createReadyOutput()
    const source = 'x'.repeat(1024 * 1024)

    let pushed = 0
    while (output.state !== HydrationScriptOutputState.Failed && pushed < 100) {
      scripts.pushSource(source + pushed++)
    }

    expect(pushed).toBeLessThan(100)
    expect(output.state).toBe(HydrationScriptOutputState.Failed)
    expect((output.error as Error).message).toContain('code-unit count')
    scripts.cleanup()
  })

  test('applies the regular backlog guard before the initial take', () => {
    const scripts = createHydrationScripts(undefined, [])
    const source = 'x'.repeat(1024 * 1024)

    try {
      for (let index = 0; index < 17; index++) {
        scripts.pushSource(source + index)
      }

      const output = scripts.claimOutput()
      expect(output.state).toBe(HydrationScriptOutputState.Failed)
      expect((output.error as Error).message).toContain('code-unit count')
    } finally {
      scripts.cleanup()
    }
  })

  test('allows one oversized source but rejects a second one', () => {
    const { scripts, output } = createReadyOutput()
    const first = 'a'.repeat(17 * 1024 * 1024)
    const second = 'b'.repeat(17 * 1024 * 1024)

    scripts.pushSource(first)
    expect(output.state).not.toBe(HydrationScriptOutputState.Failed)
    scripts.pushSource(second)

    expect(output.state).toBe(HydrationScriptOutputState.Failed)
    expect((output.error as Error).message).toContain('code-unit count')
    scripts.cleanup()
  })

  test('releases oversized-source accounting as soon as its source drains', () => {
    const openingBytes = encoder.encode('<script>').byteLength
    const separatorBytes = encoder.encode(';').byteLength
    const minimumSourceBytes = 17 * 1024 * 1024
    const sourceBytes =
      Math.ceil(
        (minimumSourceBytes + openingBytes + separatorBytes) /
          MAX_HYDRATION_OUTPUT_CHUNK_BYTES,
      ) *
        MAX_HYDRATION_OUTPUT_CHUNK_BYTES -
      openingBytes -
      separatorBytes
    const source = 'x'.repeat(sourceBytes)
    const chunksBeforeClose =
      (openingBytes + sourceBytes + separatorBytes) /
      MAX_HYDRATION_OUTPUT_CHUNK_BYTES
    const { scripts, output } = createReadyOutput()

    scripts.pushSource(source)
    for (let index = 0; index < chunksBeforeClose; index++) {
      expect(output.pullChunk()).toHaveLength(MAX_HYDRATION_OUTPUT_CHUNK_BYTES)
    }

    expect(output.state).toBe(HydrationScriptOutputState.Active)
    scripts.pushSource(source)
    expect(output.state).toBe(HydrationScriptOutputState.Active)
    expect(output.error).toBeUndefined()

    expect(decoder.decode(output.pullChunk())).toBe(
      'document.currentScript.remove()</script>',
    )
    expect(output.state).toBe(HydrationScriptOutputState.Ready)
    drainChunks(output)
    expect(output.state).toBe(HydrationScriptOutputState.Waiting)
    scripts.cleanup()
  })

  test('rejects a second consumer', () => {
    const scripts = createHydrationScripts(undefined, ['boot()'])
    scripts.claimOutput()
    expect(() => scripts.claimOutput()).toThrow(
      'SSR hydration script output already has a consumer',
    )
    scripts.cleanup()
  })

  test('rejects an output claim after the fast path owns the consumer', () => {
    const scripts = createHydrationScripts(undefined)
    scripts.disableHydration()
    expect(scripts.reserveFastPath()).toBe(true)
    expect(() => scripts.claimOutput()).toThrow(
      'SSR hydration script output already has a consumer',
    )
    scripts.cleanup()
  })

  test('cleanup clears active state and does not retain a new subscriber', async () => {
    const { scripts, output } = createReadyOutput()
    scripts.pushSource('x'.repeat(MAX_HYDRATION_OUTPUT_CHUNK_BYTES * 2))
    await flushMicrotasks()
    output.pullChunk()
    expect(output.state).toBe(HydrationScriptOutputState.Active)

    scripts.cleanup()

    expect(output.state).toBe(HydrationScriptOutputState.Done)
    expect(output.error).toBeUndefined()
    expect(() => output.pullChunk()).toThrow('not ready')
    const onChange = vi.fn()
    const unsubscribe = output.subscribe(onChange)
    scripts.pushSource('ignored()')
    scripts.finish()
    unsubscribe()
    expect(onChange).not.toHaveBeenCalled()
  })

  test('a render timeout fails immediately while a record is Active', async () => {
    vi.useFakeTimers()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { scripts, output } = createReadyOutput()
    const onChange = vi.fn()
    output.subscribe(onChange)

    try {
      scripts.pushSource('x'.repeat(MAX_HYDRATION_OUTPUT_CHUNK_BYTES * 2))
      await flushMicrotasks()
      output.pullChunk()
      expect(output.state).toBe(HydrationScriptOutputState.Active)

      scripts.startSerializationTimeout(10)
      await vi.advanceTimersByTimeAsync(10)

      expect(output.state).toBe(HydrationScriptOutputState.Failed)
      expect((output.error as Error).message).toContain('Serialization timeout')
      expect(onChange).toHaveBeenCalled()
    } finally {
      scripts.cleanup()
      errorSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  test('serialization completion clears the timeout during a slow active drain', async () => {
    vi.useFakeTimers()
    const { scripts, output } = createReadyOutput()

    try {
      scripts.pushSource('x'.repeat(MAX_HYDRATION_OUTPUT_CHUNK_BYTES * 2))
      await flushMicrotasks()
      output.pullChunk()
      expect(output.state).toBe(HydrationScriptOutputState.Active)

      scripts.startSerializationTimeout(10)
      scripts.finish()
      await vi.advanceTimersByTimeAsync(100)

      expect(output.state).toBe(HydrationScriptOutputState.Active)
      expect(decodeChunks(drainChunks(output))).toContain('$_TSR.e()')
      expect(output.state).toBe(HydrationScriptOutputState.Done)
    } finally {
      scripts.cleanup()
      vi.useRealTimers()
    }
  })
})
