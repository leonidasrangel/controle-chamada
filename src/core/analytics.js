import * as store from './store.js';
import { addDays, groupBy, todayISO } from './utils.js';

function rateOf(counts) {
  const total = counts.P + counts.F + counts.J;
  return total ? (counts.P / total) * 100 : 0;
}

const emptyCounts = () => ({ P: 0, F: 0, J: 0 });

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

export function atRisk({ threshold = 25, minLessons = 5, ...filters } = {}) {
  return perStudent(filters).filter(
    (row) => row.total >= minLessons && row.absenceRate >= threshold,
  );
}

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

export function todaySummary(date = todayISO()) {
  const entries = store.attendanceList({ from: date, to: date });
  const counts = emptyCounts();

  for (const entry of entries) {
    for (const record of Object.values(entry.records ?? {})) {
      if (record.status in counts) counts[record.status] += 1;
    }
  }

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
