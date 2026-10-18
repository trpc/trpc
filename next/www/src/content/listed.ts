import type { DocSection } from './types.ts';

/** `sections` without their hidden pages, and without the sections that leaves empty. */
export function listedSections(
  sections: ReadonlyArray<DocSection>,
): ReadonlyArray<DocSection> {
  return sections.flatMap((section) => {
    const docs = section.docs.filter((doc) => !doc.hidden);
    return docs.length === 0 ? [] : [{ docs, title: section.title }];
  });
}
