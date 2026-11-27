import { useSyncExternalStore } from 'react';

/**
 * The site's colour theme: light, or dark when the visitor switches to it.
 *
 * On <html> the theme is the attribute data-theme ('light' | 'dark'); the
 * token values for each are in src/components/paper/paper.css. Light is the
 * default. Only a choice made with the switch is stored, so every page of the
 * site and later visits open in the theme the visitor chose.
 *
 * The inline script in index.html, deep-dive.html, and coming-soon.html
 * applies the stored choice before the page renders. It repeats the storage
 * key and the two theme colours below; change them together.
 */
export type ColorTheme = 'light' | 'dark';

const STORAGE_KEY = 'multiverse-color-theme';
/** The browser's own chrome (address bar on phones) takes the page colour of the theme. */
const THEME_COLOR: Record<ColorTheme, string> = { light: '#ffffff', dark: '#101216' };

const currentTheme = (): ColorTheme => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');

function applyTheme(theme: ColorTheme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}

/** Switch the theme and remember the choice. */
export function setColorTheme(theme: ColorTheme) {
  applyTheme(theme);
  try { window.localStorage.setItem(STORAGE_KEY, theme); } catch { /* The switch also works when browser storage is disabled. */ }
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  // A choice made in another tab of the site applies here too.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY && (event.newValue === 'light' || event.newValue === 'dark')) applyTheme(event.newValue);
  };
  window.addEventListener('storage', onStorage);
  return () => {
    observer.disconnect();
    window.removeEventListener('storage', onStorage);
  };
}

/** The current theme. Follows the switch, wherever on the page it is used. */
export function useColorTheme(): ColorTheme {
  return useSyncExternalStore(subscribe, currentTheme, () => 'light');
}
