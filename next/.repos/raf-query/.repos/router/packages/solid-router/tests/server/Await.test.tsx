import { ErrorBoundary, Suspense } from 'solid-js'
import { describe, expect, it, vi } from 'vitest'
import { renderToStream, renderToStringAsync } from 'solid-js/web'
import { Await } from '../../src/awaited'

describe('Await (server)', () => {
  it('flushes blank content while an Await without a fallback is pending', async () => {
    let resolvePromise!: (value: string) => void
    const promise = new Promise<string>((resolve) => {
      resolvePromise = resolve
    })
    const records: Array<string> = []
    const completed = renderToStream(() => (
      <html>
        <body>
          <Await promise={promise}>{(value) => <span>{value}</span>}</Await>
        </body>
      </html>
    )).pipeTo(
      new WritableStream<Uint8Array>({
        write(chunk) {
          records.push(new TextDecoder().decode(chunk))
        },
      }),
    )

    await vi.waitFor(() => expect(records.length).toBeGreaterThan(0))
    expect(records.join('')).not.toContain('resolved')

    resolvePromise('resolved')
    await completed
    expect(records.join('')).toContain('resolved')
  })

  it('renders an error boundary when an Await without a fallback rejects', async () => {
    const html = await renderToStringAsync(() => (
      <Suspense fallback={<span>outer pending</span>}>
        <ErrorBoundary fallback={(error) => <span>{error.message}</span>}>
          <Suspense fallback={<span>inner pending</span>}>
            <Await promise={Promise.reject(new Error('rejected'))}>
              {(value) => <span>{value}</span>}
            </Await>
          </Suspense>
        </ErrorBoundary>
      </Suspense>
    ))

    expect(html).toContain('rejected')
    expect(html).not.toContain('pending')
  })

  it.each([
    ['zero', 0],
    ['false', false],
    ['empty string', ''],
    ['null', null],
    ['undefined', undefined],
  ])('renders a resolved %s value', async (_name, value) => {
    const children = vi.fn(() => <span>resolved</span>)

    const html = await renderToStringAsync(() => (
      <Await promise={Promise.resolve(value)} fallback={<span>pending</span>}>
        {children}
      </Await>
    ))

    expect(children).toHaveBeenCalledOnce()
    expect(children).toHaveBeenCalledWith(value)
    expect(html).toContain('resolved')
    expect(html).not.toContain('pending')
  })
})
