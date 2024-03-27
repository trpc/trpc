import { db } from '@/db/client';
import { auth, signIn, signOut } from '@/server/auth';
import { AddPostForm } from './AddPostForm';

async function AuthState() {
  const sesh = await auth();

  if (sesh?.user) {
    return (
      <div className="flex max-w-md flex-col gap-2">
        <span className="h-9 p-2">Signed in as {sesh.user.name}</span>
        <form
          action={async () => {
            'use server';
            await signOut();
          }}
        >
          <button className="w-full rounded bg-zinc-800 p-1">Sign Out</button>
        </form>
      </div>
    );
  }

  return (
    <form
      className="flex max-w-md flex-col gap-2"
      action={async (fd) => {
        'use server';
        await signIn('credentials', fd);
      }}
    >
      <input
        name="username"
        required
        className="h-9 rounded bg-zinc-300 p-2 text-zinc-900"
        placeholder="Name"
      />
      <button type="submit" className="rounded bg-zinc-800 p-1">
        Sign in
      </button>
    </form>
  );
}

export default async function Home() {
  const posts = await db.query.Post.findMany();

  return (
    <main className="flex flex-col gap-4 p-16">
      <AuthState />
      <AddPostForm />
      <ul className="flex flex-col gap-4">
        {posts.map((post) => (
          <li key={post.id}>
            <a href={`/${post.id}`}>{post.title}</a>
          </li>
        ))}
      </ul>
    </main>
  );
}
