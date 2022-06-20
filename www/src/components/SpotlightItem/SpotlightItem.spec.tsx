import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { SpotlightItem } from '.';

// Mock the Link component and pass the props down to the child anchor tag
describe('SpotlightItem', () => {
  it('should render with all of its contents', async () => {
    render(<SpotlightItem
      imageSrc="/test.svg"
      header="test header"
      description="test description"
    />);

    const image = screen.getByRole('img');

    expect(screen.getByText('test header')).toBeInTheDocument()
    expect(screen.getByText('test description')).toBeInTheDocument()
    await waitFor(() => {
      expect(image).toHaveAttribute('src', '/test.svg');
    });
  });
});
