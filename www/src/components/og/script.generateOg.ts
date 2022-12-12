// Generates Open Graph images based on blog files
import fs from 'fs';
import parseMd from 'parse-md';
import path from 'path';
import { generateOgImage } from './generateOgImage';

const genDir = path.join(process.cwd(), 'static/og-assets/generated');
const blogDir = path.join(process.cwd(), 'blog');

if (!fs.existsSync(genDir)) {
  fs.mkdirSync(genDir);
}

function getFiles(dir: string): string[] {
  const dirents = fs.readdirSync(dir, { withFileTypes: true });
  const files = dirents.map((dirent) => {
    const res = path.resolve(dir, dirent.name);
    return dirent.isDirectory() ? getFiles(res) : res;
  });
  return Array.prototype.concat(...files);
}

async function genOgs() {
  // filter mds, remove dates
  const dateRegex = /[0-9]{4}-[0-9]{2}-[0-9]{2}/;
  const mdFilePaths = getFiles(blogDir).filter((e) => e.includes('.md'));

  for (const filePath of mdFilePaths) {
    //regex hard
    const fSplit = filePath.split('/');
    let fileName = fSplit[fSplit.length - 1];
    fileName = dateRegex.test(fileName) ? fileName.slice(11) : fileName;

    let pngName = fSplit
      .slice(0, fSplit.length - 1)
      .concat([fileName])
      .filter((e) => !e.includes('index'))
      .join('/');
    pngName =
      pngName
        .replace('.mdx', '')
        .replace('.md', '')
        .replace('blog', 'static/og-assets/generated') + '.png';
    const split = pngName.split('/');
    const dir = split.slice(0, split.length - 1).join('/');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, {
        recursive: true,
      });
    }
    const file = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseMd(file) as { metadata: { title?: string } };
    let ogData: Buffer;
    if (!parsed.metadata.title) {
      console.log(
        `No title metadata found for post at ${filePath}, using default title for OG image.`,
      );
      ogData = await generateOgImage('tRPC Blog Post');
    } else {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ogData = await generateOgImage(parsed.metadata.title);
    }
    if (!ogData) throw new Error("Couldn't generate og!");
    console.log('Writing to ' + pngName);
    fs.writeFileSync(pngName, ogData);
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
genOgs();
