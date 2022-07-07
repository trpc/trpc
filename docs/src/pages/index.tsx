import { Hero } from '@/components/Hero';
import { Navbar } from '@/components/Navbar';
import { Sponsors } from '@/components/Sponsors';
import { Spotlight } from '@/components/Spotlight';
import { SpotlightItem } from '@/components/SpotlightItem';
import { NextPage } from 'next';

const Home: NextPage = () => {
  return (
    <>
      <Navbar />
      <Hero />
      <Spotlight header="Next Generation APIs">
        <SpotlightItem
          imageSrc="/wizard.svg"
          header="Automatic typesafety"
          description="Automatic typesafety & autocompletion inferred from your API-paths, their input data, & outputs."
        />
        <SpotlightItem
          imageSrc="/car.svg"
          header="Light & Snappy DX"
          description="No code generation, run-time bloat, or build pipeline. Zero dependencies & a tiny client-side footprint."
        />
        <SpotlightItem
          imageSrc="/star.svg"
          header="Add to existing brownfield project"
          description="Easy to add to your existing brownfield project with adapters for Connect/Express/Next.js."
        />
      </Spotlight>
      <Sponsors />
    </>
  );
};

export default Home;
