import { z } from 'zod';

export function zodParams<TSchema extends z.ZodType>(schema: TSchema) {
  return {
    decodeURL: (url: URL) => {
      const input = url.searchParams.get('input');
      const obj = typeof input !== 'string' ? undefined : JSON.parse(input);
      return schema.safeParse(obj);
    },
    toSearchString: (obj: z.input<TSchema>) => {
      schema.parse(obj);
      return `input=${encodeURIComponent(JSON.stringify(obj))}`;
    },
  };
}

function truncateWords(str: string, maxWords: number) {
  return str.split(' ').length > maxWords
    ? `${str.split(' ').slice(0, maxWords).join(' ')}...`
    : str;
}

export const blogParams = zodParams(
  z.object({
    title: z.string().transform((str) => truncateWords(str, 13)),
    description: z.string().transform((str) => truncateWords(str, 20)),
    date: z
      .string()
      .transform((val) => new Date(val))
      .transform((date) =>
        Intl.DateTimeFormat('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }).format(date),
      ),
    readingTime: z.string(),
    authorName: z.string(),
    authorTitle: z.string(),
    authorImg: z.string(),
  }),
);

export const docsParams = zodParams(
  z.object({
    title: z.string(),
    description: z.string().transform((str) => truncateWords(str, 20)),
    url: z.string(),
  }),
);
