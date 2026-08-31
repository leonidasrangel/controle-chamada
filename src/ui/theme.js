const KEY = 'cc.theme';

export function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
  }
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

export function watchSystemTheme() {
  const query = matchMedia('(prefers-color-scheme: dark)');
  query.addEventListener('change', (event) => {
    let hasChoice = false;
    try {
      hasChoice = localStorage.getItem(KEY) !== null;
    } catch {  }
    if (!hasChoice) document.documentElement.dataset.theme = event.matches ? 'dark' : 'light';
  });
}
