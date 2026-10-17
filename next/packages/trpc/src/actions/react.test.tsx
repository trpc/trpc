// @vitest-environment happy-dom
import { useActionState, useOptimistic } from 'react';
import { createRoot } from 'react-dom/client';
import { experimental_createAction } from '@trpc12/trpc/actions';
import { initTrpc } from '@trpc12/trpc/server';
import { expect, expectTypeOf, test } from 'vite-plus/test';
import { z } from 'zod';
import { click, container, text, waitFor } from '../fixtures/dom.ts';

const t = initTrpc<{ ctx: { user: string } }>();
const titles: string[] = [];
const addTitle = t.procedure
  .errors({ CONFLICT: {} })
  .input(z.object({ title: z.string().min(1) }))
  .mutation(async (opts) => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    if (titles.includes(opts.input.title)) return opts.errors.CONFLICT();
    titles.push(opts.input.title);
    return [...titles];
  });

const action = experimental_createAction({ ctx: { user: 'ada' } });
const addTitleAction = action(addTitle);

function Titles() {
  const [result, submit, isPending] = useActionState(addTitleAction, undefined);
  expectTypeOf(result?.data).toEqualTypeOf<string[] | undefined>();
  const [shown, addShown] = useOptimistic(
    result?.data ?? [],
    (list: string[], title: string) => [...list, `${title}…`],
  );
  return (
    <form
      action={(form) => {
        addShown(form.get('title') as string);
        submit(form);
      }}
    >
      <input name="title" defaultValue="Hello" />
      <button type="submit">Add</button>
      <ul>
        {shown.map((title) => (
          <li key={title}>{title}</li>
        ))}
      </ul>
      <p className="status">
        {isPending ? 'saving' : (result?.error?.code ?? 'idle')}
      </p>
    </form>
  );
}

test('an action is a useActionState action, and useOptimistic shows the submission until it settles', async () => {
  const el = container();
  const root = createRoot(el);
  root.render(<Titles />);
  try {
    await waitFor(() => expect(text(el, '.status')).toBe('idle'));
    click(el, 'button');
    await waitFor(() => expect(text(el, 'li')).toBe('Hello…'));
    expect(text(el, '.status')).toBe('saving');
    await waitFor(() => expect(text(el, '.status')).toBe('idle'));
    expect(text(el, 'li')).toBe('Hello');

    click(el, 'button');
    await waitFor(() => expect(text(el, '.status')).toBe('CONFLICT'));
    expect(el.querySelectorAll('li')).toHaveLength(0);
  } finally {
    root.unmount();
    el.remove();
  }
});
