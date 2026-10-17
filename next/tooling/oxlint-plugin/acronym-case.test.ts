import { RuleTester } from 'oxlint/plugins-dev';
import { describe, it } from 'vite-plus/test';
import plugin from './index.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: 'ts' } },
});

const acronym = (name: string, fixed: string) => ({
  messageId: 'acronym',
  data: { name, fixed },
});

tester.run('acronym-case', plugin.rules['acronym-case']!, {
  valid: [
    `class TrpcError extends Error {}`,
    `const httpLink = () => {};`,
    `const SSE_EVENT = 'message';`,
    `const X = 1;`,
    `const trpc = {};`,
    `class Data { toJSON() { return {}; } }`,
    `const experimental_TrpcModule = {};`,
    `const experimental_TRPC_MODULE_OPTIONS = 'options';`,
    `type Box<TRouter> = TRouter;`,
    `const value = { ['maxURLLength']: 1 };`,
    `fetch(URL);`,
  ],
  invalid: [
    {
      code: `class TRPCError extends Error {}`,
      errors: [acronym('TRPCError', 'TrpcError')],
    },
    {
      code: `type AnyTRPCError = Error;`,
      errors: [acronym('AnyTRPCError', 'AnyTrpcError')],
    },
    {
      code: `function initTRPC() {}`,
      errors: [acronym('initTRPC', 'initTrpc')],
    },
    {
      code: `const maxURLLength = 2048;`,
      errors: [acronym('maxURLLength', 'maxUrlLength')],
    },
    {
      code: `interface Schema { toJSONSchema(): unknown }`,
      errors: [acronym('toJSONSchema', 'toJsonSchema')],
    },
    {
      code: `class Generator { generateOpenAPI() {} }`,
      errors: [acronym('generateOpenAPI', 'generateOpenApi')],
    },
    {
      code: `interface HTTPLinkOptions { url: string }`,
      errors: [acronym('HTTPLinkOptions', 'HttpLinkOptions')],
    },
    {
      code: `class Stream { parseSSE = () => {}; }`,
      errors: [acronym('parseSSE', 'parseSse')],
    },
    {
      code: `interface Options { maxURLLength: number }`,
      errors: [acronym('maxURLLength', 'maxUrlLength')],
    },
    {
      code: `enum HTTPMethod { Get }`,
      errors: [acronym('HTTPMethod', 'HttpMethod')],
    },
    {
      code: `const experimental_initTRPC = () => {};`,
      errors: [acronym('experimental_initTRPC', 'experimental_initTrpc')],
    },
    {
      code: `type Value<TJSONValue> = TJSONValue;`,
      errors: [acronym('TJSONValue', 'TJsonValue')],
    },
  ],
});
