import { TRPCError } from '../error/TRPCError';
import { isObject } from '../utils';
import { toURL } from './toURL';

/**
 * HTTP connection params that are serialized as `?connectionParams=x`
 */

export type ConnectionParams = Record<string, unknown>;

export function parseConnectionParamsFromURL(
  url: URL | string,
): ConnectionParams | null {
  const u = url instanceof URL ? url : toURL(url);
  const str = u.searchParams.get('connectionParams');
  if (!str) {
    return null;
  }
  try {
    const parsed = JSON.parse(str);

    if (!isObject(parsed)) {
      throw new Error('Expected object');
    }
    return parsed;
  } catch (cause) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Not json parsable query params',
      cause,
    });
  }
}
