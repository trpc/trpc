import type { LoaderFunctionArgs } from '@remix-run/node';
import { Link, useLoaderData } from '@remix-run/react';
import { createServerSideHelpers } from '@trpc/react-query/server';
import superjson from 'superjson';
import { appRouter } from '../../../server/src/trpc/index.js';

export async function loader({ params }: LoaderFunctionArgs) {
  const id = Number(params.id);

  if (!params.id || isNaN(id)) {
    throw new Response('Invalid fruit ID', { status: 400 });
  }

  const helpers = createServerSideHelpers({
    router: appRouter,
    ctx: {},
    transformer: superjson,
  });

  try {
    const fruit = await helpers.getFruitById.fetch(id);
    return { fruit };
  } catch (error) {
    console.error(`Error loading fruit ${id}:`, error);
    throw new Response('Fruit not found', { status: 404 });
  }
}

export default function FruitDetail() {
  const { fruit } = useLoaderData<typeof loader>();

  return (
    <div className="container mx-auto p-4">
      <Link to="/" className="mb-4 inline-block text-blue-500 hover:underline">
        ← Back to fruits list
      </Link>
      <div className="mt-4 rounded border p-6 shadow-sm">
        <h1 className="mb-4 text-3xl font-bold">{fruit.name}</h1>
        <p className="mb-2 text-lg">
          Color: <span style={{ color: fruit.color }}>{fruit.color}</span>
        </p>
        <p className="mb-2 text-lg">Price: {fruit.price} </p>
      </div>
    </div>
  );
}
