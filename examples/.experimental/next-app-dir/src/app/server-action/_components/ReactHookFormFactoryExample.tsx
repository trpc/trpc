'use client';

import { Button } from '~/components/button';
import { Input } from '~/components/input';
import { JsonPreTag } from '~/components/json-pretag';
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
    <JsonPreTag
      object={{
        isSubmitting: context.formState.isSubmitting,
        fieldValue: textValue,
      }}
    />
  );
}

function RenderCount() {
  const renderCount = useRef(1);
  useEffect(() => {
    renderCount.current++;
  });
  return (
    <JsonPreTag
      object={{
        renderCount: renderCount.current,
      }}
    />
  );
}

export function ReactHookFormFactoryExample() {
  return (
    <div>
      <p>This is a playground for an imaginary form abstraction</p>
      <MyForm
        className="my-form"
        render={(props) => {
          const { form, action } = props;
          return (
            <div className="space-y-2">
              <Input type="text" {...form.register('text')} />
              <Button type="submit">Submit</Button>

              <div>
                <h2>Form state</h2>
                <FormState />
              </div>
              <div>
                <h2>Action state</h2>
                <JsonPreTag object={action} />
              </div>
              <div>
                <h2>Render count</h2>
                <RenderCount />
              </div>
            </div>
          );
        }}
      />
    </div>
  );
}
