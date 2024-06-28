import { TRPCError } from '../error/TRPCError';
import { isObject } from '../utils';
import { toURL } from './toURL';
import type { TRPCRequestInfo } from './types';

export function parseConnectionParamsFromURL(
  url: URL | string,
): TRPCRequestInfo['connectionParams'] {
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
    const nonStringValues = Object.entries(parsed).filter(
      ([_key, value]) => typeof value !== 'string',
    );

    if (nonStringValues.length > 0) {
      throw new Error(
        `Expected connectionParams to be string values. Got ${nonStringValues
          .map(([key, value]) => `${key}: ${typeof value}`)
          .join(', ')}`,
      );
    }
    return parsed as Record<string, string>;
  } catch (cause) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Not json parsable query params',
      cause,
    });
  }
}
