import { createSSGHelpers } from './ssg';

export {
  createSSGHelpers,
  /**
   * @deprecated - use `createSSGHelpers` instead
   */
  createSSGHelpers as createProxySSGHelpers,
};
export type { DecoratedProcedureSSGRecord } from './ssg';
