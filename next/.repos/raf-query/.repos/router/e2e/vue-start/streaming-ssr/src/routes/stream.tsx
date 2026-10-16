import { Await, createFileRoute, useRouter } from '@tanstack/vue-router'
import {
  Suspense,
  defineComponent,
  onMounted,
  onUnmounted,
  ref,
  watch,
} from 'vue'
import {
  createChunkStream,
  createStreamPromise,
} from '../../../../streaming-ssr-fixtures'

export const Route = createFileRoute('/stream')({
  component: () => <StreamRoute />,
  loader() {
    return {
      promise: createStreamPromise(),
      stream: createChunkStream(),
    }
  },
})

const decoder = new TextDecoder('utf-8')

const StreamRoute = defineComponent({
  setup() {
    const data = Route.useLoaderData()
    const router = useRouter()
    const streamData = ref<Array<string>>([])
    const streamComplete = ref(false)
    const streamReadCount = ref(0)
    let reader: ReadableStreamDefaultReader | undefined
    let mounted = false
    let activeStream: ReadableStream | undefined
    let reading = false
    let readTimer: ReturnType<typeof setTimeout> | undefined

    function clearReadTimer() {
      if (readTimer) {
        clearTimeout(readTimer)
        readTimer = undefined
      }
    }

    function scheduleRead(delay = 0) {
      if (!mounted || reading) {
        return
      }

      clearReadTimer()
      readTimer = setTimeout(() => {
        readTimer = undefined
        void readStream()
      }, delay)
    }

    async function readStream() {
      const stream = data.value.stream
      if (!mounted || reading || activeStream === stream) {
        return
      }

      if (stream.locked) {
        scheduleRead(10)
        return
      }

      streamData.value = []
      streamComplete.value = false

      let activeReader: ReadableStreamDefaultReader | undefined

      try {
        const currentReader = stream.getReader()
        activeReader = currentReader
        reader = currentReader
        activeStream = stream
        reading = true
        streamReadCount.value++

        let chunk
        while (!(chunk = await currentReader.read()).done) {
          let value = chunk.value
          if (typeof value !== 'string') {
            value = decoder.decode(value, { stream: !chunk.done })
          }
          streamData.value = [...streamData.value, value]
        }
        streamComplete.value = true
      } catch (e) {
        const message = String(e)
        if (e instanceof TypeError && message.includes('locked')) {
          activeStream = undefined
          scheduleRead(10)
        } else if (!(e instanceof TypeError && message.includes('cancelled'))) {
          console.error('Stream error:', e)
        }
      } finally {
        activeReader?.releaseLock()
        if (reader === activeReader) {
          reader = undefined
        }
        reading = false
        if (activeStream !== data.value.stream) {
          scheduleRead()
        }
      }
    }

    onMounted(() => {
      mounted = true
      scheduleRead()
    })
    watch(
      () => data.value.stream,
      () => {
        activeStream = undefined
        scheduleRead()
      },
    )
    onUnmounted(() => {
      mounted = false
      clearReadTimer()
      reader?.cancel().catch(() => {})
      reader = undefined
    })

    return () => (
      <div style={{ padding: '20px' }}>
        <h2>ReadableStream Test</h2>
        <button
          data-testid="refresh-stream"
          onClick={() => router.invalidate()}
        >
          Refresh stream
        </button>
        <Suspense>
          {{
            default: () => (
              <Await
                promise={data.value.promise}
                children={(value: string) => (
                  <div data-testid="promise-data">{value}</div>
                )}
              />
            ),
            fallback: () => (
              <div data-testid="promise-loading">Loading promise...</div>
            ),
          }}
        </Suspense>
        <div data-testid="stream-container">
          <h3>Stream chunks:</h3>
          <div
            data-testid="stream-data"
            data-read-count={streamReadCount.value}
          >
            {streamData.value.map((chunk, i) => (
              <div data-testid={`stream-chunk-${i}`}>{chunk}</div>
            ))}
          </div>
          {streamComplete.value && (
            <div data-testid="stream-complete">Stream complete!</div>
          )}
        </div>
      </div>
    )
  },
})
