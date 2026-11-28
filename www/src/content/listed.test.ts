import { describe, expect, it } from '@effect/vitest';

import type { ExperimentId } from '../experiments.ts';
import { listedSections } from './listed.ts';
import type { DocMeta } from './types.ts';

const doc = (
  slug: string,
  section: string,
  experiment?: ExperimentId,
): DocMeta => ({
  description: '',
  experiment,
  headings: [],
  section,
  slug,
  title: slug,
});

const sections = [
  {
    docs: [
      doc('server/overview', 'Server'),
      doc('server/contract-first', 'Server', 'contracts'),
      doc('subscriptions/publisher', 'Server', 'publisher'),
    ],
    title: 'Server',
  },
  {
    docs: [doc('openapi/overview', 'OpenAPI', 'contracts')],
    title: 'OpenAPI',
  },
];

describe('listedSections', () => {
  it("drops experiments' pages, and sections with only those", () => {
    expect(listedSections(sections)).toEqual([
      { docs: [doc('server/overview', 'Server')], title: 'Server' },
    ]);
  });

  it('keeps the pages of the experiments that are on', () => {
    expect(listedSections(sections, ['contracts'])).toEqual([
      {
        docs: [
          doc('server/overview', 'Server'),
          doc('server/contract-first', 'Server', 'contracts'),
        ],
        title: 'Server',
      },
      {
        docs: [doc('openapi/overview', 'OpenAPI', 'contracts')],
        title: 'OpenAPI',
      },
    ]);
  });

  it('drops deprecated pages', () => {
    const deprecated: DocMeta = {
      ...doc('client/links/old', 'Client'),
      stability: 'deprecated',
    };
    expect(
      listedSections([
        { docs: [doc('client/links', 'Client'), deprecated], title: 'Client' },
      ]),
    ).toEqual([{ docs: [doc('client/links', 'Client')], title: 'Client' }]);
  });
});
