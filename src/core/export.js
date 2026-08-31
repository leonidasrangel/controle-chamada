import { downloadFile, escapeHtml } from './dom.js';
import { formatDate, normalize } from './utils.js';

const BOM = '﻿';

function csvCell(value) {
  const text = value == null ? '' : String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCSV(headers, rows) {
  const lines = [headers.map(csvCell).join(';')];
  for (const row of rows) lines.push(row.map(csvCell).join(';'));
  return BOM + lines.join('\r\n');
}

export function downloadCSV(filename, headers, rows) {
  downloadFile(filename, toCSV(headers, rows), 'text/csv;charset=utf-8');
}

const PRINT_CSS = `
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
    font-size: 11px; color: #0f172a; margin: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  header { border-bottom: 2px solid #4f46e5; padding-bottom: 10px; margin-bottom: 16px; }
  header h1 { font-size: 17px; margin: 0 0 3px; letter-spacing: -.02em; }
  header .meta { font-size: 10px; color: #64748b; }
  .filters { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
  .filters span {
    padding: 3px 9px; border-radius: 999px;
    background: #eef2ff; color: #4338ca; font-size: 9.5px; font-weight: 600;
  }
  .kpis { display: flex; gap: 10px; margin-bottom: 16px; }
  .kpis div { flex: 1; padding: 9px 11px; border: 1px solid #e2e8f0; border-radius: 8px; }
  .kpis b { display: block; font-size: 16px; letter-spacing: -.02em; }
  .kpis small { color: #64748b; font-size: 9.5px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  thead th {
    background: #f1f5f9; font-size: 9px; text-transform: uppercase;
    letter-spacing: .05em; color: #475569;
  }
  tbody tr:nth-child(even) { background: #fafbfc; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .tag { padding: 1px 6px; border-radius: 999px; font-size: 9px; font-weight: 600; }
  .tag-P { background: #ecfdf5; color: #047857; }
  .tag-F { background: #fff1f2; color: #be123c; }
  .tag-J { background: #fffbeb; color: #b45309; }
  footer {
    margin-top: 18px; padding-top: 8px; border-top: 1px solid #e2e8f0;
    font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between;
  }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
`;

export function printReport({ title, filters = [], kpis = [], headers, rows }) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, {
    position: 'fixed', right: '0', bottom: '0',
    width: '0', height: '0', border: '0', visibility: 'hidden',
  });
  document.body.append(frame);

  const generatedAt = new Date().toLocaleString('pt-BR');

  const markup = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>${PRINT_CSS}</style></head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <div class="meta">Controle de Chamada &middot; emitido em ${escapeHtml(generatedAt)}</div>
  </header>

  ${filters.length ? `<div class="filters">${filters.map((f) => `<span>${escapeHtml(f)}</span>`).join('')}</div>` : ''}

  ${kpis.length ? `<div class="kpis">${kpis.map((k) =>
    `<div><b>${escapeHtml(k.value)}</b><small>${escapeHtml(k.label)}</small></div>`).join('')}</div>` : ''}

  <table>
    <thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead>
    <tbody>
      ${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table>

  <footer>
    <span>${escapeHtml(title)}</span>
    <span>${rows.length} registro(s)</span>
  </footer>
</body></html>`;

  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(markup);
  doc.close();

  frame.contentWindow.addEventListener('load', () => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 1500);
  }, { once: true });
}

export function statusTag(status) {
  return status in { P: 1, F: 1, J: 1 }
    ? `<span class="tag tag-${status}">${status}</span>`
    : '—';
}

export function reportFilename(base, extension) {
  const stamp = formatDate(new Date().toISOString().slice(0, 10)).replace(/\//g, '-');
  const safe = normalize(base).replace(/[^\w-]+/g, '-');
  return `${safe}-${stamp}.${extension}`;
}
