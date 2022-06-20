import { NextPage } from 'next';
import { Navbar } from '../components';

const Home: NextPage = () => {
  return (
    <div className="px-12 py-8">
      <Navbar />
    </div>
  );
};

export default Home;
