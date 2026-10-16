import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
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
  const { serverData, staticData, timestamp, loaderSource } =
    Route.useLoaderData()

  return (
    <div style={{ padding: '20px' }}>
      <h2>Fast Serialization Test</h2>
      <p>This route tests when serialization completes before render.</p>

      <div data-testid="server-data">
        Server: {serverData.value} @ {serverData.timestamp}
      </div>

      <div data-testid="server-fn-source">
        Server function source: {serverData.source}
      </div>

      <div data-testid="loader-source">Loader source: {loaderSource}</div>

      <div data-testid="static-data">Static: {staticData}</div>

      <div data-testid="loader-timestamp">Loader timestamp: {timestamp}</div>
    </div>
  )
}
