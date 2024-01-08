import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

const lightTheme = themes.github;
const darkTheme = themes.dracula;

if (ExecutionEnvironment.canUseDOM) {
  const storedPreference = localStorage.getItem('theme');
  const mediaMatch = window.matchMedia('(prefers-color-scheme: dark)');
  const htmlElement = document.querySelector('html');

  const resolvePreferedTheme = () => {
    if (storedPreference) return storedPreference;
    if (mediaMatch.matches) return darkTheme;
    return lightTheme;
  };

  const setInitialTheme = () => {
    const newTheme = resolvePreferedTheme();
    htmlElement?.setAttribute('data-theme', newTheme);
  };

  setInitialTheme();

  const colorSchemeChangeListener = (e) => {
    const newTheme = e.matches ? darkTheme : lightTheme;
    htmlElement?.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };
  mediaMatch.addEventListener('change', colorSchemeChangeListener);
}
