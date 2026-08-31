/**
 * store.js — camada de estado e persistencia.
 *
 * Modelo mental: um unico objeto `state` em memoria, gravado em `localStorage`
 * a cada mutacao (com debounce). As telas nunca escrevem no estado direto —
 * elas chamam as acoes exportadas aqui, que emitem eventos para quem escuta.
 *
 * Trocar por uma API real significa reescrever apenas as funcoes deste arquivo,
 * mantendo as assinaturas. Por isso todas sao sincronas e granulares.
 *
 * ---- Formato dos dados ----------------------------------------------------
 * teacher    { id, name, email, registration, subjectIds[] }
 * subject    { id, name }
 * schoolClass{ id, name, teacherId, room, weeklyHours, subjectIds[] }
 * student    { id, name, rollNumber, registration, avatar|null, classIds[] }
 * lesson     { id, classId, subjectId, weekday, start, end }   // grade semanal
 * attendance { id, classId, subjectId, date, locked, createdAt, updatedAt,
 *              records: { [studentId]: { status: 'P'|'F'|'J', note: string } } }
 * -------------------------------------------------------------------------- */

import { uid, deepClone } from './utils.js';
import { buildSeed } from './seed.js';

const STORAGE_KEY = 'cc.database.v2';
const SCHEMA_VERSION = 2;

/**
 * Chaves de versoes anteriores, descartadas na carga.
 *
 * A v1 populava a base com a massa de demonstracao no primeiro acesso. Como os
 * dados ficam no navegador (e nao no servidor), quem ja tinha aberto o sistema
 * continuaria vendo aquela escola ficticia mesmo depois de a aplicacao passar a
 * abrir vazia — reiniciar o servidor nao limpa `localStorage`. Trocar a chave
 * garante o inicio limpo sem exigir nenhuma acao manual.
 */
const LEGACY_KEYS = ['cc.database.v1'];

/** Colecoes vazias — tambem serve de contrato para o formato do estado. */
const EMPTY = {
  version: SCHEMA_VERSION,
  teachers: [],
  subjects: [],
  classes: [],
  students: [],
  lessons: [],
  attendance: [],
};

/* ------------------------------------------------------ Pub/sub simples --- */

const listeners = new Set();

/**
 * Registra um ouvinte de mudancas de estado.
 * @param {(event: { type: string, payload?: unknown }) => void} fn
 * @returns {() => void} funcao para cancelar a inscricao
 */
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(type, payload) {
  for (const fn of listeners) {
    try {
      fn({ type, payload });
    } catch (error) {
      // Um ouvinte quebrado nao pode derrubar os demais nem a gravacao
      console.error('[store] ouvinte falhou:', error);
    }
  }
}

/* --------------------------------------------------------- Persistencia --- */

let state = EMPTY;
/** `true` quando localStorage esta indisponivel (modo privado, cota cheia). */
export let persistenceAvailable = true;

let saveTimer = null;

function persist() {
  clearTimeout(saveTimer);
  // Agrupa rajadas de mutacoes (ex: "marcar todos presentes") em uma gravacao
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

/**
 * Carrega o estado do localStorage.
 *
 * Sem nada gravado, a base comeca **vazia**: quem abre o sistema pela primeira
 * vez cadastra a propria escola, e a tela de Primeiros Passos do dashboard
 * conduz essa sequencia. A massa de demonstracao continua disponivel, mas so
 * sob acao explicita em "Dados e backup" (`resetToSeed`).
 */
export function loadState() {
  discardLegacyData();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Migracoes futuras entram aqui, comparando parsed.version
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

/** Remove bases de versoes anteriores, para nao ocuparem espaco indefinidamente. */
function discardLegacyData() {
  for (const key of LEGACY_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Sem acesso ao armazenamento nao ha o que descartar
    }
  }
}

/** `true` enquanto nenhuma entidade foi cadastrada — usado pelo primeiro acesso. */
export function isEmpty() {
  return !state.teachers.length
    && !state.subjects.length
    && !state.classes.length
    && !state.students.length;
}

/** Snapshot somente-leitura do estado (clone, para evitar mutacao acidental). */
export function getState() {
  return state;
}

/** Recria a base com os dados de demonstracao. */
export function resetToSeed() {
  state = { ...EMPTY, ...buildSeed() };
  persist();
  emit('state:reset');
}

/** Apaga tudo, deixando a base vazia. */
export function clearAll() {
  state = deepClone(EMPTY);
  persist();
  emit('state:reset');
}

/** Exporta a base inteira como JSON (backup manual). */
export function exportDatabase() {
  return JSON.stringify(state, null, 2);
}

/**
 * Importa uma base previamente exportada.
 * @throws {Error} se o JSON nao tiver o formato esperado
 */
export function importDatabase(json) {
  const parsed = JSON.parse(json);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.students)) {
    throw new Error('Arquivo invalido: nao parece um backup do Controle de Chamada.');
  }
  state = { ...EMPTY, ...parsed, version: SCHEMA_VERSION };
  persist();
  emit('state:reset');
}

/* ------------------------------------------------------------- Helpers --- */

/**
 * Fabrica o CRUD de uma colecao. Todas as entidades simples compartilham
 * exatamente o mesmo comportamento, entao vale gerar em vez de repetir.
 */
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

/* ----------------------------------------------------------- Colecoes ----- */

export const teachers = collection('teachers');
export const subjects = collection('subjects');
export const students = collection('students');
export const lessons = collection('lessons');

/**
 * Turmas tem remocao em cascata: apagar uma turma precisa limpar as chamadas,
 * os horarios e os vinculos de alunos que apontam para ela, senao a base fica
 * com referencias orfas que quebram os relatorios.
 */
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

/** Remover um aluno tambem remove os registros de chamada dele. */
export function removeStudent(id) {
  removeStudents([id]);
}

/* -------------------------------------------------- Exclusao em massa ---- */

/*
 * As funcoes abaixo aplicam exatamente as mesmas cascatas da exclusao
 * individual, mas em uma unica passada: percorrer a lista chamando `remove()`
 * item a item gravaria em disco e notificaria os ouvintes N vezes, o que em uma
 * escola inteira significa centenas de reescritas do estado.
 *
 * Todas devolvem quantos registros foram removidos, para o feedback ao usuario.
 */

/**
 * Exclui varios alunos e os registros de chamada deles.
 *
 * @param {string[]} [ids] alunos a remover; sem o argumento, remove todos.
 */
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

/** Exclui todos os professores, desvinculando-os das turmas que dirigiam. */
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

/**
 * Exclui todas as disciplinas, desvinculando-as de turmas e professores.
 *
 * Os horarios da grade nao sobrevivem sem disciplina (a aula deixaria de ter
 * conteudo), entao sao removidos junto. O historico de chamadas e preservado,
 * como acontece na exclusao de uma disciplina isolada: os relatorios passam a
 * exibir "Disciplina removida", mas nenhum registro de presenca e perdido.
 */
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

/** Exclui todas as turmas, junto com horarios, chamadas e vinculos de alunos. */
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

/* ---------------------------------------------------------- Chamadas ----- */

/**
 * Localiza a chamada de uma turma/disciplina em uma data.
 * A tripla (turma, disciplina, data) e a chave natural de uma aula.
 */
export function findAttendance(classId, subjectId, date) {
  return state.attendance.find(
    (entry) => entry.classId === classId && entry.subjectId === subjectId && entry.date === date,
  ) ?? null;
}

/**
 * Grava (cria ou atualiza) a chamada de uma aula.
 *
 * @param {{ classId: string, subjectId: string, date: string,
 *           records: Record<string, {status: string, note?: string}>,
 *           locked?: boolean }} payload
 */
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

/** Alterna o bloqueio de uma chamada ja gravada. */
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

/* ------------------------------------------------------------ Consultas -- */

/** Alunos de uma turma, ja ordenados pelo numero de chamada. */
export function studentsOfClass(classId) {
  return state.students
    .filter((student) => (student.classIds ?? []).includes(classId))
    .sort((a, b) => (a.rollNumber ?? 0) - (b.rollNumber ?? 0));
}

/** Disciplinas associadas a uma turma. */
export function subjectsOfClass(classId) {
  const schoolClass = classes.get(classId);
  if (!schoolClass) return [];
  const ids = new Set(schoolClass.subjectIds ?? []);
  return state.subjects.filter((subject) => ids.has(subject.id));
}

/** Horarios de uma turma, ordenados por dia da semana e horario de inicio. */
export function lessonsOfClass(classId) {
  return state.lessons
    .filter((lesson) => lesson.classId === classId)
    .sort((a, b) => a.weekday - b.weekday || a.start.localeCompare(b.start));
}

/** Todas as chamadas, opcionalmente filtradas. */
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
