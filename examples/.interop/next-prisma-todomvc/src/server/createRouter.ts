import * as trpc from '@trpc/server';
import { Context } from './context';

export function createRouter() {
  return trpc.router<Context>();
}
