'use client';

import dynamic from 'next/dynamic';

export const DynamicCodeBlock = dynamic(() => import('./dynamic-codeblock'));
export const Banner = dynamic(() =>
  import('fumadocs-ui/components/banner').then((res) => res.Banner),
);
export const InlineTOC = dynamic(() =>
  import('fumadocs-ui/components/inline-toc').then((res) => res.InlineTOC),
);

export const File = dynamic(() =>
  import('fumadocs-ui/components/files').then((res) => res.File),
);
export const Files = dynamic(() =>
  import('fumadocs-ui/components/files').then((res) => res.Files),
);
export const Folder = dynamic(() =>
  import('fumadocs-ui/components/files').then((res) => res.Folder),
);

export const ImageZoom = dynamic(() =>
  import('fumadocs-ui/components/image-zoom').then((res) => res.ImageZoom),
);
