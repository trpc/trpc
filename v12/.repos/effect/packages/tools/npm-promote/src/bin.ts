#!/usr/bin/env node
import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient"
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import PackageJson from "../package.json" with { type: "json" }
import { cli } from "./Cli.ts"
import { NpmCli } from "./NpmPromote.ts"

const MainLayer = NpmCli.layer.pipe(
  Layer.provideMerge(Layer.mergeAll(NodeServices.layer, NodeHttpClient.layerFetch))
)

Command.run(cli, { version: PackageJson.version }).pipe(
  Effect.provide(MainLayer),
  NodeRuntime.runMain
)
