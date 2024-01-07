/**
 * This file is here to make TypeScript happy and prevent _"The inferred type of 'createContext' cannot be named without a reference to [...]"_.
 *
 * We're basically just re-exporting everything from @trpc/core here.
 *
 * If you need to import anything from here, please open an issue at https://github.com/trpc/trpc/issues
 */

export * from '@trpc/core';
