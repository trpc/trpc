import { render, screen } from '@testing-library/react';
import { Spotlight } from '.';

describe('Spotlight', () => {
  it('should render the header and children', () => {
    render(<Spotlight header='test header'><div>child</div></Spotlight>);

    expect(screen.getByText("test header")).toBeInTheDocument();
    expect(screen.getByText("child")).toBeInTheDocument();
  });
});