import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

const darkTheme = 'dark';
const lightTheme = 'light';
const DARK_THEME_SELECTOR = '.shiki.github-dark';
const LIGHT_THEME_SELECTOR = '.shiki.min-light';

if (ExecutionEnvironment.canUseDOM) {
  const storedPreference = localStorage.getItem('theme');
  const mediaMatch = window.matchMedia('(prefers-color-scheme: dark)');
  const htmlElement = document.querySelector('html');

  const resolvePreferedTheme = () => {
    if (storedPreference) return storedPreference;
    if (mediaMatch.matches) return darkTheme;
    return lightTheme;
  };

  const observer = new MutationObserver(onThemeOrClassChanged);
  const rootElement = document.documentElement;
  const themeAttribute = 'data-theme';

  observer.observe(rootElement, {
    attributeFilter: [themeAttribute, 'class'],
    subtree: false,
  });

  function makeElementVisible(selector) {
    const codeBlocks = document.querySelectorAll(selector);
    if (codeBlocks) {
      codeBlocks.forEach((el) => {
        el.style.display = 'block';
      });
    }
  }

  function makeElementInvisible(selector) {
    const codeBlocks = document.querySelectorAll(selector);
    if (codeBlocks) {
      codeBlocks.forEach((el) => {
        el.style.display = 'none';
      });
    }
  }

  function onThemeOrClassChanged() {
    const theme = htmlElement?.getAttribute('data-theme');
    if (theme === darkTheme) {
      makeElementVisible(DARK_THEME_SELECTOR);
      makeElementInvisible(LIGHT_THEME_SELECTOR);
    }

    if (theme === lightTheme) {
      makeElementVisible(LIGHT_THEME_SELECTOR);
      makeElementInvisible(DARK_THEME_SELECTOR);
    }
  }

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
