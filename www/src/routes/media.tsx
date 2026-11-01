import { createFileRoute } from '@tanstack/react-router';
import { Download } from 'lucide-react';

import { cn } from '@shared/ui/lib/utils';
import { mediaAssets } from '~/media-assets.ts';
import { mediaPage } from '~/pages.ts';
import { pageHead } from '~/seo.ts';

export const Route = createFileRoute('/media')({
  head: () => pageHead(mediaPage),
  component: MediaPage,
});

const facts: ReadonlyArray<{
  readonly label: string;
  readonly swatch: string;
  readonly value: string;
}> = [
  {
    label: 'Primary',
    swatch: 'bg-linear-to-tr from-[#066dfc] to-[#22d4fc]',
    value: '#066dfc → #22d4fc',
  },
  { label: 'Ink', swatch: 'bg-[#060a23]', value: '#060a23' },
  { label: 'Font', swatch: 'bg-black', value: 'Inter' },
];

function MediaPage() {
  return (
    <main className="mx-auto grid max-w-5xl gap-10 px-4 py-16 sm:px-6">
      <header className="grid gap-3">
        <h1 className="text-4xl font-extrabold tracking-tight">
          {mediaPage.title}
        </h1>
        <p className="max-w-2xl text-lg text-pretty text-muted-foreground">
          {mediaPage.description}
        </p>
      </header>
      <dl className="grid gap-4 sm:grid-cols-3">
        {facts.map((fact) => (
          <div
            className={cn(
              'flex h-28 items-end justify-between rounded-xl p-4 text-xl text-white',
              fact.swatch,
            )}
            key={fact.label}
          >
            <dt>{fact.label}</dt>
            <dd className="font-mono">{fact.value}</dd>
          </div>
        ))}
      </dl>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {mediaAssets.map((asset) => (
          <li className="grid content-start gap-3" key={asset.src}>
            <div
              className={cn(
                'flex h-40 items-center justify-center rounded-xl border p-6',
                asset.backdrop,
              )}
            >
              <img
                alt={`tRPC ${asset.title.toLowerCase()}`}
                className="max-h-full max-w-full object-contain"
                src={asset.src}
              />
            </div>
            <div className="grid gap-1">
              <p className="font-semibold">{asset.title}</p>
              <p className="text-sm text-muted-foreground">
                {asset.description}
              </p>
              <p className="flex gap-4">
                <a
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-link hover:underline"
                  download
                  href={asset.src}
                >
                  <Download className="size-3.5" /> SVG
                </a>
                <a
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-link hover:underline"
                  download
                  href={asset.png}
                >
                  <Download className="size-3.5" /> PNG
                </a>
              </p>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
