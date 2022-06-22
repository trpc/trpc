/**
 * @deprecated Only keeping this for future reference if our testing was a false-positive
 * Generates a big `mergeRouters`-file that can take a bunch of different number of generics.
 */
import fs from 'fs';

const NUM_ARGS = 20;

const BASE = `
import { AnyRouter, AnyRouterParams, Router } from "../../router";
import { mergeRouters } from '../mergeRouters';

`.trim();

const TEMPLATE = `


export function mergeRoutersGeneric<
  __GENERICS__
>(
  __args__
): Router<{
  _ctx: RP0['_ctx'];
  _errorShape: RP0['_errorShape'];
  _meta: RP0['_meta'];
  transformer: RP0['transformer'];
  errorFormatter: RP0['errorFormatter'];
  queries: __queries__;
  mutations: __mutations__;
  subscriptions: __subscriptions__;
  children: __children__;
  procedures: __procedures__;
}>;
`.trim();

const END = `

export function mergeRoutersGeneric(...args: AnyRouter[]): AnyRouter {
  return mergeRouters(...args) as any;
}

`.trim();

const TARGET_DIR =
  __dirname + '/../packages/server/src/core/internals/__generated__';

const partList: string[] = [];
for (let index = 0; index < NUM_ARGS; index++) {
  const generics: string[] = [];
  const args: string[] = [];
  const queries: string[] = [];
  const mutations: string[] = [];
  const subscriptions: string[] = [];
  const procedures: string[] = [];
  const children: string[] = [];

  for (let j = 0; j < index + 1; j++) {
    generics.push(`RP${j} extends AnyRouterParams`);
    args.push(`router${j}: Router<RP${j}>`);
    queries.push(`RP${j}['queries']`);
    mutations.push(`RP${j}['mutations']`);
    subscriptions.push(`RP${j}['subscriptions']`);
    children.push(`RP${j}['children']`);
    procedures.push(`RP${j}['children']`);
  }
  const ARGS = args.join(', ');

  const GENERICS = generics.join(', ');

  const make = (str: string) =>
    new Array(index + 1)
      .fill('')
      .map((_, index) => `RP${index}['${str}']`)
      .join(' & ');
  console.log(make('queries'));
  const part = TEMPLATE.replace('__GENERICS__', GENERICS)
    .replace('__args__', ARGS)
    .replace('__queries__', make('queries'))
    .replace('__mutations__', make('mutations'))
    .replace('__subscriptions__', make('subscriptions'))
    .replace('__children__', make('children'))
    .replace('__procedures__', make('procedures'));

  partList.push(part);
}

fs.mkdirSync(TARGET_DIR, { recursive: true });
fs.writeFileSync(
  `${TARGET_DIR}/mergeRoutersGeneric.ts`,
  [BASE, ...partList, END].join('\n\n'),
);
