#!/usr/bin/env node

/**
 * @since 0.6.0
 */
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { cli } from "./CLI.ts"
import * as Configuration from "./Configuration.ts"
import * as Domain from "./Domain.ts"

const MainLayer = Configuration.configProviderLayer.pipe(
  Layer.provideMerge(Layer.mergeAll(Domain.Process.layer, NodeServices.layer))
)

Effect.sync(() => process.argv.slice(2)).pipe(
  Effect.flatMap(cli),
  Effect.provide(MainLayer),
  NodeRuntime.runMain
)
