import { uid, deepClone } from './utils.js';
import { buildSeed } from './seed.js';

const STORAGE_KEY = 'cc.database.v2';
const SCHEMA_VERSION = 2;

const LEGACY_KEYS = ['cc.database.v1'];

const EMPTY = {
  version: SCHEMA_VERSION,
  teachers: [],
  subjects: [],
  classes: [],
  students: [],
  lessons: [],
  attendance: [],
};

const listeners = new Set();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(type, payload) {
  for (const fn of listeners) {
    try {
      fn({ type, payload });
    } catch (error) {
      console.error('[store] ouvinte falhou:', error);
    }
  }
}

let state = EMPTY;
export let persistenceAvailable = true;

let saveTimer = null;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      persistenceAvailable = true;
    } catch (error) {
      persistenceAvailable = false;
      console.error('[store] falha ao gravar em localStorage:', error);
      emit('persist:error', error);
    }
  }, 120);
}

export function loadState() {
  discardLegacyData();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = { ...EMPTY, ...parsed, version: SCHEMA_VERSION };
      emit('state:loaded');
      return state;
    }
  } catch (error) {
    console.warn('[store] dados salvos ilegiveis, recriando a base vazia:', error);
  }

  state = deepClone(EMPTY);
  persist();
  emit('state:loaded');
  return state;
}

function discardLegacyData() {
  for (const key of LEGACY_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
    }
  }
}

export function isEmpty() {
  return !state.teachers.length
    && !state.subjects.length
    && !state.classes.length
    && !state.students.length;
}

export function getState() {
  return state;
}

export function resetToSeed() {
  state = { ...EMPTY, ...buildSeed() };
  persist();
  emit('state:reset');
}

export function clearAll() {
  state = deepClone(EMPTY);
  persist();
  emit('state:reset');
}

export function exportDatabase() {
  return JSON.stringify(state, null, 2);
}

export function importDatabase(json) {
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.students)) {
    throw new Error('Arquivo invalido: nao parece um backup do Controle de Chamada.');
  }
  state = { ...EMPTY, ...parsed, version: SCHEMA_VERSION };
  persist();
  emit('state:reset');
}

function collection(key) {
  return {
    list: () => state[key],
    get: (id) => state[key].find((item) => item.id === id) ?? null,

    create(data) {
      const item = { ...data, id: uid(key.slice(0, 3)), createdAt: Date.now() };
      state[key] = [...state[key], item];
      persist();
      emit(`${key}:changed`, item);
      return item;
    },

    update(id, patch) {
      let updated = null;
      state[key] = state[key].map((item) => {
        if (item.id !== id) return item;
        updated = { ...item, ...patch, id, updatedAt: Date.now() };
        return updated;
      });
      persist();
      emit(`${key}:changed`, updated);
      return updated;
    },

    remove(id) {
      state[key] = state[key].filter((item) => item.id !== id);
      persist();
      emit(`${key}:changed`, { id, removed: true });
    },
  };
}

export const teachers = collection('teachers');
export const subjects = collection('subjects');
export const students = collection('students');
export const lessons = collection('lessons');

export const classes = {
  ...collection('classes'),

  remove(id) {
    state.classes = state.classes.filter((item) => item.id !== id);
    state.lessons = state.lessons.filter((lesson) => lesson.classId !== id);
    state.attendance = state.attendance.filter((entry) => entry.classId !== id);
    state.students = state.students.map((student) => ({
      ...student,
      classIds: (student.classIds ?? []).filter((classId) => classId !== id),
    }));
    persist();
    emit('classes:changed', { id, removed: true });
  },
};

export function removeStudent(id) {
  removeStudents([id]);
}

export function removeStudents(ids = null) {
  const alvo = ids ? new Set(ids) : null;
  const willRemove = (student) => !alvo || alvo.has(student.id);

  const removed = state.students.filter(willRemove).length;
  if (!removed) return 0;

  const removedIds = new Set(state.students.filter(willRemove).map((s) => s.id));
  state.students = state.students.filter((student) => !willRemove(student));

  state.attendance = state.attendance.map((entry) => {
    const records = { ...entry.records };
    let touched = false;
    for (const id of removedIds) {
      if (id in records) {
        delete records[id];
        touched = true;
      }
    }
    return touched ? { ...entry, records } : entry;
  });

  persist();
  emit('students:changed', { removed: true, count: removed });
  return removed;
}

export function removeAllTeachers() {
  const removed = state.teachers.length;
  if (!removed) return 0;

  state.teachers = [];
  state.classes = state.classes.map((schoolClass) =>
    schoolClass.teacherId ? { ...schoolClass, teacherId: '' } : schoolClass);

  persist();
  emit('teachers:changed', { removed: true, count: removed });
  return removed;
}

export function removeAllSubjects() {
  const removed = state.subjects.length;
  if (!removed) return 0;

  state.subjects = [];
  state.lessons = [];
  state.classes = state.classes.map((schoolClass) => ({ ...schoolClass, subjectIds: [] }));
  state.teachers = state.teachers.map((teacher) => ({ ...teacher, subjectIds: [] }));

  persist();
  emit('subjects:changed', { removed: true, count: removed });
  return removed;
}

export function removeAllClasses() {
  const removed = state.classes.length;
  if (!removed) return 0;

  state.classes = [];
  state.lessons = [];
  state.attendance = [];
  state.students = state.students.map((student) => ({ ...student, classIds: [] }));

  persist();
  emit('classes:changed', { removed: true, count: removed });
  return removed;
}

export function findAttendance(classId, subjectId, date) {
  return state.attendance.find(
    (entry) => entry.classId === classId && entry.subjectId === subjectId && entry.date === date,
  ) ?? null;
}

export function saveAttendance({ classId, subjectId, date, records, locked = false }) {
  const existing = findAttendance(classId, subjectId, date);
  const now = Date.now();

  if (existing) {
    const updated = { ...existing, records, locked, updatedAt: now };
    state.attendance = state.attendance.map((entry) => (entry.id === existing.id ? updated : entry));
    persist();
    emit('attendance:changed', updated);
    return updated;
  }

  const created = {
    id: uid('att'),
    classId, subjectId, date, records, locked,
    createdAt: now,
    updatedAt: now,
  };
  state.attendance = [...state.attendance, created];
  persist();
  emit('attendance:changed', created);
  return created;
}

export function setAttendanceLock(id, locked) {
  state.attendance = state.attendance.map((entry) =>
    entry.id === id ? { ...entry, locked, updatedAt: Date.now() } : entry,
  );
  persist();
  emit('attendance:changed', { id, locked });
}

export function removeAttendance(id) {
  state.attendance = state.attendance.filter((entry) => entry.id !== id);
  persist();
  emit('attendance:changed', { id, removed: true });
}

export function studentsOfClass(classId) {
  return state.students
    .filter((student) => (student.classIds ?? []).includes(classId))
    .sort((a, b) => (a.rollNumber ?? 0) - (b.rollNumber ?? 0));
}

export function subjectsOfClass(classId) {
  const schoolClass = classes.get(classId);
  if (!schoolClass) return [];
  const ids = new Set(schoolClass.subjectIds ?? []);
  return state.subjects.filter((subject) => ids.has(subject.id));
}

export function lessonsOfClass(classId) {
  return state.lessons
    .filter((lesson) => lesson.classId === classId)
    .sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
}

export function attendanceList({ classId, subjectId, studentId, from, to } = {}) {
  return state.attendance.filter((entry) => {
    if (classId && entry.classId !== classId) return false;
    if (subjectId && entry.subjectId !== subjectId) return false;
    if (studentId && !(studentId in (entry.records ?? {}))) return false;
    if (from && entry.date < from) return false;
    if (to && entry.date > to) return false;
    return true;
  });
}
