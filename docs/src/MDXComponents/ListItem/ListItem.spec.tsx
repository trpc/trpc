import { render, screen } from '@testing-library/react';
import { ListItem } from './ListItem';

describe('ListItem mdx component', () => {
  it('should render the children', () => {
    render(<ListItem>Item 1</ListItem>);

    expect(screen.getByText('Item 1')).toBeInTheDocument();
  });
});
