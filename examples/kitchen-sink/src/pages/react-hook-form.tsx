import { zodResolver } from '@hookform/resolvers/zod/dist/zod';
import { reactHookFormProps } from 'feature/react-hook-form/meta';
import { useForm } from 'react-hook-form';
import { ExamplePage } from 'utils/example';
import { trpc } from 'utils/trpc';
import { z } from 'zod';

// validation schema is used by server
export const validationSchema = z.object({
  title: z.string().min(2),
  text: z.string().min(10),
});

export default function Page() {
  const utils = trpc.useContext();
  const query = trpc.useQuery(['reactHookForm.list']);
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
      <ExamplePage {...reactHookFormProps} /> <h2>Posts</h2>
      <div className="prose">
        {query.data?.map((post) => (
          <article key={post.id}>
            <h3>{post.title}</h3>
            <p>{post.text}</p>
          </article>
        ))}
        <h3></h3>
      </div>
      <form
        onSubmit={methods.handleSubmit(async (values) => {
          await mutation.mutateAsync(values);
          methods.reset();
        })}
      >
        <label>
          title:
          <br />
          <input {...methods.register('title')} className="border" />
        </label>
        <p>{methods.formState.errors.title?.message}</p>

        <label>
          text:
          <br />
          <textarea {...methods.register('text')} className="border" />
        </label>
        <p>{methods.formState.errors.text?.message}</p>

        <input type="submit" disabled={mutation.isLoading} />
      </form>
    </>
  );
}
