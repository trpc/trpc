import { initTRPC } from '@trpc/server';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { JsonSchema } from '../src/generate';
import {
  applyDescriptions,
  collectRuntimeDescriptions,
  extractZodDescriptions,
  type RuntimeDescriptions,
} from '../src/schemaExtraction';

// ---------------------------------------------------------------------------
// extractDescriptions
// ---------------------------------------------------------------------------

describe('extractDescriptions', () => {
  it('extracts top-level .describe() from a schema', () => {
    const schema = z.object({ name: z.string() }).describe('A user object');
    const result = extractZodDescriptions(schema);
    expect(result).not.toBeNull();
    expect(result!.self).toBe('A user object');
  });

  it('extracts property-level .describe() strings', () => {
    const schema = z.object({
      name: z.string().describe('User name'),
      age: z.number().describe('User age'),
    });
    const result = extractZodDescriptions(schema);
    expect(result).not.toBeNull();
    expect(result!.properties.get('name')).toBe('User name');
    expect(result!.properties.get('age')).toBe('User age');
  });

  it('extracts nested object descriptions', () => {
    const schema = z.object({
      address: z.object({
        street: z.string().describe('Street name'),
      }),
    });
    const result = extractZodDescriptions(schema);
    expect(result).not.toBeNull();
    expect(result!.properties.get('address.street')).toBe('Street name');
  });

  it('handles optional fields', () => {
    const schema = z.object({
      nickname: z.string().describe('Optional nickname').optional(),
    });
    const result = extractZodDescriptions(schema);
    expect(result).not.toBeNull();
    expect(result!.properties.get('nickname')).toBe('Optional nickname');
  });

  it('handles nullable fields', () => {
    const schema = z.object({
      bio: z.string().describe('User bio').nullable(),
    });
    const result = extractZodDescriptions(schema);
    expect(result).not.toBeNull();
    expect(result!.properties.get('bio')).toBe('User bio');
  });

  it('extracts descriptions inside array element objects', () => {
    const schema = z.object({
      children: z.array(
        z.object({
          name: z.string().describe('Child name'),
          age: z.number().describe('Child age'),
        }),
      ),
    });
    const result = extractZodDescriptions(schema);
    expect(result).not.toBeNull();
    expect(result!.properties.get('children.name')).toBe('Child name');
    expect(result!.properties.get('children.age')).toBe('Child age');
  });

  it('extracts description from direct array element', () => {
    const schema = z.array(z.string().describe('A string item'));
    const result = extractZodDescriptions(schema);
    expect(result).not.toBeNull();
    expect(result!.properties.get('[]')).toBe('A string item');
  });

  it('extracts descriptions from nested arrays of objects', () => {
    const schema = z.object({
      groups: z.array(
        z.object({
          members: z.array(
            z.object({
              id: z.string().describe('Member ID'),
            }),
          ),
        }),
      ),
    });
    const result = extractZodDescriptions(schema);
    expect(result).not.toBeNull();
    expect(result!.properties.get('groups.members.id')).toBe('Member ID');
  });

  it('returns null when no descriptions exist', () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const result = extractZodDescriptions(schema);
    expect(result).toBeNull();
  });

  it('returns null for non-Zod values', () => {
    const result = extractZodDescriptions({
      parse: () => {
        //
      },
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// collectRuntimeDescriptions
// ---------------------------------------------------------------------------

describe('collectRuntimeDescriptions', () => {
  const t = initTRPC.create();

  it('extracts input descriptions from procedures', () => {
    const router = t.router({
      hello: t.procedure
        .input(z.object({ name: z.string().describe('User name') }))
        .query(({ input }) => `Hello ${input.name}`),
    });

    const result = new Map<string, RuntimeDescriptions>();
    collectRuntimeDescriptions(router, '', result);

    expect(result.size).toBe(1);
    const info = result.get('hello');
    expect(info).toBeDefined();
    expect(info!.input).not.toBeNull();
    expect(info!.input!.properties.get('name')).toBe('User name');
    expect(info!.output).toBeNull();
  });

  it('extracts output descriptions from procedures', () => {
    const router = t.router({
      greet: t.procedure
        .output(z.object({ message: z.string().describe('Greeting') }))
        .query(() => ({ message: 'hi' })),
    });

    const result = new Map<string, RuntimeDescriptions>();
    collectRuntimeDescriptions(router, '', result);

    const info = result.get('greet');
    expect(info).toBeDefined();
    expect(info!.input).toBeNull();
    expect(info!.output).not.toBeNull();
    expect(info!.output!.properties.get('message')).toBe('Greeting');
  });

  it('walks nested sub-routers', () => {
    const router = t.router({
      sub: t.router({
        deep: t.procedure
          .input(z.object({ id: z.number().describe('ID') }))
          .query(({ input }) => input.id),
      }),
    });

    const result = new Map<string, RuntimeDescriptions>();
    collectRuntimeDescriptions(router, '', result);

    expect(result.has('sub.deep')).toBe(true);
    expect(result.get('sub.deep')!.input!.properties.get('id')).toBe('ID');
  });

  it('walks plain RouterRecord objects (no _def)', () => {
    const router = t.router({
      plain: {
        nested: t.procedure
          .input(z.object({ x: z.number().describe('X value') }))
          .query(({ input }) => input.x),
      },
    });

    const result = new Map<string, RuntimeDescriptions>();
    collectRuntimeDescriptions(router, '', result);

    expect(result.has('plain.nested')).toBe(true);
  });

  it('handles procedures without Zod schemas (non-Zod parsers)', () => {
    const fakeParser = { parse: (v: unknown) => v };
    const proc = t.procedure.input(fakeParser as any).query(() => 'ok');
    const router = t.router({ test: proc });

    const result = new Map<string, RuntimeDescriptions>();
    collectRuntimeDescriptions(router, '', result);

    // No entry because no descriptions are extractable
    expect(result.size).toBe(0);
  });

  it('extracts descriptions from direct array input/output', () => {
    const router = t.router({
      directArray: t.procedure
        .input(z.array(z.string().describe('Input item')))
        .output(z.array(z.string().describe('Output item')))
        .mutation((opts) => opts.input),
    });

    const result = new Map<string, RuntimeDescriptions>();
    collectRuntimeDescriptions(router, '', result);

    const info = result.get('directArray');
    expect(info).toBeDefined();
    expect(info!.input!.properties.get('[]')).toBe('Input item');
    expect(info!.output!.properties.get('[]')).toBe('Output item');
  });

  it('merges multiple chained input descriptions', () => {
    const router = t.router({
      multi: t.procedure
        .input(z.object({ a: z.string().describe('First') }))
        .input(z.object({ b: z.number().describe('Second') }))
        .query(({ input }) => `${input.a}${input.b}`),
    });

    const result = new Map<string, RuntimeDescriptions>();
    collectRuntimeDescriptions(router, '', result);

    const info = result.get('multi');
    expect(info).toBeDefined();
    expect(info!.input!.properties.get('a')).toBe('First');
    expect(info!.input!.properties.get('b')).toBe('Second');
  });
});

// ---------------------------------------------------------------------------
// applyDescriptions
// ---------------------------------------------------------------------------

describe('applyDescriptions', () => {
  it('applies top-level description', () => {
    const schema: JsonSchema = { type: 'object', properties: {} };
    applyDescriptions(schema, { self: 'A schema', properties: new Map() });
    expect(schema.description).toBe('A schema');
  });

  it('overwrites existing description (Zod .describe() takes priority)', () => {
    const schema: JsonSchema = {
      type: 'object',
      description: 'Existing',
      properties: {},
    };
    applyDescriptions(schema, { self: 'New', properties: new Map() });
    expect(schema.description).toBe('New');
  });

  it('applies property descriptions', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
      },
    };
    const props = new Map([
      ['name', 'User name'],
      ['age', 'User age'],
    ]);
    applyDescriptions(schema, { properties: props });
    expect(schema.properties!['name']!.description).toBe('User name');
    expect(schema.properties!['age']!.description).toBe('User age');
  });

  it('applies nested property descriptions', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
          },
        },
      },
    };
    const props = new Map([['address.street', 'Street name']]);
    applyDescriptions(schema, { properties: props });
    expect(
      schema.properties!['address']!.properties!['street']!.description,
    ).toBe('Street name');
  });

  it('applies descriptions through array items', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        children: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'number' },
            },
          },
        },
      },
    };
    const props = new Map([
      ['children.name', 'Child name'],
      ['children.age', 'Child age'],
    ]);
    applyDescriptions(schema, { properties: props });
    const items = schema.properties!['children']!.items as JsonSchema;
    expect(items.properties!['name']!.description).toBe('Child name');
    expect(items.properties!['age']!.description).toBe('Child age');
  });

  it('applies description to array items via [] path', () => {
    const schema: JsonSchema = {
      type: 'array',
      items: {
        type: 'string',
      },
    };
    const props = new Map([['[]', 'A string item']]);
    applyDescriptions(schema, { properties: props });
    expect((schema.items as JsonSchema).description).toBe('A string item');
  });

  it('overwrites existing property descriptions (Zod takes priority)', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Existing' },
      },
    };
    const props = new Map([['name', 'New']]);
    applyDescriptions(schema, { properties: props });
    expect(schema.properties!['name']!.description).toBe('New');
  });
});
