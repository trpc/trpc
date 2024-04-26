import { formDataContentTypeHandler } from './handlers/formData';
import { jsonContentTypeHandler } from './handlers/json';

export const contentTypeHandlers = {
  list: [formDataContentTypeHandler, jsonContentTypeHandler],
  fallback: jsonContentTypeHandler,
};
