import { createFileRoute, Link } from '@tanstack/react-router';

import { GitHubIcon } from '~/components/icons.tsx';

import { kitchenSink, showcases } from './-showcases.ts';
import { showcaseFolderUrl } from './-source.ts';

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
          <li className="relative" key={showcase.path}>
            <Link
              className="block rounded-lg border p-4 pr-12 hover:bg-muted"
              to={showcase.path}
            >
              <span className="font-semibold">{showcase.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                {showcase.description}
              </span>
            </Link>
            {/* Beside the card's link, not in it: links don't nest. */}
            <a
              aria-label={`${showcase.title} on GitHub`}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground *:size-4"
              href={showcaseFolderUrl(showcase)}
              title="View example on GitHub"
            >
              <GitHubIcon />
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
