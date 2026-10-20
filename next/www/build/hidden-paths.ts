/**
 * The decisions pages (`decisions.basePath` in `src/site.ts`) are served for
 * whoever has the link, and for nobody else: no page of the site links
 * there, they're out of the sitemap, `llms.txt` and the markdown, robots
 * don't crawl them, and each says `noindex`. `vercel-output.ts` fails the
 * build on any of those slipping.
 */
import type { VercelRoute } from './old-routes.ts';

const robotsMeta = /<meta\b[^>]*\bname="robots"[^>]*>/;

/** Whether a prerendered page asks search engines not to index it. */
export const isNoindex = (html: string) =>
  robotsMeta.exec(html)?.[0].includes('noindex') ?? false;

const escapeRegExp = (text: string) =>
  text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `X-Robots-Tag: noindex, nofollow` on the path and under it, whatever the host. */
export const hiddenRoute = (basePath: string): VercelRoute => ({
  continue: true,
  headers: { 'X-Robots-Tag': 'noindex, nofollow' },
  src: `^${escapeRegExp(basePath)}(?:/.*)?$`,
});

const isUnder = (basePath: string, file: string) =>
  file === `${basePath.slice(1)}/index.html` ||
  file.startsWith(`${basePath.slice(1)}/`);

/**
 * What gives the hidden path away in the built site. `files` are the text
 * files (`.html`, `.md`, `.txt`, `.xml`) by their `/`-separated path in the
 * static directory.
 */
export function hiddenPathProblems(
  basePath: string,
  files: ReadonlyMap<string, string>,
): ReadonlyArray<string> {
  const problems: Array<string> = [];
  const link = new RegExp(
    `\\bhref="(?:https?://[^"/]+)?${escapeRegExp(basePath)}(?:[/"?#])`,
  );
  const robots = files.get('robots.txt') ?? '';
  if (!new RegExp(`^Disallow: ${escapeRegExp(basePath)}$`, 'm').test(robots)) {
    problems.push(`robots.txt: doesn't disallow ${basePath}`);
  }
  let pages = 0;
  for (const [file, text] of files) {
    if (isUnder(basePath, file)) {
      if (file.endsWith('.html')) {
        pages += 1;
        if (!isNoindex(text)) {
          problems.push(`${file}: has no noindex robots meta tag`);
        }
      } else {
        problems.push(`${file}: only pages are served under ${basePath}`);
      }
    } else if (file.endsWith('.html')) {
      if (link.test(text)) {
        problems.push(`${file}: links to ${basePath}`);
      }
    } else if (file !== 'robots.txt' && text.includes(basePath)) {
      problems.push(`${file}: lists ${basePath}`);
    }
  }
  if (pages === 0) {
    problems.push(`${basePath}: the build has no page there`);
  }
  return problems;
}
