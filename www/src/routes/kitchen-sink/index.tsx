import { createFileRoute, Link } from '@tanstack/react-router';

import { kitchenSink, showcases } from './-showcases.ts';

export const Route = createFileRoute('/kitchen-sink/')({
  component: KitchenSinkIndex,
});

function KitchenSinkIndex() {
  return (
    <>
      <h1 className="text-4xl font-extrabold tracking-tight">
        {kitchenSink.title}
      </h1>
      <p className="text-muted-foreground">{kitchenSink.description}</p>
      <ul className="grid gap-3">
        {showcases.map((showcase) => (
          <li key={showcase.path}>
            <Link
              className="block rounded-lg border p-4 hover:bg-muted"
              to={showcase.path}
            >
              <span className="font-semibold">{showcase.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {showcase.description}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
