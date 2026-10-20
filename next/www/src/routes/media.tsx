import { createFileRoute } from '@tanstack/react-router';
import { Download } from 'lucide-react';

import { cn } from '@shared/ui/lib/utils';
import { mediaPage } from '~/pages.ts';
import { pageHead } from '~/seo.ts';

export const Route = createFileRoute('/media')({
  head: () => pageHead(mediaPage),
  component: MediaPage,
});

interface Asset {
  /** Behind the image, which shows what it's for. */
  readonly backdrop: string;
  readonly description: string;
  /** Under `public/`, at trpc.io's URL. */
  readonly src: string;
  readonly title: string;
}

const assets: ReadonlyArray<Asset> = [
  {
    backdrop: 'bg-card',
    description: 'Please use this in most circumstances.',
    src: '/img/logo.svg',
    title: 'Logo',
  },
  {
    backdrop: 'bg-white',
    description: 'Please use this on light backgrounds.',
    src: '/img/logo-text-black.svg',
    title: 'Wordmark, light',
  },
  {
    backdrop: 'bg-black',
    description: 'Please use this on dark backgrounds.',
    src: '/img/logo-text-white.svg',
    title: 'Wordmark, dark',
  },
];

const facts: ReadonlyArray<{
  readonly label: string;
  readonly swatch: string;
  readonly value: string;
}> = [
  { label: 'Primary', swatch: 'bg-[#398ccb]', value: '#398ccb' },
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
      <dl className="grid gap-4 sm:grid-cols-2">
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
      <ul className="grid gap-6 sm:grid-cols-3">
        {assets.map((asset) => (
          <li className="grid content-start gap-3" key={asset.src}>
            <div
              className={cn(
                'grid h-40 place-items-center rounded-xl border p-6',
                asset.backdrop,
              )}
            >
              <img
                alt={`tRPC ${asset.title.toLowerCase()}`}
                className="max-h-full max-w-full"
                src={asset.src}
              />
            </div>
            <div className="grid gap-1">
              <p className="font-semibold">{asset.title}</p>
              <p className="text-sm text-muted-foreground">
                {asset.description}
              </p>
              <a
                className="inline-flex items-center gap-1.5 text-sm font-medium text-link hover:underline"
                download
                href={asset.src}
              >
                <Download className="size-3.5" /> SVG
              </a>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
