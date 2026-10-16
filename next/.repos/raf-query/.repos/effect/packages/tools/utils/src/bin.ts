#!/usr/bin/env node

import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import { codegen } from "./commands/codegen.ts"

const cli = Command.make("effect-utils").pipe(
  Command.withSubcommands([codegen])
)

const main = Command.run(cli, { version: "0.0.0" }).pipe(
  Effect.provide(NodeServices.layer)
)

Effect.runPromise(main)
