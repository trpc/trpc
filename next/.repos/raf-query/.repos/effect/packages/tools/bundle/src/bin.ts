#!/usr/bin/env node
/**
 * @since 4.0.0
 */
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import PackageJson from "../package.json" with { type: "json" }
import { cli } from "./Cli.ts"
import { Fixtures } from "./Fixtures.ts"
import { Reporter } from "./Reporter.ts"

const MainLayer = Layer.mergeAll(
  Fixtures.layer,
  Reporter.layer
).pipe(Layer.provideMerge(NodeServices.layer))

Command.run(cli, { version: PackageJson["version"] }).pipe(
  Effect.provide(MainLayer),
  NodeRuntime.runMain
)
