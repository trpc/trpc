import type { NextApiRequest, NextApiResponse } from 'next';

export default (req: NextApiRequest, res: NextApiResponse) => {
  res.status(200).json({ 'process.env.VERCEL_URL': process.env.VERCEL_URL });
};
