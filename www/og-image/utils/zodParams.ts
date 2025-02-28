import { z } from 'zod';

type Primitives = string | number | boolean | null;
type JsonValue = Primitives | JsonValue[] | { [key: string]: JsonValue };

const jsonStr = z.string().transform((str, ctx) => {
  try {
    return JSON.parse(str) as JsonValue;
  } catch {
    ctx.addIssue({ code: 'custom', message: 'Needs to be JSON' });
  }
});

export function zodParams<TType>(schema: z.ZodType<TType>) {
  const querySchema = z.object({
    input: jsonStr.pipe(schema),
  });
  return {
    decodeRequest: (req: Request) => {
      const url = new URL(req.url);
      const obj = Object.fromEntries(url.searchParams.entries());

      return querySchema.safeParse(obj);
    },
    toSearchString: (obj: (typeof schema)['_input']) => {
      schema.parse(obj);
      return `input=${encodeURIComponent(JSON.stringify(obj))}`;
    },
  };
}

function truncateWordsFn(str: string, maxCharacters: number) {
  if (str.length <= maxCharacters) {
    return str;
  }
  // break at closest word
  const truncated = str.slice(0, maxCharacters);
  const lastSpace = truncated.lastIndexOf(' ');
  return truncated.slice(0, lastSpace) + ' …';
}
function truncatedWordSchema(opts: { maxCharacters: number }) {
  return z
    .string()
    .transform((str) => truncateWordsFn(str, opts.maxCharacters));
}

export const fontParams = zodParams(
  z.object({
    family: z.string(),
    weight: z.number().default(400),
    text: z.string().optional(),
  }),
);

export const blogParams = zodParams(
  z.object({
    title: truncatedWordSchema({ maxCharacters: 70 }),
    description: truncatedWordSchema({ maxCharacters: 145 }),
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
    authors: z.array(
      z.object({
        name: z.string(),
        title: z.string(),
        img: z.string(),
      }),
    ),
  }),
);

export const docsParams = zodParams(
  z.object({
    title: z.string(),
    description: truncatedWordSchema({ maxCharacters: 215 }),
    hostname: z
      .string()
      .optional()
      .default('trpc.io')
      .refine((v) => {
        const parts = v.split('.');
        return parts.slice(parts.length - 2).join('.') === 'trpc.io';
      }, 'Needs to be a tRPC domain'),
    permalink: z.string().startsWith('/'),
  }),
);
