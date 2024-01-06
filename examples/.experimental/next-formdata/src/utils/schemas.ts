import { zfd } from 'zod-form-data';

export const uploadFileSchema = zfd.formData({
  name: zfd.text(),
  image: zfd.file(),
});
