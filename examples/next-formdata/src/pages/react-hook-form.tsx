import { zodResolver } from '@hookform/resolvers/zod';
import { uploadFileSchema } from '~/utils/schemas';
import { trpc } from '~/utils/trpc';
import { useRef, useState } from 'react';
import type { UseFormProps } from 'react-hook-form';
import { FormProvider, useForm } from 'react-hook-form';
import type { z } from 'zod';

/**
 * zod-form-data wraps zod in an effect where the original type is a `FormData`
 */
type UnwrapZodEffect<TType extends z.ZodType> =
  TType extends z.ZodEffects<infer U, any, any> ? U : TType;

type GetInput<TType extends z.ZodType> = UnwrapZodEffect<TType>['_input'];

function useZodFormData<TSchema extends z.ZodType>(
  props: Omit<UseFormProps<GetInput<TSchema>>, 'resolver'> & {
    schema: TSchema;
  },
) {
  const formRef = useRef<HTMLFormElement>(null);
  const _resolver = zodResolver(props.schema, undefined, {
    raw: true,
  });

  const form = useForm<GetInput<TSchema>>({
    ...props,
    resolver: (_, ctx, opts) => {
      if (!formRef.current) {
        return {
          values: {},
          errors: {
            root: {
              message: 'Form not mounted',
            },
          },
        };
      }
      const values = new FormData(formRef.current);
      return _resolver(values, ctx, opts);
    },
  });

  return { ...form, formRef };
}

export default function Page() {
  const mutation = trpc.room.sendMessage.useMutation({
    onError(err) {
      alert('Error from server: ' + err.message);
    },
  });

  const form = useZodFormData({
    schema: uploadFileSchema,
    defaultValues: {
      name: 'whadaaaap',
    },
  });

  const [noJs, setNoJs] = useState(false);

  return (
    <>
      <h2 className="text-3xl font-bold">Posts</h2>

      <FormProvider {...form}>
        <form
          method="post"
          action={`/api/trpc/${mutation.trpc.path}`}
          encType="multipart/form-data"
          onSubmit={(_event) => {
            if (noJs) {
              return;
            }
            void form.handleSubmit(async (values, event) => {
              await mutation.mutateAsync(new FormData(event?.target));
            })(_event);
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          ref={form.formRef}
        >
          <fieldset>
            <legend>Form with file upload</legend>
            <div style={{}}>
              <label htmlFor="name">Enter your name</label>
              <input {...form.register('name')} />
              {form.formState.errors.name && (
                <div>{form.formState.errors.name.message}</div>
              )}
            </div>

            <div>
              <label>Required file, only images</label>
              <input type="file" {...form.register('image')} />
              {form.formState.errors.image && (
                <div>{form.formState.errors.image.message}</div>
              )}
            </div>

            <div>
              <label>Post without JS</label>
              <input
                type="checkbox"
                checked={noJs}
                onChange={(e) => {
                  setNoJs(e.target.checked);
                }}
              />
            </div>
            <div>
              <button type="submit" disabled={mutation.status === 'pending'}>
                submit
              </button>
            </div>
          </fieldset>
        </form>

        {mutation.data && (
          <fieldset>
            <legend>Upload result</legend>
            <ul>
              <li>
                Image: <br />
                <img
                  src={mutation.data.image.url}
                  alt={mutation.data.image.url}
                />
              </li>
            </ul>
          </fieldset>
        )}
      </FormProvider>
    </>
  );
}
