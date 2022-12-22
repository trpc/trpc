import { fontParams } from './zodParams';

const baseUrl = process.env.VERCEL
  ? 'https://' + process.env.VERCEL_URL
  : 'http://localhost:3001';

export const fetchFont = (family: string, weight?: number, text?: string) =>
  fetch(
    `${baseUrl}/api/font?${fontParams.toSearchString({
      family,
      weight,
      text,
    })}`,
  ).then((res) => res.arrayBuffer());
