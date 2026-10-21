import { createSerializer, type Serializer } from './index.ts';

/** danSON with no custom types, for keys and stores that need rich types. */
export const danson: Serializer = /* @__PURE__ */ createSerializer();
