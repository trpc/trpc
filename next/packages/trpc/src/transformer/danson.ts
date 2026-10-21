import { experimental_createTransformer, type Transformer } from './index.ts';

/** danSON with no custom types, for keys and stores that need rich types. */
export const danson: Transformer =
  /* @__PURE__ */ experimental_createTransformer();
