import { useState, useEffect, useCallback } from 'react';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'myDailyFlow_theme';

/** Read persisted preference or default to 'dark' (preserves current look). */
function getStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  return 'dark';
}

/** Apply the data-theme attribute on <html> so CSS variables resolve correctly. */
function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Theme management hook.
 *
 * - Reads the user's preference from localStorage (default: 'dark')
 * - Sets `data-theme` on <html> to 'light', 'dark', or 'system'
 * - For 'system', the CSS @media rule inside index.css handles the switch
 * - Persists the choice on change
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
  }, []);

  // Apply on mount
  useEffect(() => {
    applyTheme(theme);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { theme, setTheme } as const;
}
