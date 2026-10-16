import { Await, createFileRoute } from '@tanstack/react-router'
import { Suspense, useEffect, useRef, useState } from 'react'
import {
  createChunkStream,
  createStreamPromise,
} from '../../../../streaming-ssr-fixtures'

export const Route = createFileRoute('/stream')({
  component: StreamRoute,
  loader() {
    return {
      promise: createStreamPromise(),
      stream: createChunkStream(),
    }
  },
})

const decoder = new TextDecoder('utf-8')

function StreamRoute() {
  const { promise, stream } = Route.useLoaderData()
  const [streamData, setStreamData] = useState<Array<string>>([])
  const [streamComplete, setStreamComplete] = useState(false)
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null)
  const streamRef = useRef<ReadableStream | null>(null)

  useEffect(() => {
    if (streamRef.current === stream && readerRef.current) {
      return
    }

    if (streamRef.current !== stream) {
      setStreamData([])
      setStreamComplete(false)
      streamRef.current = stream
    }

    if (stream.locked) {
      return
    }

    async function fetchStream() {
      try {
        const reader = stream.getReader()
        readerRef.current = reader
        let chunk

        while (!(chunk = await reader.read()).done) {
          let value = chunk.value
          if (typeof value !== 'string') {
            value = decoder.decode(value, { stream: !chunk.done })
          }
          setStreamData((prev) => [...prev, value])
        }
        setStreamComplete(true)
      } catch (e) {
        if (!(e instanceof TypeError && String(e).includes('cancelled'))) {
          console.error('Stream error:', e)
        }
      }
    }

    fetchStream()

    return () => {
      if (readerRef.current) {
        readerRef.current.cancel().catch(() => {})
        readerRef.current = null
      }
    }
  }, [stream])

  return (
    <div style={{ padding: '20px' }}>
      <h2>ReadableStream Test</h2>

      <Suspense
        fallback={<div data-testid="promise-loading">Loading promise...</div>}
      >
        <Await
          promise={promise}
          children={(data) => <div data-testid="promise-data">{data}</div>}
        />
      </Suspense>

      <div data-testid="stream-container">
        <h3>Stream chunks:</h3>
        <div data-testid="stream-data">
          {streamData.map((chunk, i) => (
            <div key={i} data-testid={`stream-chunk-${i}`}>
              {chunk}
            </div>
          ))}
        </div>
        {streamComplete && (
          <div data-testid="stream-complete">Stream complete!</div>
        )}
      </div>
    </div>
  )
}
