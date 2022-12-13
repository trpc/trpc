import { ImageResponse } from '@vercel/og';
import { OGDocsComponent } from './ogComponents';

export const config = {
  runtime: 'experimental-edge',
};

const inter = fetch(new URL('../static/Inter.ttf', import.meta.url)).then(
  (res) => res.arrayBuffer(),
);

export default async (req: Request) => {
  const interData = await inter;

  const { searchParams } = new URL(req.url);
  console.log({ searchParams });

  const title = searchParams.get('title') ?? 'Default tRPC Title';
  const description =
    searchParams.get('description') ?? 'Move fast and break nothing!';

  return new ImageResponse(
    OGDocsComponent({
      title,
      description,
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
