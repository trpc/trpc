import { z } from 'zod';
import { zfd } from 'zod-form-data';

if (typeof window === 'undefined') {
  const undici = require('undici');
  globalThis.File = undici.File as any;
}

export const uploadFileSchema = zfd.formData({
  name: zfd.text(),
  image: zfd.file(),
  document: zfd.file(z.instanceof(File).optional()),
});
