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
