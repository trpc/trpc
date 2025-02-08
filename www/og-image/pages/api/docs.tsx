import { ImageResponse } from '@vercel/og';
import { fetchFont } from '../../utils/fetchFont';
import { docsParams } from '../../utils/zodParams';

export const config = {
  runtime: 'edge',
};

export default async (req: Request) => {
  const [inter900, inter700, inter400] = await Promise.all([
    fetchFont('Inter', 900),
    fetchFont('Inter', 700),
    fetchFont('Inter', 400),
  ]);

  const parsed = docsParams.decodeRequest(req);

  if (!parsed.success) {
    return new Response(parsed.error.toString(), { status: 400 });
  }

  const props = parsed.data.input;

  return new ImageResponse(
    (
      <div tw="bg-zinc-900 h-full w-full text-white bg-cover flex flex-col p-14">
        <img
          src="https://assets.trpc.io/www/og-pattern-dark.svg"
          alt="background"
          tw="absolute"
        />
        <div tw="flex flex-col justify-center items-center w-full h-full">
          <img
            src="https://assets.trpc.io/icons/svgs/blue-bg-rounded.svg"
            width="100px"
            height="100px"
            alt="tRPC logo"
          />
          <h1 tw="text-6xl pt-3">{props.title}</h1>
          <p tw="text-center text-3xl text-zinc-300">{props.description}</p>
          <p tw="text-blue-500 text-3xl">
            {props.hostname}
            {props.permalink}
          </p>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 600,
      fonts: [
        { name: 'Inter', data: inter900, weight: 900 },
        { name: 'Inter', data: inter700, weight: 700 },
        { name: 'Inter', data: inter400, weight: 400 },
      ],
    },
  );
};
