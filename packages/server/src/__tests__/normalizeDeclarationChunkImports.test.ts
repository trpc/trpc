import { describe, expect, test } from 'vitest';
import { normalizeDeclarationChunkImports } from '../internals/normalizeDeclarationChunkImports';

describe('normalizeDeclarationChunkImports', () => {
  test('rewrites hashed unstable-core declaration imports to stable public paths', () => {
    const source = `
import { AnyRouter } from "../../unstable-core-do-not-import.d-BdVSvUCr.mjs";
import { HTTPBaseHandlerOptions } from "../unstable-core-do-not-import.d-Dh9CT5RO.cjs";
`;

    expect(normalizeDeclarationChunkImports(source)).toBe(`
import { AnyRouter } from "../../unstable-core-do-not-import.d.mts";
import { HTTPBaseHandlerOptions } from "../unstable-core-do-not-import.d.cts";
`);
  });

  test('leaves unrelated hashed declaration chunks untouched', () => {
    const source = `
import "../../index.d-D4qZxQJh.mjs";
import { NodeHTTPHandlerOptions } from "../../index.d-DhhodpGb.mjs";
`;

    expect(normalizeDeclarationChunkImports(source)).toBe(source);
  });
});
