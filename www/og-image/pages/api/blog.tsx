import { ImageResponse } from '@vercel/og';
import { fetchFont } from '../../utils/fetchFont';
import { blogParams } from '../../utils/zodParams';

export const config = {
  runtime: 'edge',
};

const classNames = (...classes: (string | undefined | null | false | 0)[]) => {
  return classes.filter(Boolean).join(' ');
};

export default async (req: Request) => {
  const [inter900, inter700, inter400] = await Promise.all([
    fetchFont('Inter', 900),
    fetchFont('Inter', 700),
    fetchFont('Inter', 400),
  ]);

  const parsed = blogParams.decodeRequest(req);
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
        <div tw="flex flex-col justify-between w-full h-full">
          <div tw="flex flex-col w-full">
            <div tw="flex justify-between items-center w-full">
              <div tw="flex flex-col flex-1 pr-6">
                <p tw="text-blue-500 text-2xl font-semibold">{props.date}</p>
                <h1 tw="text-6xl font-extrabold leading-tight py-0 my-0">
                  {props.title}
                </h1>
              </div>
              <img
                src="https://assets.trpc.io/icons/svgs/blue-bg-rounded.svg"
                width="84px"
                height="84px"
                alt="tRPC logo"
              />
            </div>
            <p tw="text-3xl leading-snug text-zinc-300">{props.description}</p>
            <p tw="text-2xl text-blue-500 font-semibold leading-3">
              {Math.round(props.readingTimeInMinutes)} min read
            </p>
          </div>
          <div tw="flex items-center">
            {props.authors.map((author, idx) => {
              const isLast = idx === props.authors.length - 1;
              return (
                <div
                  key={idx}
                  tw={classNames('flex items-center', !isLast && 'mr-8')}
                >
                  <img
                    src={author.img}
                    alt={`${author.name}'s profile`}
                    width="75px"
                    height="75px"
                    tw="mr-6 rounded-xl"
                  />
                  <div tw="flex flex-col justify-center">
                    <p tw="text-2xl leading-[1px] font-semibold">
                      {author.name}
                    </p>
                    <p tw="text-xl leading-[1px] text-zinc-300">
                      {author.title}
                    </p>
                  </div>
                </div>
              );
            })}
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
        { name: 'Inter', data: inter400, weight: 400 },
      ],
    },
  );
};
