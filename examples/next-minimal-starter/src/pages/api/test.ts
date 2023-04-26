import { NextApiRequest, NextApiResponse } from 'next';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function (req: NextApiRequest, res: NextApiResponse) {
  console.log('body', req.body);

  res.send('what');
}
