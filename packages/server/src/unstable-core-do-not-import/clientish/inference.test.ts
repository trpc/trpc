import superjson from 'superjson';
import { initTRPC } from '../initTRPC';
import type { inferTransformedProcedureOutput } from './inference';
import type { inferClientTypes } from './inferrable';

describe('inferTransformedProcedureOutput', () => {
  test('transformed', () => {
    const t = initTRPC.create({
      transformer: superjson,
    });

    const proc = t.procedure.query(() => new Date());

    type $Inferrable = typeof t._config.$types;

    type Output = inferTransformedProcedureOutput<$Inferrable, typeof proc>;

    expectTypeOf<Output>().toEqualTypeOf<Date>();

    type RootTypes = inferClientTypes<$Inferrable>;

    expectTypeOf<RootTypes['transformer']>().toEqualTypeOf<true>();
  });

  test('not transformed', () => {
    const t = initTRPC.create({});

    const proc = t.procedure.query(() => new Date());

    type $Inferrable = typeof t._config.$types;

    type Output = inferTransformedProcedureOutput<$Inferrable, typeof proc>;

    expectTypeOf<Output>().toEqualTypeOf<string>();
  });
});
