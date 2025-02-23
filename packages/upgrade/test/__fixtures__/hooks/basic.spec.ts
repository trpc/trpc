import { expect } from 'vitest';
import type { SpecRun } from '../../specDef';

export const run: SpecRun = async (Component) => {
  expect(Component).toBeDefined();
};
