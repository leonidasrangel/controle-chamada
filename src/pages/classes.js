import * as store from '../core/store.js';
import { icon } from '../core/icons.js';
import { $, delegate, e, render } from '../core/dom.js';
import { navigate, setParams } from '../core/router.js';
import { actionButton, bulkDeleteButton, createTable } from '../ui/table.js';
import { clearFieldErrors, confirmDialog, invalid, openModal } from '../ui/modal.js';
import { toastSuccess } from '../ui/toast.js';

export function renderClasses(host, params) {
  const tab = params.aba === 'disciplinas' ? 'disciplinas' : 'turmas';

  render(host, `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Turmas &amp; Disciplinas</h1>
          <p>Estrutura academica: o que e ensinado e para quem.</p>
        </div>
        <button class="btn btn-primary" data-new>
          ${icon('plus', { size: 16 })} ${tab === 'turmas' ? 'Nova turma' : 'Nova disciplina'}
        </button>
      </div>

      <div class="tabs" role="tablist">
        <button class="tab" role="tab" data-tab="turmas" aria-selected="${tab === 'turmas'}">Turmas</button>
        <button class="tab" role="tab" data-tab="disciplinas" aria-selected="${tab === 'disciplinas'}">Disciplinas</button>
      </div>

      <div data-table-host></div>
    </div>
  `);

  delegate(host, 'click', '[data-tab]', (_event, target) => {
    setParams({ aba: target.dataset.tab });
  });

  const table = tab === 'turmas' ? buildClassTable() : buildSubjectTable();
  $('[data-table-host]', host).append(table.element);

  delegate(host, 'click', '[data-new]', () => {
    if (tab === 'turmas') openClassForm(null, table);
    else openSubjectForm(null, table);
  });

  delegate(host, 'click', '[data-action="edit"]', (_event, target) => {
    const { id } = target.dataset;
    if (tab === 'turmas') openClassForm(store.classes.get(id), table);
    else openSubjectForm(store.subjects.get(id), table);
  });

  delegate(host, 'click', '[data-action="delete"]', async (_event, target) => {
    const { id } = target.dataset;
    if (tab === 'turmas') await deleteClass(id, table);
    else await deleteSubject(id, table);
  });

  delegate(host, 'click', '[data-action="attendance"]', (_event, target) => {
    navigate('/chamada', { turma: target.dataset.id });
  });

  delegate(host, 'click', '[data-bulk-delete]', async () => {
    const ok = tab === 'turmas' ? await confirmAllClasses() : await confirmAllSubjects();
    if (!ok) return;

    const removed = tab === 'turmas' ? store.removeAllClasses() : store.removeAllSubjects();
    toastSuccess(tab === 'turmas'
      ? `${removed} turma(s) excluida(s)`
      : `${removed} disciplina(s) excluida(s)`);
    renderClasses(host, params);
  });
}

function confirmAllClasses() {
  const total = store.classes.list().length;
  const lessons = store.lessons.list().length;
  const attendance = store.attendanceList().length;

  return confirmDialog({
    title: 'Excluir todas as turmas',
    message: [
      `Serao excluidas as ${total} turma(s) cadastradas.`,
      attendance ? `Todo o historico de chamadas (${attendance} registro(s)) sera removido.` : '',
      lessons ? `A grade semanal (${lessons} horario(s)) tambem sera apagada.` : '',
      'Os alunos permanecem cadastrados, mas ficarao sem turma.',
      'Esta acao nao pode ser desfeita.',
    ].filter(Boolean).join(' '),
    confirmLabel: `Excluir ${total} turma(s)`,
  });
}

function confirmAllSubjects() {
  const total = store.subjects.list().length;
  const lessons = store.lessons.list().length;
  const attendance = store.attendanceList().length;

  return confirmDialog({
    title: 'Excluir todas as disciplinas',
    message: [
      `Serao excluidas as ${total} disciplina(s) cadastradas.`,
      'Elas serao desvinculadas de todas as turmas e professores.',
      lessons ? `A grade semanal (${lessons} horario(s)) sera apagada, pois toda aula depende de uma disciplina.` : '',
      attendance ? 'O historico de chamadas e preservado, mas passara a exibir "Disciplina removida".' : '',
      'Esta acao nao pode ser desfeita.',
    ].filter(Boolean).join(' '),
    confirmLabel: `Excluir ${total} disciplina(s)`,
  });
}

function buildClassTable() {
  return createTable({
    rows: () => store.classes.list(),
    toolbarExtra: bulkDeleteButton(
      `Excluir todas (${store.classes.list().length})`,
      store.classes.list().length,
    ),
    searchFields: ['name', 'room', (row) => store.teachers.get(row.teacherId)?.name ?? ''],
    searchPlaceholder: 'Buscar por turma, sala ou professor...',
    emptyTitle: 'Nenhuma turma cadastrada',
    emptyMessage: 'Crie uma turma para vincular alunos, disciplinas e horarios.',
    emptyIcon: 'book-open',
    columns: [
      {
        key: 'name',
        label: 'Turma',
        sortable: true,
        render: (row) => `
          <div class="strong">${e(row.name)}</div>
          <div class="tiny faint row gap-4">
            ${icon('map-pin', { size: 11 })} ${e(row.room ?? 'Sala nao definida')}
          </div>`,
      },
      {
        key: 'teacher',
        label: 'Professor responsavel',
        sortable: true,
        sortValue: (row) => store.teachers.get(row.teacherId)?.name ?? '',
        render: (row) => {
          const teacher = store.teachers.get(row.teacherId);
          return teacher
            ? `<span class="small">${e(teacher.name)}</span>`
            : '<span class="badge badge-absent">Sem responsavel</span>';
        },
      },
      {
        key: 'subjects',
        label: 'Disciplinas',
        render: (row) => {
          const names = (row.subjectIds ?? []).map((id) => store.subjects.get(id)?.name).filter(Boolean);
          if (!names.length) return '<span class="faint small">—</span>';
          const shown = names.slice(0, 3);
          return `<div class="row wrap gap-4">
            ${shown.map((name) => `<span class="badge">${e(name)}</span>`).join('')}
            ${names.length > shown.length ? `<span class="badge">+${names.length - shown.length}</span>` : ''}
          </div>`;
        },
      },
      {
        key: 'students',
        label: 'Alunos',
        align: 'right',
        sortable: true,
        sortValue: (row) => store.studentsOfClass(row.id).length,
        render: (row) => `<span class="mono">${store.studentsOfClass(row.id).length}</span>`,
      },
      {
        key: 'weeklyHours',
        label: 'Carga/sem.',
        align: 'right',
        sortable: true,
        render: (row) => `<span class="mono">${row.weeklyHours ?? '—'}h</span>`,
      },
    ],
    actions: (row) => `
      ${actionButton('clipboard-check', { action: 'attendance', id: row.id, label: 'Fazer chamada' })}
      ${actionButton('pencil', { action: 'edit', id: row.id, label: 'Editar' })}
      ${actionButton('trash-2', { action: 'delete', id: row.id, label: 'Excluir', tone: 'btn-danger' })}
    `,
  });
}

function openClassForm(schoolClass, table) {
  const isEdit = Boolean(schoolClass);
  const teachers = store.teachers.list();
  const subjects = store.subjects.list();
  const selected = new Set(schoolClass?.subjectIds ?? []);

  openModal({
    title: isEdit ? 'Editar turma' : 'Nova turma',
    description: isEdit ? schoolClass.name : 'Defina identificacao, responsavel e disciplinas.',
    confirmLabel: isEdit ? 'Salvar alteracoes' : 'Criar turma',
    size: 'lg',
    body: `
      <div class="form-grid">
        <div class="field span-2">
          <label for="c-name">Nome da turma *</label>
          <input id="c-name" name="name" class="input" value="${e(schoolClass?.name ?? '')}"
                 placeholder="Ex: 3o Ano B - Ensino Medio" autocomplete="off" />
        </div>
        <div class="field">
          <label for="c-teacher">Professor responsavel</label>
          <select id="c-teacher" name="teacherId" class="select">
            <option value="">Nao definido</option>
            ${teachers.map((teacher) => `
              <option value="${e(teacher.id)}" ${teacher.id === schoolClass?.teacherId ? 'selected' : ''}>
                ${e(teacher.name)}
              </option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="c-room">Sala</label>
          <input id="c-room" name="room" class="input" value="${e(schoolClass?.room ?? '')}"
                 placeholder="Ex: Sala 12" autocomplete="off" />
        </div>
        <div class="field">
          <label for="c-hours">Carga horaria semanal (h)</label>
          <input id="c-hours" name="weeklyHours" type="number" min="0" max="60" class="input"
                 value="${e(schoolClass?.weeklyHours ?? '')}" placeholder="25" />
        </div>
        <div class="field span-2">
          <label>Disciplinas da turma</label>
          <div class="row wrap gap-8" style="padding: 4px 0;">
            ${subjects.length
              ? subjects.map((subject) => `
                  <label class="check">
                    <input type="checkbox" name="subjectIds" data-group="1" value="${e(subject.id)}"
                           ${selected.has(subject.id) ? 'checked' : ''} />
                    ${e(subject.name)}
                  </label>`).join('')
              : '<span class="hint">Cadastre disciplinas na aba ao lado antes de vincula-las.</span>'}
          </div>
          <span class="hint">Somente disciplinas marcadas aqui aparecem no filtro da chamada.</span>
        </div>
      </div>
    `,
    onConfirm: (data, { root }) => {
      clearFieldErrors(root);
      if (!data.name) return invalid(root, 'name', 'Informe o nome da turma.');

      const payload = {
        name: data.name,
        teacherId: data.teacherId ?? '',
        room: data.room ?? '',
        weeklyHours: data.weeklyHours ? Number(data.weeklyHours) : null,
        subjectIds: data.subjectIds ?? [],
      };

      if (isEdit) store.classes.update(schoolClass.id, payload);
      else store.classes.create(payload);

      toastSuccess(isEdit ? 'Turma atualizada' : 'Turma criada', payload.name);
      table.refresh();
      return true;
    },
  });
}

async function deleteClass(id, table) {
  const schoolClass = store.classes.get(id);
  if (!schoolClass) return;

  const students = store.studentsOfClass(id).length;
  const attendance = store.attendanceList({ classId: id }).length;

  const ok = await confirmDialog({
    title: 'Excluir turma',
    message: `Excluir "${schoolClass.name}" tambem remove ${attendance} chamada(s) e ${students} vinculo(s) de aluno, alem dos horarios da grade. Esta acao nao pode ser desfeita.`,
    confirmLabel: 'Excluir tudo',
  });
  if (!ok) return;

  store.classes.remove(id);
  toastSuccess('Turma excluida', schoolClass.name);
  table.refresh();
}

function buildSubjectTable() {
  return createTable({
    rows: () => store.subjects.list(),
    toolbarExtra: bulkDeleteButton(
      `Excluir todas (${store.subjects.list().length})`,
      store.subjects.list().length,
    ),
    searchFields: ['name'],
    searchPlaceholder: 'Buscar disciplina...',
    emptyTitle: 'Nenhuma disciplina cadastrada',
    emptyMessage: 'Disciplinas sao a base da chamada: cada aula pertence a uma delas.',
    emptyIcon: 'book-open',
    pageSize: 12,
    columns: [
      { key: 'name', label: 'Disciplina', sortable: true, render: (row) => `<span class="strong">${e(row.name)}</span>` },
      {
        key: 'classes',
        label: 'Turmas que oferecem',
        align: 'right',
        sortable: true,
        sortValue: (row) => store.classes.list().filter((c) => (c.subjectIds ?? []).includes(row.id)).length,
        render: (row) => {
          const count = store.classes.list().filter((c) => (c.subjectIds ?? []).includes(row.id)).length;
          return `<span class="mono">${count}</span>`;
        },
      },
      {
        key: 'teachers',
        label: 'Professores',
        align: 'right',
        sortValue: (row) => store.teachers.list().filter((t) => (t.subjectIds ?? []).includes(row.id)).length,
        render: (row) => {
          const count = store.teachers.list().filter((t) => (t.subjectIds ?? []).includes(row.id)).length;
          return `<span class="mono">${count}</span>`;
        },
      },
    ],
    actions: (row) => `
      ${actionButton('pencil', { action: 'edit', id: row.id, label: 'Editar' })}
      ${actionButton('trash-2', { action: 'delete', id: row.id, label: 'Excluir', tone: 'btn-danger' })}
    `,
  });
}

function openSubjectForm(subject, table) {
  const isEdit = Boolean(subject);

  openModal({
    title: isEdit ? 'Editar disciplina' : 'Nova disciplina',
    confirmLabel: isEdit ? 'Salvar' : 'Cadastrar',
    size: 'sm',
    body: `
      <div class="field">
        <label for="s-name">Nome da disciplina *</label>
        <input id="s-name" name="name" class="input" value="${e(subject?.name ?? '')}"
               placeholder="Ex: Matematica" autocomplete="off" />
      </div>`,
    onConfirm: (data, { root }) => {
      clearFieldErrors(root);
      if (!data.name) return invalid(root, 'name', 'Informe o nome da disciplina.');

      const duplicate = store.subjects.list().some(
        (item) => item.id !== subject?.id && item.name.toLowerCase() === data.name.toLowerCase(),
      );
      if (duplicate) return invalid(root, 'name', 'Ja existe uma disciplina com este nome.');

      if (isEdit) store.subjects.update(subject.id, { name: data.name });
      else store.subjects.create({ name: data.name });

      toastSuccess(isEdit ? 'Disciplina atualizada' : 'Disciplina cadastrada', data.name);
      table.refresh();
      return true;
    },
  });
}

async function deleteSubject(id, table) {
  const subject = store.subjects.get(id);
  if (!subject) return;

  const usedByClasses = store.classes.list().filter((c) => (c.subjectIds ?? []).includes(id));
  const attendance = store.attendanceList({ subjectId: id }).length;

  const ok = await confirmDialog({
    title: 'Excluir disciplina',
    message: attendance
      ? `"${subject.name}" possui ${attendance} chamada(s) registrada(s). Excluir a disciplina desvincula-a de ${usedByClasses.length} turma(s), mas o historico de chamadas e mantido.`
      : `Excluir "${subject.name}"? Ela sera desvinculada de ${usedByClasses.length} turma(s).`,
    confirmLabel: 'Excluir',
  });
  if (!ok) return;

  for (const schoolClass of usedByClasses) {
    store.classes.update(schoolClass.id, {
      subjectIds: schoolClass.subjectIds.filter((subjectId) => subjectId !== id),
    });
  }
  for (const teacher of store.teachers.list()) {
    if ((teacher.subjectIds ?? []).includes(id)) {
      store.teachers.update(teacher.id, {
        subjectIds: teacher.subjectIds.filter((subjectId) => subjectId !== id),
      });
    }
  }

  store.subjects.remove(id);
  toastSuccess('Disciplina excluida', subject.name);
  table.refresh();
}
