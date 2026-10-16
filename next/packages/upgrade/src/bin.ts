#!/usr/bin/env node
import { NodeRuntime, NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';
import { Command } from 'effect/cli';
import { upgradeCommand } from './cli.ts';

Command.run(upgradeCommand, { version: '12.0.0-alpha.0' }).pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
