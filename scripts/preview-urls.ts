// Prints each Vercel project's preview URL for a branch, so PR links can be
// written before the deploys finish. A project only has the URL once it builds.
// Usage: pnpm preview-urls [branch] [fork-owner]
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const projects: Record<string, string> = {
  www: 'www',
  'trpc-next-app-dir': 'examples/.experimental/next-app-dir',
  'next-prisma-starter': 'examples/next-prisma-starter',
  'next-prisma-websockets-starter': 'examples/next-prisma-websockets-starter',
  'examples-todomvc': 'examples/next-prisma-todomvc',
  'next-sse-chat': 'examples/tanstack-start-sse-chat',
  'og-image': 'www/og-image',
};

const branch =
  process.argv[2] ??
  execSync('git branch --show-current', { encoding: 'utf8' }).trim();
const forkOwner = process.argv[3];
const ref = forkOwner ? `fork-${forkOwner}-${branch}` : branch;
const slug = ref
  .toLowerCase()
  .replaceAll('.', '')
  .replace(/[^a-z0-9]+/g, '-');

for (const [project, dir] of Object.entries(projects)) {
  let label = `${project}-git-${slug}`;
  // A hostname label is at most 63 characters, including the `-trpc` suffix.
  if (label.length > 58) {
    const hash = createHash('sha256')
      .update(`git-${ref}${project}`)
      .digest('hex')
      .slice(0, 6);
    label = `${label.slice(0, 51).replace(/-+$/, '')}-${hash}`;
  }
  console.log(`${project} (${dir}): https://${label}-trpc.vercel.app`);
}
