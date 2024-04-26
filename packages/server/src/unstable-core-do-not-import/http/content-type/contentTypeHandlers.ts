import { formDataContentTypeHandler } from './handlers/formData';
import { jsonContentTypeHandler } from './handlers/json';

export const contentTypeHandlers = {
  list: [formDataContentTypeHandler, jsonContentTypeHandler],
  // TODO: maybe support for GET requests **without** overrides
  // fallback: jsonContentTypeHandler,
};
