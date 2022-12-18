/* eslint-disable react/no-unknown-property */
import { ImageResponse } from '@vercel/og';
import { fetchFont } from '../../utils/fetchFont';

export const config = {
  runtime: 'experimental-edge',
};

export default async (_req: Request) => {
  const [inter900, inter700] = await Promise.all([
    fetchFont('Inter', 900, 'tRPC   Move Fast and Break Nothing'),
    fetchFont('Inter', 700, 'End-to-end typesafe APIs made easy.'),
  ]);

  return new ImageResponse(
    (
      <div
        tw="bg-zinc-900 h-full w-full text-white bg-cover flex flex-col p-14"
        style={{ fontFamily: 'Inter' }}
      >
        <img
          src="https://assets.trpc.io/www/og-pattern-dark.svg"
          alt="background"
          tw="absolute"
        />
        <div tw="flex flex-col justify-center items-center w-full h-full">
          <div tw="flex items-center">
            <img
              src="https://assets.trpc.io/icons/svgs/blue-bg-rounded.svg"
              width="150px"
              height="150px"
              alt="tRPC logo"
            />
            <h1 tw="text-9xl ml-6 font-black">tRPC</h1>
          </div>
          <div tw="flex flex-col items-center">
            <p tw="text-center pt-6 text-6xl font-black">
              Move Fast and Break Nothing
            </p>
            <p tw="text-center pt-3 text-3xl text-zinc-300 font-bold mt-0">
              End-to-end typesafe APIs made easy.
            </p>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 600,
      fonts: [
        { name: 'Inter', data: inter900, weight: 900 },
        { name: 'Inter', data: inter700, weight: 700 },
      ],
    },
  );
};
