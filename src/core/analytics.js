/**
 * analytics.js — agregacoes de frequencia.
 *
 * Concentra as regras de calculo usadas pelo dashboard e pelos relatorios, para
 * que os dois nunca divirjam. Convencao adotada em todo o modulo:
 *
 *   presenca = P / (P + F + J)
 *
 * Ou seja: a falta justificada abona a ausencia para fins disciplinares, mas
 * **nao** conta como aula assistida. E o criterio mais comum na educacao basica
 * brasileira; se a escola usar outro, este e o unico ponto a mudar.
 */

import * as store from './store.js';
import { addDays, groupBy, todayISO } from './utils.js';

/** Percentual de presenca de um conjunto de registros. */
function rateOf(counts) {
  const total = counts.P + counts.F + counts.J;
  return total ? (counts.P / total) * 100 : 0;
}

const emptyCounts = () => ({ P: 0, F: 0, J: 0 });

/**
 * Consolida as chamadas de um recorte em contagens globais.
 * @param {object} [filters] repassado para `store.attendanceList`
 */
export function overallCounts(filters = {}) {
  const counts = emptyCounts();
  let lessons = 0;

  for (const entry of store.attendanceList(filters)) {
    lessons += 1;
    for (const record of Object.values(entry.records ?? {})) {
      if (record.status in counts) counts[record.status] += 1;
    }
  }

  return { ...counts, lessons, rate: rateOf(counts) };
}

/**
 * Frequencia por aluno no recorte informado.
 * @returns {Array<{ student, P, F, J, total, rate, absenceRate }>} ordenado por
 *          maior taxa de falta primeiro.
 */
export function perStudent(filters = {}) {
  const byStudent = new Map();

  for (const entry of store.attendanceList(filters)) {
    for (const [studentId, record] of Object.entries(entry.records ?? {})) {
      if (filters.studentId && studentId !== filters.studentId) continue;
      if (!byStudent.has(studentId)) byStudent.set(studentId, emptyCounts());
      const counts = byStudent.get(studentId);
      if (record.status in counts) counts[record.status] += 1;
    }
  }

  const students = new Map(store.students.list().map((s) => [s.id, s]));

  return [...byStudent.entries()]
    .map(([studentId, counts]) => {
      const total = counts.P + counts.F + counts.J;
      const rate = rateOf(counts);
      return {
        student: students.get(studentId) ?? { id: studentId, name: 'Aluno removido' },
        ...counts,
        total,
        rate,
        absenceRate: 100 - rate,
      };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.absenceRate - a.absenceRate);
}

/**
 * Alunos em risco de infrequencia.
 * @param {number} [threshold] percentual minimo de falta para entrar na lista
 * @param {number} [minLessons] ignora quem tem historico curto demais para
 *        que o percentual signifique alguma coisa
 */
export function atRisk({ threshold = 25, minLessons = 5, ...filters } = {}) {
  return perStudent(filters).filter(
    (row) => row.total >= minLessons && row.absenceRate >= threshold,
  );
}

/** Frequencia agregada por turma. */
export function perClass(filters = {}) {
  const rows = [];

  for (const schoolClass of store.classes.list()) {
    const counts = overallCounts({ ...filters, classId: schoolClass.id });
    if (!counts.lessons) continue;
    rows.push({
      schoolClass,
      ...counts,
      students: store.studentsOfClass(schoolClass.id).length,
    });
  }

  return rows.sort((a, b) => b.rate - a.rate);
}

/**
 * Serie temporal de presenca, um ponto por dia com aula.
 * @param {number} [days] tamanho da janela, contada a partir de hoje
 */
export function dailySeries({ days = 14, ...filters } = {}) {
  const today = todayISO();
  const from = addDays(today, -(days - 1));

  const entries = store.attendanceList({ ...filters, from, to: today });
  const byDate = groupBy(entries, (entry) => entry.date);

  const series = [];
  for (let i = 0; i < days; i += 1) {
    const date = addDays(from, i);
    const dayEntries = byDate.get(date) ?? [];

    const counts = emptyCounts();
    for (const entry of dayEntries) {
      for (const record of Object.values(entry.records ?? {})) {
        if (record.status in counts) counts[record.status] += 1;
      }
    }

    series.push({
      date,
      ...counts,
      lessons: dayEntries.length,
      rate: rateOf(counts),
      hasData: dayEntries.length > 0,
    });
  }

  return series;
}

/** Resumo do dia: quantas aulas ja tiveram chamada e a presenca media. */
export function todaySummary(date = todayISO()) {
  const entries = store.attendanceList({ from: date, to: date });
  const counts = emptyCounts();

  for (const entry of entries) {
    for (const record of Object.values(entry.records ?? {})) {
      if (record.status in counts) counts[record.status] += 1;
    }
  }

  // Aulas previstas na grade semanal para este dia da semana
  const weekday = new Date(`${date}T00:00:00`).getDay();
  const scheduled = store.lessons.list().filter((lesson) => lesson.weekday === weekday);

  return {
    ...counts,
    rate: rateOf(counts),
    taken: entries.length,
    scheduled: scheduled.length,
    pending: Math.max(0, scheduled.length - entries.length),
  };
}
