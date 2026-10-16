/**
 * Formats Effect metrics for Prometheus.
 *
 * This module reads metrics from the current Effect context and renders them in
 * the Prometheus text format. It can also register a pull-based HTTP endpoint,
 * such as `/metrics`, for Prometheus to scrape.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as HttpRouter from "../http/HttpRouter.ts"
import * as HttpServerResponse from "../http/HttpServerResponse.ts"
import * as Layer from "../Layer.ts"
import * as Metric from "../Metric.ts"

/**
 * A function that transforms metric names before formatting.
 *
 * **Example** (Mapping metric names)
 *
 * ```ts import.meta.vitest
 * import type { PrometheusMetrics } from "effect/observability"
 *
 * // Convert camelCase to snake_case
 * const mapper: PrometheusMetrics.MetricNameMapper = (name) =>
 *   name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase()
 *
 * mapper("httpRequests") // => "http_requests"
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type MetricNameMapper = (name: string) => string

/**
 * Options for formatting metrics.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface FormatOptions {
  /**
   * Optional prefix to prepend to all metric names.
   * The prefix will be sanitized and joined with an underscore.
   */
  readonly prefix?: string | undefined
  /**
   * Optional function to transform metric names before sanitization.
   */
  readonly metricNameMapper?: MetricNameMapper | undefined
}

/**
 * Options for exporting Prometheus metrics over HTTP.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface HttpOptions extends FormatOptions {
  /**
   * The path to the HTTP route on which Prometheus metrics should be served.
   */
  readonly path?: HttpRouter.PathInput | undefined
}

/**
 * Formats all metrics in the registry to Prometheus exposition format.
 *
 * **Example** (Formatting metrics)
 *
 * ```ts import.meta.vitest
 * import { Effect, Metric } from "effect"
 * import { PrometheusMetrics } from "effect/observability"
 *
 * const program = Effect.gen(function*() {
 *   const counter = Metric.counter("api_requests_total", {
 *     description: "Total API requests"
 *   })
 *   const gauge = Metric.gauge("active_connections", {
 *     description: "Number of active connections"
 *   })
 *
 *   yield* Metric.update(counter, 100)
 *   yield* Metric.update(gauge, 25)
 *
 *   // Format without prefix
 *   const output1 = yield* PrometheusMetrics.format()
 *
 *   // Format with prefix
 *   const output2 = yield* PrometheusMetrics.format({ prefix: "myapp" })
 *
 *   return [output1.includes("api_requests_total"), output2.includes("myapp_active_connections")]
 * })
 *
 * Effect.runSync(program) // => [true, true]
 * ```
 *
 * @stability unstable
 * @category formatting
 * @since 4.0.0
 */
export const format: (options?: FormatOptions | undefined) => Effect.Effect<string> = Effect.fnUntraced(
  function*(options) {
    const services = yield* Effect.context<never>()
    return formatUnsafe(services, options)
  }
)

/**
 * Formats all metrics in the registry to Prometheus exposition format synchronously.
 *
 * **When to use**
 *
 * Use when you already have access to the context and need low-level
 * synchronous formatting.
 *
 * @see {@link format} for effectful formatting from the current context
 *
 * @stability unstable
 * @category formatting
 * @since 4.0.0
 */
export const formatUnsafe = (
  context: Context.Context<never>,
  options?: FormatOptions | undefined
): string => {
  const snapshot = Metric.snapshotUnsafe(context)
  const prefix = options?.prefix ? sanitizeMetricName(options.prefix) + "_" : ""
  const mapper = options?.metricNameMapper ?? ((name: string) => name)
  const lines: Array<string> = []

  // Group metrics by base name for proper TYPE/HELP declarations
  const metricsByName = new Map<string, Array<Metric.Metric.Snapshot>>()
  for (let i = 0; i < snapshot.length; i++) {
    const metric = snapshot[i]
    const name = prefix + sanitizeMetricName(mapper(metric.id))
    const existing = metricsByName.get(name)
    if (existing) {
      existing.push(metric)
    } else {
      metricsByName.set(name, [metric])
    }
  }

  for (const [name, metrics] of metricsByName) {
    formatMetricFamily(name, metrics, lines)
  }

  // Prometheus expects a trailing newline if there's content
  return lines.length > 0 ? lines.join("\n") + "\n" : ""
}

/**
 * Creates a Layer that registers a `/metrics` HTTP endpoint for Prometheus
 * scraping.
 *
 * **Details**
 *
 * This layer automatically adds a GET route to your HTTP router that serves
 * metrics in Prometheus exposition format. By default, the endpoint is
 * registered at `/metrics`, but this can be customized via the `path` option.
 *
 * **Example** (Serving metrics over HTTP)
 *
 * ```ts import.meta.vitest
 * import { Layer } from "effect"
 * import { PrometheusMetrics } from "effect/observability"
 *
 * // Create a layer that adds /metrics endpoint to the router
 * const PrometheusLayer = PrometheusMetrics.layerHttp()
 *
 * // Or customize the path and add a prefix to all metric names
 * const CustomPrometheusLayer = PrometheusMetrics.layerHttp({
 *   path: "/prometheus/metrics",
 *   prefix: "myapp"
 * })
 *
 * const result = [Layer.isLayer(PrometheusLayer), Layer.isLayer(CustomPrometheusLayer)] // => [true, true]
 * ```
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerHttp = (
  options?: HttpOptions | undefined
): Layer.Layer<never, never, HttpRouter.HttpRouter> =>
  Layer.effectDiscard(Effect.gen(function*() {
    const router = yield* HttpRouter.HttpRouter

    const { path, ...formatOptions } = options ?? {}

    const handler = Effect.gen(function*() {
      const body = yield* format(formatOptions)
      return HttpServerResponse.text(body, {
        contentType: "text/plain; version=0.0.4; charset=utf-8"
      })
    })

    yield* router.add("GET", path ?? "/metrics", handler)
  }))

// -----------------------------------------------------------------------------
// Internal
// -----------------------------------------------------------------------------

/**
 * Sanitize a metric name to conform to Prometheus naming rules.
 * Valid characters: [a-zA-Z_:][a-zA-Z0-9_:]*
 */
const sanitizeMetricName = (name: string): string => {
  // Replace invalid characters with underscores
  let sanitized = name.replace(/[^a-zA-Z0-9_:]/g, "_")
  // Ensure it starts with a letter or underscore (not a digit or colon)
  if (/^[0-9:]/.test(sanitized)) {
    sanitized = "_" + sanitized
  }
  // Remove consecutive underscores
  sanitized = sanitized.replace(/_+/g, "_")
  // Remove trailing underscores
  sanitized = sanitized.replace(/_$/, "")
  return sanitized
}

/**
 * Sanitize a label name to conform to Prometheus naming rules.
 * Valid characters: [a-zA-Z_][a-zA-Z0-9_]*
 */
const sanitizeLabelName = (name: string): string => {
  // Replace invalid characters with underscores
  let sanitized = name.replace(/[^a-zA-Z0-9_]/g, "_")
  // Ensure it starts with a letter or underscore
  if (/^[0-9]/.test(sanitized)) {
    sanitized = "_" + sanitized
  }
  // Remove consecutive underscores
  sanitized = sanitized.replace(/_+/g, "_")
  return sanitized
}

/**
 * Escape special characters in label values.
 * Backslash, double-quote, and newline must be escaped.
 */
const escapeLabelValue = (value: string): string => {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"")
    .replace(/\n/g, "\\n")
}

/**
 * Escape special characters in HELP text.
 * Backslash and newline must be escaped.
 */
const escapeHelp = (text: string): string => {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
}

/**
 * Format a numeric value for Prometheus output.
 * Handles special values like NaN and Infinity.
 */
const formatValue = (value: number | bigint): string => {
  if (typeof value === "bigint") {
    return value.toString()
  }
  if (Number.isNaN(value)) {
    return "NaN"
  }
  if (value === Infinity) {
    return "+Inf"
  }
  if (value === -Infinity) {
    return "-Inf"
  }
  return value.toString()
}

/**
 * Format labels as a Prometheus label string.
 * Returns empty string if no labels, otherwise returns {label1="value1",label2="value2"}
 */
const formatLabels = (
  attributes: Metric.Metric.AttributeSet | undefined,
  extraLabels?: Array<[string, string]>
): string => {
  const labels: Array<string> = []

  // Add metric attributes as labels
  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      // Skip internal attributes like "unit" and "time_unit"
      if (key === "unit" || key === "time_unit") continue
      labels.push(`${sanitizeLabelName(key)}="${escapeLabelValue(value)}"`)
    }
  }

  // Add extra labels (e.g., for histogram buckets, summary quantiles)
  if (extraLabels) {
    for (const [key, value] of extraLabels) {
      labels.push(`${sanitizeLabelName(key)}="${escapeLabelValue(value)}"`)
    }
  }

  return labels.length > 0 ? `{${labels.join(",")}}` : ""
}

/**
 * Map Effect metric type to Prometheus metric type string.
 */
const mapMetricType = (type: Metric.Metric.Type): string => {
  switch (type) {
    case "Counter":
      return "counter"
    case "Gauge":
      return "gauge"
    case "Histogram":
      return "histogram"
    case "Summary":
      return "summary"
    case "Frequency":
      return "counter"
  }
}

/**
 * Format a metric family (all metrics with the same name).
 */
const formatMetricFamily = (
  name: string,
  metrics: Array<Metric.Metric.Snapshot>,
  lines: Array<string>
): void => {
  const first = metrics[0]
  const prometheusType = mapMetricType(first.type)

  // HELP line (only if description exists)
  if (first.description) {
    lines.push(`# HELP ${name} ${escapeHelp(first.description)}`)
  }

  // TYPE line
  lines.push(`# TYPE ${name} ${prometheusType}`)

  // Data lines for each metric instance
  for (let i = 0; i < metrics.length; i++) {
    formatMetricData(name, metrics[i], lines)
  }
}

/**
 * Format data lines for a single metric snapshot.
 */
const formatMetricData = (
  name: string,
  metric: Metric.Metric.Snapshot,
  lines: Array<string>
): void => {
  switch (metric.type) {
    case "Counter":
      formatCounter(name, metric, lines)
      break
    case "Gauge":
      formatGauge(name, metric, lines)
      break
    case "Histogram":
      formatHistogram(name, metric, lines)
      break
    case "Summary":
      formatSummary(name, metric, lines)
      break
    case "Frequency":
      formatFrequency(name, metric, lines)
      break
  }
}

/**
 * Format a Counter metric.
 */
const formatCounter = (
  name: string,
  metric: Metric.Metric.SnapshotProto<"Counter", Metric.CounterState<number | bigint>>,
  lines: Array<string>
): void => {
  const labels = formatLabels(metric.attributes)
  const value = formatValue(metric.state.count)
  lines.push(`${name}${labels} ${value}`)
}

/**
 * Format a Gauge metric.
 */
const formatGauge = (
  name: string,
  metric: Metric.Metric.SnapshotProto<"Gauge", Metric.GaugeState<number | bigint>>,
  lines: Array<string>
): void => {
  const labels = formatLabels(metric.attributes)
  const value = formatValue(metric.state.value)
  lines.push(`${name}${labels} ${value}`)
}

/**
 * Format a Histogram metric.
 * Produces _bucket, _sum, and _count lines.
 */
const formatHistogram = (
  name: string,
  metric: Metric.Metric.SnapshotProto<"Histogram", Metric.HistogramState>,
  lines: Array<string>
): void => {
  const state = metric.state

  // Format bucket lines
  // Effect buckets are [boundary, cumulativeCount] pairs
  for (let i = 0; i < state.buckets.length; i++) {
    const [boundary, cumulativeCount] = state.buckets[i]
    const bucketLabels = formatLabels(metric.attributes, [["le", boundary.toString()]])
    lines.push(`${name}_bucket${bucketLabels} ${cumulativeCount}`)
  }

  // Add +Inf bucket (total count)
  const infLabels = formatLabels(metric.attributes, [["le", "+Inf"]])
  lines.push(`${name}_bucket${infLabels} ${state.count}`)

  // Sum and count
  const baseLabels = formatLabels(metric.attributes)
  lines.push(`${name}_sum${baseLabels} ${formatValue(state.sum)}`)
  lines.push(`${name}_count${baseLabels} ${state.count}`)
}

/**
 * Format a Summary metric.
 * Produces quantile lines, _sum, and _count lines.
 */
const formatSummary = (
  name: string,
  metric: Metric.Metric.SnapshotProto<"Summary", Metric.SummaryState>,
  lines: Array<string>
): void => {
  const state = metric.state

  // Format quantile lines
  for (let i = 0; i < state.quantiles.length; i++) {
    const [quantile, value] = state.quantiles[i]
    // Only output quantiles with defined values
    if (value !== undefined) {
      const quantileLabels = formatLabels(metric.attributes, [["quantile", quantile.toString()]])
      lines.push(`${name}${quantileLabels} ${formatValue(value)}`)
    }
  }

  // Sum and count
  const baseLabels = formatLabels(metric.attributes)
  lines.push(`${name}_sum${baseLabels} ${formatValue(state.sum)}`)
  lines.push(`${name}_count${baseLabels} ${state.count}`)
}

/**
 * Format a Frequency metric as a counter with key labels.
 */
const formatFrequency = (
  name: string,
  metric: Metric.Metric.SnapshotProto<"Frequency", Metric.FrequencyState>,
  lines: Array<string>
): void => {
  const state = metric.state

  // Each occurrence becomes a separate line with a "key" label
  for (const [key, count] of state.occurrences) {
    const labels = formatLabels(metric.attributes, [["key", key]])
    lines.push(`${name}${labels} ${count}`)
  }
}
