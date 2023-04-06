export {
  /**
   * @deprecated use `@trpc/react/server` instead
   */
  type CreateSSGHelpersOptions,
  /**
   * @deprecated use `@trpc/react/server` instead
   */
  type DecoratedProcedureSSGRecord,
  /**
   * @deprecated use `import { createServerSideHelpers } from "@trpc/react/server"`;
   */
  createServerSideHelpers as createProxySSGHelpers,
} from '../server';

export { createSSGHelpers } from '../server/ssg';
