import { registerOTel } from '@vercel/otel'
import { ORPCInstrumentation } from '@orpc/opentelemetry'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node'

export function register() {
  const traceExporter = new OTLPTraceExporter({
    url: 'http://localhost:4318/v1/traces',
  })

  registerOTel({
    serviceName: 'next-playground',
    instrumentations: [
      new ORPCInstrumentation(),
    ],
    spanProcessors: [
      new BatchSpanProcessor(traceExporter),
    ],
  })
}
