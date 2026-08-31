const routes = new Map();
let notFound = () => '<div class="empty"><h3>Pagina nao encontrada</h3></div>';
let onNavigate = () => {};

export function route(path, handler) {
  routes.set(path, handler);
}

export function setNotFound(handler) {
  notFound = handler;
}

export function onRouteChange(handler) {
  onNavigate = handler;
}

export function parseHash(hash = location.hash) {
  const clean = hash.replace(/^#\/?/, '');
  const [rawPath, rawQuery = ''] = clean.split('?');
  const path = `/${rawPath}`.replace(/\/+$/, '') || '/';
  return { path, params: Object.fromEntries(new URLSearchParams(rawQuery)) };
}

export function buildHash(path, params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value != null && value !== ''),
  ).toString();
  return `#${path}${query ? `?${query}` : ''}`;
}

export function navigate(path, params = {}, { replace = false } = {}) {
  const hash = buildHash(path, params);
  if (location.hash === hash) {
    resolve();
    return;
  }
  if (replace) location.replace(hash);
  else location.hash = hash;
}

export function setParams(patch) {
  const { path, params } = parseHash();
  navigate(path, { ...params, ...patch }, { replace: true });
}

export function resolve() {
  const { path, params } = parseHash();
  const handler = routes.get(path) ?? notFound;
  handler(params);
  onNavigate(path, params);
}

export function startRouter(fallback = '/dashboard') {
  window.addEventListener('hashchange', resolve);
  if (!location.hash || location.hash === '#') {
    location.replace(buildHash(fallback));
  }
  resolve();
}
