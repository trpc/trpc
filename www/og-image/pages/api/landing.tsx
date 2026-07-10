import { ImageResponse } from '@vercel/og';
import { env } from '../../utils/env';
import { fetchFont } from '../../utils/fetchFont';

export const config = {
  runtime: 'edge',
};

const fetchGithubStars = async () => {
  const data = await (
    await fetch('https://api.github.com/repos/trpc/trpc', {
      headers: { authorization: `Bearer ${env.GITHUB_TOKEN}` },
    })
  ).json();
  if (typeof data?.stargazers_count !== 'number')
    throw new Error('Could not fetch stars');
  return new Intl.NumberFormat().format(data.stargazers_count);
};

const fetchNpmDownloads = async () => {
  const data = await (
    await fetch('https://api.npmjs.org/downloads/point/last-week/@trpc/server')
  ).json();
  if (typeof data?.downloads !== 'number')
    throw new Error('Could not fetch npm downloads');
  return new Intl.NumberFormat().format(data.downloads);
};

// const fetchTwitterFollowers = async () => {
//   const data = await (
//     await fetch(
//       'https://api.twitter.com/2/users/1353123577193779201?user.fields=public_metrics',
//       {
//         headers: { authorization: `Bearer ${env.TWITTER_BEARER_TOKEN}` },
//       },
//     )
//   ).json();
//   if (typeof data?.data?.public_metrics?.followers_count !== 'number')
//     throw new Error('Could not fetch twitter followers');
//   return new Intl.NumberFormat().format(
//     data?.data?.public_metrics?.followers_count,
//   );
// };

export default async (_req: Request) => {
  const [inter800, inter700, ghStars, npmDownloads /**, twitterFollowers */] =
    await Promise.all([
      fetchFont('Inter', 800, 'tRPC   Move Fast and Break Nothing'),
      fetchFont(
        'Inter',
        700,
        'End-to-end typesafe APIs made easy. 0123456789,',
      ),
      fetchGithubStars(),
      fetchNpmDownloads(),
      // fetchTwitterFollowers(),
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
              width="128px"
              height="128px"
              alt="tRPC logo"
            />
            <h1 tw="text-8xl ml-8 font-extrabold">tRPC</h1>
          </div>
          <div tw="flex flex-col items-center">
            <p tw="text-center pt-6 text-6xl font-extrabold">
              Move Fast and Break Nothing
            </p>
            <p tw="text-center pt-3 text-4xl text-zinc-300 font-bold mt-0">
              End-to-end typesafe APIs made easy.
            </p>
          </div>
          <div tw="flex items-center text-zinc-300">
            <div tw="flex items-center mx-8">
              <div tw="flex items-center mx-8">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  height={36}
                  fill="#fff"
                  viewBox="0 0 512 512"
                >
                  <path d="M256 32C132.3 32 32 134.9 32 261.7c0 101.5 64.2 187.5 153.2 217.9a17.56 17.56 0 003.8.4c8.3 0 11.5-6.1 11.5-11.4 0-5.5-.2-19.9-.3-39.1a102.4 102.4 0 01-22.6 2.7c-43.1 0-52.9-33.5-52.9-33.5-10.2-26.5-24.9-33.6-24.9-33.6-19.5-13.7-.1-14.1 1.4-14.1h.1c22.5 2 34.3 23.8 34.3 23.8 11.2 19.6 26.2 25.1 39.6 25.1a63 63 0 0025.6-6c2-14.8 7.8-24.9 14.2-30.7-49.7-5.8-102-25.5-102-113.5 0-25.1 8.7-45.6 23-61.6-2.3-5.8-10-29.2 2.2-60.8a18.64 18.64 0 015-.5c8.1 0 26.4 3.1 56.6 24.1a208.21 208.21 0 01112.2 0c30.2-21 48.5-24.1 56.6-24.1a18.64 18.64 0 015 .5c12.2 31.6 4.5 55 2.2 60.8 14.3 16.1 23 36.6 23 61.6 0 88.2-52.4 107.6-102.3 113.3 8 7.1 15.2 21.1 15.2 42.5 0 30.7-.3 55.5-.3 63 0 5.4 3.1 11.5 11.4 11.5a19.35 19.35 0 004-.4C415.9 449.2 480 363.1 480 261.7 480 134.9 379.7 32 256 32z" />
                </svg>
                <p tw="text-3xl font-bold ml-2">{ghStars}</p>
              </div>

              {/* <div tw="flex items-center mx-8">
                <svg
                  stroke="#fff"
                  fill="#fff"
                  viewBox="0 0 24 24"
                  height={32}
                  width={32}
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z" />
                </svg>
                <p tw="text-3xl font-bold ml-2">{twitterFollowers}</p>
              </div> */}

              <div tw="flex items-center mx-8">
                {/* <svg
                  xmlns="http://www.w3.org/2000/svg"
                  stroke="#fff"
                  fill="#fff"
                  height={48}
                  viewBox="0 0 512 512"
                >
                  <path d="M227.6 213.1H256v57.1h-28.4z" />
                  <path d="M0 156v171.4h142.2V356H256v-28.6h256V156zm142.2 142.9h-28.4v-85.7H85.3v85.7H28.4V184.6h113.8zm142.2 0h-56.9v28.6h-56.9V184.6h113.8zm199.2 0h-28.4v-85.7h-28.4v85.7h-28.4v-85.7H370v85.7h-56.9V184.6h170.7v114.3z" />
                </svg> */}
                <svg
                  role="img"
                  stroke="#fff"
                  fill="#fff"
                  height={32}
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path d="M1.763 0C.786 0 0 .786 0 1.763v20.474C0 23.214.786 24 1.763 24h20.474c.977 0 1.763-.786 1.763-1.763V1.763C24 .786 23.214 0 22.237 0zM5.13 5.323l13.837.019-.009 13.836h-3.464l.01-10.382h-3.456L12.04 19.17H5.113z" />
                </svg>
                <p tw="text-3xl font-bold ml-2">{npmDownloads}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    ),
    {
      headers: {
        'Cache-Control': 's-maxage=86400, stale-while-revalidate',
      },
      width: 1200,
      height: 600,
      fonts: [
        { name: 'Inter', data: inter800, weight: 800 },
        { name: 'Inter', data: inter700, weight: 700 },
      ],
    },
  );
};
