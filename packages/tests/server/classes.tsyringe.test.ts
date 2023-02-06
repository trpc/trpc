import { initTRPC } from '@trpc/server';
import { konn } from 'konn';
import 'reflect-metadata';
import {injectable, container} from 'tsyringe';
import { routerToServerAndClientNew } from './___testHelpers';
require("@babel/core").transformSync("code", {
  plugins: ["@babel/plugin-proposal-decorators"],
});

const t = initTRPC.create();


@injectable()
class BarService extends t.unstable_RouterBase {
  private myMethod() {
    return 'i am a shared method but not exposed to the client as a procedure'
  }
  barProc = t.procedure.query(() => {
    return {
      text: 'hello world',
      commonMethodResult: this.myMethod(),
    }
  })
}

@injectable()
class FooService extends t.unstable_RouterBase {
  constructor(public bar: BarService) {
    super()
  }
  
  fooProc = t.procedure.query(() => {
    return {
      text: 'hello world',
    }
  })
}


@injectable()
class RootService extends t.unstable_RouterBase {
  constructor(public foo: FooService) {
    super()
  }
  rootProc = t.procedure.query(() => {
    return {
      text: 'hello world',
    }
  })
}

const root = container.resolve(RootService);
describe('basic', () => {
  const ctx = konn()
    .beforeEach(() => {

      root.foo.fooProc;

      const appRouter = root.toRouter();
      appRouter._def.record.foo;
      //                     ^?
      appRouter._def.record.rootProc;
      //                     ^?
      const opts = routerToServerAndClientNew(appRouter);

      return opts;
    })
    .afterEach(async (ctx) => {
      await ctx?.close?.();
    })
    .done();
  test('should work', async () => {

    expect(await ctx.proxy.rootProc.query()).toMatchInlineSnapshot();
    
    // @ts-ignore
    expect(await ctx.proxy.foo.fooProc.query()).toMatchInlineSnapshot();
    // @ts-ignore
    expect(await ctx.proxy.foo.bar.barProc.query()).toMatchInlineSnapshot();
  });
});
