import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initTRPC } from '@trpc/server';
import React from 'react';
import superjson from 'superjson';
import { z } from 'zod';
import {
  UseTRPCActionResult,
  experimental_createActionHook,
  experimental_serverActionLink,
} from './create-action-hook';
import { experimental_createServerActionHandler } from './server';

describe('without transformer', () => {
  const instance = initTRPC
    .context<{
      foo: string;
    }>()
    .create({});
  const { procedure } = instance;

  const createAction = experimental_createServerActionHandler(instance, {
    createContext() {
      return {
        foo: 'bar',
      };
    },
  });

  const useAction = experimental_createActionHook({
    links: [experimental_serverActionLink()],
  });

  test('server actions smoke test', async () => {
    const action = createAction(procedure.mutation((opts) => opts.ctx));
    expect(await action()).toMatchInlineSnapshot(`
      Object {
        "result": Object {
          "data": Object {
            "foo": "bar",
          },
        },
      }
    `);
  });

  test('normalize FormData', async () => {
    const action = createAction(
      procedure
        .input(
          z.object({
            text: z.string(),
          }),
        )
        .mutation((opts) => `hello ${opts.input.text}` as const),
    );

    expect(
      await action({
        text: 'there',
      }),
    ).toMatchInlineSnapshot(`
      Object {
        "result": Object {
          "data": "hello there",
        },
      }
    `);

    const formData = new FormData();
    formData.append('text', 'there');
    expect(await action(formData as any)).toMatchInlineSnapshot(`
      Object {
        "result": Object {
          "data": "hello there",
        },
      }
    `);
  });

  test('an actual client', async () => {
    const action = createAction(
      procedure
        .input(
          z.object({
            text: z.string(),
          }),
        )
        .mutation((opts) => `hello ${opts.input.text}` as const),
    );

    const allStates: Omit<
      UseTRPCActionResult<any>,
      'mutate' | 'mutateAsync'
    >[] = [] as any[];

    function MyComponent() {
      const mutation = useAction(action);
      const { mutate, mutateAsync, ...other } = mutation;
      allStates.push(other);

      return (
        <>
          <button
            role="trigger"
            onClick={() => {
              mutation.mutate({
                text: 'world',
              });
            }}
          >
            click me
          </button>
        </>
      );
    }

    // mount it
    const utils = render(<MyComponent />);

    // get the contents of pre
    expect(allStates.at(-1)).toMatchInlineSnapshot(`
      Object {
        "status": "idle",
      }
    `);

    // click the button
    userEvent.click(utils.getByRole('trigger'));

    // wait to finish
    await waitFor(() => {
      assert(allStates.at(-1)?.status === 'success');
    });

    expect(allStates).toMatchInlineSnapshot(`
      Array [
        Object {
          "status": "idle",
        },
        Object {
          "status": "loading",
        },
        Object {
          "data": "hello world",
          "status": "success",
        },
      ]
    `);

    const lastState = allStates.at(-1);
    assert(lastState?.status === 'success');
    expect(lastState.data).toMatchInlineSnapshot(`"hello world"`);
  });
});

describe('with transformer', () => {
  const instance = initTRPC
    .context<{
      foo: string;
    }>()
    .create({
      transformer: superjson,
    });
  const { procedure } = instance;

  const createAction = experimental_createServerActionHandler(instance, {
    createContext() {
      return {
        foo: 'bar',
      };
    },
  });

  const useAction = experimental_createActionHook({
    links: [experimental_serverActionLink()],
    transformer: superjson,
  });

  test('pass a Date', async () => {
    const action = createAction(
      procedure
        .input(
          z.object({
            date: z.date(),
          }),
        )
        .mutation((opts) => opts.input.date),
    );

    const allStates: Omit<
      UseTRPCActionResult<any>,
      'mutate' | 'mutateAsync'
    >[] = [] as any[];

    function MyComponent() {
      const mutation = useAction(action);
      const { mutate, mutateAsync, ...other } = mutation;
      allStates.push(other);

      return (
        <>
          <button
            role="trigger"
            onClick={() => {
              mutation.mutate({
                date: new Date(0),
              });
            }}
          >
            click me
          </button>
        </>
      );
    }

    // mount it
    const utils = render(<MyComponent />);

    // get the contents of pre
    expect(allStates.at(-1)).toMatchInlineSnapshot(`
      Object {
        "status": "idle",
      }
    `);

    // click the button
    userEvent.click(utils.getByRole('trigger'));

    // wait to finish
    await waitFor(() => {
      assert(allStates.at(-1)?.status === 'success');
    });

    expect(allStates).toMatchInlineSnapshot(`
      Array [
        Object {
          "status": "idle",
        },
        Object {
          "status": "loading",
        },
        Object {
          "data": 1970-01-01T00:00:00.000Z,
          "status": "success",
        },
      ]
    `);

    const lastState = allStates.at(-1);
    assert(lastState?.status === 'success');
    expect(lastState.data).toMatchInlineSnapshot('1970-01-01T00:00:00.000Z');
    expect(lastState.data).toBeInstanceOf(Date);
  });

  test('FormData', async () => {
    const action = createAction(
      procedure
        .input(
          z.object({
            text: z.string(),
          }),
        )
        .mutation((opts) => opts.input.text),
    );

    const allStates: Omit<
      UseTRPCActionResult<any>,
      'mutate' | 'mutateAsync'
    >[] = [] as any[];

    function MyComponent() {
      const mutation = useAction(action);
      const { mutate, mutateAsync, ...other } = mutation;
      allStates.push(other);

      return (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();

              const formData = new FormData(e.currentTarget);
              mutation.mutate(formData as any);
            }}
          >
            <input type="text" name="text" defaultValue="world" />
            <button role="trigger" type="submit">
              click me
            </button>
          </form>
        </>
      );
    }

    // mount it
    const utils = render(<MyComponent />);

    // get the contents of pre
    expect(allStates.at(-1)).toMatchInlineSnapshot(`
      Object {
        "status": "idle",
      }
    `);

    // click the button
    userEvent.click(utils.getByRole('trigger'));

    // wait to finish
    await waitFor(() => {
      assert(allStates.at(-1)?.status === 'success');
    });

    expect(allStates).toMatchInlineSnapshot(`
      Array [
        Object {
          "status": "idle",
        },
        Object {
          "status": "loading",
        },
        Object {
          "data": "world",
          "status": "success",
        },
      ]
    `);

    const lastState = allStates.at(-1);
    assert(lastState?.status === 'success');
    expect(lastState.data).toMatchInlineSnapshot('"world"');
  });
});
