import * as store from '../core/store.js';
import { icon } from '../core/icons.js';
import { $, delegate, e, render } from '../core/dom.js';
import { navigate, setParams } from '../core/router.js';
import { clearFieldErrors, confirmDialog, invalid, openModal } from '../ui/modal.js';
import { toastSuccess } from '../ui/toast.js';
import { minutesBetween, todayISO, weekdayOf, WEEKDAYS } from '../core/utils.js';

export function renderSchedule(host, params) {
  const classes = store.classes.list();
  const classId = params.turma && classes.some((c) => c.id === params.turma)
    ? params.turma
    : classes[0]?.id ?? '';

  render(host, `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Dias e Horarios</h1>
          <p>Grade semanal de aulas de cada turma.</p>
        </div>
        <button class="btn btn-primary" data-new ${classId ? '' : 'disabled'}>
          ${icon('plus', { size: 16 })} Novo horario
        </button>
      </div>

      <div class="toolbar">
        <div class="field" style="max-width: 320px;">
          <label for="sched-class">Turma</label>
          <select id="sched-class" class="select" data-class-filter>
            ${classes.length
              ? classes.map((schoolClass) => `
                  <option value="${e(schoolClass.id)}" ${schoolClass.id === classId ? 'selected' : ''}>
                    ${e(schoolClass.name)}
                  </option>`).join('')
              : '<option value="">Nenhuma turma cadastrada</option>'}
          </select>
        </div>
        <div class="toolbar-end">${renderWeekSummary(classId)}</div>
      </div>

      <div data-grid-host></div>
    </div>
  `);

  renderGrid(host, classId);

  delegate(host, 'change', '[data-class-filter]', (_event, target) => {
    setParams({ turma: target.value });
  });

  delegate(host, 'click', '[data-new]', () => openLessonForm(null, classId, host));

  delegate(host, 'click', '[data-add-day]', (_event, target) => {
    openLessonForm(null, classId, host, Number(target.dataset.addDay));
  });

  delegate(host, 'click', '[data-edit-lesson]', (_event, target) => {
    openLessonForm(store.lessons.get(target.dataset.editLesson), classId, host);
  });

  delegate(host, 'click', '[data-delete-lesson]', async (_event, target) => {
    const lesson = store.lessons.get(target.dataset.deleteLesson);
    if (!lesson) return;

    const subject = store.subjects.get(lesson.subjectId);
    const ok = await confirmDialog({
      title: 'Remover horario',
      message: `Remover ${subject?.name ?? 'a aula'} de ${WEEKDAYS[lesson.weekday].label}, das ${lesson.start} as ${lesson.end}? As chamadas ja registradas nao sao afetadas.`,
      confirmLabel: 'Remover',
    });
    if (!ok) return;

    store.lessons.remove(lesson.id);
    toastSuccess('Horario removido');
    renderSchedule(host, { turma: classId });
  });

  delegate(host, 'click', '[data-lesson-attendance]', (_event, target) => {
    const lesson = store.lessons.get(target.dataset.lessonAttendance);
    if (lesson) navigate('/chamada', { turma: lesson.classId, disciplina: lesson.subjectId });
  });
}

function renderWeekSummary(classId) {
  if (!classId) return '';

  const lessons = store.lessonsOfClass(classId);
  if (!lessons.length) return '<span class="badge">Sem horarios</span>';

  const minutes = lessons.reduce((sum, lesson) => sum + minutesBetween(lesson.start, lesson.end), 0);
  const days = new Set(lessons.map((lesson) => lesson.weekday)).size;

  return `
    <span class="badge badge-accent">${lessons.length} aula(s)/semana</span>
    <span class="badge">${days} dia(s) letivo(s)</span>
    <span class="badge">${(minutes / 60).toFixed(1).replace('.', ',')}h semanais</span>
  `;
}

function renderGrid(host, classId) {
  const hostNode = $('[data-grid-host]', host);

  if (!classId) {
    hostNode.innerHTML = `
      <div class="card"><div class="empty">
        <div class="icon-wrap">${icon('calendar-days', { size: 22 })}</div>
        <h3>Nenhuma turma cadastrada</h3>
        <p>Crie uma turma em "Turmas &amp; Disciplinas" para montar a grade semanal.</p>
      </div></div>`;
    return;
  }

  const lessons = store.lessonsOfClass(classId);
  const today = weekdayOf(todayISO());

  const days = WEEKDAYS.filter((day) => day.value !== 0 || lessons.some((l) => l.weekday === 0));

  hostNode.innerHTML = `
    <div class="week-grid">
      ${days.map((day) => {
        const dayLessons = lessons.filter((lesson) => lesson.weekday === day.value);
        return `
          <div class="day-col" data-today="${day.value === today}">
            <header>
              <span>${e(day.label)}</span>
              <button class="btn btn-ghost btn-icon btn-sm" data-add-day="${day.value}"
                      data-tip="Adicionar aula" aria-label="Adicionar aula em ${e(day.label)}">
                ${icon('plus', { size: 14 })}
              </button>
            </header>
            ${dayLessons.length
              ? dayLessons.map(renderSlot).join('')
              : '<p class="tiny faint" style="padding: 6px 2px;">Sem aulas</p>'}
          </div>`;
      }).join('')}
    </div>`;
}

function renderSlot(lesson) {
  const subject = store.subjects.get(lesson.subjectId);
  const duration = minutesBetween(lesson.start, lesson.end);

  return `
    <article class="slot">
      <span class="slot-time">${e(lesson.start)} – ${e(lesson.end)}</span>
      <span class="slot-title">${e(subject?.name ?? 'Disciplina removida')}</span>
      <span class="slot-sub">${duration} min</span>
      <div class="slot-actions">
        <button class="btn btn-ghost btn-icon btn-sm" data-lesson-attendance="${e(lesson.id)}"
                data-tip="Chamada" aria-label="Fazer chamada desta aula">
          ${icon('clipboard-check', { size: 14 })}
        </button>
        <button class="btn btn-ghost btn-icon btn-sm" data-edit-lesson="${e(lesson.id)}"
                data-tip="Editar" aria-label="Editar horario">${icon('pencil', { size: 14 })}</button>
        <button class="btn btn-ghost btn-icon btn-sm" data-delete-lesson="${e(lesson.id)}"
                data-tip="Remover" aria-label="Remover horario">${icon('trash-2', { size: 14 })}</button>
      </div>
    </article>`;
}

function openLessonForm(lesson, classId, host, presetWeekday = null) {
  const isEdit = Boolean(lesson);
  const subjects = store.subjectsOfClass(classId);
  const weekday = lesson?.weekday ?? presetWeekday ?? 1;

  openModal({
    title: isEdit ? 'Editar horario' : 'Novo horario',
    description: store.classes.get(classId)?.name,
    confirmLabel: isEdit ? 'Salvar' : 'Adicionar',
    body: `
      <div class="form-grid">
        <div class="field span-2">
          <label for="l-subject">Disciplina *</label>
          <select id="l-subject" name="subjectId" class="select">
            ${subjects.length
              ? subjects.map((subject) => `
                  <option value="${e(subject.id)}" ${subject.id === lesson?.subjectId ? 'selected' : ''}>
                    ${e(subject.name)}
                  </option>`).join('')
              : '<option value="">Nenhuma disciplina vinculada a turma</option>'}
          </select>
          ${subjects.length ? '' : '<span class="hint">Vincule disciplinas a esta turma primeiro.</span>'}
        </div>
        <div class="field span-2">
          <label for="l-weekday">Dia da semana *</label>
          <select id="l-weekday" name="weekday" class="select">
            ${WEEKDAYS.map((day) => `
              <option value="${day.value}" ${day.value === weekday ? 'selected' : ''}>${e(day.label)}</option>
            `).join('')}
          </select>
        </div>
        <div class="field">
          <label for="l-start">Inicio *</label>
          <input id="l-start" name="start" type="time" class="input" value="${e(lesson?.start ?? '07:30')}" />
        </div>
        <div class="field">
          <label for="l-end">Termino *</label>
          <input id="l-end" name="end" type="time" class="input" value="${e(lesson?.end ?? '09:10')}" />
        </div>
      </div>`,
    onConfirm: (data, { root }) => {
      clearFieldErrors(root);

      if (!data.subjectId) return invalid(root, 'subjectId', 'Selecione uma disciplina.');
      if (!data.start || !data.end) return invalid(root, 'start', 'Informe inicio e termino.');
      if (minutesBetween(data.start, data.end) <= 0) {
        return invalid(root, 'end', 'O termino precisa ser depois do inicio.');
      }

      const payload = {
        classId,
        subjectId: data.subjectId,
        weekday: Number(data.weekday),
        start: data.start,
        end: data.end,
      };

      const overlapping = store.lessonsOfClass(classId).find((other) =>
        other.id !== lesson?.id
        && other.weekday === payload.weekday
        && payload.start < other.end
        && payload.end > other.start);

      if (overlapping) {
        const subject = store.subjects.get(overlapping.subjectId);
        return invalid(root, 'start',
          `Conflita com ${subject?.name ?? 'outra aula'} (${overlapping.start}–${overlapping.end}).`);
      }

      if (isEdit) store.lessons.update(lesson.id, payload);
      else store.lessons.create(payload);

      toastSuccess(isEdit ? 'Horario atualizado' : 'Horario adicionado');
      renderSchedule(host, { turma: classId });
      return true;
    },
  });
}
