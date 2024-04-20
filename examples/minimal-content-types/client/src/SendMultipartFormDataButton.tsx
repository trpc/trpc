import { trpc } from './utils/trpc';

export function SendMultipartFormDataButton() {
  const mutation = trpc.formData.useMutation();

  return (
    <button
      onClick={() => {
        const data = new FormData();

        data.set('name', 'John Doe');
        data.set('occupation', 'tRPC Extraordinaire');

        mutation.mutate(data);
      }}
    >
      Send FormData
    </button>
  );
}
