import { ErrorMessage } from '@hookform/error-message';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  FormProvider,
  UseFormProps,
  UseFormReturn,
  useForm,
  useFormContext,
} from 'react-hook-form';
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
    onSuccess() {
      alert('success!');
    },
    onError(err) {
      alert(err.message);
    },
  });

  const form = useZodForm({
    schema: uploadFileSchema,
    defaultValues: {},
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
              await mutation.mutateAsync(new FormData(event?.target) as any);
            })}
          >
            <div>
              <input {...form.register('hello')} />
              {form.formState.errors.hello && (
                <div>{form.formState.errors.hello.message}</div>
              )}
            </div>

            <input type="file" {...form.register('file1')} />

            {form.formState.errors.file1 && (
              <div>{form.formState.errors.file1.message}</div>
            )}

            <div>
              <button type="submit" disabled={form.formState.isSubmitting}>
                submit
              </button>
            </div>
          </form>
        </fieldset>
      </FormProvider>
    </>
  );
}
