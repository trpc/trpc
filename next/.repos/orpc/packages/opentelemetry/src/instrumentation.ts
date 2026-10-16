import type { InstrumentationConfig, InstrumentationModuleDefinition } from '@opentelemetry/instrumentation'
import { context, propagation, trace } from '@opentelemetry/api'
import { InstrumentationBase } from '@opentelemetry/instrumentation'
import { setTracer } from '@orpc/shared'
import pkg from '../package.json'
import { OpenTelemetryTracer } from './tracer'

export interface ORPCInstrumentationConfig extends InstrumentationConfig {
  /**
   * Whether to enable automatic OpenTelemetry context/span propagation.
   *
   * Disable this if propagation is handled elsewhere or managed manually.
   *
   * @default true
   */
  propagationEnabled?: boolean
}

/**
 * OpenTelemetry instrumentation for oRPC. Automatically instruments both
 * client and server for distributed tracing.
 *
 * @see {@link https://orpc.dev/docs/integrations/opentelemetry | OpenTelemetry Integration}
 */
export class ORPCInstrumentation extends InstrumentationBase<ORPCInstrumentationConfig> {
  constructor(config: ORPCInstrumentationConfig = {}) {
    super(pkg.name, pkg.version, config)
  }

  protected override init(): InstrumentationModuleDefinition | InstrumentationModuleDefinition[] | void {
  }

  override enable(): void {
    setTracer(new OpenTelemetryTracer({
      tracer: () => this.tracer,
      trace,
      context,
      propagation: (this._config.propagationEnabled ?? true) ? propagation : undefined,
    }))
  }

  override disable(): void {
    setTracer(undefined)
  }
}
