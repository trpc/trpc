import { useState } from 'react';
import { trpc } from './trpc';

export function Hello() {
  const hello = trpc.useQuery(['hello']);
  const mutation = trpc.useMutation(['post.create']);
  const [title, setTitle] = useState('');
  if (!hello.data) return <div>Loading...</div>;
  return (
    <div className="mx-auto max-w-6xl py-4">
      <header className="mb-4">
        <h1 className="text-xl font-bold">
          tRPC on Cloudflare Pages Function with Pages Plugins
        </h1>
      </header>
      <h2 className="text-lg">query sample:</h2>
      <p>{hello.data}</p>
      <hr />
      <h2 className="text-lg">mutation sample:</h2>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const result = await mutation.mutateAsync({ title });
          result.title;
          alert(`post created: ${result.title}`);
        }}
      >
        <div className="flex flex-col">
          <div className="flex flex-col mb-2">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              type="text"
              name="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <button className="px-4 py-2 bg-indigo-500 text-white">
            Post Data
          </button>
        </div>
      </form>
    </div>
  );
}
