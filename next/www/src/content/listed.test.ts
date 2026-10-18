import { describe, expect, it } from '@effect/vitest';

import { listedSections } from './listed.ts';
import type { DocMeta } from './types.ts';

const doc = (slug: string, section: string, hidden?: boolean): DocMeta => ({
  description: '',
  headings: [],
  hidden,
  lastModified: undefined,
  section,
  slug,
  title: slug,
});

describe('listedSections', () => {
  it('drops hidden pages, and sections with only hidden pages', () => {
    expect(
      listedSections([
        {
          docs: [
            doc('server/overview', 'Server'),
            doc('server/contract-first', 'Server', true),
          ],
          title: 'Server',
        },
        {
          docs: [doc('openapi/overview', 'OpenAPI', true)],
          title: 'OpenAPI',
        },
      ]),
    ).toEqual([{ docs: [doc('server/overview', 'Server')], title: 'Server' }]);
  });
});
