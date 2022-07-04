import { render, screen } from '@testing-library/react';
import { Paragraph } from './Paragraph';

describe('Paragraph mdx component', () => {
  it('should render the children', () => {
    render(<Paragraph>Hello World</Paragraph>);

    expect(screen.getByText('Hello World')).toBeInTheDocument();
  });
});
