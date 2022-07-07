import { render, screen } from '@testing-library/react';
import { ListItem } from '../ListItem/ListItem';
import { UnorderedList } from './UnorderedList';

describe('UnorderedList mdx component', () => {
  it('should render the children', () => {
    render(
      <UnorderedList>
        <ListItem>Item 1</ListItem>
      </UnorderedList>,
    );

    expect(screen.getByText('Item 1')).toBeInTheDocument();
  });
});
