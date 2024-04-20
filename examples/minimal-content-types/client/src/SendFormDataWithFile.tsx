import { trpc } from './utils/trpc';

export function FormWithFile() {
  const mutation = trpc.formWithFile.useMutation();

  return (
    <label>
      FormData with File:
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.target as HTMLFormElement);
          mutation.mutate(form);
        }}
      >
        <input type="file" name="file" />
        <button type="submit">Submit</button>
      </form>
    </label>
  );
}
