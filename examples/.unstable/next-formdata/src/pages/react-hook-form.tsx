import { zodResolver } from '@hookform/resolvers/zod';
import { FormProvider, UseFormProps, useForm } from 'react-hook-form';
import { z } from 'zod';
import { uploadFileSchema } from '~/utils/schemas';
import { trpc } from '~/utils/trpc';

function useZodForm<TSchema extends z.ZodType>(
  props: Omit<UseFormProps<TSchema['_input']>, 'resolver'> & {
    schema: TSchema;
  },
) {
  const form = useForm<TSchema['_input']>({
    ...props,
    resolver: zodResolver(props.schema, undefined),
  });

  return form;
}

export default function Page() {
  const mutation = trpc.upload.useMutation({
    onError(err) {
      alert('Error from server: ' + err.message);
    },
  });

  const form = useZodForm({
    schema: uploadFileSchema,
    defaultValues: {
      name: 'whadaaaap',
    },
  });

  return (
    <>
      <h2 className="text-3xl font-bold">Posts</h2>

      <FormProvider {...form}>
        <fieldset>
          <legend>Form with file upload</legend>
          <form
            method="post"
            action={`/api/trpc/${mutation.trpc.path}`}
            encType="multipart/form-data"
            onSubmit={form.handleSubmit(async (values, event) => {
              const { image } = await mutation.mutateAsync(
                new FormData(event?.target) as any,
              );
            })}
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            <div style={{}}>
              <label htmlFor="name">Enter your name</label>
              <input {...form.register('name')} />
              {form.formState.errors.name && (
                <div>{form.formState.errors.name.message}</div>
              )}
            </div>

            <div>
              <label>Required file, only pngs</label>
              <input type="file" {...form.register('image')} />
              {form.formState.errors.image && (
                <div>{form.formState.errors.image.message}</div>
              )}
            </div>

            <div>
              <label>Optional file</label>
              <input type="file" {...form.register('document')} />
              {form.formState.errors.document && (
                <div>{form.formState.errors.document.message}</div>
              )}
            </div>

            <div>
              <button type="submit" disabled={form.formState.isSubmitting}>
                submit
              </button>
            </div>
          </form>
        </fieldset>

        {mutation.data && (
          <fieldset>
            <legend>Upload result</legend>
            <ul>
              <li>
                Document:
                {mutation.data.document ? (
                  <a href={mutation.data.document.url}>
                    {mutation.data.document.name}
                  </a>
                ) : (
                  <em>Empty</em>
                )}
              </li>
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
