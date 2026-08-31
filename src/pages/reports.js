/**
 * reports.js — historico de frequencia com filtros e exportacao.
 *
 * Duas visoes sobre o mesmo recorte de dados:
 *   • "Por aluno"  — consolidado de P/F/J e percentual de cada aluno;
 *   • "Por aula"   — uma linha por chamada registrada, para auditoria.
 *
 * Os filtros ficam na URL, entao um relatorio pode ser salvo nos favoritos ou
 * enviado por e-mail como link e reabre exatamente igual.
 */

import * as analytics from '../core/analytics.js';
import * as store from '../core/store.js';
import { icon } from '../core/icons.js';
import { $, delegate, e, render } from '../core/dom.js';
import { setParams } from '../core/router.js';
import { downloadCSV, printReport, reportFilename, statusTag } from '../core/export.js';
import { toastError, toastSuccess } from '../ui/toast.js';
import {
  addDays, formatDate, initials, percent, startOfMonth, todayISO,
} from '../core/utils.js';

const RISK_THRESHOLD = 25;

export function renderReports(host, params) {
  const filters = resolveFilters(params);
  const view = params.visao === 'aulas' ? 'aulas' : 'alunos';

  const rows = view === 'alunos' ? buildStudentRows(filters) : buildLessonRows(filters);
  const totals = analytics.overallCounts(filters);

  render(host, `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Relatorios</h1>
          <p>Historico de frequencia com filtros por periodo, turma e aluno.</p>
        </div>
        <div class="row gap-8">
          <button class="btn" data-export-csv ${rows.length ? '' : 'disabled'}>
            ${icon('download', { size: 16 })} CSV
          </button>
          <button class="btn btn-primary" data-export-pdf ${rows.length ? '' : 'disabled'}>
            ${icon('printer', { size: 16 })} PDF
          </button>
        </div>
      </div>

      ${renderFilters(filters)}
      ${renderTotals(totals, filters)}

      <div class="tabs" role="tablist">
        <button class="tab" role="tab" data-view="alunos" aria-selected="${view === 'alunos'}">Por aluno</button>
        <button class="tab" role="tab" data-view="aulas" aria-selected="${view === 'aulas'}">Por aula</button>
      </div>

      ${view === 'alunos' ? renderStudentTable(rows) : renderLessonTable(rows)}
    </div>
  `);

  /* ---- Eventos ---- */

  delegate(host, 'change', '[data-filter]', (_event, target) => {
    const key = target.dataset.filter;
    // Trocar de turma zera o aluno, que pode nao pertencer a nova turma
    setParams(key === 'turma' ? { turma: target.value, aluno: '' } : { [key]: target.value });
  });

  delegate(host, 'click', '[data-preset]', (_event, target) => {
    setParams(presetRange(target.dataset.preset));
  });

  delegate(host, 'click', '[data-view]', (_event, target) => {
    setParams({ visao: target.dataset.view });
  });

  delegate(host, 'click', '[data-export-csv]', () => exportCSV(view, rows));
  delegate(host, 'click', '[data-export-pdf]', () => exportPDF(view, rows, filters, totals));
}

/* -------------------------------------------------------------- Filtros -- */

function resolveFilters(params) {
  const today = todayISO();
  return {
    from: params.de || startOfMonth(today),
    to: params.ate || today,
    classId: params.turma || '',
    subjectId: params.disciplina || '',
    studentId: params.aluno || '',
  };
}

function presetRange(preset) {
  const today = todayISO();
  if (preset === 'mes') return { de: startOfMonth(today), ate: today };
  if (preset === '30') return { de: addDays(today, -29), ate: today };
  if (preset === '90') return { de: addDays(today, -89), ate: today };
  return { de: today, ate: today };
}

function renderFilters(filters) {
  const classes = store.classes.list();
  const subjects = filters.classId ? store.subjectsOfClass(filters.classId) : store.subjects.list();
  const students = filters.classId ? store.studentsOfClass(filters.classId) : store.students.list();

  return `
    <div class="toolbar">
      <div class="field" style="flex: 0 1 165px;">
        <label for="r-from">De</label>
        <input id="r-from" type="date" class="input" data-filter="de" value="${e(filters.from)}" />
      </div>
      <div class="field" style="flex: 0 1 165px;">
        <label for="r-to">Ate</label>
        <input id="r-to" type="date" class="input" data-filter="ate" value="${e(filters.to)}" />
      </div>
      <div class="field">
        <label for="r-class">Turma</label>
        <select id="r-class" class="select" data-filter="turma">
          <option value="">Todas</option>
          ${classes.map((item) => `
            <option value="${e(item.id)}" ${item.id === filters.classId ? 'selected' : ''}>${e(item.name)}</option>
          `).join('')}
        </select>
      </div>
      <div class="field">
        <label for="r-subject">Disciplina</label>
        <select id="r-subject" class="select" data-filter="disciplina">
          <option value="">Todas</option>
          ${subjects.map((item) => `
            <option value="${e(item.id)}" ${item.id === filters.subjectId ? 'selected' : ''}>${e(item.name)}</option>
          `).join('')}
        </select>
      </div>
      <div class="field">
        <label for="r-student">Aluno</label>
        <select id="r-student" class="select" data-filter="aluno">
          <option value="">Todos</option>
          ${students.map((item) => `
            <option value="${e(item.id)}" ${item.id === filters.studentId ? 'selected' : ''}>${e(item.name)}</option>
          `).join('')}
        </select>
      </div>
      <div class="toolbar-end">
        <button class="btn btn-sm" data-preset="mes">Mes atual</button>
        <button class="btn btn-sm" data-preset="30">30 dias</button>
        <button class="btn btn-sm" data-preset="90">90 dias</button>
      </div>
    </div>`;
}

function renderTotals(totals, filters) {
  const cards = [
    { label: 'Aulas no periodo', value: String(totals.lessons), icon: 'clipboard-check', tone: '' },
    { label: 'Presencas', value: String(totals.P), icon: 'circle-check', tone: 'tone-good' },
    { label: 'Faltas', value: String(totals.F), icon: 'user-x', tone: 'tone-bad' },
    { label: 'Justificadas', value: String(totals.J), icon: 'triangle-alert', tone: 'tone-warn' },
    {
      label: 'Presenca media',
      value: totals.lessons ? percent(totals.rate) : '—',
      icon: 'percent',
      tone: totals.rate >= 85 ? 'tone-good' : totals.rate >= 70 ? 'tone-warn' : 'tone-bad',
    },
  ];

  return `
    <div class="kpi-grid">
      ${cards.map((card) => `
        <article class="kpi">
          <div class="kpi-top">
            <span class="kpi-label">${e(card.label)}</span>
            <span class="kpi-icon ${card.tone}">${icon(card.icon, { size: 16 })}</span>
          </div>
          <div class="kpi-value">${e(card.value)}</div>
          <div class="kpi-foot">${e(formatDate(filters.from))} a ${e(formatDate(filters.to))}</div>
        </article>`).join('')}
    </div>`;
}

/* ---------------------------------------------------------- Visao aluno -- */

function buildStudentRows(filters) {
  const rows = analytics.perStudent(filters);
  if (!filters.classId) return rows;
  // Sem filtro de turma o aluno pode aparecer por outra turma; com filtro,
  // limitamos ao elenco daquela turma para o total bater com a listagem.
  const allowed = new Set(store.studentsOfClass(filters.classId).map((s) => s.id));
  return rows.filter((row) => allowed.has(row.student.id));
}

function renderStudentTable(rows) {
  if (!rows.length) return emptyCard('Nenhum registro no periodo selecionado.');

  return `
    <section class="card">
      <div class="card-body flush">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Aluno</th>
                <th>Turma(s)</th>
                <th class="text-right">Aulas</th>
                <th class="text-right">P</th>
                <th class="text-right">F</th>
                <th class="text-right">J</th>
                <th style="width: 180px;">Presenca</th>
                <th>Situacao</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => {
                const tone = row.rate >= 85 ? 'is-good' : row.rate >= 75 ? 'is-warn' : 'is-bad';
                const risk = row.absenceRate >= RISK_THRESHOLD;
                const classNames = (row.student.classIds ?? [])
                  .map((id) => store.classes.get(id)?.name).filter(Boolean).join(', ');

                return `
                  <tr>
                    <td>
                      <div class="row gap-8">
                        <span class="avatar avatar-sm" aria-hidden="true">${e(initials(row.student.name))}</span>
                        <div>
                          <div class="strong">${e(row.student.name)}</div>
                          <div class="tiny faint mono">${e(row.student.registration ?? '')}</div>
                        </div>
                      </div>
                    </td>
                    <td class="small muted">${e(classNames || '—')}</td>
                    <td class="text-right mono">${row.total}</td>
                    <td class="text-right mono">${row.P}</td>
                    <td class="text-right mono">${row.F}</td>
                    <td class="text-right mono">${row.J}</td>
                    <td>
                      <div class="row gap-8">
                        <div class="meter ${tone} grow"><span style="width: ${row.rate}%;"></span></div>
                        <span class="mono small nowrap">${e(percent(row.rate))}</span>
                      </div>
                    </td>
                    <td>
                      <span class="badge ${risk ? 'badge-absent' : 'badge-present'}">
                        ${risk ? 'Risco de infrequencia' : 'Regular'}
                      </span>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </section>`;
}

/* ----------------------------------------------------------- Visao aula -- */

function buildLessonRows(filters) {
  return store.attendanceList(filters)
    .map((entry) => {
      const counts = { P: 0, F: 0, J: 0 };
      for (const record of Object.values(entry.records ?? {})) {
        if (record.status in counts) counts[record.status] += 1;
      }
      const total = counts.P + counts.F + counts.J;
      return {
        entry,
        schoolClass: store.classes.get(entry.classId),
        subject: store.subjects.get(entry.subjectId),
        ...counts,
        total,
        rate: total ? (counts.P / total) * 100 : 0,
      };
    })
    .sort((a, b) => b.entry.date.localeCompare(a.entry.date));
}

function renderLessonTable(rows) {
  if (!rows.length) return emptyCard('Nenhuma chamada registrada no periodo selecionado.');

  return `
    <section class="card">
      <div class="card-body flush">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Turma</th>
                <th>Disciplina</th>
                <th class="text-right">Alunos</th>
                <th class="text-right">P</th>
                <th class="text-right">F</th>
                <th class="text-right">J</th>
                <th class="text-right">Presenca</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => `
                <tr>
                  <td class="nowrap">${e(formatDate(row.entry.date))}</td>
                  <td>${e(row.schoolClass?.name ?? 'Turma removida')}</td>
                  <td>${e(row.subject?.name ?? 'Disciplina removida')}</td>
                  <td class="text-right mono">${row.total}</td>
                  <td class="text-right mono">${row.P}</td>
                  <td class="text-right mono">${row.F}</td>
                  <td class="text-right mono">${row.J}</td>
                  <td class="text-right mono">${e(percent(row.rate))}</td>
                  <td>
                    <span class="badge ${row.entry.locked ? '' : 'badge-accent'}">
                      ${icon(row.entry.locked ? 'lock' : 'pencil', { size: 12 })}
                      ${row.entry.locked ? 'Consolidada' : 'Editavel'}
                    </span>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </section>`;
}

function emptyCard(message) {
  return `
    <section class="card"><div class="empty">
      <div class="icon-wrap">${icon('file-bar-chart', { size: 22 })}</div>
      <h3>Sem dados</h3>
      <p>${e(message)}</p>
    </div></section>`;
}

/* ----------------------------------------------------------- Exportacao -- */

/** Descreve os filtros ativos em texto, para o cabecalho dos arquivos gerados. */
function describeFilters(filters) {
  const chips = [`Periodo: ${formatDate(filters.from)} a ${formatDate(filters.to)}`];

  if (filters.classId) chips.push(`Turma: ${store.classes.get(filters.classId)?.name ?? '—'}`);
  if (filters.subjectId) chips.push(`Disciplina: ${store.subjects.get(filters.subjectId)?.name ?? '—'}`);
  if (filters.studentId) chips.push(`Aluno: ${store.students.get(filters.studentId)?.name ?? '—'}`);

  return chips;
}

function exportCSV(view, rows) {
  if (!rows.length) {
    toastError('Nada para exportar', 'Ajuste os filtros para obter resultados.');
    return;
  }

  if (view === 'alunos') {
    downloadCSV(
      reportFilename('frequencia-por-aluno', 'csv'),
      ['Aluno', 'Matricula', 'Turmas', 'Aulas', 'Presencas', 'Faltas', 'Justificadas', 'Presenca (%)', 'Situacao'],
      rows.map((row) => [
        row.student.name,
        row.student.registration ?? '',
        (row.student.classIds ?? []).map((id) => store.classes.get(id)?.name).filter(Boolean).join(' | '),
        row.total, row.P, row.F, row.J,
        row.rate.toFixed(1).replace('.', ','),
        row.absenceRate >= RISK_THRESHOLD ? 'Risco de infrequencia' : 'Regular',
      ]),
    );
  } else {
    downloadCSV(
      reportFilename('frequencia-por-aula', 'csv'),
      ['Data', 'Turma', 'Disciplina', 'Alunos', 'Presencas', 'Faltas', 'Justificadas', 'Presenca (%)', 'Status'],
      rows.map((row) => [
        formatDate(row.entry.date),
        row.schoolClass?.name ?? '',
        row.subject?.name ?? '',
        row.total, row.P, row.F, row.J,
        row.rate.toFixed(1).replace('.', ','),
        row.entry.locked ? 'Consolidada' : 'Editavel',
      ]),
    );
  }

  toastSuccess('CSV gerado', `${rows.length} linha(s) exportada(s).`);
}

function exportPDF(view, rows, filters, totals) {
  if (!rows.length) {
    toastError('Nada para exportar', 'Ajuste os filtros para obter resultados.');
    return;
  }

  const kpis = [
    { label: 'Aulas', value: String(totals.lessons) },
    { label: 'Presencas', value: String(totals.P) },
    { label: 'Faltas', value: String(totals.F) },
    { label: 'Justificadas', value: String(totals.J) },
    { label: 'Presenca media', value: percent(totals.rate) },
  ];

  if (view === 'alunos') {
    printReport({
      title: 'Relatorio de frequencia por aluno',
      filters: describeFilters(filters),
      kpis,
      headers: ['Aluno', 'Matricula', 'Aulas', 'P', 'F', 'J', 'Presenca', 'Situacao'],
      rows: rows.map((row) => [
        e(row.student.name),
        `<span class="num">${e(row.student.registration ?? '')}</span>`,
        `<span class="num">${row.total}</span>`,
        `<span class="num">${row.P}</span>`,
        `<span class="num">${row.F}</span>`,
        `<span class="num">${row.J}</span>`,
        `<span class="num">${percent(row.rate)}</span>`,
        row.absenceRate >= RISK_THRESHOLD ? statusTag('F') + ' Risco' : statusTag('P') + ' Regular',
      ]),
    });
  } else {
    printReport({
      title: 'Relatorio de chamadas por aula',
      filters: describeFilters(filters),
      kpis,
      headers: ['Data', 'Turma', 'Disciplina', 'Alunos', 'P', 'F', 'J', 'Presenca'],
      rows: rows.map((row) => [
        formatDate(row.entry.date),
        e(row.schoolClass?.name ?? ''),
        e(row.subject?.name ?? ''),
        `<span class="num">${row.total}</span>`,
        `<span class="num">${row.P}</span>`,
        `<span class="num">${row.F}</span>`,
        `<span class="num">${row.J}</span>`,
        `<span class="num">${percent(row.rate)}</span>`,
      ]),
    });
  }

  toastSuccess('Documento pronto', 'Escolha "Salvar como PDF" no dialogo de impressao.');
}
