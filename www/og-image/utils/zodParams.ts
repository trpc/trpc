import { z } from 'zod';

export function zodParams<TType>(schema: z.ZodType<TType>) {
  const querySchema = z.object({
    input: z
      .string()
      .transform((str) => JSON.parse(str))
      .pipe(schema),
  });
  return {
    decodeRequest: (req: Request) => {
      const url = new URL(req.url);
      const obj = Object.fromEntries(url.searchParams.entries());

      return querySchema.safeParse(obj);
    },
    toSearchString: (obj: typeof schema['_input']) => {
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
    readingTimeInMinutes: z.number().positive(),
    authorName: z.string(),
    authorTitle: z.string(),
    authorImg: z.string(),
  }),
);

export const docsParams = zodParams(
  z.object({
    title: z.string(),
    description: z.string().transform((str) => truncateWords(str, 20)),
    permalink: z
      .string()
      .startsWith('/')
      .transform((v) => `trpc.io${v}`),
  }),
);
