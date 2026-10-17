declare module 'virtual:docs-manifest' {
  import type { DocSection } from '~/content/types.ts';

  /** Every page, by sidebar section, from `build/content.ts`. */
  export const sections: ReadonlyArray<DocSection>;
}

declare module 'virtual:v11-docs-manifest' {
  import type { DocSection } from '~/content/types.ts';

  /** Every page of the v11 docs' copy (`v11/docs`), by sidebar section. */
  export const sections: ReadonlyArray<DocSection>;
}

declare module 'sample:*' {
  import type { Sample } from '~/content/types.ts';

  const sample: Sample;
  export default sample;
}
