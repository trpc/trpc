/* eslint-disable @next/next/no-img-element */
import { sponsors } from '../../utils/sponsors';

export const Sponsors = () => {
  return (
    <section className="max-w-screen-xl px-4 mx-auto mt-28 sm:px-6 md:px-8 md:my-28">
      <h3 className="mb-3 text-3xl font-bold sm:text-4xl lg:text-5xl">
        Sponsors
      </h3>
      <p className="text-gray-400 mb-9 max-w-[80ch]">
        Thanks to all of our sponsors for supporting the long-term maintenance
        and innovation of tRPC, If you enjoy working with tRPC and want to
        support us consider giving a token appreciation by{' '}
        <a
          href="https://github.com/sponsors/KATT"
          className="underline text-cyan-500"
        >
          GitHub Sponsors!
        </a>
      </p>
      <div className="flex flex-wrap gap-4 mb-9">
        {sponsors.gold.map(({ imgSrc, link, name }) => {
          return (
            <a
              className="w-[250px]"
              href={link}
              key={name}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                className="rounded-md"
                src={imgSrc}
                alt={name}
                width="100%"
                height="100%"
              />
            </a>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 mb-9">
        {sponsors.silver.map(({ imgSrc, link, name }) => {
          return (
            <a
              className="w-[100px] h-[100px]"
              href={link}
              key={name}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                className="rounded-md"
                src={imgSrc}
                alt={name}
                width="100%"
                height="100%"
              />
            </a>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 mb-9">
        {sponsors.bronze.map(({ imgSrc, link, name }) => {
          return (
            <a
              className="w-[70px] h-[70px]"
              href={link}
              key={name}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                className="rounded-md"
                src={imgSrc}
                alt={name}
                width="100%"
                height="100%"
              />
            </a>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 mb-9 max-w-[75%]">
        {sponsors.individuals.map(({ imgSrc, link, name }) => {
          return (
            <a
              className="w-[50px] h-[50px]"
              href={link}
              key={name}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                className="rounded-md"
                src={imgSrc}
                alt={name}
                width="100%"
                height="100%"
              />
            </a>
          );
        })}
      </div>
    </section>
  );
};
