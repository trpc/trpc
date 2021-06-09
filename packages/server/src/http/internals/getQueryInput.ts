import qs from 'qs';
import { inputValidationError } from '../../errors';

export function getQueryInput(query: qs.ParsedQs) {
  const queryInput = query.input;
  if (!queryInput) {
    return undefined;
  }
  try {
    return JSON.parse(queryInput as string);
  } catch (err) {
    throw inputValidationError('Expected query.input to be a JSON string');
  }
}
