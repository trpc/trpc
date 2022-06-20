import { render, screen } from '@testing-library/react';
import { Navbar } from '.';

describe('Navbar', () => {
  it('should render the brand', () => {
    render(<Navbar />);

    expect(screen.getByText(/trpc/i)).toBeInTheDocument();
  });

  it('should render the links', () => {
    render(<Navbar />);

    expect(screen.getByText(/docs/i)).toBeInTheDocument();
    expect(screen.getByText(/quickstart/i)).toBeInTheDocument();
    expect(screen.getByText(/examples/i)).toBeInTheDocument();
  });
});
