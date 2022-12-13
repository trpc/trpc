import { ImageResponse } from '@vercel/og';
import { z } from 'zod';
import { OGBlogComponent } from './ogComponents';

export const config = {
  runtime: 'experimental-edge',
};

const inter = fetch(new URL('../static/Inter.ttf', import.meta.url)).then(
  (res) => res.arrayBuffer(),
);

const searchParamsSchema = z.object({
  title: z.string(),
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
});

export default async (req: Request) => {
  const interData = await inter;

  const url = new URL(req.url);

  const parsed = searchParamsSchema.safeParse(
    Object.fromEntries(url.searchParams.entries()),
  );
  if (!parsed.success) {
    return new Response(parsed.error.toString(), { status: 400 });
  }

  return new ImageResponse(
    OGBlogComponent({
      title: parsed.data.title,
      author: parsed.data.authorName,
      authorDesc: parsed.data.authorTitle,
      img: parsed.data.authorImg,
      date: parsed.data.date,
      readingTime: parsed.data.readingTime,
    }),
    {
      width: 1200,
      height: 600,
      fonts: [
        {
          name: 'Inter',
          data: interData,
          style: 'normal',
        },
      ],
    },
  );
};
