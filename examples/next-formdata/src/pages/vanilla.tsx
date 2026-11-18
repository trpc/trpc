/**
 * This is a Next.js page.
 */
import { useMutation } from '@tanstack/react-query';
import { useTRPC } from '../utils/trpc';

export default function IndexPage() {
  const trpc = useTRPC();
  const mutationOptions = trpc.room.sendMessage.mutationOptions({
    onSuccess() {
      alert('success!');
    },
    onError(err) {
      alert('Error: ' + err.message);
    },
  });
  const mutation = useMutation(mutationOptions);

  return (
    <>
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
          action={`/api/trpc/${mutationOptions.trpc.path}`}
          encType="multipart/form-data"
          onSubmit={(e) => {
            const formData = new FormData(e.currentTarget);
            if (formData.get('nojs')) {
              // Submit the form the oldschool way
              return;
            }

            mutation.mutate(formData);
            e.preventDefault();
          }}
        >
          <p>
            <input name="name" defaultValue="haz upload" />
          </p>
          <p>
            <input type="file" name="image" />
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

      {mutation.data && (
        <fieldset>
          <legend>Upload result</legend>
          <ul>
            <li>
              Image: <br />
              <img
                src={mutation.data.image.url}
                alt={mutation.data.image.url}
              />
            </li>
          </ul>
        </fieldset>
      )}
    </>
  );
}
