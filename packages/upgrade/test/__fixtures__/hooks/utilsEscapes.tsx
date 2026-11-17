import { useCallback } from 'react';
import { trpc } from './basic.trpc';

declare function makeInvalidator(utils: unknown): void;

// A returned tuple is not a dependency list
export function useInvalidator() {
  const utils = trpc.useUtils();
  const invalidate = useCallback(() => utils.post.list.invalidate(), [utils]);
  return [invalidate, utils] as const;
}

// What receives `utils` expects the old object
export function Component2() {
  const utils = trpc.useUtils();
  makeInvalidator(utils);
  return null;
}
