import * as store from '../core/store.js';
import * as analytics from '../core/analytics.js';
import { icon } from '../core/icons.js';
import { $, delegate, e, render } from '../core/dom.js';
import { navigate, setParams } from '../core/router.js';
import { actionButton, bulkDeleteButton, createTable } from '../ui/table.js';
import { clearFieldErrors, confirmDialog, invalid, openModal } from '../ui/modal.js';
import { toastError, toastSuccess } from '../ui/toast.js';
import { initials, percent } from '../core/utils.js';

const AVATAR_SIZE = 128;

export function renderStudents(host, params) {
  const classes = store.classes.list();
  const classFilter = params.turma ?? '';

  render(host, `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Alunos</h1>
          <p>Cadastro, numero de chamada e vinculo com turmas.</p>
        </div>
        <button class="btn btn-primary" data-new>${icon('plus', { size: 16 })} Novo aluno</button>
      </div>
      <div data-table-host></div>
    </div>
  `);

  const targets = classFilter
    ? store.studentsOfClass(classFilter)
    : store.students.list();

  const filterName = classFilter ? store.classes.get(classFilter)?.name : null;

  const filterSelect = `
    <div class="field" style="min-width: 210px;">
      <select class="select" data-class-filter aria-label="Filtrar por turma">
        <option value="">Todas as turmas</option>
        ${classes.map((schoolClass) => `
          <option value="${e(schoolClass.id)}" ${schoolClass.id === classFilter ? 'selected' : ''}>
            ${e(schoolClass.name)}
          </option>`).join('')}
      </select>
    </div>
    ${bulkDeleteButton(
      filterName ? `Excluir os ${targets.length} desta turma` : `Excluir todos (${targets.length})`,
      targets.length,
    )}`;

  const table = createTable({
    rows: () => {
      const all = store.students.list();
      return classFilter
        ? all.filter((student) => (student.classIds ?? []).includes(classFilter))
        : all;
    },
    searchFields: ['name', 'registration', (row) => String(row.rollNumber ?? '')],
    searchPlaceholder: 'Buscar por nome, matricula ou numero...',
    emptyTitle: classFilter ? 'Nenhum aluno nesta turma' : 'Nenhum aluno cadastrado',
    emptyMessage: 'Cadastre alunos e vincule-os a turmas para liberar a chamada.',
    emptyIcon: 'users',
    pageSize: 12,
    toolbarExtra: filterSelect,
    columns: [
      {
        key: 'rollNumber',
        label: 'No.',
        align: 'right',
        sortable: true,
        render: (row) => `<span class="mono strong">${row.rollNumber ?? '—'}</span>`,
      },
      {
        key: 'name',
        label: 'Aluno',
        sortable: true,
        render: (row) => `
          <div class="row gap-8">
            ${avatarMarkup(row, 'avatar-sm')}
            <div class="grow">
              <div class="strong truncate">${e(row.name)}</div>
              <div class="tiny faint mono">${e(row.registration ?? '')}</div>
            </div>
          </div>`,
      },
      {
        key: 'classes',
        label: 'Turmas',
        render: (row) => {
          const names = (row.classIds ?? []).map((id) => store.classes.get(id)?.name).filter(Boolean);
          if (!names.length) return '<span class="badge badge-absent">Sem turma</span>';
          return `<div class="row wrap gap-4">${names
            .map((name) => `<span class="badge">${e(name)}</span>`).join('')}</div>`;
        },
      },
      {
        key: 'attendance',
        label: 'Frequencia',
        sortable: true,
        sortValue: (row) => attendanceRate(row.id) ?? -1,
        render: (row) => {
          const rate = attendanceRate(row.id);
          if (rate == null) return '<span class="faint small">sem registros</span>';
          const tone = rate >= 85 ? 'is-good' : rate >= 75 ? 'is-warn' : 'is-bad';
          return `
            <div class="row gap-8" style="min-width: 150px;">
              <div class="meter ${tone} grow"><span style="width: ${rate}%;"></span></div>
              <span class="mono small nowrap">${e(percent(rate, 0))}</span>
            </div>`;
        },
      },
    ],
    actions: (row) => `
      ${actionButton('file-bar-chart', { action: 'report', id: row.id, label: 'Relatorio' })}
      ${actionButton('pencil', { action: 'edit', id: row.id, label: 'Editar' })}
      ${actionButton('trash-2', { action: 'delete', id: row.id, label: 'Excluir', tone: 'btn-danger' })}
    `,
  });

  $('[data-table-host]', host).append(table.element);

  delegate(host, 'change', '[data-class-filter]', (_event, target) => {
    setParams({ turma: target.value });
  });

  delegate(host, 'click', '[data-new]', () => openStudentForm(null, table, classFilter));
  delegate(host, 'click', '[data-action="edit"]', (_event, target) => {
    openStudentForm(store.students.get(target.dataset.id), table);
  });
  delegate(host, 'click', '[data-action="report"]', (_event, target) => {
    navigate('/relatorios', { aluno: target.dataset.id });
  });
  delegate(host, 'click', '[data-action="delete"]', async (_event, target) => {
    const student = store.students.get(target.dataset.id);
    if (!student) return;

    const ok = await confirmDialog({
      title: 'Excluir aluno',
      message: `Excluir ${student.name} remove tambem o historico de presenca dele. Esta acao nao pode ser desfeita.`,
      confirmLabel: 'Excluir',
    });
    if (!ok) return;

    store.removeStudent(student.id);
    toastSuccess('Aluno excluido', student.name);
    table.refresh();
  });

  delegate(host, 'click', '[data-bulk-delete]', async () => {
    if (!targets.length) return;

    const comHistorico = targets.filter((student) =>
      store.attendanceList({ studentId: student.id }).length).length;

    const ok = await confirmDialog({
      title: filterName ? 'Excluir alunos da turma' : 'Excluir todos os alunos',
      message: [
        filterName
          ? `Serao excluidos os ${targets.length} aluno(s) de "${filterName}".`
          : `Serao excluidos os ${targets.length} aluno(s) cadastrados.`,
        comHistorico
          ? `${comHistorico} deles possuem historico de presenca, que sera removido junto.`
          : '',
        'Esta acao nao pode ser desfeita.',
      ].filter(Boolean).join(' '),
      confirmLabel: `Excluir ${targets.length} aluno(s)`,
    });
    if (!ok) return;

    const removed = store.removeStudents(targets.map((student) => student.id));
    toastSuccess(`${removed} aluno(s) excluido(s)`);
    renderStudents(host, params);
  });
}

function avatarMarkup(student, size = '') {
  return student.avatar
    ? `<img class="avatar ${size}" src="${e(student.avatar)}" alt="" loading="lazy" />`
    : `<span class="avatar ${size}" aria-hidden="true">${e(initials(student.name))}</span>`;
}

function attendanceRate(studentId) {
  const [row] = analytics.perStudent({ studentId });
  return row ? row.rate : null;
}

function openStudentForm(student, table, defaultClassId = '') {
  const isEdit = Boolean(student);
  const classes = store.classes.list();
  const selected = new Set(student?.classIds ?? (defaultClassId ? [defaultClassId] : []));

  let avatar = student?.avatar ?? null;

  const modal = openModal({
    title: isEdit ? 'Editar aluno' : 'Novo aluno',
    description: isEdit ? student.name : 'Dados basicos e vinculo com turmas.',
    confirmLabel: isEdit ? 'Salvar alteracoes' : 'Cadastrar',
    size: 'lg',
    body: `
      <div class="row gap-16" style="margin-bottom: 18px; align-items: flex-start;">
        <div data-avatar-preview>${avatarMarkup({ name: student?.name ?? '?', avatar }, 'avatar-lg')}</div>
        <div class="col grow gap-4">
          <div class="row gap-8">
            <button type="button" class="btn btn-sm" data-pick-avatar>
              ${icon('upload', { size: 15 })} Enviar foto
            </button>
            <button type="button" class="btn btn-sm btn-ghost" data-clear-avatar
                    ${avatar ? '' : 'hidden'}>Remover</button>
          </div>
          <span class="hint">JPG ou PNG, ate 2 MB. A imagem e reduzida para ${AVATAR_SIZE}px antes de ser salva.</span>
          <input type="file" accept="image/png,image/jpeg,image/webp" data-avatar-input class="sr-only" />
        </div>
      </div>

      <div class="form-grid">
        <div class="field span-2">
          <label for="st-name">Nome completo *</label>
          <input id="st-name" name="name" class="input" value="${e(student?.name ?? '')}"
                 placeholder="Ex: Ana Beatriz Ferreira" autocomplete="off" />
        </div>
        <div class="field">
          <label for="st-roll">Numero de chamada *</label>
          <input id="st-roll" name="rollNumber" type="number" min="1" max="999" class="input"
                 value="${e(student?.rollNumber ?? '')}" placeholder="1" />
        </div>
        <div class="field">
          <label for="st-reg">Matricula *</label>
          <input id="st-reg" name="registration" class="input"
                 value="${e(student?.registration ?? '')}" placeholder="20241001" autocomplete="off" />
        </div>
        <div class="field span-2">
          <label>Turmas *</label>
          <div class="row wrap gap-8" style="padding: 4px 0;">
            ${classes.length
              ? classes.map((schoolClass) => `
                  <label class="check">
                    <input type="checkbox" name="classIds" data-group="1" value="${e(schoolClass.id)}"
                           ${selected.has(schoolClass.id) ? 'checked' : ''} />
                    ${e(schoolClass.name)}
                  </label>`).join('')
              : '<span class="hint">Cadastre uma turma antes de vincular alunos.</span>'}
          </div>
        </div>
      </div>
    `,
    onConfirm: (data, { root }) => {
      clearFieldErrors(root);

      if (!data.name) return invalid(root, 'name', 'Informe o nome do aluno.');
      if (!data.rollNumber) return invalid(root, 'rollNumber', 'Informe o numero de chamada.');
      if (!data.registration) return invalid(root, 'registration', 'Informe a matricula.');

      const classIds = data.classIds ?? [];
      if (!classIds.length) {
        return invalid(root, 'classIds', 'Vincule o aluno a pelo menos uma turma.');
      }

      const rollNumber = Number(data.rollNumber);

      const conflict = store.students.list().find((other) =>
        other.id !== student?.id
        && other.rollNumber === rollNumber
        && (other.classIds ?? []).some((id) => classIds.includes(id)));

      if (conflict) {
        const turma = store.classes.get(conflict.classIds.find((id) => classIds.includes(id)));
        return invalid(root, 'rollNumber',
          `O numero ${rollNumber} ja pertence a ${conflict.name} em ${turma?.name ?? 'uma turma selecionada'}.`);
      }

      const payload = {
        name: data.name,
        rollNumber,
        registration: data.registration,
        classIds,
        avatar,
      };

      if (isEdit) store.students.update(student.id, payload);
      else store.students.create(payload);

      toastSuccess(isEdit ? 'Aluno atualizado' : 'Aluno cadastrado', payload.name);
      table.refresh();
      return true;
    },
  });

  const root = modal.root;
  const fileInput = $('[data-avatar-input]', root);

  $('[data-pick-avatar]', root).addEventListener('click', () => fileInput.click());

  $('[data-clear-avatar]', root).addEventListener('click', () => {
    avatar = null;
    refreshAvatarPreview(root, $('[name="name"]', root).value, avatar);
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      toastError('Imagem muito grande', 'Envie um arquivo de ate 2 MB.');
      fileInput.value = '';
      return;
    }

    try {
      avatar = await readAvatar(file);
      refreshAvatarPreview(root, $('[name="name"]', root).value, avatar);
    } catch {
      toastError('Nao foi possivel ler a imagem', 'Tente outro arquivo.');
    } finally {
      fileInput.value = '';
    }
  });
}

function refreshAvatarPreview(root, name, avatar) {
  $('[data-avatar-preview]', root).innerHTML = avatarMarkup({ name: name || '?', avatar }, 'avatar-lg');
  $('[data-clear-avatar]', root).hidden = !avatar;
}

function readAvatar(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Imagem invalida'));
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;

        const side = Math.min(image.width, image.height);
        const sx = (image.width - side) / 2;
        const sy = (image.height - side) / 2;

        canvas.getContext('2d').drawImage(image, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.src = reader.result;
    };

    reader.readAsDataURL(file);
  });
}
