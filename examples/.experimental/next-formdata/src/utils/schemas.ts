import { zfd } from 'zod-form-data';

if (typeof window === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const undici = require('undici');
  globalThis.File = undici.File;
}

export const uploadFileSchema = zfd.formData({
  name: zfd.text(),
  image: zfd.file(),
});
