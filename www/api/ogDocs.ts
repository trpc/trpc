import { ImageResponse } from '@vercel/og';
import { z } from 'zod';
import { OGDocsComponent } from './ogComponents';

export const config = {
  runtime: 'experimental-edge',
};

const inter = fetch(new URL('../static/Inter.ttf', import.meta.url)).then(
  (res) => res.arrayBuffer(),
);

const searchParamsSchema = z.object({
  title: z.string(),
  description: z.string(),
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
    OGDocsComponent({
      title: parsed.data.title,
      description: parsed.data.description,
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
