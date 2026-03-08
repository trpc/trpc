import { describe, expect, it } from 'vitest';
import { createTRPCHeyApiClientConfig } from '../src/heyapi';

describe('createTRPCHeyApiClientConfig', () => {
  describe('without transformer', () => {
    const config = createTRPCHeyApiClientConfig();

    it('returns a querySerializer', () => {
      expect(config.querySerializer).toBeTypeOf('function');
    });

    it('does not return bodySerializer or responseTransformer', () => {
      expect(config.bodySerializer).toBeUndefined();
      expect(config.responseTransformer).toBeUndefined();
    });

    it('serializes query params as JSON strings', () => {
      const result = config.querySerializer({
        input: { name: 'World' },
      });
      expect(result).toBe('input=%7B%22name%22%3A%22World%22%7D');
      // Decode to verify
      const params = new URLSearchParams(result);
      expect(JSON.parse(params.get('input')!)).toEqual({ name: 'World' });
    });

    it('serializes multiple query params', () => {
      const result = config.querySerializer({
        input: { id: 1 },
        other: 'value',
      });
      const params = new URLSearchParams(result);
      expect(JSON.parse(params.get('input')!)).toEqual({ id: 1 });
      expect(JSON.parse(params.get('other')!)).toBe('value');
    });
  });

  describe('with combined transformer (superjson-style)', () => {
    // Mock a superjson-like combined transformer
    const mockTransformer = {
      input: {
        serialize: (value: unknown) => ({
          json: value,
          meta: { type: 'mock' },
        }),
        deserialize: (value: any) => value.json,
      },
      output: {
        serialize: (value: unknown) => ({
          json: value,
          meta: { type: 'mock' },
        }),
        deserialize: (value: any) => value.json,
      },
    };

    const config = createTRPCHeyApiClientConfig({
      transformer: mockTransformer,
    });

    it('returns querySerializer, bodySerializer, and responseTransformer', () => {
      expect(config.querySerializer).toBeTypeOf('function');
      expect(config.bodySerializer).toBeTypeOf('function');
      expect(config.responseTransformer).toBeTypeOf('function');
    });

    it('serializes the input key through the transformer in querySerializer', () => {
      const result = config.querySerializer({
        input: { name: 'World' },
      });
      const params = new URLSearchParams(result);
      const parsed = JSON.parse(params.get('input')!);
      // Should be serialized through the transformer
      expect(parsed).toEqual({
        json: { name: 'World' },
        meta: { type: 'mock' },
      });
    });

    it('does not transform non-input query keys', () => {
      const result = config.querySerializer({
        other: 'value',
      });
      const params = new URLSearchParams(result);
      expect(JSON.parse(params.get('other')!)).toBe('value');
    });

    it('serializes body through the transformer', () => {
      const result = config.bodySerializer!({ name: 'test' });
      expect(JSON.parse(result)).toEqual({
        json: { name: 'test' },
        meta: { type: 'mock' },
      });
    });

    it('deserializes response result.data through the transformer', async () => {
      const rawResponse = {
        result: {
          data: { json: { message: 'hello' }, meta: { type: 'mock' } },
        },
      };

      const transformed = await config.responseTransformer!(rawResponse);
      expect((transformed as any).result.data).toEqual({ message: 'hello' });
    });

    it('deserializes response error.data through the transformer', async () => {
      const rawResponse = {
        error: {
          data: { json: { code: 'NOT_FOUND' }, meta: { type: 'mock' } },
        },
      };

      const transformed = await config.responseTransformer!(rawResponse);
      expect((transformed as any).error.data).toEqual({ code: 'NOT_FOUND' });
    });

    it('passes through responses without result or error', async () => {
      const rawResponse = { something: 'else' };
      const transformed = await config.responseTransformer!(rawResponse);
      expect(transformed).toEqual({ something: 'else' });
    });

    it('handles null/undefined data gracefully', async () => {
      const transformed = await config.responseTransformer!(null);
      expect(transformed).toBeNull();

      const transformed2 = await config.responseTransformer!(undefined);
      expect(transformed2).toBeUndefined();

      const transformed3 = await config.responseTransformer!('string');
      expect(transformed3).toBe('string');
    });
  });

  describe('with simple (non-combined) transformer', () => {
    // A simple transformer that implements TRPCDataTransformer directly
    // (both serialize/deserialize on same object, not split into input/output)
    const simpleTransformer = {
      serialize: (value: unknown) => ({ wrapped: value }),
      deserialize: (value: any) => value.wrapped,
    };

    const config = createTRPCHeyApiClientConfig({
      transformer: simpleTransformer,
    });

    it('wraps simple transformer into combined form', () => {
      expect(config.bodySerializer).toBeTypeOf('function');
      expect(config.responseTransformer).toBeTypeOf('function');
    });

    it('uses the simple transformer for body serialization', () => {
      const result = config.bodySerializer!({ test: true });
      expect(JSON.parse(result)).toEqual({ wrapped: { test: true } });
    });

    it('uses the simple transformer for response deserialization', async () => {
      const rawResponse = {
        result: {
          data: { wrapped: { message: 'hello' } },
        },
      };

      const transformed = await config.responseTransformer!(rawResponse);
      expect((transformed as any).result.data).toEqual({ message: 'hello' });
    });
  });

  describe('with no options', () => {
    it('works when called with no arguments', () => {
      const config = createTRPCHeyApiClientConfig();
      expect(config.querySerializer).toBeTypeOf('function');
    });

    it('works when called with empty options', () => {
      const config = createTRPCHeyApiClientConfig({});
      expect(config.querySerializer).toBeTypeOf('function');
      expect(config.bodySerializer).toBeUndefined();
      expect(config.responseTransformer).toBeUndefined();
    });
  });
});
