/**
 * dashboard.js — visao geral com KPIs, serie diaria e alunos em risco.
 *
 * Todos os numeros vem de `core/analytics.js`, nunca de calculos locais, para
 * que dashboard e relatorios contem sempre a mesma historia.
 */

import * as analytics from '../core/analytics.js';
import * as store from '../core/store.js';
import { icon } from '../core/icons.js';
import { delegate, e, render } from '../core/dom.js';
import { navigate } from '../core/router.js';
import {
  addDays, formatDate, initials, percent, startOfMonth, todayISO, WEEKDAYS,
} from '../core/utils.js';

const RISK_THRESHOLD = 25; // % de falta que caracteriza risco de infrequencia

export function renderDashboard(host) {
  const today = todayISO();
  const monthStart = startOfMonth(today);

  // Antes da primeira chamada nao ha o que resumir: os KPIs sairiam todos em
  // branco. Nesse periodo o dashboard vira um guia de configuracao.
  if (!store.attendanceList().length) {
    renderFirstRun(host, today);
    return;
  }

  const day = analytics.todaySummary(today);
  const month = analytics.overallCounts({ from: monthStart, to: today });
  const risk = analytics.atRisk({ threshold: RISK_THRESHOLD, from: addDays(today, -90), to: today });
  const series = analytics.dailySeries({ days: 14 });
  const classes = analytics.perClass({ from: monthStart, to: today });

  render(host, `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>${e(formatDate(today, 'long'))}</p>
        </div>
        <button class="btn btn-primary" data-go-attendance>
          ${icon('clipboard-check', { size: 16 })} Iniciar chamada
        </button>
      </div>

      ${renderKpis({ day, month, risk })}

      <div style="display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: 16px;"
           data-two-col>
        ${renderTrend(series)}
        ${renderRisk(risk)}
      </div>

      ${renderClassTable(classes)}
    </div>
  `);

  // Em telas estreitas as duas colunas viram uma so
  applyResponsiveColumns(host);

  delegate(host, 'click', '[data-go-attendance]', () => navigate('/chamada'));
  delegate(host, 'click', '[data-student-report]', (_event, target) => {
    navigate('/relatorios', { aluno: target.dataset.studentReport });
  });
  delegate(host, 'click', '[data-class-attendance]', (_event, target) => {
    navigate('/chamada', { turma: target.dataset.classAttendance });
  });
}

/* --------------------------------------------------- Primeiro acesso ----- */

/**
 * Define a sequencia de configuracao da escola.
 *
 * A ordem nao e cosmetica: cada etapa depende da anterior (uma turma precisa de
 * disciplinas, um horario precisa de turma com disciplina). Por isso a proxima
 * etapa pendente e destacada e as seguintes ficam apenas listadas.
 */
function setupSteps() {
  const subjects = store.subjects.list().length;
  const classes = store.classes.list().length;
  const students = store.students.list().length;
  const teachers = store.teachers.list().length;
  const lessons = store.lessons.list().length;

  return [
    {
      title: 'Cadastre as disciplinas',
      description: 'Matematica, Portugues, Historia... Sao a base de toda aula.',
      icon: 'book-open',
      done: subjects > 0,
      count: subjects,
      unit: 'disciplina(s)',
      action: 'Cadastrar disciplinas',
      route: ['/turmas', { aba: 'disciplinas' }],
    },
    {
      title: 'Cadastre os professores',
      description: 'Nome, e-mail, matricula e as disciplinas que cada um leciona.',
      icon: 'user-round',
      done: teachers > 0,
      count: teachers,
      unit: 'professor(es)',
      action: 'Cadastrar professores',
      route: ['/professores', {}],
    },
    {
      title: 'Crie as turmas',
      description: 'Identificacao, professor responsavel, sala e disciplinas oferecidas.',
      icon: 'graduation-cap',
      done: classes > 0,
      count: classes,
      unit: 'turma(s)',
      action: 'Criar turmas',
      route: ['/turmas', {}],
    },
    {
      title: 'Matricule os alunos',
      description: 'Nome, numero de chamada, matricula e vinculo com as turmas.',
      icon: 'users',
      done: students > 0,
      count: students,
      unit: 'aluno(s)',
      action: 'Cadastrar alunos',
      route: ['/alunos', {}],
    },
    {
      title: 'Monte a grade semanal',
      description: 'Dias e horarios de cada aula. Opcional, mas evita chamadas em dia errado.',
      icon: 'calendar-days',
      done: lessons > 0,
      count: lessons,
      unit: 'horario(s)',
      optional: true,
      action: 'Definir horarios',
      route: ['/horarios', {}],
    },
    {
      title: 'Registre a primeira chamada',
      description: 'A partir daqui o dashboard passa a mostrar os indicadores de frequencia.',
      icon: 'clipboard-check',
      done: false,
      blockedBy: !(subjects && classes && students),
      action: 'Fazer chamada',
      route: ['/chamada', {}],
    },
  ];
}

function renderFirstRun(host, today) {
  const steps = setupSteps();
  const required = steps.filter((step) => !step.optional && step !== steps.at(-1));
  const concluded = required.filter((step) => step.done).length;
  const progress = (concluded / required.length) * 100;
  const next = steps.find((step) => !step.done && !step.blockedBy);
  const virgin = store.isEmpty();

  render(host, `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Bem-vindo ao Controle de Chamada</h1>
          <p>${e(formatDate(today, 'long'))}</p>
        </div>
      </div>

      <section class="card">
        <div class="card-header">
          <div>
            <h2>Primeiros passos</h2>
            <p class="small muted" style="margin-top: 2px;">
              ${virgin
                ? 'A base esta vazia. Siga a sequencia abaixo para configurar a escola.'
                : `${concluded} de ${required.length} etapas essenciais concluidas.`}
            </p>
          </div>
          <span class="badge ${concluded === required.length ? 'badge-present' : 'badge-accent'}">
            ${Math.round(progress)}%
          </span>
        </div>

        <div class="card-body">
          <div class="meter ${concluded === required.length ? 'is-good' : ''}" style="margin-bottom: 18px;">
            <span style="width: ${progress}%;"></span>
          </div>

          <ol class="setup-list">
            ${steps.map((step, index) => renderStep(step, index, step === next)).join('')}
          </ol>
        </div>
      </section>

      <p class="tiny faint text-center">
        Quer explorar o sistema antes de cadastrar? Abra
        <b>Dados e backup</b>, no rodape do menu, e escolha
        <b>Restaurar dados de demonstracao</b>.
      </p>
    </div>
  `);

  delegate(host, 'click', '[data-step-route]', (_event, target) => {
    const [path, params] = JSON.parse(target.dataset.stepRoute);
    navigate(path, params);
  });
}

function renderStep(step, index, isNext) {
  const state = step.done ? 'done' : step.blockedBy ? 'blocked' : isNext ? 'next' : 'todo';

  return `
    <li class="setup-step" data-state="${state}">
      <span class="setup-marker">
        ${step.done ? icon('check', { size: 15 }) : `<span class="setup-index">${index + 1}</span>`}
      </span>

      <div class="grow">
        <div class="row gap-8 wrap">
          <span class="setup-title">${e(step.title)}</span>
          ${step.optional ? '<span class="badge">opcional</span>' : ''}
          ${step.done ? `<span class="badge badge-present">${step.count} ${e(step.unit)}</span>` : ''}
        </div>
        <p class="setup-desc">${e(step.description)}</p>
      </div>

      <button class="btn ${isNext ? 'btn-primary' : 'btn-sm'}"
              data-step-route='${e(JSON.stringify(step.route))}'
              ${step.blockedBy ? 'disabled' : ''}>
        ${step.done ? 'Revisar' : e(step.action)}
      </button>
    </li>`;
}

/* ----------------------------------------------------------------- KPIs -- */

function renderKpis({ day, month, risk }) {
  const cards = [
    {
      label: 'Presenca hoje',
      value: day.P + day.F + day.J ? percent(day.rate) : '—',
      foot: day.taken
        ? `${day.taken} de ${day.scheduled || day.taken} aula(s) com chamada`
        : 'Nenhuma chamada registrada hoje',
      icon: 'percent',
      tone: day.rate >= 85 ? 'tone-good' : day.rate >= 70 ? 'tone-warn' : 'tone-bad',
    },
    {
      label: 'Presenca no mes',
      value: month.lessons ? percent(month.rate) : '—',
      foot: `${month.P} presencas, ${month.F} faltas, ${month.J} justificadas`,
      icon: 'trending-up',
      tone: month.rate >= 85 ? 'tone-good' : month.rate >= 70 ? 'tone-warn' : 'tone-bad',
    },
    {
      label: 'Aulas dadas no mes',
      value: String(month.lessons),
      foot: day.pending
        ? `${day.pending} chamada(s) pendente(s) hoje`
        : 'Chamadas de hoje em dia',
      icon: 'clipboard-check',
      tone: '',
    },
    {
      label: `Risco de infrequencia`,
      value: String(risk.length),
      foot: `Alunos com mais de ${RISK_THRESHOLD}% de falta`,
      icon: 'user-x',
      tone: risk.length ? 'tone-bad' : 'tone-good',
    },
  ];

  return `<div class="kpi-grid">${cards.map((card) => `
    <article class="kpi">
      <div class="kpi-top">
        <span class="kpi-label">${e(card.label)}</span>
        <span class="kpi-icon ${card.tone}">${icon(card.icon, { size: 16 })}</span>
      </div>
      <div class="kpi-value">${e(card.value)}</div>
      <div class="kpi-foot">${e(card.foot)}</div>
    </article>`).join('')}</div>`;
}

/* -------------------------------------------------------- Serie diaria --- */

function renderTrend(series) {
  const withData = series.filter((point) => point.hasData);

  if (!withData.length) {
    return `
      <section class="card">
        <div class="card-header"><h2>Presenca nos ultimos 14 dias</h2></div>
        <div class="empty">
          <div class="icon-wrap">${icon('trending-up', { size: 22 })}</div>
          <h3>Sem dados no periodo</h3>
          <p>Registre chamadas para acompanhar a evolucao da frequencia.</p>
        </div>
      </section>`;
  }

  const average = withData.reduce((sum, point) => sum + point.rate, 0) / withData.length;

  return `
    <section class="card">
      <div class="card-header">
        <h2>Presenca nos ultimos 14 dias</h2>
        <span class="badge badge-accent">media ${e(percent(average))}</span>
      </div>
      <div class="card-body">
        <div class="bar-chart" role="img"
             aria-label="Taxa de presenca diaria nos ultimos 14 dias, media de ${e(percent(average))}">
          ${series.map((point) => {
            const weekday = WEEKDAYS[new Date(`${point.date}T00:00:00`).getDay()].short;
            const label = `${weekday} ${point.date.slice(8)}`;
            return `
              <div class="bar-col" data-tip="${e(point.hasData
                ? `${formatDate(point.date)}: ${percent(point.rate)} (${point.lessons} aula(s))`
                : `${formatDate(point.date)}: sem aula`)}">
                <div class="bar-track">
                  <div class="bar-fill" style="height: ${point.hasData ? Math.max(4, point.rate) : 0}%;"></div>
                </div>
                <span class="bar-label">${e(label)}</span>
              </div>`;
          }).join('')}
        </div>
      </div>
    </section>`;
}

/* ------------------------------------------------------ Alunos em risco -- */

function renderRisk(risk) {
  if (!risk.length) {
    return `
      <section class="card">
        <div class="card-header"><h2>Risco de infrequencia</h2></div>
        <div class="empty">
          <div class="icon-wrap">${icon('circle-check', { size: 22 })}</div>
          <h3>Nenhum aluno em risco</h3>
          <p>Todos estao abaixo de ${RISK_THRESHOLD}% de falta nos ultimos 90 dias.</p>
        </div>
      </section>`;
  }

  const top = risk.slice(0, 7);

  return `
    <section class="card">
      <div class="card-header">
        <h2>Risco de infrequencia</h2>
        <span class="badge badge-absent">${risk.length}</span>
      </div>
      <div class="card-body">
        ${top.map((row) => `
          <div class="risk-item">
            <span class="avatar avatar-sm" aria-hidden="true">${e(initials(row.student.name))}</span>
            <div class="grow">
              <div class="truncate strong small">${e(row.student.name)}</div>
              <div class="meter is-bad" style="margin-top: 5px;">
                <span style="width: ${Math.min(100, row.absenceRate)}%;"></span>
              </div>
            </div>
            <button class="btn btn-ghost btn-sm risk-pct" data-student-report="${e(row.student.id)}"
                    data-tip="Ver relatorio">${e(percent(row.absenceRate, 0))}</button>
          </div>`).join('')}
        ${risk.length > top.length
          ? `<p class="tiny faint" style="margin-top: 10px;">e mais ${risk.length - top.length} aluno(s).</p>`
          : ''}
      </div>
    </section>`;
}

/* ------------------------------------------------------ Tabela de turmas - */

function renderClassTable(rows) {
  if (!rows.length) {
    return `
      <section class="card">
        <div class="card-header"><h2>Frequencia por turma</h2></div>
        <div class="empty">
          <div class="icon-wrap">${icon('book-open', { size: 22 })}</div>
          <h3>Nenhuma chamada neste mes</h3>
          <p>Assim que a primeira chamada do mes for registrada, os numeros por turma aparecem aqui.</p>
        </div>
      </section>`;
  }

  return `
    <section class="card">
      <div class="card-header">
        <h2>Frequencia por turma <span class="muted small">(mes corrente)</span></h2>
      </div>
      <div class="card-body flush">
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Turma</th>
                <th class="text-right">Alunos</th>
                <th class="text-right">Aulas</th>
                <th class="text-right">Faltas</th>
                <th style="width: 190px;">Presenca</th>
                <th class="text-right no-print">Acao</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((row) => {
                const tone = row.rate >= 85 ? 'is-good' : row.rate >= 70 ? 'is-warn' : 'is-bad';
                const teacher = store.teachers.get(row.schoolClass.teacherId);
                return `
                  <tr>
                    <td>
                      <div class="strong">${e(row.schoolClass.name)}</div>
                      <div class="tiny faint">${e(teacher?.name ?? 'Sem professor')} · ${e(row.schoolClass.room ?? '—')}</div>
                    </td>
                    <td class="text-right mono">${row.students}</td>
                    <td class="text-right mono">${row.lessons}</td>
                    <td class="text-right mono">${row.F + row.J}</td>
                    <td>
                      <div class="row gap-8">
                        <div class="meter ${tone} grow"><span style="width: ${row.rate}%;"></span></div>
                        <span class="mono small nowrap">${e(percent(row.rate))}</span>
                      </div>
                    </td>
                    <td class="text-right no-print">
                      <button class="btn btn-ghost btn-sm" data-class-attendance="${e(row.schoolClass.id)}">
                        Chamada
                      </button>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </section>`;
}

/**
 * A grade de duas colunas do meio da tela e definida inline (para nao poluir o
 * CSS com um caso unico), entao o ajuste responsivo dela tambem mora aqui.
 */
function applyResponsiveColumns(host) {
  const grid = host.querySelector('[data-two-col]');
  if (!grid) return;

  const query = matchMedia('(max-width: 900px)');
  const apply = () => {
    grid.style.gridTemplateColumns = query.matches ? '1fr' : 'minmax(0, 1.55fr) minmax(0, 1fr)';
  };
  apply();
  query.addEventListener('change', apply);
}
