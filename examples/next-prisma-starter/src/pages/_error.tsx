import Error from 'next/error';
import { NextPageContext } from 'next';

interface ErrorComponentProps {
  statusCode?: number;
}

function ErrorComponent({
  statusCode,
  ...other
}: ErrorComponentProps): JSX.Element {
  console.log('other', other);
  return (
    <p>
      {statusCode
        ? `An error ${statusCode} occurred on server`
        : 'An error occurred on client'}
    </p>
  );
}

ErrorComponent.getInitialProps = ({ res, err }: NextPageContext) => {
  console.log('hello me', res);
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default ErrorComponent;
