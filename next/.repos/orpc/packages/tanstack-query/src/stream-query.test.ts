import { sleep } from '@orpc/shared'
import { QueryClient } from '@tanstack/query-core'
import { serializableStreamedQuery } from './stream-query'

describe('serializableStreamedQuery', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })

  beforeEach(() => {
    queryClient.clear()
  })

  describe('refetchMode option', () => {
    it('works with reset refetch mode (default)', async () => {
      const key = ['refetch-test']

      const queryFn1 = serializableStreamedQuery(async () => {
        await sleep(50)
        return (async function* () {
          await sleep(50)
          yield 'initial1'
          await sleep(50)
          yield 'initial2'
        }())
      })

      const promise1 = expect(queryFn1({
        queryKey: key,
        signal: new AbortController().signal,
        client: queryClient,
      } as any)).resolves.toEqual(['initial1', 'initial2'])

      // not define anything on initial
      await sleep(0)
      expect(queryClient.getQueryState(key)).toBeUndefined()
      expect(queryClient.getQueryData(key)).toBeUndefined()

      await sleep(50)
      expect(queryClient.getQueryState(key)?.status).toBe('success')
      expect(queryClient.getQueryData(key)).toEqual([])

      await sleep(50)
      expect(queryClient.getQueryState(key)?.status).toBe('success')
      expect(queryClient.getQueryData(key)).toEqual(['initial1'])

      await sleep(50)
      expect(queryClient.getQueryState(key)?.status).toBe('success')
      expect(queryClient.getQueryData(key)).toEqual(['initial1', 'initial2'])

      await promise1

      // Refetch with reset mode (default)
      const queryFn2 = serializableStreamedQuery(async () => {
        await sleep(50)
        return (async function* () {
          await sleep(50)
          yield 'refetch1'
          await sleep(50)
          yield 'refetch2'
        }())
      })

      const resultPromise = expect(queryFn2({
        queryKey: key,
        signal: new AbortController().signal,
        client: queryClient,
      } as any)).resolves.toEqual(['refetch1', 'refetch2'])

      // should reset status to pending
      await sleep(0)
      expect(queryClient.getQueryState(key)?.status).toBe('pending')
      expect(queryClient.getQueryData(key)).toBeUndefined()

      await sleep(50)
      expect(queryClient.getQueryState(key)?.status).toBe('success')
      expect(queryClient.getQueryData(key)).toEqual([])

      await sleep(50)
      expect(queryClient.getQueryState(key)?.status).toBe('success')
      expect(queryClient.getQueryData(key)).toEqual(['refetch1'])

      await resultPromise
    })

    it('works with append refetch mode', async () => {
      const key = ['append-test']

      // First query
      const queryFn1 = serializableStreamedQuery(async () => {
        await sleep(50)
        return (async function* () {
          await sleep(50)
          yield 'initial1'
          await sleep(50)
          yield 'initial2'
        }())
      })

      const promise1 = expect(
        queryFn1({
          queryKey: key,
          signal: new AbortController().signal,
          client: queryClient,
        } as any),
      ).resolves.toEqual(['initial1', 'initial2'])

      await sleep(0)
      expect(queryClient.getQueryState(key)).toBeUndefined()
      expect(queryClient.getQueryData(key)).toBeUndefined()

      await sleep(50)
      expect(queryClient.getQueryState(key)?.status).toBe('success')
      expect(queryClient.getQueryData(key)).toEqual([])

      await sleep(50)
      expect(queryClient.getQueryState(key)?.status).toBe('success')
      expect(queryClient.getQueryData(key)).toEqual(['initial1'])

      await sleep(50)
      expect(queryClient.getQueryState(key)?.status).toBe('success')
      expect(queryClient.getQueryData(key)).toEqual(['initial1', 'initial2'])

      await promise1

      // Refetch with append mode
      const queryFn2 = serializableStreamedQuery(async () => {
        await sleep(50)
        return (async function* () {
          await sleep(50)
          yield 'append1'
          await sleep(50)
          yield 'append2'
        }())
      }, { refetchMode: 'append' })

      const promise2 = expect(queryFn2({
        queryKey: key,
        signal: new AbortController().signal,
        client: queryClient,
      } as any)).resolves.toEqual(['initial1', 'initial2', 'append1', 'append2'])

      await sleep(0)
      expect(queryClient.getQueryState(key)?.status).toBe('success')
      expect(queryClient.getQueryData(key)).toEqual(['initial1', 'initial2'])

      await sleep(50)
      expect(queryClient.getQueryState(key)?.status).toBe('success')
      expect(queryClient.getQueryData(key)).toEqual(['initial1', 'initial2'])

      await sleep(50)
      expect(queryClient.getQueryState(key)?.status).toBe('success')
      expect(queryClient.getQueryData(key)).toEqual(['initial1', 'initial2', 'append1'])

      await sleep(50)
      expect(queryClient.getQueryState(key)?.status).toBe('success')
      expect(queryClient.getQueryData(key)).toEqual(['initial1', 'initial2', 'append1', 'append2'])

      await promise2
    })

    it('works with replace refetch mode', async () => {
      const key = ['replace-test']

      const queryFn1 = serializableStreamedQuery(async () => {
        await sleep(50)
        return (async function* () {
          await sleep(50)
          yield 'initial1'
          await sleep(50)
          yield 'initial2'
        }())
      })

      const promise1 = expect(queryFn1({
        queryKey: key,
        signal: new AbortController().signal,
        client: queryClient,
      } as any)).resolves.toEqual(['initial1', 'initial2'])

      await sleep(0)
      expect(queryClient.getQueryState(key)).toBeUndefined()
      expect(queryClient.getQueryData(key)).toBeUndefined()

      await sleep(50)
      expect(queryClient.getQueryState(key)?.status).toBe('success')
      expect(queryClient.getQueryData(key)).toEqual([])

      await sleep(50)
      expect(queryClient.getQueryState(key)?.status).toBe('success')
      expect(queryClient.getQueryData(key)).toEqual(['initial1'])

      await sleep(50)
      expect(queryClient.getQueryState(key)?.status).toBe('success')
      expect(queryClient.getQueryData(key)).toEqual(['initial1', 'initial2'])

      await promise1

      // Refetch with replace mode
      const queryFn2 = serializableStreamedQuery(async () => {
        await sleep(50)
        return (async function* () {
          await sleep(50)
          yield 'replace1'
          await sleep(50)
          yield 'replace2'
        }())
      }, { refetchMode: 'replace' })

      const promise2 = expect(queryFn2({
        queryKey: key,
        signal: new AbortController().signal,
        client: queryClient,
      } as any)).resolves.toEqual(['replace1', 'replace2'])

      await sleep(0)
      expect(queryClient.getQueryState(key)?.status).toBe('success')
      expect(queryClient.getQueryData(key)).toEqual(['initial1', 'initial2'])

      await sleep(50)
      expect(queryClient.getQueryState(key)?.status).toBe('success')
      expect(queryClient.getQueryData(key)).toEqual(['initial1', 'initial2'])

      await sleep(50)
      expect(queryClient.getQueryState(key)?.status).toBe('success')
      expect(queryClient.getQueryData(key)).toEqual(['initial1', 'initial2'])

      await sleep(50)
      expect(queryClient.getQueryState(key)?.status).toBe('success')
      expect(queryClient.getQueryData(key)).toEqual(['replace1', 'replace2'])

      await promise2
    })
  })

  describe('maxChunks option', () => {
    it('works with append & parallel', async () => {
      const queryFn = serializableStreamedQuery(async () => {
        await sleep(50)

        return (async function* () {
          await sleep(50)
          yield 'chunk1'
          await sleep(50)
          yield 'chunk2'
          await sleep(50)
          yield 'chunk3'
          await sleep(50)
          yield 'chunk4'
          await sleep(50)
        }())
      }, { maxChunks: 2, refetchMode: 'append' })

      const controller = new AbortController()

      // exceed maxChunks with pre-existing data - should keep only the latest 2 chunks
      queryClient.setQueryData(['max-chunks-test'], ['pre1', 'pre2', 'pre3'])

      const resultPromise = expect(queryFn({
        queryKey: ['max-chunks-test'],
        signal: controller.signal,
        client: queryClient,
      } as any)).resolves.toEqual(['parallel5', 'parallel6'])

      await sleep(0)
      expect(queryClient.getQueryData(['max-chunks-test'])).toEqual(['pre2', 'pre3'])

      // exceed while still resolve streaming
      queryClient.setQueryData(['max-chunks-test'], ['pre4', 'pre5', 'pre6'])
      await sleep(50)
      expect(queryClient.getQueryData(['max-chunks-test'])).toEqual(['pre5', 'pre6'])

      await sleep(50)
      expect(queryClient.getQueryData(['max-chunks-test'])).toEqual(['pre6', 'chunk1'])

      await sleep(50)
      expect(queryClient.getQueryData(['max-chunks-test'])).toEqual(['chunk1', 'chunk2'])

      await sleep(50)
      expect(queryClient.getQueryData(['max-chunks-test'])).toEqual(['chunk2', 'chunk3'])

      // parallel during streaming
      queryClient.setQueryData(['max-chunks-test'], ['parallel1', 'parallel2', 'parallel3'])

      await sleep(50)
      expect(queryClient.getQueryData(['max-chunks-test'])).toEqual(['parallel3', 'chunk4'])

      // parallel during streaming
      queryClient.setQueryData(['max-chunks-test'], ['parallel4', 'parallel5', 'parallel6'])

      await resultPromise
    })

    it('works with reset & parallel', async () => {
      const queryFn = serializableStreamedQuery(async () => {
        await sleep(50)

        return (async function* () {
          await sleep(50)
          yield 'chunk1'
          await sleep(50)
          yield 'chunk2'
          await sleep(50)
          yield 'chunk3'
          await sleep(50)
          yield 'chunk4'
          await sleep(50)
        }())
      }, { maxChunks: 2, refetchMode: 'reset' })

      const controller = new AbortController()

      // exceed maxChunks with pre-existing data - should keep only the latest 2 chunks
      queryClient.setQueryData(['max-chunks-test'], ['pre1', 'pre2', 'pre3'])

      const resultPromise = expect(queryFn({
        queryKey: ['max-chunks-test'],
        signal: controller.signal,
        client: queryClient,
      } as any)).resolves.toEqual(['parallel5', 'parallel6'])

      await sleep(0)
      expect(queryClient.getQueryData(['max-chunks-test'])).toEqual(undefined)

      // exceed while still resolve streaming
      queryClient.setQueryData(['max-chunks-test'], ['pre4', 'pre5', 'pre6'])
      await sleep(50)
      expect(queryClient.getQueryData(['max-chunks-test'])).toEqual(['pre5', 'pre6'])

      await sleep(50)
      expect(queryClient.getQueryData(['max-chunks-test'])).toEqual(['pre6', 'chunk1'])

      await sleep(50)
      expect(queryClient.getQueryData(['max-chunks-test'])).toEqual(['chunk1', 'chunk2'])

      await sleep(50)
      expect(queryClient.getQueryData(['max-chunks-test'])).toEqual(['chunk2', 'chunk3'])

      // parallel during streaming
      queryClient.setQueryData(['max-chunks-test'], ['parallel1', 'parallel2', 'parallel3'])

      await sleep(50)
      expect(queryClient.getQueryData(['max-chunks-test'])).toEqual(['parallel3', 'chunk4'])

      // parallel during streaming
      queryClient.setQueryData(['max-chunks-test'], ['parallel4', 'parallel5', 'parallel6'])

      await resultPromise
    })

    it('works with replace & parallel', async () => {
      const queryFn = serializableStreamedQuery(async () => {
        await sleep(50)

        return (async function* () {
          await sleep(50)
          yield 'chunk1'
          await sleep(50)
          yield 'chunk2'
          await sleep(50)
          yield 'chunk3'
          await sleep(50)
          yield 'chunk4'
          await sleep(50)
        }())
      }, { maxChunks: 2, refetchMode: 'replace' })

      const controller = new AbortController()

      // exceed maxChunks with pre-existing data - should keep only the latest 2 chunks
      queryClient.setQueryData(['max-chunks-test'], ['pre1', 'pre2', 'pre3'])

      const resultPromise = expect(queryFn({
        queryKey: ['max-chunks-test'],
        signal: controller.signal,
        client: queryClient,
      } as any)).resolves.toEqual(['chunk3', 'chunk4'])

      await sleep(0)
      expect(queryClient.getQueryData(['max-chunks-test'])).toEqual(['pre2', 'pre3'])

      // exceed while still resolve streaming
      queryClient.setQueryData(['max-chunks-test'], ['pre4', 'pre5', 'pre6'])
      await sleep(50)
      expect(queryClient.getQueryData(['max-chunks-test'])).toEqual(['pre5', 'pre6'])

      await sleep(50)
      expect(queryClient.getQueryData(['max-chunks-test'])).toEqual(['pre5', 'pre6'])

      await sleep(50)
      expect(queryClient.getQueryData(['max-chunks-test'])).toEqual(['pre5', 'pre6'])

      await sleep(50)
      expect(queryClient.getQueryData(['max-chunks-test'])).toEqual(['pre5', 'pre6'])

      // parallel during streaming
      queryClient.setQueryData(['max-chunks-test'], ['parallel1', 'parallel2', 'parallel3'])

      await sleep(50)
      expect(queryClient.getQueryData(['max-chunks-test'])).toEqual(['parallel1', 'parallel2', 'parallel3'])

      // parallel during streaming
      queryClient.setQueryData(['max-chunks-test'], ['parallel4', 'parallel5', 'parallel6'])

      await resultPromise
    })

    it('with value Infinite (unlimited)', async () => {
      const queryFn = serializableStreamedQuery(async function* () {
        yield 'chunk1'
        yield 'chunk2'
        yield 'chunk3'
        yield 'chunk4'
        yield 'chunk5'
      }, { maxChunks: Number.POSITIVE_INFINITY })

      const result = await queryFn({
        queryKey: ['unlimited-chunks'],
        signal: new AbortController().signal,
        client: queryClient,
      } as any)

      expect(result).toEqual(['chunk1', 'chunk2', 'chunk3', 'chunk4', 'chunk5'])
      expect(queryClient.getQueryData(['unlimited-chunks'])).toEqual(['chunk1', 'chunk2', 'chunk3', 'chunk4', 'chunk5'])
    })
  })

  describe('abort signal handling', () => {
    it('handles abort signal during streaming', async () => {
      let cleanupCalled = false
      const yieldFn = vi.fn(v => v)
      const queryFn = serializableStreamedQuery(async function* () {
        try {
          yield yieldFn('chunk1')
          await new Promise(resolve => setTimeout(resolve, 50))
          yield yieldFn('chunk2')
          await new Promise(resolve => setTimeout(resolve, 50))
          yield yieldFn('chunk3')
        }
        finally {
          cleanupCalled = true
        }
      })

      const controller = new AbortController()

      const resultPromise = expect(queryFn({
        queryKey: ['abort-test'],
        signal: controller.signal,
        client: queryClient,
      } as any)).rejects.toSatisfy(err => err === controller.signal.reason)

      await vi.waitFor(() => {
        expect(queryClient.getQueryData(['abort-test'])).toEqual(['chunk1'])
      })

      controller.abort()

      await resultPromise
      expect(cleanupCalled).toBe(true)
      expect(yieldFn).toHaveBeenCalledTimes(2)
      expect(queryClient.getQueryData(['abort-test'])).toEqual(['chunk1'])
    })

    it('handles abort signal with replace refetch mode', async () => {
    // First query
      const queryFn1 = serializableStreamedQuery(async function* () {
        yield 'initial1'
        yield 'initial2'
      })

      await queryFn1({
        queryKey: ['abort-replace-test'],
        signal: new AbortController().signal,
        client: queryClient,
      } as any)

      expect(queryClient.getQueryData(['abort-replace-test'])).toEqual(['initial1', 'initial2'])

      // Refetch with replace mode and abort
      const queryFn2 = serializableStreamedQuery(async function* () {
        yield 'replace1'
        await new Promise(resolve => setTimeout(resolve, 50))
        yield 'replace2'
      }, { refetchMode: 'replace' })

      const controller = new AbortController()

      const resultPromise = expect(queryFn2({
        queryKey: ['abort-replace-test'],
        signal: controller.signal,
        client: queryClient,
      } as any)).rejects.toSatisfy(err => err === controller.signal.reason)

      await new Promise(resolve => setTimeout(resolve, 25))
      controller.abort()

      await resultPromise

      // Should not replace cache when aborted
      expect(queryClient.getQueryData(['abort-replace-test'])).toEqual(['initial1', 'initial2'])
    })
  })

  describe('edge cases', () => {
    it('handle cache is reset while ending stream', async () => {
      const key = ['data-reset-test']

      const queryFn = serializableStreamedQuery(async function* () {
        yield 'chunk1'
        await sleep(100)
      })

      const promise1 = expect(queryFn({
        queryKey: key,
        signal: new AbortController().signal,
        client: queryClient,
      } as any)).resolves.toEqual(['chunk1'])

      await sleep(0)
      expect(queryClient.getQueryData(key)).toEqual(['chunk1'])

      // reset data before stream ends
      queryClient.resetQueries({ queryKey: key, exact: true })

      await promise1
    })

    it('handles error in stream', async () => {
      const queryFn = serializableStreamedQuery(async function* () {
        yield 'chunk1'
        await new Promise(resolve => setTimeout(resolve, 50))
        throw new Error('Stream error')
      })

      await expect(queryFn({
        queryKey: ['error-stream'],
        signal: new AbortController().signal,
        client: queryClient,
      } as any)).rejects.toThrow('Stream error')

      // Should still have the chunk that was yielded before error
      expect(queryClient.getQueryData(['error-stream'])).toEqual(['chunk1'])
    })
  })
})
