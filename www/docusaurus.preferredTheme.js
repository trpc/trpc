import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

const darkTheme = 'dark';
const lightTheme = 'light';

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
  const themeAttribute = "data-theme";

  observer.observe(rootElement, {
    attributeFilter: [themeAttribute, "class"],
    subtree: false,
  });

  // const themeClassNames = new Map([
  //   ["dark", dark],
  //   ["light", light],
  // ]);


  function onThemeOrClassChanged() {
    console.log('onThemeOrClassChanged');
  }

  const setInitialTheme = () => {
    const newTheme = resolvePreferedTheme();
    htmlElement?.setAttribute('data-theme', newTheme);
  };

  setInitialTheme();


  const colorSchemeChangeListener = (e) => {
    console.log('colorSchemeChangeListener')
    const newTheme = e.matches ? darkTheme : lightTheme;
    htmlElement?.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };
  mediaMatch.addEventListener('change', colorSchemeChangeListener);


// function createClassChanger(element: HTMLElement) {
//   let currentClassName: string | undefined;
//   return function changeClass(newClassName?: string) {
//     if (newClassName && element.classList.contains(newClassName)) {
//       return;
//     }
//     if (currentClassName) {
//       element.classList.remove(currentClassName);
//     }
//     if (newClassName) {
//       element.classList.add(newClassName);
//     }
//     currentClassName = newClassName;
//   };
}
