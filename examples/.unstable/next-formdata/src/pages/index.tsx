/**
 * This is a Next.js page.
 */
import { trpc } from '../utils/trpc';

export default function IndexPage() {
  const mutation = trpc.mut.useMutation({
    onSuccess() {
      alert('success!');
    },
    onError(err) {
      alert(err.message);
    },
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
          action={`/api/trpc/${mutation.trpc.path}`}
          encType="multipart/form-data"
          onSubmit={(e) => {
            const formData = new FormData(e.currentTarget);
            if (formData.get('nojs')) {
              return;
            }

            // setFormData(formData);
            mutation.mutate(formData as any);
            e.preventDefault();
          }}
        >
          <p>
            <input name="hello" defaultValue="haz upload" />
          </p>
          <p>
            <input type="file" name="file1" />
          </p>

          <p>
            <input type="checkbox" id="nojs" name="nojs" value="1" />{' '}
            <label htmlFor="nojs">Do oldschool POST w/o JS</label>
          </p>
          <p>
            <button type="submit">submit</button>
          </p>
        </form>
      </fieldset>
    </div>
  );
}
