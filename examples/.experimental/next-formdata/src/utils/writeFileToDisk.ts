import fs from 'node:fs';
import path from 'node:path';

export async function writeFileToDisk(file: File) {
  const rootDir = __dirname + '/../../../../..';

  const nonce = Date.now();
  const fileDir = path.resolve(`${rootDir}/public/uploads/${nonce}`);

  if (!fs.existsSync(fileDir)) {
    fs.mkdirSync(fileDir, { recursive: true });
  }
  console.log('Writing', file.name, 'to', fileDir);
  fs.writeFileSync(
    path.resolve(`${fileDir}/${file.name}`),
    new DataView(await file.arrayBuffer()),
  );

  return {
    url: `/uploads/${nonce}/${file.name}`,
    name: file.name,
  };
}
