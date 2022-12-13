import { ImageResponse } from '@vercel/og';
import { OGBlogComponent } from './ogComponents';

export const config = {
  runtime: 'experimental-edge',
};

const inter = fetch(new URL('../static/Inter.ttf', import.meta.url)).then(
  (res) => res.arrayBuffer(),
);

const alex = 'https://avatars.githubusercontent.com/u/459267?v=4';

export default async (req: Request) => {
  const interData = await inter;

  const { searchParams } = new URL(req.url);
  console.log({ searchParams });

  const title = searchParams.get('title') ?? 'Default tRPC Title';

  const date = Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    searchParams.has('date') ? new Date(searchParams.get('date')!) : new Date(),
  );

  const readingTime = searchParams.get('readingTime') ?? '5.00';
  const img = searchParams.get('authorImg') || alex;
  const author = searchParams.get('authorName') ?? 'Alex';
  const authorDesc = searchParams.get('authorTitle') ?? 'Creator of tRPC';

  return new ImageResponse(
    OGBlogComponent({
      title,
      author,
      authorDesc,
      img,
      date,
      readingTime,
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
