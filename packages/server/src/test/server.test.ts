/* eslint-disable no-console */
// FIXME tmp - delete me asap
import { expectTypeOf } from 'expect-type';
import { appRouter } from './server';
import { User } from './server/context';

///////////// this below are just tests that the type checking is doing it's thing right ////////////
async function main() {
  {
    // query 'whoami'
    const output = await appRouter.queries.viewerWhoAmi();
    console.log({ output });
    expectTypeOf(output).not.toBeAny();
    expectTypeOf(output).toMatchTypeOf<{
      text: string;
      user: User;
    }>();

    // should work
    await appRouter.queries.viewerWhoAmi(undefined);
  }
  {
    const output = await appRouter.mutations.updateToken('asd');
    expectTypeOf(output).toMatchTypeOf<string>();
  }

  {
    const output = await appRouter.mutations.editOrg({
      organizationId: '123',
      data: {
        name: 'asd',
      },
    });
    expectTypeOf(output).toMatchTypeOf<{
      name?: string;
      id: string;
    }>();
  }
  {
    const output = await appRouter.mutations.updateToken('hey');

    expectTypeOf(output).toMatchTypeOf<'ok'>();
  }
  {
    const output = await appRouter.mutations.postAdd({
      title: 'asd',
      body: 'asd',
    });

    expectTypeOf(output).toMatchTypeOf<{
      id: string;
      title: string;
      body: string;
      userId: string;
    }>();
  }
}

main();
