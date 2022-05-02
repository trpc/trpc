import { expectTypeOf } from 'expect-type';
import { appRouter } from './server';

///////////// this below are just tests that the type checking is doing it's thing right ////////////
async function main() {
  {
    // query 'whoami'
    const output = await appRouter.queries.viewerWhoAmi();
    console.log({ output });
    expectTypeOf(output).not.toBeAny();
    expectTypeOf(output).toBeString();

    // should work
    await appRouter.queries.viewerWhoAmi({});
    await appRouter.queries.viewerWhoAmi({
      input: undefined,
    });
  }
  {
    const output = await appRouter.mutations.updateToken({ input: 'asd' });
    expectTypeOf(output).toMatchTypeOf<string>();
  }

  {
    const output = await appRouter.mutations.editOrg({
      input: {
        organizationId: '123',
        data: {
          name: 'asd',
        },
      },
    });
    expectTypeOf(output).toMatchTypeOf<{
      name?: string;
      id: string;
    }>();
  }
  {
    const output = await appRouter.mutations.updateToken({ input: 'hey' });

    expectTypeOf(output).toMatchTypeOf<'ok'>();
  }
  {
    const output = await appRouter.mutations.postAdd({
      input: {
        title: 'asd',
        body: 'asd',
      },
    });

    expectTypeOf(output).toMatchTypeOf<{
      id: string;
      title: string;
      body: string;
      userId: string;
    }>();
  }

  {
    // if you hover result we can see that we can infer both the result and every possible expected error
    // const result = await appRouter.queries.greeting({ hello: 'there' });
    // if ('error' in result && result.error) {
    //   if ('zod' in result.error) {
    //     // zod error inferred - useful for forms w/o libs
    //     console.log(result.error.zod.hello?._errors);
    //   }
    // } else {
    //   console.log(result);
    // }
    // // some type testing below
    // type MyProcedure = inferProcedure<typeof appRouter['queries']['greeting']>;
    // expectTypeOf<MyProcedure['ctx']>().toMatchTypeOf<{
    //   user?: { id: string };
    // }>();
    // expectTypeOf<MyProcedure['data']>().toMatchTypeOf<{
    //   greeting: string;
    // }>();
    // expectTypeOf<MyProcedure['_input_in']>().toMatchTypeOf<{
    //   hello: string;
    //   lengthOf?: string;
    // }>();
    // expectTypeOf<MyProcedure['_input_out']>().toMatchTypeOf<{
    //   hello: string;
    //   lengthOf: number;
    // }>();
  }
  // {
  //   // no leaky
  //   const trpc = initTRPC();
  //   trpc.router({
  //     queries: {
  //       test: trpc.resolver(() => {
  //         return 'ok';
  //       }),
  //     },
  //     // @ts-expect-error should error
  //     doesNotExist: {},
  //   });
  // }
  // {
  //   const result = await appRouter.mutations['fireAndForget']('hey');
  //   console.log(result);
  // }
}

main();
