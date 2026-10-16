import { createFileRoute } from '@tanstack/vue-router'
import { createServerFn } from '@tanstack/vue-start'
import {
  fastSerialStaticData,
  makeFastSerialSmallData,
  sourceMarker,
} from '../../../../streaming-ssr-fixtures'

const getSmallData = createServerFn({ method: 'GET' }).handler(() =>
  makeFastSerialSmallData(),
)

export const Route = createFileRoute('/fast-serial')({
  loader: async () => {
    const data = await getSmallData()
    return {
      serverData: data,
      staticData: fastSerialStaticData,
      timestamp: Date.now(),
      loaderSource: sourceMarker(),
    }
  },
  component: FastSerial,
})

function FastSerial() {
  const data = Route.useLoaderData()

  return (
    <div style={{ padding: '20px' }}>
      <h2>Fast Serialization Test</h2>
      <p>This route tests when serialization completes before render.</p>
      <div data-testid="server-data">
        Server: {data.value.serverData.value} @{' '}
        {data.value.serverData.timestamp}
      </div>
      <div data-testid="server-fn-source">
        Server function source: {data.value.serverData.source}
      </div>
      <div data-testid="loader-source">
        Loader source: {data.value.loaderSource}
      </div>
      <div data-testid="static-data">Static: {data.value.staticData}</div>
      <div data-testid="loader-timestamp">
        Loader timestamp: {data.value.timestamp}
      </div>
    </div>
  )
}
