/**
 * teachers.js — cadastro de professores.
 *
 * Segue o padrao usado por todas as telas de CRUD: uma `createTable` para a
 * listagem e um `openModal` com formulario para criar/editar. A validacao roda
 * dentro do `onConfirm` do modal e devolve `false` para manter o dialogo aberto
 * quando algum campo esta invalido.
 */

import * as store from '../core/store.js';
import { icon } from '../core/icons.js';
import { delegate, e, render } from '../core/dom.js';
import { actionButton, bulkDeleteButton, createTable } from '../ui/table.js';
import { clearFieldErrors, confirmDialog, invalid, openModal } from '../ui/modal.js';
import { toastSuccess } from '../ui/toast.js';
import { initials } from '../core/utils.js';

export function renderTeachers(host) {
  render(host, `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Professores</h1>
          <p>Cadastro do corpo docente e das disciplinas ministradas.</p>
        </div>
        <button class="btn btn-primary" data-new>${icon('plus', { size: 16 })} Novo professor</button>
      </div>
      <div data-table-host></div>
    </div>
  `);

  const table = createTable({
    rows: () => store.teachers.list(),
    toolbarExtra: bulkDeleteButton(
      `Excluir todos (${store.teachers.list().length})`,
      store.teachers.list().length,
    ),
    searchFields: ['name', 'email', 'registration'],
    searchPlaceholder: 'Buscar por nome, e-mail ou matricula...',
    emptyTitle: 'Nenhum professor cadastrado',
    emptyMessage: 'Cadastre professores para associa-los as turmas e disciplinas.',
    emptyIcon: 'users',
    columns: [
      {
        key: 'name',
        label: 'Professor',
        sortable: true,
        render: (teacher) => `
          <div class="row gap-8">
            <span class="avatar avatar-sm" aria-hidden="true">${e(initials(teacher.name))}</span>
            <div>
              <div class="strong">${e(teacher.name)}</div>
              <div class="tiny faint">${e(teacher.email ?? '')}</div>
            </div>
          </div>`,
      },
      {
        key: 'registration',
        label: 'Matricula',
        sortable: true,
        render: (teacher) => `<span class="mono small">${e(teacher.registration ?? '—')}</span>`,
      },
      {
        key: 'subjects',
        label: 'Disciplinas',
        render: (teacher) => {
          const names = (teacher.subjectIds ?? [])
            .map((id) => store.subjects.get(id)?.name)
            .filter(Boolean);
          if (!names.length) return '<span class="faint small">—</span>';
          return `<div class="row wrap gap-4">${names
            .map((name) => `<span class="badge">${e(name)}</span>`).join('')}</div>`;
        },
      },
      {
        key: 'classes',
        label: 'Turmas',
        align: 'right',
        sortValue: (teacher) => store.classes.list().filter((c) => c.teacherId === teacher.id).length,
        render: (teacher) => {
          const count = store.classes.list().filter((c) => c.teacherId === teacher.id).length;
          return `<span class="mono">${count}</span>`;
        },
      },
    ],
    actions: (teacher) => `
      ${actionButton('pencil', { action: 'edit', id: teacher.id, label: 'Editar' })}
      ${actionButton('trash-2', { action: 'delete', id: teacher.id, label: 'Excluir', tone: 'btn-danger' })}
    `,
  });

  host.querySelector('[data-table-host]').append(table.element);

  delegate(host, 'click', '[data-new]', () => openTeacherForm(null, table));
  delegate(host, 'click', '[data-action="edit"]', (_event, target) => {
    openTeacherForm(store.teachers.get(target.dataset.id), table);
  });
  delegate(host, 'click', '[data-action="delete"]', async (_event, target) => {
    const teacher = store.teachers.get(target.dataset.id);
    if (!teacher) return;

    const linked = store.classes.list().filter((c) => c.teacherId === teacher.id);
    const ok = await confirmDialog({
      title: 'Excluir professor',
      message: linked.length
        ? `${teacher.name} e responsavel por ${linked.length} turma(s). Elas ficarao sem professor responsavel. Confirmar exclusao?`
        : `Excluir ${teacher.name}? Esta acao nao pode ser desfeita.`,
      confirmLabel: 'Excluir',
    });
    if (!ok) return;

    // Desvincula das turmas antes de remover, para nao deixar referencia orfa
    for (const schoolClass of linked) store.classes.update(schoolClass.id, { teacherId: '' });
    store.teachers.remove(teacher.id);
    toastSuccess('Professor excluido');
    table.refresh();
  });

  delegate(host, 'click', '[data-bulk-delete]', async () => {
    const total = store.teachers.list().length;
    if (!total) return;

    const comTurma = store.classes.list().filter((c) => c.teacherId).length;

    const ok = await confirmDialog({
      title: 'Excluir todos os professores',
      message: [
        `Serao excluidos os ${total} professor(es) cadastrados.`,
        comTurma ? `${comTurma} turma(s) ficarao sem professor responsavel.` : '',
        'Esta acao nao pode ser desfeita.',
      ].filter(Boolean).join(' '),
      confirmLabel: `Excluir ${total} professor(es)`,
    });
    if (!ok) return;

    const removed = store.removeAllTeachers();
    toastSuccess(`${removed} professor(es) excluido(s)`);
    renderTeachers(host);
  });
}

function openTeacherForm(teacher, table) {
  const isEdit = Boolean(teacher);
  const allSubjects = store.subjects.list();
  const selected = new Set(teacher?.subjectIds ?? []);

  openModal({
    title: isEdit ? 'Editar professor' : 'Novo professor',
    description: isEdit ? teacher.name : 'Preencha os dados do docente.',
    confirmLabel: isEdit ? 'Salvar alteracoes' : 'Cadastrar',
    body: `
      <div class="form-grid">
        <div class="field span-2">
          <label for="t-name">Nome completo *</label>
          <input id="t-name" name="name" class="input" value="${e(teacher?.name ?? '')}"
                 placeholder="Ex: Marina Albuquerque" autocomplete="off" />
        </div>
        <div class="field">
          <label for="t-email">E-mail *</label>
          <input id="t-email" name="email" type="email" class="input"
                 value="${e(teacher?.email ?? '')}" placeholder="nome@escola.edu.br" autocomplete="off" />
        </div>
        <div class="field">
          <label for="t-reg">Matricula *</label>
          <input id="t-reg" name="registration" class="input"
                 value="${e(teacher?.registration ?? '')}" placeholder="PROF-0000" autocomplete="off" />
        </div>
        <div class="field span-2">
          <label>Disciplinas ministradas</label>
          <div class="row wrap gap-8" style="padding: 4px 0;">
            ${allSubjects.length
              ? allSubjects.map((subject) => `
                  <label class="check">
                    <input type="checkbox" name="subjectIds" data-group="1" value="${e(subject.id)}"
                           ${selected.has(subject.id) ? 'checked' : ''} />
                    ${e(subject.name)}
                  </label>`).join('')
              : '<span class="hint">Nenhuma disciplina cadastrada ainda.</span>'}
          </div>
        </div>
      </div>
    `,
    onConfirm: (data, { root }) => {
      clearFieldErrors(root);

      if (!data.name) return invalid(root, 'name', 'Informe o nome do professor.');
      if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        return invalid(root, 'email', 'Informe um e-mail valido.');
      }
      if (!data.registration) {
        return invalid(root, 'registration', 'Informe a matricula.');
      }

      // Matricula e a chave de negocio: precisa ser unica
      const duplicate = store.teachers.list().some(
        (item) => item.id !== teacher?.id
          && item.registration?.toLowerCase() === data.registration.toLowerCase(),
      );
      if (duplicate) {
        return invalid(root, 'registration', 'Ja existe um professor com esta matricula.');
      }

      const payload = {
        name: data.name,
        email: data.email,
        registration: data.registration,
        subjectIds: data.subjectIds ?? [],
      };

      if (isEdit) store.teachers.update(teacher.id, payload);
      else store.teachers.create(payload);

      toastSuccess(isEdit ? 'Professor atualizado' : 'Professor cadastrado', payload.name);
      table.refresh();
      return true;
    },
  });
}
