import * as Config from "../../Config.ts"
import * as Schema from "../../Schema.ts"

export type Signal = "LOGS" | "METRICS" | "TRACES"

const exporterList = (path: string) =>
  Config.Array(Schema.String, path).pipe(
    Config.map((_) => _.map((_) => _.toLowerCase().trim()).filter((_) => _ !== ""))
  )

const headersRecord = (path: string) => Config.Record(Schema.String, Schema.StringFromUriComponent, path)

export const headers = (signal: Signal) =>
  headersRecord(`OTEL_EXPORTER_OTLP_${signal}_HEADERS`).pipe(
    Config.orElse(() => headersRecord("OTEL_EXPORTER_OTLP_HEADERS")),
    Config.withDefault(undefined)
  )

export const endpoint = (signal: Signal) =>
  Config.URL(`OTEL_EXPORTER_OTLP_${signal}_ENDPOINT`).pipe(
    Config.orElse(() =>
      Config.URL("OTEL_EXPORTER_OTLP_ENDPOINT").pipe(
        Config.map((url) => {
          const slash = url.pathname.endsWith("/") ? "" : "/"
          url.pathname += `${slash}v1/${signal.toLowerCase()}`
          return url
        })
      )
    ),
    Config.withDefault(undefined)
  )

export const exporters = (signal: Signal) =>
  exporterList(`OTEL_${signal}_EXPORTER`).pipe(
    Config.withDefault<ReadonlyArray<string>>([])
  )
