export {
  /**
   * @deprecated use `@trpc/react-query/server` instead
   */
  type CreateSSGHelpersOptions,
  /**
   * @deprecated use `@trpc/react-query/server` instead
   */
  type DecoratedProcedureSSGRecord,
  /**
   * @deprecated use `import { createServerSideHelpers } from "@trpc/react-query/server"`
   */
  createServerSideHelpers as createProxySSGHelpers,
} from '../server';

export { createSSGHelpers } from './ssg';
