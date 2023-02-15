/**
 * This is a Next.js page.
 */
import { useState } from 'react';
import { trpc } from '../utils/trpc';

export default function IndexPage() {
  const mutation = trpc.mut.useMutation();

  const [formData, setFormData] = useState<FormData>();
  const query = trpc.que.useQuery(formData as any, {
    enabled: !!formData,
  });

  return (
    <div>
      {/**
       * The type is defined and can be autocompleted
       * 💡 Tip: Hover over `data` to see the result type
       * 💡 Tip: CMD+Click (or CTRL+Click) on `text` to go to the server definition
       * 💡 Tip: Secondary click on `text` and "Rename Symbol" to rename it both on the client & server
       */}
      <h1>Form!</h1>
      <fieldset>
        <legend>Form with file upload</legend>
        <form
          method="post"
          action="/api/trpc/mut"
          encType="multipart/form-data"
          onSubmit={(e) => {
            const formData = new FormData(e.currentTarget);

            // setFormData(formData);
            mutation.mutate(formData as any);
            e.preventDefault();
          }}
        >
          <input name="hello" defaultValue="haz upload" />
          <br />
          <input type="file" name="file1" />
          <br />
          <input type="file" name="file2" />
          <br />
          <button type="submit">submit</button>
        </form>
      </fieldset>

      <fieldset>
        <legend>Form with w/o upload</legend>
        <form
          method="post"
          action="/api/trpc/mut"
          encType="multipart/form-data"
        >
          <input name="hello" defaultValue="no upload" />
          <br />
          <button>submit</button>
        </form>
      </fieldset>
    </div>
  );
}
