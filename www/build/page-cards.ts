/**
 * The pages, besides the docs, the blog and the home page, whose social
 * cards `vite.config.ts` registers (`ogCards`): `pageHead` points each
 * page's `og:image` at its card, which is a 404 without one.
 */
import { mediaPage, searchPage } from '../src/pages.ts';
import {
  kitchenSink,
  showcases,
} from '../src/routes/kitchen-sink/-showcases.ts';

export const pageCards = [mediaPage, searchPage, kitchenSink, ...showcases];
