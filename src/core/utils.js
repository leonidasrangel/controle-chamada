/**
 * utils.js — funcoes puras de apoio: ids, datas, formatacao e agregacoes.
 *
 * Nada aqui toca no DOM nem no estado; e tudo testavel isoladamente.
 */

/* ---------------------------------------------------------------- IDs ---- */

/**
 * Gera um id curto e unico o suficiente para uso local.
 * Usa `crypto.randomUUID` quando disponivel e cai para um fallback simples.
 */
export function uid(prefix = 'id') {
  const rand =
    globalThis.crypto?.randomUUID?.().slice(0, 8) ??
    Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}

/* -------------------------------------------------------------- Datas ---- */

export const WEEKDAYS = [
  { value: 0, label: 'Domingo', short: 'Dom' },
  { value: 1, label: 'Segunda-feira', short: 'Seg' },
  { value: 2, label: 'Terca-feira', short: 'Ter' },
  { value: 3, label: 'Quarta-feira', short: 'Qua' },
  { value: 4, label: 'Quinta-feira', short: 'Qui' },
  { value: 5, label: 'Sexta-feira', short: 'Sex' },
  { value: 6, label: 'Sabado', short: 'Sab' },
];

/**
 * Datas circulam pela aplicacao sempre como string `YYYY-MM-DD`.
 * Isso evita o classico bug de fuso em que `new Date('2024-03-10')` vira
 * o dia 9 em fusos negativos como o do Brasil.
 */
export function toISODate(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Converte `YYYY-MM-DD` para um Date *local* (meia-noite no fuso do usuario). */
export function fromISODate(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function todayISO() {
  return toISODate(new Date());
}

/** Dia da semana (0 = domingo) de uma data ISO, sem sofrer com fuso. */
export function weekdayOf(iso) {
  return fromISODate(iso).getDay();
}

export function formatDate(iso, style = 'short') {
  if (!iso) return '—';
  const d = fromISODate(iso);
  if (style === 'long') {
    return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  }
  if (style === 'medium') {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return d.toLocaleDateString('pt-BR');
}

export function formatDateTime(timestamp) {
  if (!timestamp) return '—';
  return new Date(timestamp).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Soma (ou subtrai) dias de uma data ISO, devolvendo outra data ISO. */
export function addDays(iso, days) {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

/** Primeiro dia do mes de uma data ISO. */
export function startOfMonth(iso) {
  const d = fromISODate(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth(), 1));
}

/** Ultimo dia do mes de uma data ISO. */
export function endOfMonth(iso) {
  const d = fromISODate(iso);
  return toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

/** `true` se `iso` esta dentro do intervalo fechado [from, to]; limites vazios sao ignorados. */
export function isWithin(iso, from, to) {
  if (from && iso < from) return false;
  if (to && iso > to) return false;
  return true;
}

/** Diferenca em minutos entre dois horarios `HH:MM`. */
export function minutesBetween(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

/* --------------------------------------------------------- Formatacao ---- */

export function percent(value, digits = 1) {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toFixed(digits).replace('.', ',').replace(/,0$/, '')}%`;
}

/** Iniciais para o avatar de fallback (no maximo duas letras). */
export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts.at(-1)[0]).toUpperCase();
}

/**
 * Normaliza texto para busca: minusculas e sem acentos, para que
 * "jose" encontre "Jose" e "Josue" encontre "Josue".
 */
export function normalize(text = '') {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // remove as marcas de acentuacao combinantes
}

/** `true` se todos os termos da busca aparecem em algum dos campos. */
export function matchesQuery(query, ...fields) {
  const q = normalize(query).trim();
  if (!q) return true;
  const haystack = normalize(fields.filter(Boolean).join(' '));
  return q.split(/\s+/).every((term) => haystack.includes(term));
}

/* --------------------------------------------------------- Coletores ---- */

/** Indexa uma lista por id, para lookups O(1) durante a renderizacao. */
export function indexById(list = []) {
  return new Map(list.map((item) => [item.id, item]));
}

export function sortBy(list, key, dir = 'asc') {
  const factor = dir === 'desc' ? -1 : 1;
  return [...list].sort((a, b) => {
    const av = typeof key === 'function' ? key(a) : a[key];
    const bv = typeof key === 'function' ? key(b) : b[key];

    if (av == null && bv == null) return 0;
    if (av == null) return 1;   // valores vazios sempre no fim
    if (bv == null) return -1;

    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
    return String(av).localeCompare(String(bv), 'pt-BR', { numeric: true }) * factor;
  });
}

/** Agrupa itens em um Map, preservando a ordem de insercao. */
export function groupBy(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** Adia a execucao ate `wait` ms sem novas chamadas (usado na busca). */
export function debounce(fn, wait = 220) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

/** Clone profundo seguro para os dados simples usados aqui. */
export function deepClone(value) {
  return globalThis.structuredClone
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

/* ------------------------------------------------------------ Dominio ---- */

/** Status de presenca e seus rotulos/estilos, em um unico lugar. */
export const STATUS = {
  P: { key: 'P', label: 'Presente',  badge: 'badge-present', tone: 'good' },
  F: { key: 'F', label: 'Ausente',   badge: 'badge-absent',  tone: 'bad'  },
  J: { key: 'J', label: 'Justificada', badge: 'badge-excused', tone: 'warn' },
};

export const STATUS_KEYS = Object.keys(STATUS);

/**
 * Conta P/F/J em um mapa de registros `{ studentId: { status } }`.
 * Retorna tambem a taxa de presenca, em que faltas justificadas
 * NAO contam como presenca (regra comum na maioria das redes de ensino).
 */
export function tallyRecords(records = {}) {
  const tally = { P: 0, F: 0, J: 0, total: 0 };
  for (const record of Object.values(records)) {
    if (record?.status in tally) tally[record.status] += 1;
    tally.total += 1;
  }
  tally.rate = tally.total ? (tally.P / tally.total) * 100 : 0;
  return tally;
}
