import Head from '@docusaurus/Head';
import Layout from '@theme/Layout';
import React from 'react';

const Asset = (props: {
  title: string;
  description: string;
  src: string;
  imgClassName: string;
}) => {
  return (
    <div className="relative flex flex-col">
      <img
        className={`grow self-center ${props.imgClassName}`}
        src={props.src}
      />
      <div className="mt-2">
        <p className="w-full font-semibold">{props.title}</p>
        <p>{props.description}</p>
      </div>
    </div>
  );
};

const InfoCard = (props: {
  className: string;
  title: string;
  value: string;
}) => {
  return (
    <div
      className={`relative h-28 w-full rounded-lg text-white ${props.className}`}
    >
      <div className="absolute bottom-0 m-2 flex w-full text-xl">
        <p>{props.title}</p>
        <button
          onClick={() => void navigator.clipboard.writeText(props.value)}
          className={`ml-auto mr-4 hover:text-gray-300`}
          style={{
            fontFamily: props.value,
          }}
        >
          {props.value}
        </button>
      </div>
    </div>
  );
};
const PressContent = () => {
  return (
    <main className="container mx-auto px-6">
      <h1 className="m-4 whitespace-pre-wrap text-center text-2xl font-extrabold leading-tight tracking-tight md:text-3xl lg:text-4xl xl:text-5xl">
        Media Assets
      </h1>

      <div className="sm:flex sm:space-x-4">
        <div className="-space-y-8 sm:w-1/3 lg:w-1/4">
          <InfoCard
            className="z-10 bg-primary"
            title="Primary"
            value="#398ccb"
          />
          <InfoCard className="bg-black " title="Font" value="Inter" />
        </div>

        <div className="my-4 grid grid-cols-3 gap-4 sm:mt-0 sm:w-2/3 lg:w-3/4">
          <Asset
            title="Logo"
            description="Please use this in most circumstances."
            src="img/logo.svg"
            imgClassName="w-20"
          />
          <Asset
            title="Wordmark Logo Light"
            description="Please use this on light backgrounds."
            src="img/logo-text-black.svg"
            imgClassName="bg-white p-4 rounded-md"
          />
          <Asset
            title="Wordmark Logo Dark"
            description="Please use this on dark backgrounds."
            src="img/logo-text-white.svg"
            imgClassName="bg-black p-4 rounded-md"
          />
        </div>
      </div>
    </main>
  );
};
const PressPage = () => {
  return (
    <>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin={'true'}
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </Head>
      <Layout title="Media" description="tRPC media assets">
        <PressContent />
      </Layout>
    </>
  );
};
export default PressPage;
