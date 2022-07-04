import { render, screen } from '@testing-library/react';
import { H1 } from './H1';

describe('H1 mdx component', () => {
  it('should render the children', () => {
    render(<H1>Hello World</H1>);

    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });
});
