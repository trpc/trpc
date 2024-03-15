'use client';

import { startTransition, useEffect, useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import toast, { Toaster } from 'react-hot-toast';
import { formDataAction } from './_data';

export function SubmitButton(
  props: Omit<JSX.IntrinsicElements['button'], 'type'>,
) {
  const state = useFormStatus();

  return (
    <button
      type="submit"
      {...props}
      disabled={state.pending || props.disabled}
    />
  );
}
export function AddPostForm_useFormState() {
  const [serverState, action] = useFormState(formDataAction, {});

  const [state, setState] = useState(serverState);

  useEffect(() => {
    console.log('Server state', serverState);
    setState(serverState);
  }, [serverState]);

  useEffect(() => {
    console.log('Form state', state);
    if (state.error) {
      toast.error(`Failed to add post: ${state.error.code}`);
    }
  }, [state]);

  return (
    <form
      action={action}
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target as HTMLFormElement);

        const res = await formDataAction({}, fd);
        res && setState(res);
        console.log({ res });
      }}
    >
      <div>
        <input name="title" defaultValue={state.input?.title} />
        {state.error?.fieldErrors?.title && (
          <div>Invalid title: {state.error.fieldErrors.title.join(',')}</div>
        )}
      </div>
      <div>
        <input name="content" defaultValue={state.input?.content} />
        {state.error?.fieldErrors?.content && (
          <div>
            Invalid content: {state.error.fieldErrors.content.join(',')}
          </div>
        )}
      </div>

      {state.error && (
        <div>
          <h3>Errors</h3>
          {state.error?.code === 'UNAUTHORIZED' && (
            <div>Unauthorized - you need to sign in</div>
          )}
          {state.error?.code === 'INPUT_VALIDATION' && <div>Invalid input</div>}
        </div>
      )}
      <SubmitButton>Add post</SubmitButton>
    </form>
  );
}
