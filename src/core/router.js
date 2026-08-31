/**
 * router.js — roteador por hash.
 *
 * Usa `location.hash` (e nao a History API) porque a aplicacao precisa rodar
 * tanto servida por HTTP quanto aberta de um diretorio qualquer, sem depender
 * de o servidor reescrever rotas.
 *
 * Formato: `#/rota?chave=valor&outra=valor`
 */

const routes = new Map();
let notFound = () => '<div class="empty"><h3>Pagina nao encontrada</h3></div>';
let onNavigate = () => {};

/** Registra uma tela. `handler(params) -> void` monta o conteudo. */
export function route(path, handler) {
  routes.set(path, handler);
}

export function setNotFound(handler) {
  notFound = handler;
}

/** Callback disparado a cada navegacao concluida (usado para marcar o menu). */
export function onRouteChange(handler) {
  onNavigate = handler;
}

/** Analisa o hash atual em `{ path, params }`. */
export function parseHash(hash = location.hash) {
  const clean = hash.replace(/^#\/?/, '');
  const [rawPath, rawQuery = ''] = clean.split('?');
  const path = `/${rawPath}`.replace(/\/+$/, '') || '/';
  return { path, params: Object.fromEntries(new URLSearchParams(rawQuery)) };
}

/** Monta um hash a partir de rota e parametros (ignora valores vazios). */
export function buildHash(path, params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value != null && value !== ''),
  ).toString();
  return `#${path}${query ? `?${query}` : ''}`;
}

/** Navega para uma rota. `replace` evita empilhar no historico. */
export function navigate(path, params = {}, { replace = false } = {}) {
  const hash = buildHash(path, params);
  if (location.hash === hash) {
    // Mesmo hash nao dispara hashchange; forca o re-render manualmente
    resolve();
    return;
  }
  if (replace) location.replace(hash);
  else location.hash = hash;
}

/**
 * Atualiza apenas os parametros da rota atual, sem empilhar historico.
 * E o que os filtros das telas usam para ficarem "linkaveis".
 */
export function setParams(patch) {
  const { path, params } = parseHash();
  navigate(path, { ...params, ...patch }, { replace: true });
}

/** Resolve o hash atual e executa o handler correspondente. */
export function resolve() {
  const { path, params } = parseHash();
  const handler = routes.get(path) ?? notFound;
  handler(params);
  onNavigate(path, params);
}

/** Liga o roteador. Redireciona para `fallback` quando nao ha hash. */
export function startRouter(fallback = '/dashboard') {
  window.addEventListener('hashchange', resolve);
  if (!location.hash || location.hash === '#') {
    location.replace(buildHash(fallback));
  }
  resolve();
}
