import { NodeSDK } from '@opentelemetry/sdk-node'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node'
import { ORPCInstrumentation } from '@orpc/opentelemetry'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'

const traceExporter = new OTLPTraceExporter({
  url: 'http://localhost:4318/v1/traces',
})

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    'service.name': 'bun-playground',
  }),
  spanProcessors: [
    new BatchSpanProcessor(traceExporter),
  ],
  instrumentations: [
    getNodeAutoInstrumentations(),
    new ORPCInstrumentation(),
  ],
})

sdk.start()
