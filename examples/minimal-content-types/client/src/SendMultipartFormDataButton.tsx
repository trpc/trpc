import { trpc } from './utils/trpc';

export function SendMultipartFormDataButton() {
  const mutation = trpc.formData.useMutation();

  return (
    <button
      onClick={() => {
        const fd = new FormData();

        fd.set('name', 'John Doe');
        fd.set('occupation', 'tRPC Extraordinaire');

        fd.set(
          'about',
          new File(['hi bob'], 'bob.txt', {
            type: 'text/plain',
          }),
        );

        mutation.mutate(fd);
      }}
    >
      Send FormData
    </button>
  );
}
