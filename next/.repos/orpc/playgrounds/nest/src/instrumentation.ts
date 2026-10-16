import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import { ORPCInstrumentation } from '@orpc/opentelemetry'

const traceExporter = new OTLPTraceExporter({
  url: 'http://localhost:4318/v1/traces',
})

const provider = new NodeTracerProvider({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: 'nest-playground',
  }),
  spanProcessors: [
    new BatchSpanProcessor(traceExporter),
  ],
})
provider.register()

registerInstrumentations({
  instrumentations: [
    new HttpInstrumentation(),
    new ORPCInstrumentation(),
  ],
})
