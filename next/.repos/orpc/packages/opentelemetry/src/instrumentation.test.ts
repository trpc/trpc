import { trace } from '@opentelemetry/api'
import { registerInstrumentations } from '@opentelemetry/instrumentation'
import { InMemorySpanExporter, NodeTracerProvider, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node'
import * as SharedModule from '@orpc/shared'
import pkg from '../package.json'
import { ORPCInstrumentation } from './instrumentation'
import { OpenTelemetryTracer } from './tracer'

const setTracerSpy = vi.spyOn(SharedModule, 'setTracer').mockImplementation(() => {})
const getTracerSpy = vi.spyOn(trace, 'getTracer')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('oRPCInstrumentation', () => {
  it('should initialize the instrumentation and enable by default', () => {
    void new ORPCInstrumentation()

    expect(getTracerSpy).toHaveBeenCalledWith(pkg.name, pkg.version)
    expect(setTracerSpy).toHaveBeenCalledTimes(1)

    const tracer = setTracerSpy.mock.calls[0]![0]
    expect(tracer).toBeInstanceOf(OpenTelemetryTracer)
    expect(tracer!.inject).toBeTypeOf('function')
    expect(tracer!.extract).toBeTypeOf('function')
  })

  it('should support propagationEnabled=false', () => {
    void new ORPCInstrumentation({ propagationEnabled: false })

    const tracer = setTracerSpy.mock.calls[0]![0]
    expect(tracer).toBeInstanceOf(OpenTelemetryTracer)
    expect(tracer!.inject).toBeUndefined()
    expect(tracer!.extract).toBeUndefined()
  })

  it('should not enable if enabled=false', () => {
    void new ORPCInstrumentation({ enabled: false })
    expect(setTracerSpy).not.toHaveBeenCalled()
  })

  it('can disable the instrumentation', () => {
    const instrumentation = new ORPCInstrumentation()
    instrumentation.disable()
    expect(setTracerSpy).toHaveBeenCalledWith(undefined)
  })

  describe('tracer provider given to registerInstrumentations', () => {
    const exporter = new InMemorySpanExporter()
    const provider = new NodeTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] })

    beforeEach(() => {
      exporter.reset()
    })

    it.each([
      ['an enabled', {}],
      ['a disabled', { enabled: false }],
    ])('receives the spans of %s instrumentation without being registered globally', (_, config) => {
      registerInstrumentations({ instrumentations: [new ORPCInstrumentation(config)], tracerProvider: provider })

      setTracerSpy.mock.lastCall![0]!.startSpan('span').end()

      expect(exporter.getFinishedSpans()).toHaveLength(1)
    })
  })
})
