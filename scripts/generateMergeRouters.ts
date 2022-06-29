/**
 * @deprecated Only keeping this for future reference if our testing was a false-positive
 * Generates a big `mergeRouters`-file that can take a bunch of different number of generics.
 */
import fs from 'fs';

const NUM_ARGS = 20;

const BASE = `
 import { AnyRouter, AnyRouterDef, Router } from "../../router";
 import { mergeRouters } from '../mergeRouters';
 
 `.trim();

const TEMPLATE = `
 
 
 export function mergeRoutersGeneric<
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
   procedures: __PROCEDURES__;
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

  for (let j = 0; j < index + 1; j++) {
    generics.push(`RP${j} extends AnyRouterDef`);
    args.push(`router${j}: Router<RP${j}>`);
    queries.push(`RP${j}['queries']`);
    mutations.push(`RP${j}['mutations']`);
    subscriptions.push(`RP${j}['subscriptions']`);
    procedures.push(`RP${j}['procedures']`);
  }

  const GENERICS = generics.join(', ');
  const ARGS = args.join(', ');
  const QUERIES = queries.join(' & ');
  const MUTATIONS = mutations.join(' & ');
  const SUBSCRIPTIONS = subscriptions.join(' & ');
  const PROCEDURES = procedures.join(' & ');

  const part = TEMPLATE.replace('__GENERICS__', GENERICS)
    .replace('__ARGS__', ARGS)
    .replace('__QUERIES__', QUERIES)
    .replace('__MUTATIONS__', MUTATIONS)
    .replace('__SUBSCRIPTIONS__', SUBSCRIPTIONS)
    .replace('__PROCEDURES__', PROCEDURES);

  partList.push(part);
}

fs.mkdirSync(TARGET_DIR, { recursive: true });
fs.writeFileSync(
  `${TARGET_DIR}/mergeRoutersGeneric.ts`,
  [BASE, ...partList, END].join('\n\n'),
);
