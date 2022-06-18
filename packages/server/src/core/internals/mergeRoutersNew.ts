import { AnyRouter, AnyRouterParams, Router } from "../router";

export function mergeRoutersNew<
  RP0 extends AnyRouterParams
>(
  router0: Router<RP0>
): Router<{
  _ctx: RP0['_ctx'];
  _errorShape: RP0['_errorShape'];
  _meta: RP0['_meta'];
  transformer: RP0['transformer'];
  errorFormatter: RP0['errorFormatter'];
  queries: RP0['queries'];
  mutations: RP0['mutations'];
  subscriptions: RP0['subscriptions'];
}>;

export function mergeRoutersNew<
  RP0 extends AnyRouterParams, RP1 extends AnyRouterParams
>(
  router0: Router<RP0>, router1: Router<RP1>
): Router<{
  _ctx: RP0['_ctx'];
  _errorShape: RP0['_errorShape'];
  _meta: RP0['_meta'];
  transformer: RP0['transformer'];
  errorFormatter: RP0['errorFormatter'];
  queries: RP0['queries'] & RP1['queries'];
  mutations: RP0['mutations'] & RP1['mutations'];
  subscriptions: RP0['subscriptions'] & RP1['subscriptions'];
}>;

export function mergeRoutersNew<
  RP0 extends AnyRouterParams, RP1 extends AnyRouterParams, RP2 extends AnyRouterParams
>(
  router0: Router<RP0>, router1: Router<RP1>, router2: Router<RP2>
): Router<{
  _ctx: RP0['_ctx'];
  _errorShape: RP0['_errorShape'];
  _meta: RP0['_meta'];
  transformer: RP0['transformer'];
  errorFormatter: RP0['errorFormatter'];
  queries: RP0['queries'] & RP1['queries'] & RP2['queries'];
  mutations: RP0['mutations'] & RP1['mutations'] & RP2['mutations'];
  subscriptions: RP0['subscriptions'] & RP1['subscriptions'] & RP2['subscriptions'];
}>;

export function mergeRoutersNew<
  RP0 extends AnyRouterParams, RP1 extends AnyRouterParams, RP2 extends AnyRouterParams, RP3 extends AnyRouterParams
>(
  router0: Router<RP0>, router1: Router<RP1>, router2: Router<RP2>, router3: Router<RP3>
): Router<{
  _ctx: RP0['_ctx'];
  _errorShape: RP0['_errorShape'];
  _meta: RP0['_meta'];
  transformer: RP0['transformer'];
  errorFormatter: RP0['errorFormatter'];
  queries: RP0['queries'] & RP1['queries'] & RP2['queries'] & RP3['queries'];
  mutations: RP0['mutations'] & RP1['mutations'] & RP2['mutations'] & RP3['mutations'];
  subscriptions: RP0['subscriptions'] & RP1['subscriptions'] & RP2['subscriptions'] & RP3['subscriptions'];
}>;

export function mergeRoutersNew<
  RP0 extends AnyRouterParams, RP1 extends AnyRouterParams, RP2 extends AnyRouterParams, RP3 extends AnyRouterParams, RP4 extends AnyRouterParams
>(
  router0: Router<RP0>, router1: Router<RP1>, router2: Router<RP2>, router3: Router<RP3>, router4: Router<RP4>
): Router<{
  _ctx: RP0['_ctx'];
  _errorShape: RP0['_errorShape'];
  _meta: RP0['_meta'];
  transformer: RP0['transformer'];
  errorFormatter: RP0['errorFormatter'];
  queries: RP0['queries'] & RP1['queries'] & RP2['queries'] & RP3['queries'] & RP4['queries'];
  mutations: RP0['mutations'] & RP1['mutations'] & RP2['mutations'] & RP3['mutations'] & RP4['mutations'];
  subscriptions: RP0['subscriptions'] & RP1['subscriptions'] & RP2['subscriptions'] & RP3['subscriptions'] & RP4['subscriptions'];
}>;

export function mergeRoutersNew<
  RP0 extends AnyRouterParams, RP1 extends AnyRouterParams, RP2 extends AnyRouterParams, RP3 extends AnyRouterParams, RP4 extends AnyRouterParams, RP5 extends AnyRouterParams
>(
  router0: Router<RP0>, router1: Router<RP1>, router2: Router<RP2>, router3: Router<RP3>, router4: Router<RP4>, router5: Router<RP5>
): Router<{
  _ctx: RP0['_ctx'];
  _errorShape: RP0['_errorShape'];
  _meta: RP0['_meta'];
  transformer: RP0['transformer'];
  errorFormatter: RP0['errorFormatter'];
  queries: RP0['queries'] & RP1['queries'] & RP2['queries'] & RP3['queries'] & RP4['queries'] & RP5['queries'];
  mutations: RP0['mutations'] & RP1['mutations'] & RP2['mutations'] & RP3['mutations'] & RP4['mutations'] & RP5['mutations'];
  subscriptions: RP0['subscriptions'] & RP1['subscriptions'] & RP2['subscriptions'] & RP3['subscriptions'] & RP4['subscriptions'] & RP5['subscriptions'];
}>;

export function mergeRoutersNew<
  RP0 extends AnyRouterParams, RP1 extends AnyRouterParams, RP2 extends AnyRouterParams, RP3 extends AnyRouterParams, RP4 extends AnyRouterParams, RP5 extends AnyRouterParams, RP6 extends AnyRouterParams
>(
  router0: Router<RP0>, router1: Router<RP1>, router2: Router<RP2>, router3: Router<RP3>, router4: Router<RP4>, router5: Router<RP5>, router6: Router<RP6>
): Router<{
  _ctx: RP0['_ctx'];
  _errorShape: RP0['_errorShape'];
  _meta: RP0['_meta'];
  transformer: RP0['transformer'];
  errorFormatter: RP0['errorFormatter'];
  queries: RP0['queries'] & RP1['queries'] & RP2['queries'] & RP3['queries'] & RP4['queries'] & RP5['queries'] & RP6['queries'];
  mutations: RP0['mutations'] & RP1['mutations'] & RP2['mutations'] & RP3['mutations'] & RP4['mutations'] & RP5['mutations'] & RP6['mutations'];
  subscriptions: RP0['subscriptions'] & RP1['subscriptions'] & RP2['subscriptions'] & RP3['subscriptions'] & RP4['subscriptions'] & RP5['subscriptions'] & RP6['subscriptions'];
}>;

export function mergeRoutersNew<
  RP0 extends AnyRouterParams, RP1 extends AnyRouterParams, RP2 extends AnyRouterParams, RP3 extends AnyRouterParams, RP4 extends AnyRouterParams, RP5 extends AnyRouterParams, RP6 extends AnyRouterParams, RP7 extends AnyRouterParams
>(
  router0: Router<RP0>, router1: Router<RP1>, router2: Router<RP2>, router3: Router<RP3>, router4: Router<RP4>, router5: Router<RP5>, router6: Router<RP6>, router7: Router<RP7>
): Router<{
  _ctx: RP0['_ctx'];
  _errorShape: RP0['_errorShape'];
  _meta: RP0['_meta'];
  transformer: RP0['transformer'];
  errorFormatter: RP0['errorFormatter'];
  queries: RP0['queries'] & RP1['queries'] & RP2['queries'] & RP3['queries'] & RP4['queries'] & RP5['queries'] & RP6['queries'] & RP7['queries'];
  mutations: RP0['mutations'] & RP1['mutations'] & RP2['mutations'] & RP3['mutations'] & RP4['mutations'] & RP5['mutations'] & RP6['mutations'] & RP7['mutations'];
  subscriptions: RP0['subscriptions'] & RP1['subscriptions'] & RP2['subscriptions'] & RP3['subscriptions'] & RP4['subscriptions'] & RP5['subscriptions'] & RP6['subscriptions'] & RP7['subscriptions'];
}>;

export function mergeRoutersNew<
  RP0 extends AnyRouterParams, RP1 extends AnyRouterParams, RP2 extends AnyRouterParams, RP3 extends AnyRouterParams, RP4 extends AnyRouterParams, RP5 extends AnyRouterParams, RP6 extends AnyRouterParams, RP7 extends AnyRouterParams, RP8 extends AnyRouterParams
>(
  router0: Router<RP0>, router1: Router<RP1>, router2: Router<RP2>, router3: Router<RP3>, router4: Router<RP4>, router5: Router<RP5>, router6: Router<RP6>, router7: Router<RP7>, router8: Router<RP8>
): Router<{
  _ctx: RP0['_ctx'];
  _errorShape: RP0['_errorShape'];
  _meta: RP0['_meta'];
  transformer: RP0['transformer'];
  errorFormatter: RP0['errorFormatter'];
  queries: RP0['queries'] & RP1['queries'] & RP2['queries'] & RP3['queries'] & RP4['queries'] & RP5['queries'] & RP6['queries'] & RP7['queries'] & RP8['queries'];
  mutations: RP0['mutations'] & RP1['mutations'] & RP2['mutations'] & RP3['mutations'] & RP4['mutations'] & RP5['mutations'] & RP6['mutations'] & RP7['mutations'] & RP8['mutations'];
  subscriptions: RP0['subscriptions'] & RP1['subscriptions'] & RP2['subscriptions'] & RP3['subscriptions'] & RP4['subscriptions'] & RP5['subscriptions'] & RP6['subscriptions'] & RP7['subscriptions'] & RP8['subscriptions'];
}>;

export function mergeRoutersNew<
  RP0 extends AnyRouterParams, RP1 extends AnyRouterParams, RP2 extends AnyRouterParams, RP3 extends AnyRouterParams, RP4 extends AnyRouterParams, RP5 extends AnyRouterParams, RP6 extends AnyRouterParams, RP7 extends AnyRouterParams, RP8 extends AnyRouterParams, RP9 extends AnyRouterParams
>(
  router0: Router<RP0>, router1: Router<RP1>, router2: Router<RP2>, router3: Router<RP3>, router4: Router<RP4>, router5: Router<RP5>, router6: Router<RP6>, router7: Router<RP7>, router8: Router<RP8>, router9: Router<RP9>
): Router<{
  _ctx: RP0['_ctx'];
  _errorShape: RP0['_errorShape'];
  _meta: RP0['_meta'];
  transformer: RP0['transformer'];
  errorFormatter: RP0['errorFormatter'];
  queries: RP0['queries'] & RP1['queries'] & RP2['queries'] & RP3['queries'] & RP4['queries'] & RP5['queries'] & RP6['queries'] & RP7['queries'] & RP8['queries'] & RP9['queries'];
  mutations: RP0['mutations'] & RP1['mutations'] & RP2['mutations'] & RP3['mutations'] & RP4['mutations'] & RP5['mutations'] & RP6['mutations'] & RP7['mutations'] & RP8['mutations'] & RP9['mutations'];
  subscriptions: RP0['subscriptions'] & RP1['subscriptions'] & RP2['subscriptions'] & RP3['subscriptions'] & RP4['subscriptions'] & RP5['subscriptions'] & RP6['subscriptions'] & RP7['subscriptions'] & RP8['subscriptions'] & RP9['subscriptions'];
}>;

export function mergeRoutersNew<
  RP0 extends AnyRouterParams, RP1 extends AnyRouterParams, RP2 extends AnyRouterParams, RP3 extends AnyRouterParams, RP4 extends AnyRouterParams, RP5 extends AnyRouterParams, RP6 extends AnyRouterParams, RP7 extends AnyRouterParams, RP8 extends AnyRouterParams, RP9 extends AnyRouterParams, RP10 extends AnyRouterParams
>(
  router0: Router<RP0>, router1: Router<RP1>, router2: Router<RP2>, router3: Router<RP3>, router4: Router<RP4>, router5: Router<RP5>, router6: Router<RP6>, router7: Router<RP7>, router8: Router<RP8>, router9: Router<RP9>, router10: Router<RP10>
): Router<{
  _ctx: RP0['_ctx'];
  _errorShape: RP0['_errorShape'];
  _meta: RP0['_meta'];
  transformer: RP0['transformer'];
  errorFormatter: RP0['errorFormatter'];
  queries: RP0['queries'] & RP1['queries'] & RP2['queries'] & RP3['queries'] & RP4['queries'] & RP5['queries'] & RP6['queries'] & RP7['queries'] & RP8['queries'] & RP9['queries'] & RP10['queries'];
  mutations: RP0['mutations'] & RP1['mutations'] & RP2['mutations'] & RP3['mutations'] & RP4['mutations'] & RP5['mutations'] & RP6['mutations'] & RP7['mutations'] & RP8['mutations'] & RP9['mutations'] & RP10['mutations'];
  subscriptions: RP0['subscriptions'] & RP1['subscriptions'] & RP2['subscriptions'] & RP3['subscriptions'] & RP4['subscriptions'] & RP5['subscriptions'] & RP6['subscriptions'] & RP7['subscriptions'] & RP8['subscriptions'] & RP9['subscriptions'] & RP10['subscriptions'];
}>;

export function mergeRoutersNew<
  RP0 extends AnyRouterParams, RP1 extends AnyRouterParams, RP2 extends AnyRouterParams, RP3 extends AnyRouterParams, RP4 extends AnyRouterParams, RP5 extends AnyRouterParams, RP6 extends AnyRouterParams, RP7 extends AnyRouterParams, RP8 extends AnyRouterParams, RP9 extends AnyRouterParams, RP10 extends AnyRouterParams, RP11 extends AnyRouterParams
>(
  router0: Router<RP0>, router1: Router<RP1>, router2: Router<RP2>, router3: Router<RP3>, router4: Router<RP4>, router5: Router<RP5>, router6: Router<RP6>, router7: Router<RP7>, router8: Router<RP8>, router9: Router<RP9>, router10: Router<RP10>, router11: Router<RP11>
): Router<{
  _ctx: RP0['_ctx'];
  _errorShape: RP0['_errorShape'];
  _meta: RP0['_meta'];
  transformer: RP0['transformer'];
  errorFormatter: RP0['errorFormatter'];
  queries: RP0['queries'] & RP1['queries'] & RP2['queries'] & RP3['queries'] & RP4['queries'] & RP5['queries'] & RP6['queries'] & RP7['queries'] & RP8['queries'] & RP9['queries'] & RP10['queries'] & RP11['queries'];
  mutations: RP0['mutations'] & RP1['mutations'] & RP2['mutations'] & RP3['mutations'] & RP4['mutations'] & RP5['mutations'] & RP6['mutations'] & RP7['mutations'] & RP8['mutations'] & RP9['mutations'] & RP10['mutations'] & RP11['mutations'];
  subscriptions: RP0['subscriptions'] & RP1['subscriptions'] & RP2['subscriptions'] & RP3['subscriptions'] & RP4['subscriptions'] & RP5['subscriptions'] & RP6['subscriptions'] & RP7['subscriptions'] & RP8['subscriptions'] & RP9['subscriptions'] & RP10['subscriptions'] & RP11['subscriptions'];
}>;

export function mergeRoutersNew<
  RP0 extends AnyRouterParams, RP1 extends AnyRouterParams, RP2 extends AnyRouterParams, RP3 extends AnyRouterParams, RP4 extends AnyRouterParams, RP5 extends AnyRouterParams, RP6 extends AnyRouterParams, RP7 extends AnyRouterParams, RP8 extends AnyRouterParams, RP9 extends AnyRouterParams, RP10 extends AnyRouterParams, RP11 extends AnyRouterParams, RP12 extends AnyRouterParams
>(
  router0: Router<RP0>, router1: Router<RP1>, router2: Router<RP2>, router3: Router<RP3>, router4: Router<RP4>, router5: Router<RP5>, router6: Router<RP6>, router7: Router<RP7>, router8: Router<RP8>, router9: Router<RP9>, router10: Router<RP10>, router11: Router<RP11>, router12: Router<RP12>
): Router<{
  _ctx: RP0['_ctx'];
  _errorShape: RP0['_errorShape'];
  _meta: RP0['_meta'];
  transformer: RP0['transformer'];
  errorFormatter: RP0['errorFormatter'];
  queries: RP0['queries'] & RP1['queries'] & RP2['queries'] & RP3['queries'] & RP4['queries'] & RP5['queries'] & RP6['queries'] & RP7['queries'] & RP8['queries'] & RP9['queries'] & RP10['queries'] & RP11['queries'] & RP12['queries'];
  mutations: RP0['mutations'] & RP1['mutations'] & RP2['mutations'] & RP3['mutations'] & RP4['mutations'] & RP5['mutations'] & RP6['mutations'] & RP7['mutations'] & RP8['mutations'] & RP9['mutations'] & RP10['mutations'] & RP11['mutations'] & RP12['mutations'];
  subscriptions: RP0['subscriptions'] & RP1['subscriptions'] & RP2['subscriptions'] & RP3['subscriptions'] & RP4['subscriptions'] & RP5['subscriptions'] & RP6['subscriptions'] & RP7['subscriptions'] & RP8['subscriptions'] & RP9['subscriptions'] & RP10['subscriptions'] & RP11['subscriptions'] & RP12['subscriptions'];
}>;

export function mergeRoutersNew<
  RP0 extends AnyRouterParams, RP1 extends AnyRouterParams, RP2 extends AnyRouterParams, RP3 extends AnyRouterParams, RP4 extends AnyRouterParams, RP5 extends AnyRouterParams, RP6 extends AnyRouterParams, RP7 extends AnyRouterParams, RP8 extends AnyRouterParams, RP9 extends AnyRouterParams, RP10 extends AnyRouterParams, RP11 extends AnyRouterParams, RP12 extends AnyRouterParams, RP13 extends AnyRouterParams
>(
  router0: Router<RP0>, router1: Router<RP1>, router2: Router<RP2>, router3: Router<RP3>, router4: Router<RP4>, router5: Router<RP5>, router6: Router<RP6>, router7: Router<RP7>, router8: Router<RP8>, router9: Router<RP9>, router10: Router<RP10>, router11: Router<RP11>, router12: Router<RP12>, router13: Router<RP13>
): Router<{
  _ctx: RP0['_ctx'];
  _errorShape: RP0['_errorShape'];
  _meta: RP0['_meta'];
  transformer: RP0['transformer'];
  errorFormatter: RP0['errorFormatter'];
  queries: RP0['queries'] & RP1['queries'] & RP2['queries'] & RP3['queries'] & RP4['queries'] & RP5['queries'] & RP6['queries'] & RP7['queries'] & RP8['queries'] & RP9['queries'] & RP10['queries'] & RP11['queries'] & RP12['queries'] & RP13['queries'];
  mutations: RP0['mutations'] & RP1['mutations'] & RP2['mutations'] & RP3['mutations'] & RP4['mutations'] & RP5['mutations'] & RP6['mutations'] & RP7['mutations'] & RP8['mutations'] & RP9['mutations'] & RP10['mutations'] & RP11['mutations'] & RP12['mutations'] & RP13['mutations'];
  subscriptions: RP0['subscriptions'] & RP1['subscriptions'] & RP2['subscriptions'] & RP3['subscriptions'] & RP4['subscriptions'] & RP5['subscriptions'] & RP6['subscriptions'] & RP7['subscriptions'] & RP8['subscriptions'] & RP9['subscriptions'] & RP10['subscriptions'] & RP11['subscriptions'] & RP12['subscriptions'] & RP13['subscriptions'];
}>;

export function mergeRoutersNew<
  RP0 extends AnyRouterParams, RP1 extends AnyRouterParams, RP2 extends AnyRouterParams, RP3 extends AnyRouterParams, RP4 extends AnyRouterParams, RP5 extends AnyRouterParams, RP6 extends AnyRouterParams, RP7 extends AnyRouterParams, RP8 extends AnyRouterParams, RP9 extends AnyRouterParams, RP10 extends AnyRouterParams, RP11 extends AnyRouterParams, RP12 extends AnyRouterParams, RP13 extends AnyRouterParams, RP14 extends AnyRouterParams
>(
  router0: Router<RP0>, router1: Router<RP1>, router2: Router<RP2>, router3: Router<RP3>, router4: Router<RP4>, router5: Router<RP5>, router6: Router<RP6>, router7: Router<RP7>, router8: Router<RP8>, router9: Router<RP9>, router10: Router<RP10>, router11: Router<RP11>, router12: Router<RP12>, router13: Router<RP13>, router14: Router<RP14>
): Router<{
  _ctx: RP0['_ctx'];
  _errorShape: RP0['_errorShape'];
  _meta: RP0['_meta'];
  transformer: RP0['transformer'];
  errorFormatter: RP0['errorFormatter'];
  queries: RP0['queries'] & RP1['queries'] & RP2['queries'] & RP3['queries'] & RP4['queries'] & RP5['queries'] & RP6['queries'] & RP7['queries'] & RP8['queries'] & RP9['queries'] & RP10['queries'] & RP11['queries'] & RP12['queries'] & RP13['queries'] & RP14['queries'];
  mutations: RP0['mutations'] & RP1['mutations'] & RP2['mutations'] & RP3['mutations'] & RP4['mutations'] & RP5['mutations'] & RP6['mutations'] & RP7['mutations'] & RP8['mutations'] & RP9['mutations'] & RP10['mutations'] & RP11['mutations'] & RP12['mutations'] & RP13['mutations'] & RP14['mutations'];
  subscriptions: RP0['subscriptions'] & RP1['subscriptions'] & RP2['subscriptions'] & RP3['subscriptions'] & RP4['subscriptions'] & RP5['subscriptions'] & RP6['subscriptions'] & RP7['subscriptions'] & RP8['subscriptions'] & RP9['subscriptions'] & RP10['subscriptions'] & RP11['subscriptions'] & RP12['subscriptions'] & RP13['subscriptions'] & RP14['subscriptions'];
}>;

export function mergeRoutersNew<
  RP0 extends AnyRouterParams, RP1 extends AnyRouterParams, RP2 extends AnyRouterParams, RP3 extends AnyRouterParams, RP4 extends AnyRouterParams, RP5 extends AnyRouterParams, RP6 extends AnyRouterParams, RP7 extends AnyRouterParams, RP8 extends AnyRouterParams, RP9 extends AnyRouterParams, RP10 extends AnyRouterParams, RP11 extends AnyRouterParams, RP12 extends AnyRouterParams, RP13 extends AnyRouterParams, RP14 extends AnyRouterParams, RP15 extends AnyRouterParams
>(
  router0: Router<RP0>, router1: Router<RP1>, router2: Router<RP2>, router3: Router<RP3>, router4: Router<RP4>, router5: Router<RP5>, router6: Router<RP6>, router7: Router<RP7>, router8: Router<RP8>, router9: Router<RP9>, router10: Router<RP10>, router11: Router<RP11>, router12: Router<RP12>, router13: Router<RP13>, router14: Router<RP14>, router15: Router<RP15>
): Router<{
  _ctx: RP0['_ctx'];
  _errorShape: RP0['_errorShape'];
  _meta: RP0['_meta'];
  transformer: RP0['transformer'];
  errorFormatter: RP0['errorFormatter'];
  queries: RP0['queries'] & RP1['queries'] & RP2['queries'] & RP3['queries'] & RP4['queries'] & RP5['queries'] & RP6['queries'] & RP7['queries'] & RP8['queries'] & RP9['queries'] & RP10['queries'] & RP11['queries'] & RP12['queries'] & RP13['queries'] & RP14['queries'] & RP15['queries'];
  mutations: RP0['mutations'] & RP1['mutations'] & RP2['mutations'] & RP3['mutations'] & RP4['mutations'] & RP5['mutations'] & RP6['mutations'] & RP7['mutations'] & RP8['mutations'] & RP9['mutations'] & RP10['mutations'] & RP11['mutations'] & RP12['mutations'] & RP13['mutations'] & RP14['mutations'] & RP15['mutations'];
  subscriptions: RP0['subscriptions'] & RP1['subscriptions'] & RP2['subscriptions'] & RP3['subscriptions'] & RP4['subscriptions'] & RP5['subscriptions'] & RP6['subscriptions'] & RP7['subscriptions'] & RP8['subscriptions'] & RP9['subscriptions'] & RP10['subscriptions'] & RP11['subscriptions'] & RP12['subscriptions'] & RP13['subscriptions'] & RP14['subscriptions'] & RP15['subscriptions'];
}>;

export function mergeRoutersNew<
  RP0 extends AnyRouterParams, RP1 extends AnyRouterParams, RP2 extends AnyRouterParams, RP3 extends AnyRouterParams, RP4 extends AnyRouterParams, RP5 extends AnyRouterParams, RP6 extends AnyRouterParams, RP7 extends AnyRouterParams, RP8 extends AnyRouterParams, RP9 extends AnyRouterParams, RP10 extends AnyRouterParams, RP11 extends AnyRouterParams, RP12 extends AnyRouterParams, RP13 extends AnyRouterParams, RP14 extends AnyRouterParams, RP15 extends AnyRouterParams, RP16 extends AnyRouterParams
>(
  router0: Router<RP0>, router1: Router<RP1>, router2: Router<RP2>, router3: Router<RP3>, router4: Router<RP4>, router5: Router<RP5>, router6: Router<RP6>, router7: Router<RP7>, router8: Router<RP8>, router9: Router<RP9>, router10: Router<RP10>, router11: Router<RP11>, router12: Router<RP12>, router13: Router<RP13>, router14: Router<RP14>, router15: Router<RP15>, router16: Router<RP16>
): Router<{
  _ctx: RP0['_ctx'];
  _errorShape: RP0['_errorShape'];
  _meta: RP0['_meta'];
  transformer: RP0['transformer'];
  errorFormatter: RP0['errorFormatter'];
  queries: RP0['queries'] & RP1['queries'] & RP2['queries'] & RP3['queries'] & RP4['queries'] & RP5['queries'] & RP6['queries'] & RP7['queries'] & RP8['queries'] & RP9['queries'] & RP10['queries'] & RP11['queries'] & RP12['queries'] & RP13['queries'] & RP14['queries'] & RP15['queries'] & RP16['queries'];
  mutations: RP0['mutations'] & RP1['mutations'] & RP2['mutations'] & RP3['mutations'] & RP4['mutations'] & RP5['mutations'] & RP6['mutations'] & RP7['mutations'] & RP8['mutations'] & RP9['mutations'] & RP10['mutations'] & RP11['mutations'] & RP12['mutations'] & RP13['mutations'] & RP14['mutations'] & RP15['mutations'] & RP16['mutations'];
  subscriptions: RP0['subscriptions'] & RP1['subscriptions'] & RP2['subscriptions'] & RP3['subscriptions'] & RP4['subscriptions'] & RP5['subscriptions'] & RP6['subscriptions'] & RP7['subscriptions'] & RP8['subscriptions'] & RP9['subscriptions'] & RP10['subscriptions'] & RP11['subscriptions'] & RP12['subscriptions'] & RP13['subscriptions'] & RP14['subscriptions'] & RP15['subscriptions'] & RP16['subscriptions'];
}>;

export function mergeRoutersNew<
  RP0 extends AnyRouterParams, RP1 extends AnyRouterParams, RP2 extends AnyRouterParams, RP3 extends AnyRouterParams, RP4 extends AnyRouterParams, RP5 extends AnyRouterParams, RP6 extends AnyRouterParams, RP7 extends AnyRouterParams, RP8 extends AnyRouterParams, RP9 extends AnyRouterParams, RP10 extends AnyRouterParams, RP11 extends AnyRouterParams, RP12 extends AnyRouterParams, RP13 extends AnyRouterParams, RP14 extends AnyRouterParams, RP15 extends AnyRouterParams, RP16 extends AnyRouterParams, RP17 extends AnyRouterParams
>(
  router0: Router<RP0>, router1: Router<RP1>, router2: Router<RP2>, router3: Router<RP3>, router4: Router<RP4>, router5: Router<RP5>, router6: Router<RP6>, router7: Router<RP7>, router8: Router<RP8>, router9: Router<RP9>, router10: Router<RP10>, router11: Router<RP11>, router12: Router<RP12>, router13: Router<RP13>, router14: Router<RP14>, router15: Router<RP15>, router16: Router<RP16>, router17: Router<RP17>
): Router<{
  _ctx: RP0['_ctx'];
  _errorShape: RP0['_errorShape'];
  _meta: RP0['_meta'];
  transformer: RP0['transformer'];
  errorFormatter: RP0['errorFormatter'];
  queries: RP0['queries'] & RP1['queries'] & RP2['queries'] & RP3['queries'] & RP4['queries'] & RP5['queries'] & RP6['queries'] & RP7['queries'] & RP8['queries'] & RP9['queries'] & RP10['queries'] & RP11['queries'] & RP12['queries'] & RP13['queries'] & RP14['queries'] & RP15['queries'] & RP16['queries'] & RP17['queries'];
  mutations: RP0['mutations'] & RP1['mutations'] & RP2['mutations'] & RP3['mutations'] & RP4['mutations'] & RP5['mutations'] & RP6['mutations'] & RP7['mutations'] & RP8['mutations'] & RP9['mutations'] & RP10['mutations'] & RP11['mutations'] & RP12['mutations'] & RP13['mutations'] & RP14['mutations'] & RP15['mutations'] & RP16['mutations'] & RP17['mutations'];
  subscriptions: RP0['subscriptions'] & RP1['subscriptions'] & RP2['subscriptions'] & RP3['subscriptions'] & RP4['subscriptions'] & RP5['subscriptions'] & RP6['subscriptions'] & RP7['subscriptions'] & RP8['subscriptions'] & RP9['subscriptions'] & RP10['subscriptions'] & RP11['subscriptions'] & RP12['subscriptions'] & RP13['subscriptions'] & RP14['subscriptions'] & RP15['subscriptions'] & RP16['subscriptions'] & RP17['subscriptions'];
}>;

export function mergeRoutersNew<
  RP0 extends AnyRouterParams, RP1 extends AnyRouterParams, RP2 extends AnyRouterParams, RP3 extends AnyRouterParams, RP4 extends AnyRouterParams, RP5 extends AnyRouterParams, RP6 extends AnyRouterParams, RP7 extends AnyRouterParams, RP8 extends AnyRouterParams, RP9 extends AnyRouterParams, RP10 extends AnyRouterParams, RP11 extends AnyRouterParams, RP12 extends AnyRouterParams, RP13 extends AnyRouterParams, RP14 extends AnyRouterParams, RP15 extends AnyRouterParams, RP16 extends AnyRouterParams, RP17 extends AnyRouterParams, RP18 extends AnyRouterParams
>(
  router0: Router<RP0>, router1: Router<RP1>, router2: Router<RP2>, router3: Router<RP3>, router4: Router<RP4>, router5: Router<RP5>, router6: Router<RP6>, router7: Router<RP7>, router8: Router<RP8>, router9: Router<RP9>, router10: Router<RP10>, router11: Router<RP11>, router12: Router<RP12>, router13: Router<RP13>, router14: Router<RP14>, router15: Router<RP15>, router16: Router<RP16>, router17: Router<RP17>, router18: Router<RP18>
): Router<{
  _ctx: RP0['_ctx'];
  _errorShape: RP0['_errorShape'];
  _meta: RP0['_meta'];
  transformer: RP0['transformer'];
  errorFormatter: RP0['errorFormatter'];
  queries: RP0['queries'] & RP1['queries'] & RP2['queries'] & RP3['queries'] & RP4['queries'] & RP5['queries'] & RP6['queries'] & RP7['queries'] & RP8['queries'] & RP9['queries'] & RP10['queries'] & RP11['queries'] & RP12['queries'] & RP13['queries'] & RP14['queries'] & RP15['queries'] & RP16['queries'] & RP17['queries'] & RP18['queries'];
  mutations: RP0['mutations'] & RP1['mutations'] & RP2['mutations'] & RP3['mutations'] & RP4['mutations'] & RP5['mutations'] & RP6['mutations'] & RP7['mutations'] & RP8['mutations'] & RP9['mutations'] & RP10['mutations'] & RP11['mutations'] & RP12['mutations'] & RP13['mutations'] & RP14['mutations'] & RP15['mutations'] & RP16['mutations'] & RP17['mutations'] & RP18['mutations'];
  subscriptions: RP0['subscriptions'] & RP1['subscriptions'] & RP2['subscriptions'] & RP3['subscriptions'] & RP4['subscriptions'] & RP5['subscriptions'] & RP6['subscriptions'] & RP7['subscriptions'] & RP8['subscriptions'] & RP9['subscriptions'] & RP10['subscriptions'] & RP11['subscriptions'] & RP12['subscriptions'] & RP13['subscriptions'] & RP14['subscriptions'] & RP15['subscriptions'] & RP16['subscriptions'] & RP17['subscriptions'] & RP18['subscriptions'];
}>;

export function mergeRoutersNew<
  RP0 extends AnyRouterParams, RP1 extends AnyRouterParams, RP2 extends AnyRouterParams, RP3 extends AnyRouterParams, RP4 extends AnyRouterParams, RP5 extends AnyRouterParams, RP6 extends AnyRouterParams, RP7 extends AnyRouterParams, RP8 extends AnyRouterParams, RP9 extends AnyRouterParams, RP10 extends AnyRouterParams, RP11 extends AnyRouterParams, RP12 extends AnyRouterParams, RP13 extends AnyRouterParams, RP14 extends AnyRouterParams, RP15 extends AnyRouterParams, RP16 extends AnyRouterParams, RP17 extends AnyRouterParams, RP18 extends AnyRouterParams, RP19 extends AnyRouterParams
>(
  router0: Router<RP0>, router1: Router<RP1>, router2: Router<RP2>, router3: Router<RP3>, router4: Router<RP4>, router5: Router<RP5>, router6: Router<RP6>, router7: Router<RP7>, router8: Router<RP8>, router9: Router<RP9>, router10: Router<RP10>, router11: Router<RP11>, router12: Router<RP12>, router13: Router<RP13>, router14: Router<RP14>, router15: Router<RP15>, router16: Router<RP16>, router17: Router<RP17>, router18: Router<RP18>, router19: Router<RP19>
): Router<{
  _ctx: RP0['_ctx'];
  _errorShape: RP0['_errorShape'];
  _meta: RP0['_meta'];
  transformer: RP0['transformer'];
  errorFormatter: RP0['errorFormatter'];
  queries: RP0['queries'] & RP1['queries'] & RP2['queries'] & RP3['queries'] & RP4['queries'] & RP5['queries'] & RP6['queries'] & RP7['queries'] & RP8['queries'] & RP9['queries'] & RP10['queries'] & RP11['queries'] & RP12['queries'] & RP13['queries'] & RP14['queries'] & RP15['queries'] & RP16['queries'] & RP17['queries'] & RP18['queries'] & RP19['queries'];
  mutations: RP0['mutations'] & RP1['mutations'] & RP2['mutations'] & RP3['mutations'] & RP4['mutations'] & RP5['mutations'] & RP6['mutations'] & RP7['mutations'] & RP8['mutations'] & RP9['mutations'] & RP10['mutations'] & RP11['mutations'] & RP12['mutations'] & RP13['mutations'] & RP14['mutations'] & RP15['mutations'] & RP16['mutations'] & RP17['mutations'] & RP18['mutations'] & RP19['mutations'];
  subscriptions: RP0['subscriptions'] & RP1['subscriptions'] & RP2['subscriptions'] & RP3['subscriptions'] & RP4['subscriptions'] & RP5['subscriptions'] & RP6['subscriptions'] & RP7['subscriptions'] & RP8['subscriptions'] & RP9['subscriptions'] & RP10['subscriptions'] & RP11['subscriptions'] & RP12['subscriptions'] & RP13['subscriptions'] & RP14['subscriptions'] & RP15['subscriptions'] & RP16['subscriptions'] & RP17['subscriptions'] & RP18['subscriptions'] & RP19['subscriptions'];
}>;

export function mergeRoutersNew(..._args: AnyRouter[]): AnyRouter {
  throw new Error('Not implemented');
}