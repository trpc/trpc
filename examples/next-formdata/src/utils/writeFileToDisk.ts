import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

export async function writeFileToDisk(file: File) {
  const rootDir = __dirname + '/../../../../..';

  const nonce = Date.now();
  const fileDir = path.resolve(`${rootDir}/public/uploads/${nonce}`);

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
