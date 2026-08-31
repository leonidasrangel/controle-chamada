/**
 * theme.js — alternancia entre tema claro e escuro.
 *
 * A escolha do usuario e gravada em `localStorage` e reaplicada por um script
 * inline no `index.html` antes da primeira pintura. Se o usuario nunca escolheu
 * nada, seguimos a preferencia do sistema — inclusive quando ela muda ao vivo.
 */

const KEY = 'cc.theme';

export function currentTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Sem persistencia (modo privado): o tema vale so para esta sessao
  }
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

/** Acompanha o sistema enquanto o usuario nao fizer uma escolha explicita. */
export function watchSystemTheme() {
  const query = matchMedia('(prefers-color-scheme: dark)');
  query.addEventListener('change', (event) => {
    let hasChoice = false;
    try {
      hasChoice = localStorage.getItem(KEY) !== null;
    } catch { /* ignora */ }
    if (!hasChoice) document.documentElement.dataset.theme = event.matches ? 'dark' : 'light';
  });
}
