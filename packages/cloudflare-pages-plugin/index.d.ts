import type { AnyRouter } from '@trpc/server';

export type PluginArgs = { router: AnyRouter; endPoint?: string };

export default function tRPCPagesPluginFunction(
  args: PluginArgs,
): PagesFunction;
