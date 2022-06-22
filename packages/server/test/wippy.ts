type ProcedureCall = (...any: any[]) => any;
type ProcedureType = 'query' | 'mutation';
type QueryProcedure<T extends ProcedureCall = any> = {
  query: T;
};
type MutationProcedure<T extends ProcedureCall = any> = {
  mutation: T;
};

type Procedure = MutationProcedure | QueryProcedure;

type CreateProcedure<
  TType extends ProcedureType,
  TProcedureCall extends ProcedureCall,
> = TType extends 'query'
  ? QueryProcedure<TProcedureCall>
  : TType extends 'mutation'
  ? MutationProcedure<TProcedureCall>
  : never;

export function createProcedure<
  TType extends ProcedureType,
  TProcedureCall extends ProcedureCall,
>(type: TType, call: TProcedureCall): CreateProcedure<TType, TProcedureCall> {
  throw '';
}

export interface RouterDef {
  children: Record<string, AnyRouter>;
  procedures: Record<string, Procedure>;
}

export interface Router<TDef extends RouterDef> {
  _def: TDef;
}

export type AnyRouter = Router<any>;

export type EnsureRecord<T> = T extends Record<string, any>
  ? T
  : Record<string, never>;

export function createRouter<TDef extends Partial<RouterDef>>(
  router: TDef,
): Router<{
  procedures: EnsureRecord<TDef['procedures']>;
  children: EnsureRecord<TDef['children']>;
}> {
  return {
    _def: {
      children: router.children || ({} as any),
      procedures: router.procedures || ({} as any),
    },
  };
}

type FlattenRouter<TRouter extends AnyRouter> =
  TRouter['_def']['procedures'] & {
    [TKey in keyof TRouter['_def']['children']]: FlattenRouter<
      TRouter['_def']['children'][TKey]
    >;
  };
const router = createRouter({
  procedures: {
    foo: createProcedure('query', () => 'foo' as const),
  },
  children: {
    child1: createRouter({
      procedures: {
        childFoo: createProcedure('query', () => 'childFoo' as const),
      },
      children: {
        grandchild: createRouter({
          procedures: {
            grandChildFoo: createProcedure(
              'query',
              () => 'grandChildFoo' as const,
            ),
            grandChildMut: createProcedure(
              'mutation',
              () => 'grandChildFoo' as const,
            ),
          },
        }),
      },
    }),
    child2: createRouter({
      procedures: {
        childFoo: createProcedure('query', () => 'childFoo' as const),
      },
      children: {
        grandchild: createRouter({
          procedures: {
            grandChildFoo: createProcedure(
              'query',
              () => 'grandChildFoo' as const,
            ),
            grandChildMut: createProcedure(
              'mutation',
              () => 'grandChildFoo' as const,
            ),
          },
        }),
      },
    }),
  },
});

export function createClient<
  TRouter extends AnyRouter,
>(): FlattenRouter<TRouter> {
  throw new Error('');
}

const client = createClient<typeof router>();

client.child1.childFoo.query();
