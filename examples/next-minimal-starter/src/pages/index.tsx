/**
 * This is a Next.js page.
 */
import { trpc } from '../utils/trpc';

export default function IndexPage() {
  // 💡 Tip: CMD+Click (or CTRL+Click) on `greeting` to go to the server definition
  const result = trpc.greeting.useQuery({ name: 'client' });

  if (!result.data) {
    return (
      <div>
        <h1>Loading...</h1>
      </div>
    );
  }
  return (
    <div>
      {/**
       * The type is defined and can be autocompleted
       * 💡 Tip: Hover over `data` to see the result type
       * 💡 Tip: CMD+Click (or CTRL+Click) on `text` to go to the server definition
       * 💡 Tip: Secondary click on `text` and "Rename Symbol" to rename it both on the client & server
       */}
      <h1>{result.data.text}</h1>
      <div>
        <form
          method="post"
          action="/api/trpc/mut"
          encType="multipart/form-data"
        >
          <input name="hello" value="asd" />
          <br />
          <input type="file" name="file" />
          <br />
          <button>submit</button>
        </form>
      </div>
    </div>
  );
}
