import { Link } from '@remix-run/react';
import { trpc } from '../lib/trpc';

export default function Index() {
  const { data: fruits, isLoading, error } = trpc.getFruits.useQuery();

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;
  if (!fruits || fruits.length === 0) return <p>No fruits available</p>;

  return (
    <div className="container mx-auto p-4">
      <h1 className="mb-4 text-2xl font-bold">Fruit List</h1>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {fruits.map((fruit) => (
          <div key={fruit.id} className="rounded border p-4 shadow-sm">
            <Link to={`/fruits/${fruit.id}`} className="block hover:underline">
              <h2 className="text-xl font-semibold">{fruit.name}</h2>
              <p>
                Color: <span style={{ color: fruit.color }}>{fruit.color}</span>
              </p>
              <p>Price: {fruit.price} </p>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
