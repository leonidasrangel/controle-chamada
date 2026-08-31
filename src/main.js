import * as store from './core/store.js';
import { icon } from './core/icons.js';
import { $, $$, delegate, downloadFile, render } from './core/dom.js';
import { buildHash, navigate, onRouteChange, route, setNotFound, startRouter } from './core/router.js';
import { currentTheme, toggleTheme, watchSystemTheme } from './ui/theme.js';
import { confirmDialog, openModal } from './ui/modal.js';
import { toastError, toastSuccess } from './ui/toast.js';

import { renderDashboard } from './pages/dashboard.js';
import { renderAttendance } from './pages/attendance.js';
import { renderTeachers } from './pages/teachers.js';
import { renderClasses } from './pages/classes.js';
import { renderStudents } from './pages/students.js';
import { renderSchedule } from './pages/schedule.js';
import { renderReports } from './pages/reports.js';

const NAV = [
  {
    label: 'Operacao',
    items: [
      { path: '/dashboard', title: 'Dashboard', icon: 'layout-dashboard' },
      { path: '/chamada', title: 'Chamada', icon: 'clipboard-check' },
      { path: '/relatorios', title: 'Relatorios', icon: 'file-bar-chart' },
    ],
  },
  {
    label: 'Cadastros',
    items: [
      { path: '/turmas', title: 'Turmas & Disciplinas', icon: 'book-open', count: () => store.classes.list().length },
      { path: '/alunos', title: 'Alunos', icon: 'users', count: () => store.students.list().length },
      { path: '/professores', title: 'Professores', icon: 'user-round', count: () => store.teachers.list().length },
      { path: '/horarios', title: 'Dias e Horarios', icon: 'calendar-days' },
    ],
  },
];

const PAGE_META = {
  '/dashboard': ['Dashboard', 'Visao geral da frequencia escolar'],
  '/chamada': ['Chamada', 'Registro de presenca da aula'],
  '/relatorios': ['Relatorios', 'Historico e exportacao'],
  '/turmas': ['Turmas & Disciplinas', 'Estrutura academica'],
  '/alunos': ['Alunos', 'Cadastro e vinculos'],
  '/professores': ['Professores', 'Corpo docente'],
  '/horarios': ['Dias e Horarios', 'Grade semanal de aulas'],
};

function renderShell() {
  render(document.getElementById('app'), `
    <div class="sidebar-scrim" data-close-nav></div>

    <aside class="sidebar" data-sidebar>
      <div class="brand">
        <span class="brand-mark">${icon('graduation-cap', { size: 19 })}</span>
        <span class="brand-text">
          <strong>Controle de Chamada</strong>
          <span>Gestao escolar</span>
        </span>
      </div>

      <nav aria-label="Navegacao principal">
        ${NAV.map((group) => `
          <div class="nav-group">
            <span class="nav-label">${group.label}</span>
            ${group.items.map((item) => `
              <a class="nav-item" href="${buildHash(item.path)}" data-nav="${item.path}">
                ${icon(item.icon, { size: 17 })}
                <span class="grow truncate">${item.title}</span>
                ${item.count ? `<span class="count" data-count="${item.path}"></span>` : ''}
              </a>`).join('')}
          </div>`).join('')}
      </nav>

      <div class="sidebar-footer">
        <button class="nav-item" style="width: 100%;" data-manage-data>
          ${icon('database', { size: 17 })}
          <span class="grow" style="text-align: left;">Dados e backup</span>
        </button>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <button class="btn btn-ghost btn-icon menu-toggle" data-toggle-nav aria-label="Abrir menu">
          ${icon('menu', { size: 18 })}
        </button>
        <div>
          <h1 data-page-title>Dashboard</h1>
          <div class="subtitle" data-page-subtitle></div>
        </div>
        <div class="topbar-actions">
          <button class="btn btn-ghost btn-icon" data-toggle-theme
                  aria-label="Alternar tema" data-tip="Alternar tema"></button>
        </div>
      </header>

      <main data-view-host></main>
    </div>
  `);

  bindShell();
  refreshCounts();
  refreshThemeButton();
}

function bindShell() {
  const app = document.getElementById('app');

  delegate(app, 'click', '[data-toggle-theme]', () => {
    toggleTheme();
    refreshThemeButton();
  });

  delegate(app, 'click', '[data-toggle-nav]', () => {
    document.body.dataset.nav = document.body.dataset.nav === 'open' ? '' : 'open';
  });

  delegate(app, 'click', '[data-close-nav]', () => {
    document.body.dataset.nav = '';
  });

  delegate(app, 'click', '[data-nav]', () => {
    document.body.dataset.nav = '';
  });

  delegate(app, 'click', '[data-manage-data]', openDataManager);
}

function refreshThemeButton() {
  const button = $('[data-toggle-theme]');
  if (!button) return;
  const dark = currentTheme() === 'dark';
  button.innerHTML = icon(dark ? 'sun' : 'moon', { size: 18 });
  button.setAttribute('aria-label', dark ? 'Usar tema claro' : 'Usar tema escuro');
}

function refreshCounts() {
  for (const group of NAV) {
    for (const item of group.items) {
      if (!item.count) continue;
      const node = $(`[data-count="${item.path}"]`);
      if (node) node.textContent = String(item.count());
    }
  }
}

function markActiveNav(path) {
  for (const link of $$('[data-nav]')) {
    if (link.dataset.nav === path) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  const [title, subtitle] = PAGE_META[path] ?? ['Controle de Chamada', ''];
  $('[data-page-title]').textContent = title;
  $('[data-page-subtitle]').textContent = subtitle;
  document.title = `${title} · Controle de Chamada`;
}

function page(renderer) {
  return (params) => {
    const host = document.createElement('div');
    $('[data-view-host]').replaceChildren(host);

    renderer(host, params);
    refreshCounts();
    window.scrollTo({ top: 0 });
  };
}

function registerRoutes() {
  route('/dashboard', page(renderDashboard));
  route('/chamada', page(renderAttendance));
  route('/relatorios', page(renderReports));
  route('/turmas', page(renderClasses));
  route('/alunos', page(renderStudents));
  route('/professores', page(renderTeachers));
  route('/horarios', page(renderSchedule));

  setNotFound(page((host) => {
    render(host, `
      <div class="page"><div class="card"><div class="empty">
        <div class="icon-wrap">${icon('circle-alert', { size: 22 })}</div>
        <h3>Pagina nao encontrada</h3>
        <p>O endereco acessado nao corresponde a nenhuma tela do sistema.</p>
        <button class="btn btn-primary" data-home>Voltar ao dashboard</button>
      </div></div></div>`);
    delegate(host, 'click', '[data-home]', () => navigate('/dashboard'));
  }));
}

function openDataManager() {
  const { root } = openModal({
    title: 'Dados e backup',
    description: 'Os dados ficam no navegador deste dispositivo.',
    confirmLabel: 'Fechar',
    cancelLabel: 'Cancelar',
    size: 'sm',
    body: `
      <div class="col gap-16">
        <p class="small muted">
          Tudo e gravado em <code>localStorage</code>. Limpar os dados do navegador apaga o
          cadastro, entao exporte um backup antes de trocar de maquina.
        </p>
        <div class="col gap-8">
          <button type="button" class="btn" data-export-json>
            ${icon('download', { size: 15 })} Exportar backup (JSON)
          </button>
          <button type="button" class="btn" data-import-json>
            ${icon('upload', { size: 15 })} Importar backup
          </button>
          <button type="button" class="btn" data-reset-seed>
            ${icon('refresh-ccw', { size: 15 })} Restaurar dados de demonstracao
          </button>
          <button type="button" class="btn btn-danger" data-clear-all>
            ${icon('trash-2', { size: 15 })} Apagar todos os dados
          </button>
        </div>
        <input type="file" accept="application/json,.json" data-import-input class="sr-only" />
      </div>`,
    onConfirm: () => true,
  });

  const fileInput = $('[data-import-input]', root);

  $('[data-export-json]', root).addEventListener('click', () => {
    downloadFile('controle-chamada-backup.json', store.exportDatabase(), 'application/json');
    toastSuccess('Backup exportado');
  });

  $('[data-import-json]', root).addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      store.importDatabase(await file.text());
      toastSuccess('Backup importado', 'Os dados foram substituidos.');
      reboot();
    } catch (error) {
      toastError('Falha ao importar', error.message);
    } finally {
      fileInput.value = '';
    }
  });

  $('[data-reset-seed]', root).addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Restaurar demonstracao',
      message: 'Os dados atuais serao substituidos pela base de exemplo. Continuar?',
      confirmLabel: 'Restaurar',
    });
    if (!ok) return;
    store.resetToSeed();
    toastSuccess('Dados de demonstracao restaurados');
    reboot();
  });

  $('[data-clear-all]', root).addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Apagar todos os dados',
      message: 'Professores, turmas, alunos e todo o historico de chamadas serao removidos. Esta acao nao pode ser desfeita.',
      confirmLabel: 'Apagar tudo',
    });
    if (!ok) return;
    store.clearAll();
    toastSuccess('Base esvaziada');
    reboot();
  });
}

function reboot() {
  location.hash = buildHash('/dashboard');
  location.reload();
}

function boot() {
  store.loadState();

  renderShell();
  registerRoutes();
  onRouteChange(markActiveNav);
  watchSystemTheme();

  store.subscribe(refreshCounts);

  startRouter('/dashboard');

  if (!store.persistenceAvailable) {
    toastError(
      'Armazenamento indisponivel',
      'O navegador bloqueou o localStorage. As alteracoes valem apenas para esta sessao.',
    );
  }
}

boot();
