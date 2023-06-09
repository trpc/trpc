import { createServerSideInternalHelpers } from './ssgProxy';

/**
 * @deprecated use `createServerSideInternalHelpers` instead
 */
export const createServerSideHelpers = createServerSideInternalHelpers;

export { createServerSideInternalHelpers } from './ssgProxy';
export { createServerSideExternalHelpers } from './ssgProxy';
export type {
  CreateSSGInternalHelpersOptions,
  CreateSSGInternalHelpersOptions as CreateSSGHelpersOptions,
} from './types';
export type { CreateSSGExternalHelpersOptions as CreateSSGExternalHelpersOptions } from './types';

export type { DecoratedProcedureSSGRecord } from './ssgProxy';
