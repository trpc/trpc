/**
 * fix-content.ts
 *
 * Fixes migrated Docusaurus content for compatibility with fumadocs:
 *
 * 1. Replaces `@site/src/components/` imports with `@/src/components/`
 * 2. Replaces `@site/src/utils/` imports with `@/src/utils/`
 * 3. Replaces `@site/unversioned/` imports with relative paths to content/docs/partials/
 * 4. Converts twoslash code fences:
 *    - ```ts twoslash  -->  ```ts
 *    - ```tsx twoslash  -->  ```tsx
 *    - ```twoslash include <name>  -->  ```ts (kept as plain code blocks)
 * 5. Removes twoslash-specific comments:
 *    - // @noErrors
 *    - // @include: <name>
 *    - // @filename: <name>
 *    - // @target: <value>
 *    - // @module: <value>
 *    - // @errors: <value>
 *    - // ---cut---
 * 6. Converts Docusaurus <Tabs>/<TabItem> to fumadocs <Tabs>/<Tab>
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname } from 'path';

const CONTENT_DIR = join(import.meta.dirname ?? process.cwd(), '..', 'content');

// Recursively collect all .md and .mdx files
function collectFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectFiles(full));
    } else if (entry.endsWith('.md') || entry.endsWith('.mdx')) {
      results.push(full);
    }
  }
  return results;
}

function fixContent(filePath: string, content: string): string {
  let result = content;
  let changed = false;

  // === 1. Fix @site/src/components/ imports ===
  // Replace @site/src/components/ with @/src/components/
  if (result.includes('@site/src/components/')) {
    result = result.replace(/@site\/src\/components\//g, '@/src/components/');
    changed = true;
  }

  // === 2. Fix @site/src/utils/ imports ===
  if (result.includes('@site/src/utils/')) {
    result = result.replace(/@site\/src\/utils\//g, '@/src/utils/');
    changed = true;
  }

  // === 3. Fix @site/unversioned/ imports ===
  // These reference content/docs/partials/ files
  // e.g. import Content from '@site/unversioned/_love.mdx' should become
  // a relative import to the partials directory
  const unversionedRegex = /import\s+(\w+)\s+from\s+['"]@site\/unversioned\/(.*?)['"]/g;
  if (result.match(unversionedRegex)) {
    result = result.replace(
      /import\s+(\w+)\s+from\s+['"]@site\/unversioned\/(.*?)['"]/g,
      (_match, name, path) => {
        // Calculate relative path from this file to content/docs/partials/
        const fileDir = dirname(filePath);
        const partialsDir = join(CONTENT_DIR, 'docs', 'partials');
        let rel = relative(fileDir, join(partialsDir, path));
        if (!rel.startsWith('.')) {
          rel = './' + rel;
        }
        return `import ${name} from '${rel}'`;
      },
    );
    changed = true;
  }

  // === 4. Convert twoslash code fences ===

  // ```ts twoslash ... -> ```ts ...
  // ```tsx twoslash ... -> ```tsx ...
  // ```tsx title='...' twoslash -> ```tsx title='...'
  // Handle twoslash appearing anywhere in the code fence line
  const twoslashFenceRegex = /^(```(?:ts|tsx|typescript))(.*?)\s+twoslash(.*)$/gm;
  if (result.match(twoslashFenceRegex)) {
    result = result.replace(
      /^(```(?:ts|tsx|typescript))(.*?)\s+twoslash(.*)$/gm,
      (_match, lang, before, after) => {
        const parts = [lang, before.trim(), after.trim()].filter(Boolean);
        return parts.join(' ');
      },
    );
    changed = true;
  }

  // ```twoslash include <name> -> ```ts
  // These are shared code snippet definitions in twoslash.
  // We keep the code but mark them as regular ts code blocks.
  const twoslashIncludeRegex = /^```twoslash\s+include\s+\S+/gm;
  if (result.match(twoslashIncludeRegex)) {
    result = result.replace(/^```twoslash\s+include\s+\S+/gm, '```ts');
    changed = true;
  }

  // === 5. Remove twoslash-specific comment lines ===
  // These are directives that only make sense for the twoslash compiler.
  // We remove them line by line.

  // Remove lines that are purely twoslash directives
  const twoslashDirectiveRegex =
    /^[ \t]*\/\/ @(noErrors|include|filename|target|module|errors)\b.*\n?/gm;
  if (result.match(twoslashDirectiveRegex)) {
    result = result.replace(twoslashDirectiveRegex, '');
    changed = true;
  }

  // Remove // ---cut--- lines (twoslash cut markers)
  const cutRegex = /^[ \t]*\/\/ ---cut---\s*\n?/gm;
  if (result.match(cutRegex)) {
    result = result.replace(cutRegex, '');
    changed = true;
  }

  // === 6. Convert Docusaurus Tabs/TabItem to fumadocs Tabs/Tab ===
  // Docusaurus:
  //   <Tabs>
  //     <TabItem value="npm" label="npm" default>
  //       content
  //     </TabItem>
  //   </Tabs>
  //
  // Fumadocs:
  //   import { Tab, Tabs } from 'fumadocs-ui/components/tabs';
  //   <Tabs items={["npm", "yarn", "pnpm"]}>
  //     <Tab value="npm">
  //       content
  //     </Tab>
  //   </Tabs>

  if (result.includes('<Tabs>') || result.includes('<TabItem')) {
    // First, collect all Tabs blocks and extract the items/labels
    // We need a more careful approach: find each <Tabs>...</Tabs> block
    // and transform it.

    result = transformTabs(result);
    changed = true;
  }

  if (changed) {
    return result;
  }
  return content; // Return original if no changes
}

/**
 * Transform Docusaurus Tabs/TabItem blocks to fumadocs Tabs/Tab blocks.
 */
function transformTabs(content: string): string {
  let result = content;

  // Process each <Tabs>...</Tabs> block
  // We'll do this iteratively since there can be multiple Tabs blocks
  while (result.includes('<Tabs>')) {
    const tabsStart = result.indexOf('<Tabs>');
    const tabsEnd = result.indexOf('</Tabs>', tabsStart);
    if (tabsEnd === -1) break;

    const tabsEndFull = tabsEnd + '</Tabs>'.length;
    const block = result.substring(tabsStart, tabsEndFull);

    // Extract all TabItem entries from this block
    const items: { label: string; value: string; content: string }[] = [];
    const tabItemRegex =
      /<TabItem\s+(?:[^>]*?)value="([^"]*)"(?:\s+label="([^"]*)")?[^>]*>([\s\S]*?)<\/TabItem>/g;
    let match;
    while ((match = tabItemRegex.exec(block)) !== null) {
      const value = match[1]!;
      const label = match[2] || value;
      const tabContent = match[3]!;
      items.push({ value, label, content: tabContent });
    }

    if (items.length === 0) {
      // If we couldn't parse any TabItem, just remove the Tabs wrapper
      const innerContent = block
        .replace('<Tabs>', '')
        .replace('</Tabs>', '')
        .trim();
      result = result.substring(0, tabsStart) + innerContent + result.substring(tabsEndFull);
      continue;
    }

    // Build fumadocs Tabs component
    const labels = items.map((i) => i.label);
    const tabsItems = JSON.stringify(labels);

    let newBlock = `<Tabs items={${tabsItems}}>`;
    for (const item of items) {
      newBlock += `\n<Tab value="${item.label}">`;
      newBlock += item.content;
      newBlock += `</Tab>`;
    }
    newBlock += '\n</Tabs>';

    result = result.substring(0, tabsStart) + newBlock + result.substring(tabsEndFull);
  }

  // Add fumadocs Tab import if the file uses Tabs and doesn't already import it
  if (result.includes('<Tabs items=') && !result.includes("from 'fumadocs-ui/components/tabs'")) {
    // Insert import after frontmatter (---...---) or at the top
    const frontmatterEnd = findFrontmatterEnd(result);
    const importStatement = `\nimport { Tab, Tabs } from 'fumadocs-ui/components/tabs';\n`;

    if (frontmatterEnd !== -1) {
      result =
        result.substring(0, frontmatterEnd) + importStatement + result.substring(frontmatterEnd);
    } else {
      result = importStatement + result;
    }
  }

  return result;
}

/**
 * Find the end position of YAML frontmatter (after the closing ---).
 */
function findFrontmatterEnd(content: string): number {
  if (!content.startsWith('---')) return -1;
  const secondDash = content.indexOf('---', 3);
  if (secondDash === -1) return -1;
  // Return position right after the closing --- and its newline
  const afterDash = secondDash + 3;
  if (content[afterDash] === '\n') return afterDash + 1;
  if (content[afterDash] === '\r' && content[afterDash + 1] === '\n') return afterDash + 2;
  return afterDash;
}

// ---- Main ----
const files = collectFiles(CONTENT_DIR);
let totalChanged = 0;
const changeDetails: { file: string; changes: string[] }[] = [];

for (const filePath of files) {
  const original = readFileSync(filePath, 'utf-8');
  const fixed = fixContent(filePath, original);

  if (fixed !== original) {
    writeFileSync(filePath, fixed, 'utf-8');
    totalChanged++;

    // Summarize changes
    const changes: string[] = [];
    if (original.includes('@site/') && !fixed.includes('@site/')) {
      changes.push('Fixed @site/ imports');
    } else if (
      original.split('@site/').length > fixed.split('@site/').length
    ) {
      changes.push('Partially fixed @site/ imports');
    }
    if (original.includes('twoslash') && !fixed.includes('twoslash')) {
      changes.push('Removed twoslash markers');
    }
    if (original.includes('// @noErrors') && !fixed.includes('// @noErrors')) {
      changes.push('Removed // @noErrors');
    }
    if (original.includes('// ---cut---') && !fixed.includes('// ---cut---')) {
      changes.push('Removed // ---cut--- markers');
    }
    if (original.includes('// @include:') && !fixed.includes('// @include:')) {
      changes.push('Removed // @include: directives');
    }
    if (original.includes('// @filename:') && !fixed.includes('// @filename:')) {
      changes.push('Removed // @filename: directives');
    }
    if (original.includes('<TabItem') && !fixed.includes('<TabItem')) {
      changes.push('Converted Tabs/TabItem to fumadocs');
    }

    changeDetails.push({
      file: relative(CONTENT_DIR, filePath),
      changes,
    });
  }
}

console.log(`\n=== Content Fix Summary ===`);
console.log(`Total files scanned: ${files.length}`);
console.log(`Total files modified: ${totalChanged}`);
console.log('');

for (const detail of changeDetails) {
  console.log(`  ${detail.file}`);
  for (const change of detail.changes) {
    console.log(`    - ${change}`);
  }
}

console.log('\nDone!');
