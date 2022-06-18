import fs from 'fs';

const NUM_ARGS = 20;

const BASE = `
import { AnyRouter, AnyRouterParams, Router } from "../router";

`.trim();

const END = `

export function mergeRoutersNew(..._args: AnyRouter[]): AnyRouter {
  throw new Error('Not implemented');
}

`.trim();

const TEMPLATE = `

export function mergeRoutersNew<
  __GENERICS__
>(
  __ARGS__
): Router<{
  _ctx: RP0['_ctx'];
  _errorShape: RP0['_errorShape'];
  _meta: RP0['_meta'];
  transformer: RP0['transformer'];
  errorFormatter: RP0['errorFormatter'];
  queries: __QUERIES__;
  mutations: __MUTATIONS__;
  subscriptions: __SUBSCRIPTIONS__;
}>;
`.trim();

const TARGET_FILE =
  __dirname + '/../packages/server/src/core/internals/mergeRoutersNew.ts';

const partList: string[] = [];
for (let index = 0; index < NUM_ARGS; index++) {
  const generics: string[] = [];
  const args: string[] = [];
  const queries: string[] = [];
  const mutations: string[] = [];
  const subscriptions: string[] = [];

  for (let j = 0; j < index + 1; j++) {
    generics.push(`RP${j} extends AnyRouterParams`);
    args.push(`router${j}: Router<RP${j}>`);
    queries.push(`RP${j}['queries']`);
    mutations.push(`RP${j}['mutations']`);
    subscriptions.push(`RP${j}['subscriptions']`);
  }

  const GENERICS = generics.join(', ');
  const ARGS = args.join(', ');
  const QUERIES = queries.join(' & ');
  const MUTATIONS = mutations.join(' & ');
  const SUBSCRIPTIONS = subscriptions.join(' & ');

  const part = TEMPLATE.replace('__GENERICS__', GENERICS)
    .replace('__ARGS__', ARGS)
    .replace('__QUERIES__', QUERIES)
    .replace('__MUTATIONS__', MUTATIONS)
    .replace('__SUBSCRIPTIONS__', SUBSCRIPTIONS);

  partList.push(part);
}

console.log({ TARGET_FILE, BASE });

fs.writeFileSync(TARGET_FILE, [BASE, ...partList, END].join('\n\n'));
