import { trpc } from './utils/trpc';

export function SendMultipartFormDataButton() {
  const mutation = trpc.formData.useMutation();

  return (
    <button
      onClick={() => {
        const data = new FormData();

        data.append('name', 'John Doe');
        data.append('occupation', 'tRPC Extraordinaire');

        mutation.mutate(data);
      }}
    >
      Send FormData
    </button>
  );
}
