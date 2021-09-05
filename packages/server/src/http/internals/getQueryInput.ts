import qs from 'qs';
import { TRPCError } from '../../TRPCError';

export function getQueryInput(query: qs.ParsedQs) {
  const queryInput = query.input;
  if (!queryInput) {
    return undefined;
  }
  try {
    return JSON.parse(queryInput as string);
  } catch (cause) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      cause,
    });
  }
}
