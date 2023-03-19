import { api } from 'trpc-api';

async function whatever(fd: FormData) {
  'use server';
  console.log(fd);
}

export default async function TestPage() {
  const data = await api.reviews.list.query();
  return (
    <div>
      <form action="" method="POST" className="space-y-2">
        <input name="$$id" value={whatever.$$id} hidden readOnly />
        <input
          name="text"
          className="block w-full rounded-lg border-none bg-gray-600 px-2 font-medium text-gray-200 focus:border-vercel-pink focus:ring-2 focus:ring-vercel-pink"
        />
        <button
          type="submit"
          className="relative rounded-lg w-full items-center space-x-2 bg-vercel-blue px-3 py-1 text-sm font-medium text-white hover:bg-vercel-blue/90 disabled:text-white/70 disabled:cursor-not-allowed"
        >
          Submit
        </button>
      </form>
      <div className="space-y-8">
        {data.map((review) => {
          return <div key={review.id}>{review.comment}</div>;
        })}
      </div>
    </div>
  );
}
