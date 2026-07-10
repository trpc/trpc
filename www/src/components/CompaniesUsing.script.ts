import fs from 'fs';
import path from 'path';

const WWW_ROOT = path.join(__dirname, '../../');

const files = fs.readdirSync(path.join(WWW_ROOT, 'static/logos')).sort();

const companies = files.map((src) => {
  const ext = path.extname(src);

  const name = src.substring(0, src.length - ext.length);

  return {
    src: `/logos/${src}`,
    name,
  };
});

fs.writeFileSync(
  __dirname + '/CompaniesUsing.script.output.ts',
  `
// prettier-ignore
// eslint-disable

export const companies = ${JSON.stringify(companies, null, 2)} as const;
`.trimStart(),
);
