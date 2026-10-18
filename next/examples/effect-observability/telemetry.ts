/**
 * OpenTelemetry for one service, exporting into memory so the smoke and the
 * tests can read the spans. A real app passes an OTLP exporter
 * (`@opentelemetry/exporter-trace-otlp-http`) to the same `NodeSdk.layer`.
 */
import * as NodeSdk from '@effect/opentelemetry/NodeSdk';
import type { Resource } from '@effect/opentelemetry/Resource';
import {
  InMemorySpanExporter,
  type ReadableSpan,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import type { Layer } from 'effect';

/** Keeps its spans when the SDK shuts down; `InMemorySpanExporter` drops them. */
class KeepingExporter extends InMemorySpanExporter {
  override shutdown(): Promise<void> {
    return this.forceFlush();
  }
}

export interface Telemetry {
  readonly layer: Layer.Layer<Resource>;
  /** The spans this service has ended so far. */
  readonly spans: () => ReadonlyArray<ReadableSpan>;
}

export function inMemoryTelemetry(serviceName: string): Telemetry {
  const exporter = new KeepingExporter();
  return {
    layer: NodeSdk.layer(() => ({
      resource: { serviceName },
      spanProcessor: new SimpleSpanProcessor(exporter),
    })),
    spans: () => exporter.getFinishedSpans(),
  };
}

const serviceOf = (span: ReadableSpan) =>
  String(span.resource.attributes['service.name']);

/** The trace's spans as an indented tree, children in start order. */
export function formatTrace(
  traceId: string,
  spans: ReadonlyArray<ReadableSpan>,
): string {
  const inTrace = spans
    .filter((s) => s.spanContext().traceId === traceId)
    .sort((a, b) => hrMs(a.startTime) - hrMs(b.startTime));
  const ids = new Set(inTrace.map((s) => s.spanContext().spanId));
  const start = inTrace[0] ? hrMs(inTrace[0].startTime) : 0;
  const lines: string[] = [];
  const visit = (parentId: string | undefined, depth: number) => {
    for (const span of inTrace) {
      const parent = span.parentSpanContext?.spanId;
      const isRoot = parent === undefined || !ids.has(parent);
      if (parentId === undefined ? !isRoot : parent !== parentId) continue;
      const from = hrMs(span.startTime) - start;
      const to = hrMs(span.endTime) - start;
      lines.push(
        `${'  '.repeat(depth)}${span.name} [${serviceOf(span)}] ${from.toFixed(0)}–${to.toFixed(0)}ms`,
      );
      visit(span.spanContext().spanId, depth + 1);
    }
  };
  visit(undefined, 0);
  return lines.join('\n');
}

/** The span named `name` that `service` ended, in `traceId` when given. */
export function findSpan(
  spans: ReadonlyArray<ReadableSpan>,
  opts: { name: string; service: string; traceId?: string | undefined },
): ReadableSpan {
  const span = spans.find(
    (s) =>
      s.name === opts.name &&
      serviceOf(s) === opts.service &&
      (opts.traceId === undefined || s.spanContext().traceId === opts.traceId),
  );
  if (!span) throw new Error(`No ${opts.name} span from ${opts.service}`);
  return span;
}

/** An OpenTelemetry time in milliseconds. */
export const hrMs = (time: readonly [number, number]): number =>
  time[0] * 1e3 + time[1] / 1e6;
