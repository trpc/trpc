import Error from 'next/error';
import { NextPageContext } from 'next';

interface ErrorComponentProps {
  statusCode?: number;
}

function ErrorComponent({ statusCode }: ErrorComponentProps): JSX.Element {
  return (
    <p>
      {statusCode
        ? `An error ${statusCode} occurred on server`
        : 'An error occurred on client'}
    </p>
  );
}

ErrorComponent.getInitialProps = ({ res, err }: NextPageContext) => {
  console.log('hello me');
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default ErrorComponent;
