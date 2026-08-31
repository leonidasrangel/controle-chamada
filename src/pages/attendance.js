/**
 * attendance.js — modulo de chamada interativa (funcionalidade central).
 *
 * Fluxo: o professor escolhe turma, disciplina e data no topo; a lista de
 * alunos aparece com os tres botoes de status; ao salvar, os registros vao
 * para o store e a chamada pode ser bloqueada.
 *
 * Duas decisoes que orientam o codigo daqui:
 *
 * 1. Os cliques em P/F/J alteram apenas um rascunho em memoria (`draft`) e
 *    repintam somente a linha afetada. Repintar a lista inteira a cada toque
 *    perderia o foco do teclado e faria a animacao piscar em turmas grandes.
 *
 * 2. Os filtros vivem na URL (`#/chamada?turma=...&data=...`), entao a tela e
 *    recarregavel e compartilhavel, e o botao "voltar" do navegador funciona.
 */

import * as store from '../core/store.js';
import { icon } from '../core/icons.js';
import { $, $$, delegate, e, render } from '../core/dom.js';
import { navigate, setParams } from '../core/router.js';
import { openModal } from '../ui/modal.js';
import { toastError, toastSuccess } from '../ui/toast.js';
import {
  STATUS, STATUS_KEYS, formatDate, formatDateTime, initials,
  percent, tallyRecords, todayISO, weekdayOf, WEEKDAYS,
} from '../core/utils.js';

/** Rascunho da chamada aberta: `{ [studentId]: { status, note } }`. */
let draft = {};
/** Snapshot do que esta gravado, para detectar alteracoes nao salvas. */
let savedSnapshot = '';
let context = { classId: '', subjectId: '', date: todayISO() };

/* --------------------------------------------------------- Renderizacao -- */

export function renderAttendance(host, params) {
  const classes = store.classes.list();

  // Resolve o contexto a partir da URL, caindo para padroes sensatos
  const classId = params.turma && classes.some((c) => c.id === params.turma)
    ? params.turma
    : classes[0]?.id ?? '';

  const subjects = classId ? store.subjectsOfClass(classId) : [];
  const subjectId = params.disciplina && subjects.some((s) => s.id === params.disciplina)
    ? params.disciplina
    : subjects[0]?.id ?? '';

  const date = params.data || todayISO();
  context = { classId, subjectId, date };

  render(host, `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Chamada</h1>
          <p>Selecione a aula e registre a presenca dos alunos.</p>
        </div>
      </div>

      ${renderToolbar(classes, subjects)}
      <div data-roster-host></div>
    </div>
  `);

  bindToolbar(host);
  renderRoster(host);
}

function renderToolbar(classes, subjects) {
  const { classId, subjectId, date } = context;

  return `
    <div class="toolbar">
      <div class="field">
        <label for="filter-class">Turma</label>
        <select id="filter-class" class="select" data-filter="turma">
          ${classes.length
            ? classes.map((c) => `<option value="${e(c.id)}" ${c.id === classId ? 'selected' : ''}>${e(c.name)}</option>`).join('')
            : '<option value="">Nenhuma turma cadastrada</option>'}
        </select>
      </div>

      <div class="field">
        <label for="filter-subject">Disciplina</label>
        <select id="filter-subject" class="select" data-filter="disciplina" ${subjects.length ? '' : 'disabled'}>
          ${subjects.length
            ? subjects.map((s) => `<option value="${e(s.id)}" ${s.id === subjectId ? 'selected' : ''}>${e(s.name)}</option>`).join('')
            : '<option value="">Sem disciplinas</option>'}
        </select>
      </div>

      <div class="field" style="flex: 0 1 190px;">
        <label for="filter-date">Data da aula</label>
        <input id="filter-date" type="date" class="input" data-filter="data" value="${e(date)}" max="${e(todayISO())}" />
      </div>

      <div class="toolbar-end">
        <button class="btn btn-sm" data-shift="-1" aria-label="Dia anterior">${icon('chevron-left', { size: 15 })}</button>
        <button class="btn btn-sm" data-today>Hoje</button>
        <button class="btn btn-sm" data-shift="1" aria-label="Proximo dia"
                ${date >= todayISO() ? 'disabled' : ''}>${icon('chevron-right', { size: 15 })}</button>
      </div>
    </div>
  `;
}

/**
 * (Re)desenha o painel da chamada.
 *
 * Cada chamada desta funcao monta um painel **novo** e substitui o anterior.
 * Os listeners sao registrados nesse painel descartavel, e nao no host da tela:
 * como `renderRoster` roda de novo a cada gravacao ou bloqueio, ligar os
 * eventos ao host faria os handlers se acumularem — e o handler antigo,
 * segurando um `existing` desatualizado, desfaria o efeito do novo.
 */
function renderRoster(host) {
  const { classId, subjectId, date } = context;

  const panel = document.createElement('div');
  panel.className = 'col gap-16';
  $('[data-roster-host]', host).replaceChildren(panel);

  if (!classId || !subjectId) {
    // Sem turma e um caso; turma sem disciplina e outro — cada um leva a uma
    // tela diferente, entao a mensagem precisa distinguir os dois.
    panel.innerHTML = classId
      ? emptyState(
        'book-open',
        'Turma sem disciplinas',
        'Associe disciplinas a esta turma para poder registrar a chamada de uma aula.',
        { label: 'Editar turma', path: '/turmas' },
      )
      : emptyState(
        'graduation-cap',
        'Nenhuma turma cadastrada',
        'A chamada precisa de uma turma com disciplinas associadas e alunos matriculados.',
        { label: 'Criar primeira turma', path: '/turmas' },
      );
    bindEmptyAction(panel);
    return;
  }

  const roster = store.studentsOfClass(classId);
  if (!roster.length) {
    panel.innerHTML = emptyState(
      'users',
      'Turma sem alunos',
      'Vincule alunos a esta turma na tela de Alunos para liberar a chamada.',
      { label: 'Matricular alunos', path: '/alunos', params: { turma: classId } },
    );
    bindEmptyAction(panel);
    return;
  }

  // Aviso (nao bloqueio) quando a data escolhida nao consta na grade da turma
  const weekday = weekdayOf(date);
  const scheduled = store.lessonsOfClass(classId)
    .some((lesson) => lesson.weekday === weekday && lesson.subjectId === subjectId);

  const existing = store.findAttendance(classId, subjectId, date);
  draft = buildDraft(roster, existing);
  savedSnapshot = existing ? JSON.stringify(existing.records) : '';

  panel.innerHTML = `
    ${scheduled ? '' : `
      <div class="badge badge-info" style="padding: 8px 12px;">
        ${icon('info', { size: 13 })}
        ${WEEKDAYS[weekday].label} nao consta na grade desta turma para a disciplina selecionada.
      </div>`}

    <div class="attendance-summary" data-summary>${renderSummary()}</div>

    <div class="card">
      <div class="card-header">
        <div class="row gap-8 wrap">
          <button class="btn btn-sm" data-bulk="all-present">
            ${icon('check-check', { size: 15 })} Marcar todos presentes
          </button>
          <button class="btn btn-sm" data-bulk="invert">
            ${icon('refresh-ccw', { size: 15 })} Inverter selecao
          </button>
          <button class="btn btn-sm" data-bulk="clear">Limpar</button>
        </div>
        ${existing ? `
          <span class="badge ${existing.locked ? 'badge-absent' : 'badge-present'}">
            ${icon(existing.locked ? 'lock' : 'circle-check', { size: 12 })}
            ${existing.locked ? 'Chamada bloqueada' : 'Chamada registrada'}
          </span>` : '<span class="badge">Nao registrada</span>'}
      </div>

      <div class="card-body flush">
        <div class="roster" data-roster>
          ${roster.map((student) => renderRow(student, existing?.locked)).join('')}
        </div>
      </div>
    </div>

    ${renderSaveBar(existing)}
  `;

  bindRoster(host, panel, roster, existing);
}

function renderRow(student, locked = false) {
  const record = draft[student.id] ?? { status: 'P', note: '' };

  return `
    <div class="roster-row" data-student="${e(student.id)}" data-status="${e(record.status)}">
      <span class="roster-num">${student.rollNumber ?? '—'}</span>
      ${renderAvatar(student)}
      <div class="roster-info">
        <span class="roster-name">${e(student.name)}</span>
        <span class="roster-meta">
          <span class="mono">${e(student.registration ?? '')}</span>
          ${record.note ? `<span class="truncate" title="${e(record.note)}">· ${e(record.note)}</span>` : ''}
        </span>
      </div>
      <div class="roster-controls">
        <div class="status-group" role="group" aria-label="Status de ${e(student.name)}">
          ${STATUS_KEYS.map((key) => `
            <button type="button" class="status-btn" data-status="${key}"
              aria-pressed="${record.status === key}" ${locked ? 'disabled' : ''}
              data-tip="${e(STATUS[key].label)}" aria-label="${e(STATUS[key].label)}">${key}</button>
          `).join('')}
        </div>
        <button type="button" class="btn btn-ghost btn-icon btn-sm note-btn"
          data-note data-has-note="${Boolean(record.note)}" ${locked ? 'disabled' : ''}
          data-tip="Observacao" aria-label="Observacao de ${e(student.name)}">
          ${icon('message-square', { size: 15 })}
        </button>
      </div>
    </div>
  `;
}

function renderAvatar(student, size = '') {
  if (student.avatar) {
    return `<img class="avatar ${size}" src="${e(student.avatar)}" alt="" loading="lazy" />`;
  }
  return `<span class="avatar ${size}" aria-hidden="true">${e(initials(student.name))}</span>`;
}

function renderSummary() {
  const tally = tallyRecords(draft);
  return `
    <div class="summary-stat"><b>${tally.total}</b><span>alunos</span></div>
    <div class="summary-stat tone-good"><b>${tally.P}</b><span>presentes</span></div>
    <div class="summary-stat tone-bad"><b>${tally.F}</b><span>faltas</span></div>
    <div class="summary-stat tone-warn"><b>${tally.J}</b><span>justificadas</span></div>
    <div class="grow"></div>
    <div class="summary-stat"><b>${percent(tally.rate)}</b><span>de presenca</span></div>
  `;
}

function renderSaveBar(existing) {
  return `
    <div class="save-bar">
      <div class="small muted">
        ${existing
          ? `Ultima gravacao em ${e(formatDateTime(existing.updatedAt))}`
          : 'Chamada ainda nao gravada para esta aula.'}
      </div>
      <div class="save-actions">
        ${existing ? `
          <button class="btn btn-sm" data-toggle-lock>
            ${icon(existing.locked ? 'lock-open' : 'lock', { size: 15 })}
            ${existing.locked ? 'Desbloquear' : 'Bloquear'}
          </button>` : ''}
        <button class="btn btn-primary" data-save ${existing?.locked ? 'disabled' : ''}>
          ${icon('save', { size: 16 })} ${existing ? 'Atualizar chamada' : 'Salvar chamada'}
        </button>
      </div>
    </div>
  `;
}

/**
 * Estado vazio com um caminho de saida.
 *
 * @param {{ label: string, path: string, params?: object }} [action]
 *        Botao que leva a tela onde o impedimento e resolvido.
 */
function emptyState(iconName, title, message, action = null) {
  return `
    <div class="card"><div class="empty">
      <div class="icon-wrap">${icon(iconName, { size: 22 })}</div>
      <h3>${e(title)}</h3>
      <p>${e(message)}</p>
      ${action ? `
        <button class="btn btn-primary" style="margin-top: 4px;"
                data-empty-action='${e(JSON.stringify([action.path, action.params ?? {}]))}'>
          ${e(action.label)}
        </button>` : ''}
    </div></div>`;
}

/** Liga o botao do estado vazio ao roteador. */
function bindEmptyAction(panel) {
  delegate(panel, 'click', '[data-empty-action]', (_event, target) => {
    const [path, params] = JSON.parse(target.dataset.emptyAction);
    navigate(path, params);
  });
}

/* -------------------------------------------------------------- Estado --- */

/**
 * Monta o rascunho inicial. Alunos sem registro previo entram como presentes:
 * na pratica a maioria da turma esta presente, entao o professor so precisa
 * marcar as excecoes.
 */
function buildDraft(roster, existing) {
  const result = {};
  for (const student of roster) {
    const saved = existing?.records?.[student.id];
    result[student.id] = {
      status: saved?.status ?? 'P',
      note: saved?.note ?? '',
    };
  }
  return result;
}

function hasUnsavedChanges() {
  return JSON.stringify(draft) !== savedSnapshot && Object.keys(draft).length > 0;
}

/* -------------------------------------------------------------- Eventos -- */

function bindToolbar(host) {
  delegate(host, 'change', '[data-filter]', (_event, target) => {
    const key = target.dataset.filter;

    // Trocar de turma invalida a disciplina selecionada
    const patch = key === 'turma'
      ? { turma: target.value, disciplina: '' }
      : { [key]: target.value };

    guardUnsaved(() => setParams(patch));
  });

  delegate(host, 'click', '[data-shift]', (_event, target) => {
    const days = Number(target.dataset.shift);
    const next = new Date(`${context.date}T00:00:00`);
    next.setDate(next.getDate() + days);
    guardUnsaved(() => setParams({ data: next.toISOString().slice(0, 10) }));
  });

  delegate(host, 'click', '[data-today]', () => {
    guardUnsaved(() => setParams({ data: todayISO() }));
  });
}

/** Pede confirmacao antes de descartar uma chamada nao gravada. */
function guardUnsaved(action) {
  if (!hasUnsavedChanges()) {
    action();
    return;
  }
  openModal({
    title: 'Descartar alteracoes?',
    body: '<p class="muted">Ha marcacoes que ainda nao foram gravadas nesta chamada. Se continuar, elas serao perdidas.</p>',
    confirmLabel: 'Descartar',
    tone: 'danger',
    size: 'sm',
    onConfirm: () => {
      savedSnapshot = JSON.stringify(draft); // evita novo aviso em cascata
      action();
    },
  });
}

/**
 * Liga os eventos do painel.
 *
 * @param {HTMLElement} host   raiz da tela, repassada a `renderRoster` quando
 *                             gravar ou bloquear exige redesenhar o painel
 * @param {HTMLElement} panel  painel descartavel desta renderizacao — todos os
 *                             listeners moram aqui e morrem junto com ele
 */
function bindRoster(host, panel, roster, existing) {
  /* --- Toque em P / F / J --- */
  delegate(panel, 'click', '.status-btn', (_event, button) => {
    const row = button.closest('.roster-row');
    const studentId = row.dataset.student;
    const status = button.dataset.status;

    draft[studentId] = { ...draft[studentId], status };
    paintRow(row, status);
    refreshSummary(panel);
  });

  /* --- Observacao individual --- */
  delegate(panel, 'click', '[data-note]', (_event, button) => {
    const row = button.closest('.roster-row');
    const studentId = row.dataset.student;
    const student = roster.find((s) => s.id === studentId);

    openModal({
      title: 'Observacao',
      description: student?.name,
      size: 'sm',
      confirmLabel: 'Salvar observacao',
      body: `
        <div class="field">
          <label for="note-input">Anotacao desta aula</label>
          <textarea id="note-input" name="note" class="textarea" maxlength="240"
            placeholder="Ex: entrou apos 15 min.">${e(draft[studentId]?.note ?? '')}</textarea>
          <span class="hint">Ate 240 caracteres. Aparece no historico e nos relatorios.</span>
        </div>`,
      onConfirm: ({ note }) => {
        draft[studentId] = { ...draft[studentId], note };
        // Repinta so esta linha para preservar o restante da lista
        row.outerHTML = renderRow(student, existing?.locked);
      },
    });
  });

  /* --- Acoes em lote --- */
  delegate(panel, 'click', '[data-bulk]', (_event, button) => {
    const mode = button.dataset.bulk;

    for (const studentId of Object.keys(draft)) {
      const current = draft[studentId].status;
      const next = mode === 'all-present' ? 'P'
        : mode === 'clear' ? 'P'
          : current === 'P' ? 'F' : 'P';   // inverter: alterna presente <-> falta
      draft[studentId] = {
        status: next,
        note: mode === 'clear' ? '' : draft[studentId].note,
      };
    }

    for (const row of $$('.roster-row', panel)) {
      const record = draft[row.dataset.student];
      paintRow(row, record.status);
      if (mode === 'clear') {
        const noteButton = $('[data-note]', row);
        if (noteButton) noteButton.dataset.hasNote = 'false';
      }
    }
    refreshSummary(panel);
  });

  /* --- Gravar --- */
  delegate(panel, 'click', '[data-save]', () => {
    const tally = tallyRecords(draft);
    if (!tally.total) {
      toastError('Nada para salvar', 'Esta turma nao possui alunos vinculados.');
      return;
    }

    store.saveAttendance({ ...context, records: draft, locked: existing?.locked ?? false });
    savedSnapshot = JSON.stringify(draft);

    toastSuccess(
      'Chamada gravada',
      `${tally.P} presentes, ${tally.F} faltas e ${tally.J} justificadas em ${formatDate(context.date)}.`,
    );
    renderRoster(host); // reflete o novo estado (badge, data de gravacao, bloqueio)
  });

  /* --- Bloquear / desbloquear --- */
  delegate(panel, 'click', '[data-toggle-lock]', () => {
    if (!existing) return;
    store.setAttendanceLock(existing.id, !existing.locked);
    toastSuccess(existing.locked ? 'Chamada liberada para edicao' : 'Chamada bloqueada');
    renderRoster(host);
  });
}

/** Atualiza a aparencia de uma linha sem reconstruir o markup inteiro. */
function paintRow(row, status) {
  row.dataset.status = status;
  for (const button of $$('.status-btn', row)) {
    button.setAttribute('aria-pressed', String(button.dataset.status === status));
  }
}

function refreshSummary(scope) {
  const summary = $('[data-summary]', scope);
  if (summary) summary.innerHTML = renderSummary();
}
