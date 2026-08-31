import { addDays, normalize, toISODate, weekdayOf } from './utils.js';

function createRandom(seed = 20240311) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST_NAMES = [
  'Ana', 'Beatriz', 'Bruno', 'Camila', 'Carlos', 'Daniel', 'Eduarda', 'Enzo',
  'Fernanda', 'Gabriel', 'Helena', 'Igor', 'Isabela', 'Joao', 'Julia', 'Kaique',
  'Larissa', 'Lucas', 'Mariana', 'Matheus', 'Nicole', 'Otavio', 'Paula', 'Pedro',
  'Rafaela', 'Rodrigo', 'Sofia', 'Thiago', 'Vitoria', 'Yasmin', 'Arthur', 'Clara',
  'Davi', 'Emanuel', 'Giovana', 'Heitor', 'Ingrid', 'Juliana', 'Leonardo', 'Manuela',
];

const LAST_NAMES = [
  'Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves',
  'Pereira', 'Lima', 'Gomes', 'Costa', 'Ribeiro', 'Martins', 'Carvalho',
  'Almeida', 'Lopes', 'Soares', 'Fernandes', 'Vieira', 'Barbosa', 'Rocha',
  'Dias', 'Nunes', 'Moreira', 'Cardoso', 'Teixeira', 'Correia', 'Azevedo',
];

export function buildSeed() {
  const random = createRandom();
  const pick = (list) => list[Math.floor(random() * list.length)];

  const subjectNames = [
    'Matematica', 'Portugues', 'Historia', 'Geografia', 'Fisica',
    'Quimica', 'Biologia', 'Ingles', 'Educacao Fisica', 'Filosofia',
  ];
  const subjects = subjectNames.map((name, i) => ({
    id: `sub_${String(i + 1).padStart(2, '0')}`,
    name,
  }));
  const subjectByName = Object.fromEntries(subjects.map((s) => [s.name, s.id]));

  const teacherSeeds = [
    ['Marina Albuquerque', ['Matematica', 'Fisica']],
    ['Ricardo Tavares', ['Portugues', 'Filosofia']],
    ['Juliana Menezes', ['Historia', 'Geografia']],
    ['Fabio Nogueira', ['Quimica', 'Biologia']],
    ['Patricia Lemos', ['Ingles']],
    ['Anderson Prado', ['Educacao Fisica']],
  ];

  const teachers = teacherSeeds.map(([name, taught], i) => ({
    id: `tea_${String(i + 1).padStart(2, '0')}`,
    name,
    email: `${normalize(name).replace(/\s+/g, '.')}@escola.edu.br`,
    registration: `PROF-${2100 + i}`,
    subjectIds: taught.map((n) => subjectByName[n]),
    createdAt: Date.now(),
  }));

  const classSeeds = [
    ['1o Ano A - Ensino Medio', 'tea_02', 'Sala 12', 25, ['Portugues', 'Matematica', 'Historia', 'Ingles', 'Educacao Fisica']],
    ['2o Ano B - Ensino Medio', 'tea_01', 'Sala 07', 28, ['Matematica', 'Fisica', 'Quimica', 'Portugues', 'Geografia']],
    ['3o Ano B - Ensino Medio', 'tea_04', 'Laboratorio 2', 30, ['Biologia', 'Quimica', 'Fisica', 'Matematica', 'Filosofia']],
    ['9o Ano C - Fundamental II', 'tea_03', 'Sala 03', 24, ['Historia', 'Geografia', 'Portugues', 'Ingles', 'Matematica']],
  ];

  const classes = classSeeds.map(([name, teacherId, room, weeklyHours, subjectList], i) => ({
    id: `cls_${String(i + 1).padStart(2, '0')}`,
    name,
    teacherId,
    room,
    weeklyHours,
    subjectIds: subjectList.map((n) => subjectByName[n]),
    createdAt: Date.now(),
  }));

  const students = [];
  const usedNames = new Set();

  classes.forEach((schoolClass, classIndex) => {
    const size = 22 + Math.floor(random() * 7);

    for (let roll = 1; roll <= size; roll += 1) {
      let name;
      let guard = 0;
      do {
        name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)} ${pick(LAST_NAMES)}`;
        guard += 1;
      } while (usedNames.has(name) && guard < 40);
      usedNames.add(name);

      students.push({
        id: `stu_${classIndex + 1}_${String(roll).padStart(2, '0')}`,
        name,
        rollNumber: roll,
        registration: `${2024 + classIndex}${String(1000 + roll)}`,
        avatar: null,
        classIds: [schoolClass.id],
        createdAt: Date.now(),
      });
    }
  });

  const TIME_SLOTS = [
    ['07:30', '09:10'],
    ['09:30', '11:10'],
    ['13:00', '14:40'],
    ['15:00', '16:40'],
  ];

  const lessons = [];
  classes.forEach((schoolClass, classIndex) => {
    const days = classIndex % 2 === 0 ? [1, 3, 5] : [1, 2, 4];

    days.forEach((weekday, dayIndex) => {
      const slotsToday = 1 + (dayIndex % 2);
      for (let s = 0; s < slotsToday; s += 1) {
        const [start, end] = TIME_SLOTS[(dayIndex + s + classIndex) % TIME_SLOTS.length];
        lessons.push({
          id: `les_${schoolClass.id}_${weekday}_${s}`,
          classId: schoolClass.id,
          subjectId: schoolClass.subjectIds[(dayIndex + s) % schoolClass.subjectIds.length],
          weekday,
          start,
          end,
        });
      }
    });
  });

  const attendance = [];
  const today = toISODate(new Date());

  const absenceRate = new Map(
    students.map((student) => {
      const roll = random();
      const rate = roll > 0.93 ? 0.30 + random() * 0.18
        : roll > 0.80 ? 0.12 + random() * 0.10
          : random() * 0.07;
      return [student.id, rate];
    }),
  );

  const NOTES = [
    'Entrou apos 15 min.',
    'Atestado medico apresentado.',
    'Saiu mais cedo com autorizacao.',
    'Participou de atividade externa.',
  ];

  for (let offset = 70; offset >= 0; offset -= 1) {
    const date = addDays(today, -offset);
    const weekday = weekdayOf(date);

    for (const lesson of lessons) {
      if (lesson.weekday !== weekday) continue;

      const roster = students.filter((s) => s.classIds.includes(lesson.classId));
      if (!roster.length) continue;

      const records = {};
      for (const student of roster) {
        const rate = absenceRate.get(student.id) ?? 0.05;
        const roll = random();

        let status = 'P';
        let note = '';
        if (roll < rate) {
          status = random() < 0.34 ? 'J' : 'F';
          if (status === 'J') note = NOTES[1];
        } else if (roll < rate + 0.02) {
          note = NOTES[0];
        }
        records[student.id] = { status, note };
      }

      const createdAt = new Date(`${date}T${lesson.end}:00`).getTime();
      attendance.push({
        id: `att_${lesson.id}_${date}`,
        classId: lesson.classId,
        subjectId: lesson.subjectId,
        date,
        locked: offset > 14,
        records,
        createdAt,
        updatedAt: createdAt,
      });
    }
  }

  return { teachers, subjects, classes, students, lessons, attendance };
}
