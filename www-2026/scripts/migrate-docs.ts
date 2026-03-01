/**
 * Script to migrate docs from Docusaurus format to fumadocs format.
 * - Copies docs from www/docs/ to www-2026/content/docs/
 * - Strips/adapts Docusaurus-specific frontmatter
 * - Removes Docusaurus-specific imports
 * - Creates meta.json files for sidebar ordering
 */

import fs from 'fs';
import path from 'path';

const WWW_DOCS = path.resolve(import.meta.dirname, '../../www/docs');
const TARGET_DOCS = path.resolve(import.meta.dirname, '../content/docs');

const WWW_BLOG = path.resolve(import.meta.dirname, '../../www/blog');
const TARGET_BLOG = path.resolve(import.meta.dirname, '../content/blog');

const WWW_UNVERSIONED = path.resolve(import.meta.dirname, '../../www/unversioned');

// Docusaurus imports to strip
const IMPORTS_TO_STRIP = [
  /^import\s+.*from\s+['"]@theme\/.*['"];?\s*$/gm,
  /^import\s+.*from\s+['"]@docusaurus\/.*['"];?\s*$/gm,
  /^import\s+CodeBlock\s+from\s+['"]@theme\/CodeBlock['"];?\s*$/gm,
  /^import\s+TabItem\s+from\s+['"]@theme\/TabItem['"];?\s*$/gm,
  /^import\s+Tabs\s+from\s+['"]@theme\/Tabs['"];?\s*$/gm,
];

function stripDocusaurusImports(content: string): string {
  for (const pattern of IMPORTS_TO_STRIP) {
    content = content.replace(pattern, '');
  }
  return content;
}

function adaptFrontmatter(content: string, filePath: string): string {
  // Match YAML frontmatter
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return content;

  const fmBlock = fmMatch[1]!;
  const rest = content.slice(fmMatch[0].length);

  // Parse frontmatter fields
  const lines = fmBlock.split('\n');
  const fm: Record<string, string> = {};
  for (const line of lines) {
    const match = line.match(/^(\w[\w_-]*):\s*(.*)$/);
    if (match) {
      fm[match[1]!] = match[2]!.trim();
    }
  }

  // Build new frontmatter - keep title and description, add icon if applicable
  const newFm: string[] = [];
  if (fm['title']) {
    newFm.push(`title: ${fm['title']}`);
  }
  if (fm['description']) {
    newFm.push(`description: ${fm['description']}`);
  }
  if (fm['hide_title']) {
    newFm.push(`full: true`);
  }

  const newContent = `---\n${newFm.join('\n')}\n---${rest}`;
  return newContent;
}

function copyDocsRecursive(srcDir: string, destDir: string, skipDirs: string[] = []) {
  if (!fs.existsSync(srcDir)) return;

  fs.mkdirSync(destDir, { recursive: true });

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (skipDirs.includes(entry.name)) continue;
    if (entry.name === '.gitignore') continue;
    if (entry.name === 'typedoc') continue;

    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyDocsRecursive(srcPath, destPath);
    } else if (entry.name.endsWith('.md') || entry.name.endsWith('.mdx')) {
      let content = fs.readFileSync(srcPath, 'utf-8');
      content = adaptFrontmatter(content, srcPath);
      content = stripDocusaurusImports(content);
      fs.writeFileSync(destPath, content);
      console.log(`  Copied: ${path.relative(srcDir, srcPath)} -> ${path.relative(destDir, destPath)}`);
    }
  }
}

// Sidebar order from www/sidebars.ts - we need to create meta.json files
function createMetaFiles() {
  // Root level meta.json
  writeMetaJson(path.join(TARGET_DOCS, 'meta.json'), {
    title: 'Documentation',
    pages: [
      '---tRPC---',
      'main',
      '---Backend Usage---',
      'server',
      '---Client Usage---',
      'client',
      '---Extra information---',
      'further',
      'migration',
      '---Community---',
      'community',
    ],
  });

  // main/ meta.json
  writeMetaJson(path.join(TARGET_DOCS, 'main/meta.json'), {
    title: 'tRPC',
    pages: [
      'introduction',
      'getting-started',
      'concepts',
      'quickstart',
      'videos-and-community-resources',
      'example-apps',
    ],
  });

  // server/ meta.json
  writeMetaJson(path.join(TARGET_DOCS, 'server/meta.json'), {
    title: 'Backend Usage',
    pages: [
      'routers',
      'procedures',
      'validators',
      'non-json-content-types',
      'merging-routers',
      'context',
      'middlewares',
      '---Hosting tRPC with Adapters---',
      'adapters-intro',
      'adapters',
      '---',
      'server-side-calls',
      'authorization',
      'error-handling',
      'error-formatting',
      'data-transformers',
      'metadata',
      'caching',
      'subscriptions',
      'websockets',
    ],
  });

  // server/adapters/ meta.json
  writeMetaJson(path.join(TARGET_DOCS, 'server/adapters/meta.json'), {
    title: 'Adapters',
    pages: [
      'standalone',
      'express',
      'fastify',
      'nextjs',
      'aws-lambda',
      'fetch',
    ],
  });

  // client/ meta.json
  writeMetaJson(path.join(TARGET_DOCS, 'client/meta.json'), {
    title: 'Client Usage',
    pages: [
      'overview',
      'tanstack-react-query',
      'react',
      'nextjs',
      'vanilla',
      'links',
      'headers',
      'cors',
    ],
  });

  // client/tanstack-react-query/ meta.json
  writeMetaJson(path.join(TARGET_DOCS, 'client/tanstack-react-query/meta.json'), {
    title: 'TanStack React Query',
    pages: ['setup', 'usage', 'migrating', 'server-components'],
  });

  // client/react/ meta.json
  writeMetaJson(path.join(TARGET_DOCS, 'client/react/meta.json'), {
    title: 'React Query Integration (Classic)',
    pages: [
      'introduction',
      'setup',
      'server-components',
      'infer-types',
      'useQuery',
      'useMutation',
      'useInfiniteQuery',
      'useSubscription',
      'useUtils',
      'createTRPCQueryUtils',
      'useQueries',
      'suspense',
      'getQueryKey',
      'aborting-procedures',
      'disabling-queries',
    ],
  });

  // client/nextjs/ meta.json
  writeMetaJson(path.join(TARGET_DOCS, 'client/nextjs/meta.json'), {
    title: 'Next.js Integration',
    pages: [
      'introduction',
      'setup',
      'ssr',
      'ssg',
      'server-side-helpers',
      'aborting-procedures',
      'starter-projects',
    ],
  });

  // client/vanilla/ meta.json
  writeMetaJson(path.join(TARGET_DOCS, 'client/vanilla/meta.json'), {
    title: 'Vanilla Client',
    pages: ['introduction', 'setup', 'infer-types', 'aborting-procedures'],
  });

  // client/links/ meta.json
  writeMetaJson(path.join(TARGET_DOCS, 'client/links/meta.json'), {
    title: 'Links',
    pages: [
      'overview',
      'httpLink',
      'httpBatchLink',
      'httpBatchStreamLink',
      'httpSubscriptionLink',
      'localLink',
      'wsLink',
      'splitLink',
      'loggerLink',
      'retryLink',
    ],
  });

  // further/ meta.json
  writeMetaJson(path.join(TARGET_DOCS, 'further/meta.json'), {
    title: 'Extra information',
    pages: ['faq', 'rpc', 'further-reading'],
  });

  // migration/ meta.json
  writeMetaJson(path.join(TARGET_DOCS, 'migration/meta.json'), {
    title: 'Migration',
    pages: ['migrate-from-v10-to-v11'],
  });

  // community/ meta.json
  writeMetaJson(path.join(TARGET_DOCS, 'community/meta.json'), {
    title: 'Community',
    pages: ['awesome-trpc', 'contributing', 'love', 'sponsors'],
  });
}

function writeMetaJson(filePath: string, data: any) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n');
  console.log(`  Created: ${filePath}`);
}

// Main migration
console.log('Migrating docs...');
console.log(`  Source: ${WWW_DOCS}`);
console.log(`  Target: ${TARGET_DOCS}`);

// Clean target
if (fs.existsSync(TARGET_DOCS)) {
  fs.rmSync(TARGET_DOCS, { recursive: true });
}
fs.mkdirSync(TARGET_DOCS, { recursive: true });

// Copy docs (skip landing-intro and partials which are Docusaurus-specific)
copyDocsRecursive(WWW_DOCS, TARGET_DOCS, ['landing-intro', 'partials']);

// Create meta.json files
console.log('\nCreating meta.json files...');
createMetaFiles();

// Copy unversioned content
if (fs.existsSync(WWW_UNVERSIONED)) {
  console.log('\nCopying unversioned content...');
  const unversionedFiles = fs.readdirSync(WWW_UNVERSIONED);
  const unversionedTarget = path.join(TARGET_DOCS, 'partials');
  fs.mkdirSync(unversionedTarget, { recursive: true });
  for (const file of unversionedFiles) {
    if (file.endsWith('.mdx') || file.endsWith('.md')) {
      let content = fs.readFileSync(path.join(WWW_UNVERSIONED, file), 'utf-8');
      content = stripDocusaurusImports(content);
      fs.writeFileSync(path.join(unversionedTarget, file), content);
      console.log(`  Copied unversioned: ${file}`);
    }
  }
}

// Migrate blog posts
console.log('\nMigrating blog posts...');
if (fs.existsSync(TARGET_BLOG)) {
  fs.rmSync(TARGET_BLOG, { recursive: true });
}
fs.mkdirSync(TARGET_BLOG, { recursive: true });

const blogFiles = fs.readdirSync(WWW_BLOG);
for (const file of blogFiles) {
  if (file === 'authors.yml') {
    // Copy authors.yml as-is
    fs.copyFileSync(
      path.join(WWW_BLOG, file),
      path.join(TARGET_BLOG, file),
    );
    console.log(`  Copied: ${file}`);
    continue;
  }
  if (!file.endsWith('.mdx') && !file.endsWith('.md')) continue;

  let content = fs.readFileSync(path.join(WWW_BLOG, file), 'utf-8');

  // Extract date from filename (YYYY-MM-DD-slug.mdx)
  const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})-(.+)\.(mdx?)$/);
  if (dateMatch) {
    const date = dateMatch[1]!;
    const slug = dateMatch[2]!;

    // Add date to frontmatter if not already present
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      const fmBlock = fmMatch[1]!;
      if (!fmBlock.includes('date:')) {
        content = content.replace(
          /^---\n/,
          `---\ndate: ${date}\n`,
        );
      }
    }

    // Rename file to just slug (fumadocs uses file path for routing)
    const newName = `${slug}.${dateMatch[3]}`;
    content = stripDocusaurusImports(content);
    fs.writeFileSync(path.join(TARGET_BLOG, newName), content);
    console.log(`  Copied blog: ${file} -> ${newName}`);
  }
}

console.log('\nMigration complete!');
