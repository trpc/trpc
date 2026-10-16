#!/usr/bin/env node
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import PackageJson from "../package.json" with { type: "json" }
import { ApiDiff } from "./ApiDiff.ts"
import { cli } from "./Cli.ts"

const MainLayer = ApiDiff.layer.pipe(
  Layer.provideMerge(NodeServices.layer)
)

Command.run(cli, { version: PackageJson.version }).pipe(
  Effect.provide(MainLayer),
  NodeRuntime.runMain
)
