import { createServerSideHelpers } from './ssgProxy';

export { createSSGHelpers } from './ssg';
export type { CreateSSGHelpersOptions } from './ssg';

export {
  createServerSideHelpers,
  /**
   * @deprecated - use `createServerSideHelpers` instead
   */
  createServerSideHelpers as createProxySSGHelpers,
};
export type { DecoratedProcedureSSGRecord } from './ssgProxy';
