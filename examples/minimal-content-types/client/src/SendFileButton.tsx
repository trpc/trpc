import { trpc } from './utils/trpc';

export function SendFileButton() {
  const mutation = trpc.file.useMutation();

  return (
    <label>
      Send File:
      <input
        type="file"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const file = e.target.files.item(0)!;
            console.log('uploading file', file);

            // TODO: type inference needs sorting out ion one way or another
            mutation.mutate(file);
          }
        }}
      />
    </label>
  );
}
