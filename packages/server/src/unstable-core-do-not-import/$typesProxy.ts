import { createFlatProxy } from './createProxy';

/**
 * Prevents access to `$types` at runtime
 * @internal
 */
export const $typesProxy = createFlatProxy<any>((key) => {
  throw new Error(
    `Tried to access "$types.${key}" which is not available at runtime`,
  );
});
