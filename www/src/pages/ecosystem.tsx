import Layout from '@theme/Layout';
import React from 'react';
import {
  EcosystemItem,
  categories,
  categoryLabels,
  ecosystemItems,
} from '../utils/ecosystemData';

const EcosystemCard = ({
  title,
  description,
  url,
  authorName,
  authorUrl,
}: EcosystemItem) => {
  return (
    <a
      className="flex flex-col text-white hover:text-white p-2 border-gray-500 border-[0.5px] rounded-md hover:no-underline hover:bg-zinc-800 transition-colors"
      target="_blank"
      rel="noreferrer"
      href={url}
    >
      <h3 className="text-lg">{title}</h3>
      <p>{description}</p>

      <div className="flex-grow" />

      <div className="mt-4">
        <a
          className="text-gray-300 hover:no-underline hover:text-gray-300"
          target="_blank"
          rel="noreferrer"
          href={authorUrl}
        >
          by {authorName}
        </a>
      </div>
    </a>
  );
};

const EcosystemList = (props: { items: EcosystemItem[] }) => {
  return (
    <div className="flex flex-col gap-2">
      {categories.map((category) => {
        const items = props.items.filter((item) =>
          item.categories.includes(category),
        );

        return (
          <div key={category} id={category}>
            <h2 className="text-2xl">{categoryLabels[category]}</h2>

            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-5">
              {items.map((item) => (
                <EcosystemCard key={item.title} {...item} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};

const EcosystemContent = () => {
  return (
    <main className="container px-6 mx-auto">
      <h1 className="m-4 text-2xl font-extrabold leading-tight tracking-tight text-center whitespace-pre-wrap md:text-3xl lg:text-4xl xl:text-5xl">
        Ecosystem
      </h1>

      <p className="text-center">
        Collection of resources on tRPC.{' '}
        <a href="https://github.com/trpc/trpc/blob/main/www/src/utils/ecosystemData.ts">
          Edit this page
        </a>{' '}
        and add your own projects!
      </p>

      <EcosystemList items={ecosystemItems} />
    </main>
  );
};
const EcosystemPage = () => {
  return (
    <>
      <Layout title="Ecosystem" description="tRPC ecosystem">
        <EcosystemContent />
      </Layout>
    </>
  );
};
export default EcosystemPage;
