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

declare module 'virtual:v10-docs-manifest' {
  import type { DocSection } from '~/content/types.ts';

  /** Every page of the v10 docs' copy (`v10/docs`), by sidebar section. */
  export const sections: ReadonlyArray<DocSection>;
}

declare module 'virtual:v9-docs-manifest' {
  import type { DocSection } from '~/content/types.ts';

  /** Every page of the v9 docs' copy (`v9/docs`), by sidebar section. */
  export const sections: ReadonlyArray<DocSection>;
}

declare module 'virtual:blog-manifest' {
  import type { PostMeta } from '~/content/types.ts';

  /** Every post of the blog's copy (`blog/`), newest first, from `build/blog-content.ts`. */
  export const posts: ReadonlyArray<PostMeta>;
}

declare module 'sample:*' {
  import type { Sample } from '~/content/types.ts';

  const sample: Sample;
  export default sample;
}
