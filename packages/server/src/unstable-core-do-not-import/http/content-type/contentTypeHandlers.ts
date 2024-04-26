import { formDataContentTypeHandler } from './handlers/formData';
import { jsonContentTypeHandler } from './handlers/json';

export const contentTypeHandlers = {
  list: [formDataContentTypeHandler, jsonContentTypeHandler],
  /**
   * Fallback handler if there is no match
   */
  fallback: jsonContentTypeHandler,
};
