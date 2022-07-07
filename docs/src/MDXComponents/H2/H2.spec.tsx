import { render, screen } from '@testing-library/react';
import { H2 } from './H2';

describe('H2 mdx component', () => {
  it('should render the children', () => {
    render(<H2>Hello World</H2>);

    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });
});
