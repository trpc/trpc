/** A logo `/media` offers, as an SVG under `public/` and a PNG the build renders from it. */
export interface MediaAsset {
  /** Behind the image, which shows what it's for. */
  readonly backdrop: string;
  readonly description: string;
  /** The PNG's URL path. */
  readonly png: string;
  /** The PNG's width, in pixels. */
  readonly pngWidth: number;
  /** Under `public/`, at trpc.io's URL. */
  readonly src: string;
  readonly title: string;
}

export const mediaAssets: ReadonlyArray<MediaAsset> = [
  {
    backdrop: 'bg-card',
    description: 'Please use this in most circumstances.',
    png: '/img/logo.png',
    pngWidth: 1024,
    src: '/img/logo.svg',
    title: 'Logo',
  },
  {
    backdrop: 'bg-white',
    description: 'Please use this on light backgrounds.',
    png: '/img/logo-text-black.png',
    pngWidth: 2048,
    src: '/img/logo-text-black.svg',
    title: 'Wordmark, light',
  },
  {
    backdrop: 'bg-black',
    description: 'Please use this on dark backgrounds.',
    png: '/img/logo-text-white.png',
    pngWidth: 2048,
    src: '/img/logo-text-white.svg',
    title: 'Wordmark, dark',
  },
  {
    backdrop: 'bg-white',
    description: 'Please use this where only one color prints.',
    png: '/img/logo-mono.png',
    pngWidth: 1024,
    src: '/img/logo-mono.svg',
    title: 'Logo, one color',
  },
];
