import { router } from '@trpc/server';
import { Context } from './context';

export function createRouter() {
  return router<Context>();
}
