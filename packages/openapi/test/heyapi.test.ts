import http from 'node:http';
import { createHTTPHandler } from '@trpc/server/adapters/standalone';
import { makeAsyncResource } from '@trpc/server/unstable-core-do-not-import/stream/utils/disposable';
import SuperJSON from 'superjson';
import { describe, expect, it, test } from 'vitest';
import {
  configureTRPCHeyApiClient,
  createTRPCHeyApiClientConfig,
} from '../src/heyapi';
import { ErrorFormatterRouter } from './routers/errorFormatterRouter';
import { client as errorFormatterClient } from './routers/errorFormatterRouter-heyapi/client.gen';
import { Sdk as ErrorFormatterSdk } from './routers/errorFormatterRouter-heyapi/sdk.gen';
import { SuperjsonRouter } from './routers/superjsonRouter';
import { client as superjsonClient } from './routers/superjsonRouter-heyapi/client.gen';
import { Sdk as SuperjsonSdk } from './routers/superjsonRouter-heyapi/sdk.gen';

describe('createTRPCHeyApiClientConfig', () => {
  describe('without transformer', () => {
    const config = createTRPCHeyApiClientConfig();

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

      const transformed = (await config.responseTransformer!(
        rawResponse,
      )) as any;
      expect(transformed.result.data).toEqual({ message: 'hello' });
    });

    it('deserializes response result.data when result.type is "data"', async () => {
      const rawResponse = {
        result: {
          type: 'data' as const,
          data: { json: { message: 'hello' }, meta: { type: 'mock' } },
        },
      };

      const transformed = (await config.responseTransformer!(
        rawResponse,
      )) as any;
      expect(transformed.result.data).toEqual({ message: 'hello' });
    });

    it('does not deserialize result.data when result.type is not "data"', async () => {
      const rawResponse = {
        result: {
          type: 'stopped' as const,
          data: { json: { message: 'hello' }, meta: { type: 'mock' } },
        },
      };

      const transformed = (await config.responseTransformer!(
        rawResponse,
      )) as any;
      // Should NOT have been deserialized
      expect(transformed.result.data).toEqual({
        json: { message: 'hello' },
        meta: { type: 'mock' },
      });
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

      const transformed = (await config.responseTransformer!(
        rawResponse,
      )) as any;
      expect(transformed.result.data).toEqual({ message: 'hello' });
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

  describe('error response via real server without transformer', () => {
    async function setupSdk() {
      const server = http.createServer(
        createHTTPHandler({ router: ErrorFormatterRouter }),
      );
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const baseUrl = `http://localhost:${(server.address() as { port: number }).port}`;

      configureTRPCHeyApiClient(errorFormatterClient, { baseUrl });

      return makeAsyncResource(
        { sdk: new ErrorFormatterSdk({ client: errorFormatterClient }) },
        () => new Promise<void>((resolve) => server.close(() => resolve())),
      );
    }

    it('returns custom errorFormatter fields in the error response', async () => {
      await using ctx = await setupSdk();
      const { sdk } = ctx;

      type IntentionallyWillError = any;

      // Send invalid input (number instead of string) to trigger BAD_REQUEST
      const result = await sdk.hello({
        query: { input: { name: 123 as IntentionallyWillError } },
      });

      // Without a transformer the raw JSON comes back unchanged
      expect(result.error).toBeDefined();
      const error = result.error!;
      expect(error).toBeDefined();
      expect(error.error.code).toBe(-32600); // BAD_REQUEST
      expect(error.error.data.code).toBe('BAD_REQUEST');
      expect(error.error.data.httpStatus).toBe(400);
      expect(error.error.data).toHaveProperty('zodError');
    });
  });

  describe('error response via real server with SuperJSON transformer', () => {
    async function setupSdk() {
      const server = http.createServer(
        createHTTPHandler({ router: SuperjsonRouter }),
      );
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const baseUrl = `http://localhost:${(server.address() as { port: number }).port}`;

      configureTRPCHeyApiClient(superjsonClient, {
        baseUrl,
        transformer: SuperJSON,
      });

      return makeAsyncResource(
        { sdk: new SuperjsonSdk({ client: superjsonClient }) },
        () => new Promise<void>((resolve) => server.close(() => resolve())),
      );
    }

    it('deserializes the entire error object through the error interceptor', async () => {
      await using ctx = await setupSdk();
      const { sdk } = ctx;

      type IntentionallyWillError = any;

      // Send invalid input to trigger BAD_REQUEST
      const result = await sdk.getEvent({
        query: {
          input: {
            id: 123 as IntentionallyWillError,
            at: 'not-a-date' as IntentionallyWillError,
          },
        },
      });

      expect(result.error).toBeDefined();
      // After the error interceptor deserializes, the standard shape is restored
      const error = result.error!;
      expect(error).toBeDefined();
      expect(error.error.code).toBe(-32600); // BAD_REQUEST
      expect(error.error.data.code).toBe('BAD_REQUEST');
      expect(error.error.data.httpStatus).toBe(400);
      expect(error.error.message).toBeTypeOf('string');
    });
  });

  describe('bad values', () => {
    test.each([
      {
        label: 'undefined',
        value: undefined,
        included: false,
        expectedValue: undefined,
      },
      { label: 'null', value: null, included: true, expectedValue: 'null' },
      { label: 'empty string', value: '', included: true, expectedValue: '""' },
      { label: 'zero', value: 0, included: true, expectedValue: '0' },
    ])(
      'querySerializer handles $label values in query params',
      ({ value, included, expectedValue }) => {
        const config = createTRPCHeyApiClientConfig();
        const result = config.querySerializer({ input: value });
        const params = new URLSearchParams(result);

        expect(params.has('input')).toBe(included);
        if (included) {
          expect(params.get('input')).toEqual(expectedValue);
        }
      },
    );

    test.each([
      {
        label: 'undefined',
        value: undefined,
        included: false,
        expectedParsed: undefined,
      },
      {
        label: 'null',
        value: null,
        included: true,
        expectedParsed: '{"json":null}',
      },
      {
        label: 'empty string',
        value: '',
        included: true,
        expectedParsed: '{"json":""}',
      },
      { label: 'zero', value: 0, included: true, expectedParsed: '{"json":0}' },
    ])(
      'querySerializer with transformer handles $label values in query params',
      ({ value, included, expectedParsed }) => {
        const config = createTRPCHeyApiClientConfig({
          transformer: SuperJSON,
        });
        const result = config.querySerializer({ input: value });
        const params = new URLSearchParams(result);

        expect(params.has('input')).toBe(included);
        if (included) {
          expect(params.get('input')).toEqual(expectedParsed);
        }
      },
    );

    test.each([
      {
        label: 'undefined',
        value: undefined,
        expectedParsed: '{"json":null,"meta":{"values":["undefined"]}}',
      },
      { label: 'null', value: null, expectedParsed: '{"json":null}' },
      {
        label: 'empty string',
        value: '',
        expectedParsed: '{"json":""}',
      },
      {
        label: 'zero',
        value: 0,
        expectedParsed: '{"json":0}',
      },
    ])('bodySerializer handles $label body', ({ value, expectedParsed }) => {
      const config = createTRPCHeyApiClientConfig({
        transformer: SuperJSON,
      });
      const result = config.bodySerializer!(value);

      expect(result).toBe(expectedParsed);
    });

    test.each([
      { label: 'undefined', value: undefined },
      { label: 'null', value: null },
      { label: 'empty string', value: '' },
      { label: 'zero', value: 0 },
    ])('responseTransformer handles $label data', async ({ value }) => {
      const config = createTRPCHeyApiClientConfig({
        transformer: SuperJSON,
      });
      const transformed = await config.responseTransformer!(value);
      expect(transformed).toEqual(value);
    });
  });
});
