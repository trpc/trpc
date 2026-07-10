import { TRPCError } from '../error/TRPCError';
import { isObject } from '../utils';
import type { TRPCRequestInfo } from './types';

export function parseConnectionParamsFromUnknown(
  parsed: unknown,
): TRPCRequestInfo['connectionParams'] {
  try {
    if (parsed === null) {
      return null;
    }
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
      code: 'PARSE_ERROR',
      message: 'Invalid connection params shape',
      cause,
    });
  }
}
export function parseConnectionParamsFromString(
  str: string,
): TRPCRequestInfo['connectionParams'] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(str);
  } catch (cause) {
    throw new TRPCError({
      code: 'PARSE_ERROR',
      message: 'Not JSON-parsable query params',
      cause,
    });
  }
  return parseConnectionParamsFromUnknown(parsed);
}
