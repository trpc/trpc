import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

export async function writeFileToDisk(file: File) {
  const nonce = Date.now();
  // `next dev` and `next start` run in the project root
  const fileDir = path.resolve(`${process.cwd()}/public/uploads/${nonce}`);

  if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir, { recursive: true });
  }
  console.log('Writing', file.name, 'to', fileDir);
  const fd = fs.createWriteStream(path.resolve(`${fileDir}/${file.name}`));

  const fileStream = Readable.fromWeb(
    // @ts-expect-error - unsure why this is not working
    file.stream(),
  );
  for await (const chunk of fileStream) {
    fd.write(chunk);
  }
  fd.end();

  return {
    url: `/uploads/${nonce}/${file.name}`,
    name: file.name,
  };
}
