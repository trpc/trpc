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
   __generics__
 >(
   __args__
 ): Router<{
  router: true;
  _ctx: RP0['_ctx'];
  _errorShape: RP0['_errorShape'];
  _meta: RP0['_meta'];
  transformer: RP0['transformer'];
  errorFormatter: RP0['errorFormatter'];
  queries: __queries__;
  mutations: __mutations__;
  subscriptions: __subscriptions__;
  procedures: __procedures__;
  record: __records__;
 }> & __records__;
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
  const records: string[] = [];

  for (let j = 0; j < index + 1; j++) {
    generics.push(`RP${j} extends AnyRouterDef`);
    args.push(`router${j}: Router<RP${j}>`);
    queries.push(`RP${j}['queries']`);
    mutations.push(`RP${j}['mutations']`);
    subscriptions.push(`RP${j}['subscriptions']`);
    procedures.push(`RP${j}['procedures']`);
    records.push(`RP${j}['record']`);
  }

  const part = TEMPLATE.replace('', '')
    .replace(/__generics__/g, generics.join(', '))
    .replace(/__args__/g, args.join(', '))
    .replace(/__queries__/g, queries.join(' & '))
    .replace(/__mutations__/g, mutations.join(' & '))
    .replace(/__subscriptions__/g, subscriptions.join(' & '))
    .replace(/__procedures__/g, procedures.join(' & '))
    .replace(/__records__/g, records.join(' & '));

  partList.push(part);
}

fs.mkdirSync(TARGET_DIR, { recursive: true });
fs.writeFileSync(
  `${TARGET_DIR}/mergeRoutersGeneric.ts`,
  [BASE, ...partList, END].join('\n\n'),
);
