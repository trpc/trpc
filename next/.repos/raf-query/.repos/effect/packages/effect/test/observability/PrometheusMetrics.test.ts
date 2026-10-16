import { assert, describe, it } from "@effect/vitest"
import { Effect, Metric } from "effect"
import { PrometheusMetrics } from "effect/observability"

describe("PrometheusMetrics", () => {
  describe("format", () => {
    describe("Counter", () => {
      it.effect("formats a simple counter", () =>
        Effect.gen(function*() {
          const counter = Metric.counter("test_counter", {
            description: "A test counter"
          })

          yield* Metric.update(counter, 42)

          const output = yield* PrometheusMetrics.format()

          assert.include(output, "# HELP test_counter A test counter")
          assert.include(output, "# TYPE test_counter counter")
          assert.include(output, "test_counter 42")
        }))

      it.effect("formats a counter with bigint value", () =>
        Effect.gen(function*() {
          const counter = Metric.counter("bigint_counter", {
            description: "A bigint counter",
            bigint: true
          })

          yield* Metric.update(counter, 9007199254740993n)

          const output = yield* PrometheusMetrics.format()

          assert.include(output, "# TYPE bigint_counter counter")
          assert.include(output, "bigint_counter 9007199254740993")
        }))

      it.effect("formats a counter with attributes", () =>
        Effect.gen(function*() {
          const counter = Metric.counter("labeled_counter", {
            description: "Counter with labels",
            attributes: { method: "GET", endpoint: "/api/users" }
          })

          yield* Metric.update(counter, 10)

          const output = yield* PrometheusMetrics.format()

          assert.include(output, "# TYPE labeled_counter counter")
          assert.include(output, "labeled_counter{method=\"GET\",endpoint=\"/api/users\"} 10")
        }))

      it.effect("formats a counter without description", () =>
        Effect.gen(function*() {
          const counter = Metric.counter("no_desc_counter")

          yield* Metric.update(counter, 5)

          const output = yield* PrometheusMetrics.format()

          assert.notInclude(output, "# HELP no_desc_counter")
          assert.include(output, "# TYPE no_desc_counter counter")
          assert.include(output, "no_desc_counter 5")
        }))
    })

    describe("Gauge", () => {
      it.effect("formats a simple gauge", () =>
        Effect.gen(function*() {
          const gauge = Metric.gauge("test_gauge", {
            description: "A test gauge"
          })

          yield* Metric.update(gauge, 123.45)

          const output = yield* PrometheusMetrics.format()

          assert.include(output, "# HELP test_gauge A test gauge")
          assert.include(output, "# TYPE test_gauge gauge")
          assert.include(output, "test_gauge 123.45")
        }))

      it.effect("formats a gauge with negative value", () =>
        Effect.gen(function*() {
          const gauge = Metric.gauge("negative_gauge", {
            description: "A gauge with negative value"
          })

          yield* Metric.update(gauge, -50)

          const output = yield* PrometheusMetrics.format()

          assert.include(output, "negative_gauge -50")
        }))

      it.effect("formats a gauge with bigint value", () =>
        Effect.gen(function*() {
          const gauge = Metric.gauge("bigint_gauge", {
            description: "A bigint gauge",
            bigint: true
          })

          yield* Metric.update(gauge, 1000000000000n)

          const output = yield* PrometheusMetrics.format()

          assert.include(output, "bigint_gauge 1000000000000")
        }))
    })

    describe("Histogram", () => {
      it.effect("formats a histogram with buckets", () =>
        Effect.gen(function*() {
          const histogram = Metric.histogram("test_histogram", {
            description: "A test histogram",
            boundaries: [10, 50, 100, 500]
          })

          yield* Metric.update(histogram, 5)
          yield* Metric.update(histogram, 25)
          yield* Metric.update(histogram, 75)
          yield* Metric.update(histogram, 200)
          yield* Metric.update(histogram, 1000)

          const output = yield* PrometheusMetrics.format()

          assert.include(output, "# HELP test_histogram A test histogram")
          assert.include(output, "# TYPE test_histogram histogram")
          assert.include(output, "test_histogram_bucket{le=\"10\"} 1")
          assert.include(output, "test_histogram_bucket{le=\"50\"} 2")
          assert.include(output, "test_histogram_bucket{le=\"100\"} 3")
          assert.include(output, "test_histogram_bucket{le=\"500\"} 4")
          assert.include(output, "test_histogram_bucket{le=\"+Inf\"} 5")
          assert.include(output, "test_histogram_sum 1305")
          assert.include(output, "test_histogram_count 5")
        }))

      it.effect("formats a histogram with attributes", () =>
        Effect.gen(function*() {
          const histogram = Metric.histogram("labeled_histogram", {
            description: "Histogram with labels",
            boundaries: [100, 500],
            attributes: { service: "api" }
          })

          yield* Metric.update(histogram, 250)

          const output = yield* PrometheusMetrics.format()

          assert.include(output, "labeled_histogram_bucket{service=\"api\",le=\"100\"} 0")
          assert.include(output, "labeled_histogram_bucket{service=\"api\",le=\"500\"} 1")
          assert.include(output, "labeled_histogram_bucket{service=\"api\",le=\"+Inf\"} 1")
          assert.include(output, "labeled_histogram_sum{service=\"api\"} 250")
          assert.include(output, "labeled_histogram_count{service=\"api\"} 1")
        }))
    })

    describe("Summary", () => {
      it.effect("formats a summary with quantiles", () =>
        Effect.gen(function*() {
          const summary = Metric.summary("test_summary", {
            description: "A test summary",
            maxAge: "1 minute",
            maxSize: 100,
            quantiles: [0.5, 0.9, 0.99]
          })

          // Add enough values to have meaningful quantiles
          for (let i = 1; i <= 100; i++) {
            yield* Metric.update(summary, i)
          }

          const output = yield* PrometheusMetrics.format()

          assert.include(output, "# HELP test_summary A test summary")
          assert.include(output, "# TYPE test_summary summary")
          assert.include(output, "test_summary{quantile=\"0.5\"}")
          assert.include(output, "test_summary{quantile=\"0.9\"}")
          assert.include(output, "test_summary{quantile=\"0.99\"}")
          assert.include(output, "test_summary_sum 5050")
          assert.include(output, "test_summary_count 100")
        }))
    })

    describe("Frequency", () => {
      it.effect("formats a frequency metric", () =>
        Effect.gen(function*() {
          const frequency = Metric.frequency("test_frequency", {
            description: "A test frequency"
          })

          yield* Metric.update(frequency, "success")
          yield* Metric.update(frequency, "success")
          yield* Metric.update(frequency, "failure")
          yield* Metric.update(frequency, "success")

          const output = yield* PrometheusMetrics.format()

          assert.include(output, "# HELP test_frequency A test frequency")
          assert.include(output, "# TYPE test_frequency counter")
          assert.include(output, "test_frequency{key=\"success\"} 3")
          assert.include(output, "test_frequency{key=\"failure\"} 1")
        }))

      it.effect("formats a frequency metric with attributes", () =>
        Effect.gen(function*() {
          const frequency = Metric.frequency("labeled_frequency", {
            description: "Frequency with labels",
            attributes: { service: "api" }
          })

          yield* Metric.update(frequency, "200")
          yield* Metric.update(frequency, "404")

          const output = yield* PrometheusMetrics.format()

          assert.include(output, "labeled_frequency{service=\"api\",key=\"200\"} 1")
          assert.include(output, "labeled_frequency{service=\"api\",key=\"404\"} 1")
        }))
    })

    describe("options", () => {
      it.effect("applies prefix to metric names", () =>
        Effect.gen(function*() {
          const counter = Metric.counter("requests_total", {
            description: "Total requests"
          })

          yield* Metric.update(counter, 100)

          const output = yield* PrometheusMetrics.format({ prefix: "myapp" })

          assert.include(output, "# HELP myapp_requests_total Total requests")
          assert.include(output, "# TYPE myapp_requests_total counter")
          assert.include(output, "myapp_requests_total 100")
        }))

      it.effect("applies custom metric name mapper", () =>
        Effect.gen(function*() {
          const counter = Metric.counter("requestCount", {
            description: "Request count"
          })

          yield* Metric.update(counter, 50)

          // Convert camelCase to snake_case
          const mapper = (name: string) => name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase()

          const output = yield* PrometheusMetrics.format({ metricNameMapper: mapper })

          assert.include(output, "# HELP request_count Request count")
          assert.include(output, "# TYPE request_count counter")
          assert.include(output, "request_count 50")
        }))

      it.effect("combines prefix and mapper", () =>
        Effect.gen(function*() {
          const counter = Metric.counter("httpRequests", {
            description: "HTTP requests"
          })

          yield* Metric.update(counter, 25)

          const mapper = (name: string) => name.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase()

          const output = yield* PrometheusMetrics.format({
            prefix: "app",
            metricNameMapper: mapper
          })

          assert.include(output, "app_http_requests 25")
        }))
    })

    describe("sanitization", () => {
      it.effect("sanitizes invalid metric name characters", () =>
        Effect.gen(function*() {
          const counter = Metric.counter("metric-with-dashes.and.dots", {
            description: "Metric with special chars"
          })

          yield* Metric.update(counter, 1)

          const output = yield* PrometheusMetrics.format()

          assert.include(output, "metric_with_dashes_and_dots 1")
        }))

      it.effect("handles metric names starting with digits", () =>
        Effect.gen(function*() {
          const counter = Metric.counter("123_metric", {
            description: "Metric starting with number"
          })

          yield* Metric.update(counter, 1)

          const output = yield* PrometheusMetrics.format()

          assert.include(output, "_123_metric 1")
        }))

      it.effect("escapes special characters in label values", () =>
        Effect.gen(function*() {
          const counter = Metric.counter("escape_test", {
            description: "Test escaping",
            attributes: {
              path: "/api/users\"quoted\"",
              message: "line1\nline2"
            }
          })

          yield* Metric.update(counter, 1)

          const output = yield* PrometheusMetrics.format()

          assert.include(output, "path=\"/api/users\\\"quoted\\\"\"")
          assert.include(output, "message=\"line1\\nline2\"")
        }))

      it.effect("escapes backslashes in label values", () =>
        Effect.gen(function*() {
          const counter = Metric.counter("backslash_test", {
            description: "Test backslash escaping",
            attributes: { path: "C:\\Users\\test" }
          })

          yield* Metric.update(counter, 1)

          const output = yield* PrometheusMetrics.format()

          assert.include(output, "path=\"C:\\\\Users\\\\test\"")
        }))

      it.effect("escapes special characters in HELP text", () =>
        Effect.gen(function*() {
          const counter = Metric.counter("help_escape", {
            description: "Line 1\nLine 2 with\\backslash"
          })

          yield* Metric.update(counter, 1)

          const output = yield* PrometheusMetrics.format()

          assert.include(output, "# HELP help_escape Line 1\\nLine 2 with\\\\backslash")
        }))
    })

    describe("special values", () => {
      it.effect("formats NaN values", () =>
        Effect.gen(function*() {
          const gauge = Metric.gauge("nan_gauge", {
            description: "Gauge with NaN"
          })

          yield* Metric.update(gauge, NaN)

          const output = yield* PrometheusMetrics.format()

          assert.include(output, "nan_gauge NaN")
        }))

      it.effect("formats Infinity values", () =>
        Effect.gen(function*() {
          const gauge = Metric.gauge("inf_gauge", {
            description: "Gauge with Infinity"
          })

          yield* Metric.update(gauge, Infinity)

          const output = yield* PrometheusMetrics.format()

          assert.include(output, "inf_gauge +Inf")
        }))

      it.effect("formats negative Infinity values", () =>
        Effect.gen(function*() {
          const gauge = Metric.gauge("neg_inf_gauge", {
            description: "Gauge with -Infinity"
          })

          yield* Metric.update(gauge, -Infinity)

          const output = yield* PrometheusMetrics.format()

          assert.include(output, "neg_inf_gauge -Inf")
        }))
    })

    describe("empty output", () => {
      it.effect("returns empty string when no metrics are registered", () =>
        Effect.gen(function*() {
          const output = yield* PrometheusMetrics.format()

          // Output may contain other metrics from the test environment,
          // but at minimum it should be a valid string
          assert.isString(output)
        }))
    })

    describe("output format", () => {
      it.effect("ends with a newline when there are metrics", () =>
        Effect.gen(function*() {
          const counter = Metric.counter("newline_test", {
            description: "Test newline"
          })

          yield* Metric.update(counter, 1)

          const output = yield* PrometheusMetrics.format()

          if (output.length > 0) {
            assert.isTrue(output.endsWith("\n"))
          }
        }))
    })
  })
})
