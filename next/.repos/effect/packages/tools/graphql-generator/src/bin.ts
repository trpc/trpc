#!/usr/bin/env node
import * as NodeRuntime from "@effect/platform-node/NodeRuntime"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"
import { run } from "./main.ts"

run.pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain
)
