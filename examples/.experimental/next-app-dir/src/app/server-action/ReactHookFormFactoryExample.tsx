'use client';

import { useEffect, useRef } from 'react';
import { rhfAction } from './ReactHookFormExample.action';
import { rhfActionSchema } from './ReactHookFormExample.schema';
import { createForm } from './ReactHookFormFactoryExample.lib';

const MyForm = createForm({
  action: rhfAction,
  schema: rhfActionSchema,
});

function FormState() {
  const context = MyForm.useFormContext();
  const textValue = MyForm.useWatch({
    name: 'text',
  });

  return (
    <>
      <h2>FormState</h2>
      <ul>
        <li>IsSubmitting? {context.formState.isSubmitting ? 'yes' : 'no'}</li>
        <li>Field value: {textValue}</li>
      </ul>
    </>
  );
}

function RenderCount() {
  const renderCount = useRef(1);
  useEffect(() => {
    renderCount.current++;
  });
  return (
    <>
      <h2>Render count</h2>
      <ul>
        <li>Render count: {renderCount.current}</li>
      </ul>
    </>
  );
}

export function ReactHookFormFactoryExample() {
  return (
    <>
      <p>This is a playground for an imaginary form abstraction</p>
      <MyForm
        className="my-form"
        render={(props) => {
          const { form, action } = props;

          return (
            <>
              <div>
                <input type="text" {...form.register('text')} />
              </div>
              <div>
                <button type="submit">Submit</button>
              </div>

              <h2>Form state</h2>
              <FormState />
              <h2>Action state</h2>
              <pre
                style={{
                  overflowX: 'scroll',
                }}
              >
                {JSON.stringify(action, null, 4)}
              </pre>
              <RenderCount />
            </>
          );
        }}
      />
    </>
  );
}
