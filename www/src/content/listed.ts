import type { ExperimentId } from '../experiments.ts';
import type { DocSection } from './types.ts';

/**
 * `sections` without the pages of experiments that aren't `on`, and without
 * the sections that leaves empty.
 */
export function listedSections(
  sections: ReadonlyArray<DocSection>,
  on: ReadonlyArray<ExperimentId> = [],
): ReadonlyArray<DocSection> {
  return sections.flatMap((section) => {
    const docs = section.docs.filter(
      (doc) => doc.experiment === undefined || on.includes(doc.experiment),
    );
    return docs.length === 0 ? [] : [{ docs, title: section.title }];
  });
}
