import {
  experimental_createProgressiveJson,
  type Transformer,
} from './index.ts';

/** Progressive JSON with no custom types, for keys and stores that need rich types. */
export const progressiveJson: Transformer =
  /* @__PURE__ */ experimental_createProgressiveJson();
