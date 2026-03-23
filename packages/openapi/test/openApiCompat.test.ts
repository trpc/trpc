import { it } from 'vitest';
import type { OpenAPIV3_1 } from 'openapi-types';
import type { Document } from '../src/types';

it('our document type is a superset of the published OpenAPI v3.1 document type', () => {
  const _publishedTypes: Document = null as unknown as OpenAPIV3_1.Document;
});
