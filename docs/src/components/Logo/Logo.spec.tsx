import { render, screen } from '@testing-library/react';
import { Logo } from '.';

describe('Logo', () => {
  it('should render the logo', () => {
    render(<Logo />);

    expect(screen.getByTitle(/logo/i)).toBeInTheDocument();
  });
});
