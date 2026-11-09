import { assert, describe, it } from "@effect/vitest"
import * as McpProtocol from "effect/ai/McpProtocol"
import * as Effect from "effect/Effect"
import * as BaseProtocolTest from "./McpConformance/BaseProtocolTest.ts"
import * as LifecycleTest from "./McpConformance/LifecycleTest.ts"
import * as LoggingTest from "./McpConformance/LoggingTest.ts"
import * as McpConformance from "./McpConformance/McpConformance.ts"
import * as PromptsTest from "./McpConformance/PromptsTest.ts"
import * as ResourcesTest from "./McpConformance/ResourcesTest.ts"
import * as RootsTest from "./McpConformance/RootsTest.ts"
import * as SamplingTest from "./McpConformance/SamplingTest.ts"
import * as ToolsTest from "./McpConformance/ToolsTest.ts"
import * as TransportsTest from "./McpConformance/TransportsTest.ts"
import * as UtilitiesTest from "./McpConformance/UtilitiesTest.ts"

const protocol = McpProtocol.v2024_11_05
const testLayer = McpConformance.layer(protocol)

LifecycleTest.suite(protocol, testLayer)
BaseProtocolTest.suite(protocol, testLayer)
BaseProtocolTest.statefulLegacySuite(protocol, testLayer)
TransportsTest.suite(protocol, testLayer)
UtilitiesTest.suite(protocol, testLayer)
UtilitiesTest.statefulLegacySuite(protocol, testLayer)
LoggingTest.suite(protocol, testLayer)
ToolsTest.suite(protocol, testLayer)
ToolsTest.statefulLegacySuite(protocol, testLayer)
ResourcesTest.suite(protocol, testLayer)
ResourcesTest.statefulLegacySuite(protocol, testLayer)
PromptsTest.suite(protocol, testLayer)
PromptsTest.statefulLegacySuite(protocol, testLayer)
RootsTest.suite(protocol, testLayer)
SamplingTest.suite(protocol, testLayer)

it.layer(testLayer)(`Mcp Conformance (${protocol.protocolVersion})`, (it) => {
  describe("Completion", () => {
    describe("Capabilities", () => {
      it.effect("MUST NOT advertise completions", () =>
        Effect.gen(function*() {
          const test = yield* McpConformance.McpConformance
          const initialized = yield* test.initialize({ server: "features" })

          assert.notProperty(initialized.message.result.capabilities, "completions")
        }))
    })
  })
})
