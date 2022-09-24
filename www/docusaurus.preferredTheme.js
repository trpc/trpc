import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

const darkTheme = 'dark';
const lightTheme = 'light';

if (ExecutionEnvironment.canUseDOM) {
  const mediaMatch = window.matchMedia('(prefers-color-scheme: dark)');
  const htmlElement = document.querySelector('html');

  const setInitialTheme = () => {
    const newTheme = mediaMatch.matches ? darkTheme : lightTheme;
    htmlElement?.setAttribute('data-theme', newTheme);
  };
  setInitialTheme();

  const colorSchemeChangeListener = (e) => {
    const newTheme = e.matches ? darkTheme : lightTheme;
    htmlElement?.setAttribute('data-theme', newTheme);
  };
  mediaMatch.addEventListener('change', colorSchemeChangeListener);
}
