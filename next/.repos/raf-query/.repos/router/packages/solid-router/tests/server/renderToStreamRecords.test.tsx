import { Suspense, createResource } from 'solid-js'
import { describe, expect, test } from 'vitest'
import { renderToStream } from 'solid-js/web'

describe('installed Solid stream renderer', () => {
  test('writes a resolved Suspense patch as complete records', async () => {
    let resolveResource!: (value: string) => void
    const resource = new Promise<string>((resolve) => {
      resolveResource = resolve
    })

    function Deferred() {
      const [value] = createResource(() => resource)
      return (
        <Suspense fallback={<p>solid-fallback</p>}>
          <p>{value()}</p>
        </Suspense>
      )
    }

    const records: Array<string> = []
    let resolveFirstRecord!: () => void
    const firstRecord = new Promise<void>((resolve) => {
      resolveFirstRecord = resolve
    })
    const stream = renderToStream(() => (
      <html>
        <body>
          <Deferred />
        </body>
      </html>
    ))
    const completed = stream.pipeTo(
      new WritableStream<Uint8Array>({
        write(chunk) {
          records.push(new TextDecoder('utf-8', { fatal: true }).decode(chunk))
          if (records.length === 1) {
            resolveFirstRecord()
          }
        },
      }),
    )

    await firstRecord
    expect(records[0]).toContain('solid-fallback')

    resolveResource('solid-resolved')
    await completed

    const templateIndex = records.findIndex((record) =>
      record.includes('solid-resolved'),
    )
    expect(templateIndex).toBeGreaterThan(0)
    expect(records[templateIndex]).toMatch(
      /^<template\b[^>]*>[\s\S]*<\/template>$/,
    )

    const scriptRecord = records[templateIndex + 1]
    expect(scriptRecord).toMatch(/^<script\b[^>]*>[\s\S]*<\/script>$/)
  })
})
