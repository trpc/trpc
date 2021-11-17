import { zodResolver } from '@hookform/resolvers/zod/dist/zod';
import { useForm } from 'react-hook-form';
import { trpc } from 'utils/trpc';
import { z } from 'zod';

// validation schema is used by server
export const validationSchema = z.object({
  title: z.string().min(2),
  text: z.string().min(5),
});

export default function Page() {
  const utils = trpc.useContext();
  const query = trpc.useQuery(['reactHookForm.list'], { suspense: true });

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const posts = query.data!;
  const mutation = trpc.useMutation('reactHookForm.add', {
    async onSuccess() {
      await utils.invalidateQueries(['reactHookForm.list']);
    },
  });

  const methods = useForm({
    resolver: zodResolver(validationSchema),
    defaultValues: {
      title: '',
      text: '',
    },
  });

  return (
    <>
      <h2 className="text-3xl font-bold">Posts</h2>

      {query.data?.map((post) => (
        <article
          key={post.id}
          className="prose bg-white shadow overflow-hidden sm:rounded-lg p-4"
        >
          <h3>{post.title}</h3>
          <p>{post.text}</p>
        </article>
      ))}

      <h2 className="text-2xl font-bold">Add a post</h2>
      <form
        onSubmit={methods.handleSubmit(async (values) => {
          await mutation.mutateAsync(values);
          methods.reset();
        })}
        className="space-y-2"
      >
        <div>
          <label>
            Title
            <br />
            <input {...methods.register('title')} className="border" />
          </label>

          {methods.formState.errors.title?.message && (
            <p className="text-red-700">
              {methods.formState.errors.title?.message}
            </p>
          )}
        </div>
        <div>
          <label>
            Text
            <br />
            <textarea {...methods.register('text')} className="border" />
          </label>
          {methods.formState.errors.text?.message && (
            <p className="text-red-700">
              {methods.formState.errors.text?.message}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={mutation.isLoading}
          className="border bg-primary-500 text-white p-2 font-bold"
        >
          {mutation.isLoading ? 'Loading' : 'Submit'}
        </button>
      </form>
    </>
  );
}
