import { render, screen } from '@testing-library/react';
import React, { ReactElement } from 'react';
import { NavLink } from '.';

// Mock the Link component and pass the props down to the child anchor tag
describe('NavLink component', () => {
  it('should render with the link', () => {
    render(<NavLink href="/">Home</NavLink>);

    expect(screen.getByRole('link')).toHaveAttribute('href', '/');
  });

  it('should render with children', () => {
    render(<NavLink href="/">Home</NavLink>);

    expect(screen.getByText(/home/i)).toBeInTheDocument();
  });

  it('should render an external link when the external prop is true', () => {
    render(
      <NavLink href="https://github.com/trpc/trpc" external>
        Github
      </NavLink>,
    );

    expect(screen.getByRole('link')).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link')).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
  });
});
