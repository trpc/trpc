import { useHistory } from '@docusaurus/router';
import Logo from '@theme-original/Navbar/Logo';
import React from 'react';

export default function LogoWrapper(props) {
  const history = useHistory();

  return (
    <div
      onContextMenu={(e) => {
        e.preventDefault();
        history.push({ pathname: '/media' });
      }}
    >
      <Logo {...props} />
    </div>
  );
}
