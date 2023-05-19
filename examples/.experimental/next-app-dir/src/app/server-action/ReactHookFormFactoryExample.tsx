'use client';

import { useAction } from 'trpc-api';
import { rhfAction } from './ReactHookFormExample.action';
import { rhfActionSchema } from './ReactHookFormExample.schema';
import { createForm } from './ReactHookFormFactoryExample.lib';

const MyForm = createForm({
  action: rhfAction,
  schema: rhfActionSchema,
});

export function ReactHookFormFactoryExample() {
  const mutation = useAction(rhfAction);

  return (
    <>
      <p>Check the console for the logger output.</p>
      <MyForm
        className="my-form"
        render={(props) => {
          const { form } = props;

          return (
            <>
              <div>
                <input type="text" {...form.register('text')} />
              </div>
              <div>
                <button type="submit">Run server action raw debugging</button>
              </div>

              <h2>Form state</h2>
              <pre
                style={{
                  overflowX: 'scroll',
                }}
              >
                {JSON.stringify(
                  {
                    formState: {
                      isSubmitting: form.formState.isSubmitting,
                    },
                  },
                  null,
                  4,
                )}
              </pre>
              <h2>Mutation state</h2>
              <pre
                style={{
                  overflowX: 'scroll',
                }}
              >
                {JSON.stringify(mutation, null, 4)}
              </pre>
            </>
          );
        }}
      />
    </>
  );
}
