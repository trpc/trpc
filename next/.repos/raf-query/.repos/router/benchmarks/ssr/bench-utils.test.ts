import { describe, expect, it } from 'vitest'
import { buildRequestSequences, runRequestLoop } from './bench-utils'
import type { StartRequestHandler } from './bench-utils'

function deferred() {
  let resolve = () => {}
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('runRequestLoop', () => {
  it('caps fixed concurrency and waits for every streaming body', async () => {
    const concurrency = 4
    const totalRequests = 20
    const firstWaveStarted = deferred()
    let builtRequests = 0
    let executedRequests = 0
    let validatedResponses = 0
    let finishedBodies = 0
    let inFlightRequests = 0
    let maximumInFlightRequests = 0

    const handler: StartRequestHandler = {
      fetch() {
        expect(builtRequests).toBe(totalRequests)
        executedRequests += 1
        inFlightRequests += 1
        maximumInFlightRequests = Math.max(
          maximumInFlightRequests,
          inFlightRequests,
        )

        if (inFlightRequests === concurrency) {
          firstWaveStarted.resolve()
        }

        const body = new ReadableStream<Uint8Array>({
          async start(controller) {
            await firstWaveStarted.promise
            controller.enqueue(new Uint8Array([1]))
            controller.close()
            finishedBodies += 1
            inFlightRequests -= 1
          },
        })

        return new Response(body)
      },
    }

    await runRequestLoop(handler, {
      seed: 123,
      concurrency,
      totalRequests,
      buildRequest: (_random, index) => {
        builtRequests += 1
        return new Request(`http://localhost/request/${index}`)
      },
      validateResponse: () => {
        validatedResponses += 1
      },
    })

    expect(builtRequests).toBe(totalRequests)
    expect(executedRequests).toBe(totalRequests)
    expect(validatedResponses).toBe(totalRequests)
    expect(maximumInFlightRequests).toBe(concurrency)
    expect(inFlightRequests).toBe(0)
    expect(finishedBodies).toBe(totalRequests)
  })

  it('builds identical predetermined worker sequences from identical seeds', () => {
    const buildSequences = (seed: number) =>
      buildRequestSequences({
        seed,
        concurrency: 4,
        totalRequests: 12,
        buildRequest: (random, index) =>
          new Request(
            `http://localhost/request/${index}?value=${random().toString(36)}`,
          ),
      }).map((requests) => requests.map((request) => request.url))

    const first = buildSequences(456)
    const second = buildSequences(456)

    expect(second).toEqual(first)
    expect(first.map((requests) => requests.map(requestIndex))).toEqual([
      [0, 4, 8],
      [1, 5, 9],
      [2, 6, 10],
      [3, 7, 11],
    ])
  })

  it('drains every started body before reporting a worker failure', async () => {
    const concurrency = 4
    const firstWaveStarted = deferred()
    let executedRequests = 0
    let finishedBodies = 0
    let inFlightRequests = 0

    const handler: StartRequestHandler = {
      fetch(request) {
        executedRequests += 1
        inFlightRequests += 1
        if (inFlightRequests === concurrency) {
          firstWaveStarted.resolve()
        }

        const body = new ReadableStream<Uint8Array>({
          async start(controller) {
            await firstWaveStarted.promise
            controller.close()
            finishedBodies += 1
            inFlightRequests -= 1
          },
        })

        return new Response(body, {
          status: request.url.endsWith('/0') ? 500 : 200,
        })
      },
    }

    await expect(
      runRequestLoop(handler, {
        seed: 789,
        concurrency,
        totalRequests: 12,
        buildRequest: (_random, index) =>
          new Request(`http://localhost/request/${index}`),
      }),
    ).rejects.toThrow('non-200 status 500')

    expect(finishedBodies).toBe(executedRequests)
    expect(inFlightRequests).toBe(0)
  })
})

function requestIndex(url: string) {
  return Number(new URL(url).pathname.split('/').at(-1))
}
