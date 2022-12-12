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

export default async function handler(req: NextRequest) {
  const fontData = await font;
  const fontBoldData = await fontBold;

  const { searchParams } = new URL(req.url);
  console.log({ searchParams });

  const title = searchParams.get('title') ?? 'Default tRPC Title';
  const description =
    searchParams.get('description') ?? 'Move fast and break nothing!';

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
            <p tw="text-2xl text-gray-700">{description}</p>
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
