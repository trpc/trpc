import { ImageResponse } from '@vercel/og';
import { type NextRequest } from 'next/server';

export const config = {
  runtime: 'experimental-edge',
};

// load proper font here
const font = fetch(
  new URL('../../assets/SFPRODISPLAYREGULAR.OTF', import.meta.url),
).then((res) => res.arrayBuffer());
const fontBold = fetch(
  new URL('../../assets/SFPRODISPLAYBOLD.OTF', import.meta.url),
).then((res) => res.arrayBuffer());

const alex = 'https://avatars.githubusercontent.com/u/459267?v=4';

export default async function handler(req: NextRequest) {
  const fontData = await font;
  const fontBoldData = await fontBold;

  const { searchParams } = new URL(req.url);
  console.log({ searchParams });

  const title = searchParams.get('title') ?? 'Default tRPC Title';

  const date = Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(
    searchParams.has('date') ? new Date(searchParams.get('date')) : new Date(),
  );

  const readingTime = searchParams.get('readingTime') ?? '5 min read';

  const img = searchParams.get('img') || alex;

  const author = searchParams.get('author') ?? 'Alex';
  const authorDesc = searchParams.get('authorDesc') ?? 'Creator of tRPC';

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          display: 'flex',
          width: '100%',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          fontFamily: 'SF Pro Display',
        }}
      >
        <img
          src={`${
            process.env.VERCEL_URL
              ? 'https://' + process.env.VERCEL_URL
              : 'http://localhost:3000'
          }/pattern.svg`}
          tw="absolute"
        />
        <div tw="flex items-center justify-between h-full w-full p-16">
          <div tw="flex flex-col items-start">
            <h1 tw="text-6xl text-gray-900">{title}</h1>
            <div tw="flex">
              <p>{date}</p>
              <p tw="mx-2">•</p>
              <p>{readingTime}</p>
            </div>
            <div tw="flex items-center">
              <img src={img} tw="h-32 w-32 rounded-full" />
              <div tw="flex flex-col ml-4">
                <p tw="my-1" style={{ fontFamily: 'SF Pro Display Bold' }}>
                  {author}
                </p>
                <p tw="my-1">{authorDesc}</p>
              </div>
            </div>
          </div>

          <div tw="flex justify-between">
            <div tw="flex flex-col items-center">
              <img
                tw="h-64 w-64 mb-4"
                src="https://assets.trpc.io/icons/svgs/blue-bg-rounded.svg"
                alt=""
              />
              <span
                tw="text-5xl font-bold"
                style={{ fontFamily: 'SF Pro Display Bold' }}
              >
                tRPC
              </span>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 600,
      fonts: [
        {
          name: 'SF Pro Display',
          data: fontData,
          style: 'normal',
          weight: 400,
        },
        {
          name: 'SF Pro Display Bold',
          data: fontBoldData,
          style: 'normal',
          weight: 700,
        },
      ],
    },
  );
}
