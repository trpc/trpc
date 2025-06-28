import { docs } from '@/.source';
import { icons as tablerIcons } from '@tabler/icons-react';
import type { InferMetaType, InferPageType } from 'fumadocs-core/source';
import { loader } from 'fumadocs-core/source';
import { attachFile, createOpenAPI } from 'fumadocs-openapi/server';
import { createElement } from 'react';

export const source = loader({
  baseUrl: '/docs',
  icon(icon) {
    if (icon && icon in tablerIcons)
      return createElement(tablerIcons[icon as keyof typeof tablerIcons]);
  },
  source: docs.toFumadocsSource(),
  pageTree: {
    attachFile,
  },
});

export const openapi = createOpenAPI({
  proxyUrl: '/api/proxy',
  shikiOptions: {
    themes: {
      dark: 'vesper',
      light: 'vitesse-light',
    },
  },
});

export type Page = InferPageType<typeof source>;
export type Meta = InferMetaType<typeof source>;
