import { AnyRouter } from '..';
import * as parent from '../adapters/ws';

export type { WSSHandlerOptions } from '../adapters/ws';

/**
 * @deprecated replace your import with `@trpc/server/adapters/ws`
 * TODO: remove this file in next major
 */
export function applyWSSHandler<TRouter extends AnyRouter>(
  opts: parent.WSSHandlerOptions<TRouter>,
) {
  return parent.applyWSSHandler(opts);
}
