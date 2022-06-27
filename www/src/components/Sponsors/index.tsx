/* eslint-disable @next/next/no-img-element */
import { sponsors } from '../../utils/sponsors';

export const Sponsors = () => {
  return (
    <section className="px-4 sm:px-6 md:px-8 max-w-screen-xl mx-auto mt-12 md:mt-28">
      <h3 className="font-bold text-3xl sm:text-4xl lg:text-5xl mb-3">Sponsors</h3>
      <p className="text-xl text-gray-500 mb-9">
        Thanks to all of our sponsors for supporting the long-term maintenance
        and innovation of tRPC, If you enjoy working with tRPC and want to
        support us consider giving a token appreciation by{' '}
        <a href="https://github.com/sponsors/KATT">GitHub Sponsors!</a>
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
              <img src={imgSrc} alt={name} width="100%" height="100%" />
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
              <img src={imgSrc} alt={name} width="100%" height="100%" />
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
              <img src={imgSrc} alt={name} width="100%" height="100%" />
            </a>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 mb-9">
        {sponsors.individuals.map(({ imgSrc, link, name }) => {
          return (
            <a
              className="w-[50px] h-[50px]"
              href={link}
              key={name}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img src={imgSrc} alt={name} width="100%" height="100%" />
            </a>
          );
        })}
      </div>
    </section>
  );
};
