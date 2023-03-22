import { createServerSideHelpers } from './ssg';

export {
  createServerSideHelpers,
  /**
   * @deprecated - use `createServerSideHelpers` instead
   */
  createServerSideHelpers as createProxySSGHelpers,
};
export type { DecoratedProcedureSSGRecord } from './ssg';
