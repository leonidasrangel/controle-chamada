import { icon } from '../core/icons.js';
import { $, $$, delegate, e, html } from '../core/dom.js';
import { clamp, matchesQuery, sortBy } from '../core/utils.js';

export function createTable({
  columns,
  rows,
  searchFields = [],
  searchPlaceholder = 'Buscar...',
  pageSize = 10,
  emptyTitle = 'Nenhum registro',
  emptyMessage = 'Cadastre o primeiro item para comecar.',
  emptyIcon = 'inbox',
  actions = null,
  toolbarExtra = '',
  onRowClick = null,
}) {
  const state = {
    query: '',
    sortKey: columns.find((column) => column.sortable)?.key ?? null,
    sortDir: 'asc',
    page: 1,
  };

  const element = html(`
    <div class="card">
      <div class="card-header">
        <div class="field input-icon" style="max-width: 320px; flex: 1 1 240px;">
          ${icon('search')}
          <input type="search" class="input" data-search
                 placeholder="${e(searchPlaceholder)}" aria-label="${e(searchPlaceholder)}" />
        </div>
        <div class="row wrap gap-8 grow" style="justify-content: flex-end;">${toolbarExtra}</div>
      </div>
      <div class="card-body flush">
        <div class="table-wrap" data-body></div>
      </div>
      <div data-footer></div>
    </div>
  `);

  const bodyHost = $('[data-body]', element);
  const footerHost = $('[data-footer]', element);
  const searchInput = $('[data-search]', element);

  function visibleRows() {
    const all = typeof rows === 'function' ? rows() : rows;

    const filtered = state.query && searchFields.length
      ? all.filter((row) => matchesQuery(state.query, ...searchFields.map((field) =>
          typeof field === 'function' ? field(row) : row[field])))
      : all;

    if (!state.sortKey) return filtered;

    const column = columns.find((c) => c.key === state.sortKey);
    return sortBy(filtered, column?.sortValue ?? state.sortKey, state.sortDir);
  }

  function renderHead() {
    const cells = columns.map((column) => {
      const align = column.align === 'right' ? ' class="text-right"' : '';
      if (!column.sortable) return `<th${align}>${e(column.label)}</th>`;

      const active = state.sortKey === column.key;
      const arrow = !active ? 'chevrons-up-down' : state.sortDir === 'asc' ? 'arrow-up' : 'arrow-down';
      return `<th${align}>
        <button type="button" class="th-sort" data-sort="${e(column.key)}" data-active="${active}">
          ${e(column.label)}${icon(arrow, { size: 13 })}
        </button>
      </th>`;
    });

    if (actions) cells.push('<th class="text-right no-print">Acoes</th>');
    return `<thead><tr>${cells.join('')}</tr></thead>`;
  }

  function renderBody(pageRows) {
    const body = pageRows.map((row) => {
      const cells = columns.map((column) => {
        const align = column.align === 'right' ? ' class="text-right"' : '';
        const content = column.render ? column.render(row) : e(row[column.key] ?? '—');
        return `<td${align}>${content}</td>`;
      });

      if (actions) cells.push(`<td class="no-print"><div class="row-actions">${actions(row)}</div></td>`);
      return `<tr data-row-id="${e(row.id)}">${cells.join('')}</tr>`;
    });

    return `<table class="table">${renderHead()}<tbody>${body.join('')}</tbody></table>`;
  }

  function renderEmpty() {
    const searching = Boolean(state.query);
    return `
      <div class="empty">
        <div class="icon-wrap">${icon(searching ? 'search' : emptyIcon, { size: 22 })}</div>
        <h3>${searching ? 'Nenhum resultado' : e(emptyTitle)}</h3>
        <p>${searching
          ? `Nada encontrado para "${e(state.query)}". Tente outro termo.`
          : e(emptyMessage)}</p>
      </div>`;
  }

  function renderFooter(total, totalPages) {
    if (total <= pageSize) return '';

    const first = (state.page - 1) * pageSize + 1;
    const last = Math.min(state.page * pageSize, total);

    const start = clamp(state.page - 2, 1, Math.max(1, totalPages - 4));
    const numbers = Array.from({ length: Math.min(5, totalPages) }, (_, i) => start + i)
      .filter((page) => page <= totalPages);

    return `
      <div class="pagination no-print">
        <span>Exibindo <b>${first}–${last}</b> de <b>${total}</b></span>
        <div class="pages">
          <button class="page-btn" data-page="${state.page - 1}"
                  ${state.page === 1 ? 'disabled' : ''} aria-label="Pagina anterior">
            ${icon('chevron-left', { size: 15 })}
          </button>
          ${numbers.map((page) => `
            <button class="page-btn" data-page="${page}"
                    ${page === state.page ? 'aria-current="page"' : ''}>${page}</button>`).join('')}
          <button class="page-btn" data-page="${state.page + 1}"
                  ${state.page === totalPages ? 'disabled' : ''} aria-label="Proxima pagina">
            ${icon('chevron-right', { size: 15 })}
          </button>
        </div>
      </div>`;
  }

  function refresh() {
    const data = visibleRows();
    const totalPages = Math.max(1, Math.ceil(data.length / pageSize));

    state.page = clamp(state.page, 1, totalPages);

    const pageRows = data.slice((state.page - 1) * pageSize, state.page * pageSize);

    bodyHost.innerHTML = data.length ? renderBody(pageRows) : renderEmpty();
    footerHost.innerHTML = renderFooter(data.length, totalPages);
  }

  searchInput.addEventListener('input', (event) => {
    state.query = event.target.value;
    state.page = 1;
    refresh();
  });

  delegate(element, 'click', '[data-sort]', (_event, target) => {
    const key = target.dataset.sort;
    if (state.sortKey === key) {
      state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      state.sortKey = key;
      state.sortDir = 'asc';
    }
    refresh();
  });

  delegate(element, 'click', '[data-page]', (_event, target) => {
    state.page = Number(target.dataset.page);
    refresh();
  });

  if (onRowClick) {
    delegate(element, 'click', 'tbody tr', (event, target) => {
      if (event.target.closest('button, a')) return;
      onRowClick(target.dataset.rowId, event);
    });
  }

  refresh();

  return {
    element,
    refresh,
    reset() {
      state.query = '';
      state.page = 1;
      searchInput.value = '';
      refresh();
    },
    currentRows: visibleRows,
  };
}

export function bulkDeleteButton(label, count) {
  return `
    <button type="button" class="btn btn-sm btn-danger" data-bulk-delete
            ${count ? '' : 'disabled'} aria-label="${e(label)}">
      ${icon('trash-2', { size: 15 })} ${e(label)}
    </button>`;
}

export function actionButton(iconName, { action, id, label, tone = '' } = {}) {
  return `<button type="button" class="btn btn-ghost btn-icon btn-sm ${tone}"
    data-action="${e(action)}" data-id="${e(id)}" data-tip="${e(label)}" aria-label="${e(label)}">
    ${icon(iconName, { size: 15 })}
  </button>`;
}

export function rowIds(element) {
  return $$('tbody tr', element).map((tr) => tr.dataset.rowId);
}
