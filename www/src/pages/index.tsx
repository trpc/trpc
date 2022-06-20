import { Navbar } from '@/components/Navbar';
import { NextPage } from 'next';

const Home: NextPage = () => {
  return (
    <div className="px-12 py-8">
      <Navbar />
    </div>
  );
};

export default Home;
