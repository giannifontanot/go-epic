import { Library, LibNode } from './library.model';
import {
  allSprints, areaFull, emptySprint, epicsByLifeArea, finishedByEpic, focusSprint, hasContent, isPlanned, isReviewed,
  pastSprints, sanitizeSprint, sprintAt, sprintCardOn, sprintDay, sprintDays, toggleEpic,
} from './sprint.model';
import { Task, Week, emptyWeek } from './week.model';

const node = (id: string, kind: LibNode['kind'], parentId: string | null, title = id): LibNode => ({ id, kind, title, parentId, color: null });
const task = (id: string, ref: string | null, extra: Partial<Task> = {}): Task => ({ id, title: id, minutes: 10, color: null, active: true, ref, ...extra });

const lib: Library = {
  nodes: [
    node('temple', 'area', null, 'El Templo'), node('body', 'epic', 'temple', 'Soy atleta'), node('mind', 'epic', 'temple', 'Soy lector'),
    node('faith', 'epic', 'temple', 'Soy fiel'),
    node('castle', 'area', null, 'El Castillo'), node('home', 'epic', 'castle', 'Soy buen padre'),
    node('other', 'area', null, 'Health'),
    node('f1', 'feature', 'body'), node('s1', 'story', 'f1'), node('run', 'task', 's1', 'Run'),
    node('f2', 'feature', 'mind'), node('s2', 'story', 'f2'), node('read', 'task', 's2', 'Read'),
    node('loose', 'task', null, 'Loose'),
  ],
};

function weekEveryDay(tasks: Task[]): Week {
  const week = emptyWeek();
  for (const day of Object.keys(week) as (keyof Week)[]) week[day] = { blocks: [{ id: 'b', name: 'B', start: null, end: null, tasks: structuredClone(tasks) }] };
  return week;
}

describe('sprints', () => {
  const list = allSprints();

  it('lists every sprint of the Go Epic years, 21 days each, from a Monday to a Sunday', () => {
    expect(list.length).toBe(32);
    expect(list[0]).toEqual({ key: '2025-12-22', from: '2025-12-22', to: '2026-01-11', season: 'winter', n: 1, year: 2026 });
    const autumn4 = list.find((s) => s.year === 2026 && s.season === 'autumn' && s.n === 4)!;
    expect(autumn4.from).toBe('2026-11-23');
    expect(autumn4.to).toBe('2026-12-13');
    for (const s of list) expect(sprintDay(s, s.to)).toBe(21);
  });

  it('finds the sprint of a day; the rest week has none, and the page then plans the next one', () => {
    expect(sprintAt(list, '2026-11-25')?.from).toBe('2026-11-23');
    expect(sprintAt(list, '2026-12-16')).toBeNull();
    expect(focusSprint(list, '2026-12-16')?.from).toBe('2026-12-21');
    expect(focusSprint(list, '2026-11-25')?.from).toBe('2026-11-23');
    expect(focusSprint(list, '2030-01-01')).toBe(list[list.length - 1]);
  });

  it('lists past sprints newest first: those with something saved and always the last ended', () => {
    const past = pastSprints(list, '2026-12-16', new Set(['2026-10-12']), '2026-12-21');
    expect(past.map((s) => s.key)).toEqual(['2026-11-23', '2026-10-12']);
    expect(pastSprints(list, '2026-11-25', new Set(), '2026-11-23').map((s) => s.key)).toEqual(['2026-11-02']);
  });

  it('marks the first day of a sprint to plan it and the last to review it', () => {
    expect(sprintCardOn(list, '2026-11-23')).toEqual({ kind: 'plan', sprint: sprintAt(list, '2026-11-23') });
    expect(sprintCardOn(list, '2026-12-13')?.kind).toBe('review');
    expect(sprintCardOn(list, '2026-11-25')).toBeNull();
    const days = sprintDays(list);
    expect(days.get('2026-11-23')).toBe('plan');
    expect(days.get('2026-12-13')).toBe('review');
    expect(days.has('2026-12-16')).toBe(false);
  });
});

describe('sprint documents', () => {
  it('sanitizes what is stored', () => {
    expect(sanitizeSprint(null)).toEqual(emptySprint());
    const doc = sanitizeSprint({ epics: ['a', 'a', 3, ''], went: 'ok', didnt: 7, pending: 'x'.repeat(5000), change: 'more', extra: true, updated: 5 });
    expect(doc.epics).toEqual(['a']);
    expect(doc.didnt).toBe('');
    expect(doc.pending.length).toBe(4000);
    expect(doc.updated).toBe(5);
    expect('extra' in doc).toBe(false);
  });

  it('knows when a sprint is planned, reviewed, or holds anything', () => {
    expect(hasContent(emptySprint())).toBe(false);
    expect(isPlanned({ ...emptySprint(), epics: ['body'] })).toBe(true);
    expect(isReviewed({ ...emptySprint(), pending: '  ' })).toBe(false);
    expect(isReviewed({ ...emptySprint(), pending: 'call Ana' })).toBe(true);
    expect(hasContent({ ...emptySprint(), change: 'less' })).toBe(true);
  });

  it('chooses at most two Epics per area, and lets one go', () => {
    let doc = emptySprint();
    doc = toggleEpic(lib, doc, 'body') as typeof doc;
    doc = toggleEpic(lib, doc, 'mind') as typeof doc;
    expect(areaFull(lib, doc, 'temple')).toBe(true);
    expect(toggleEpic(lib, doc, 'faith')).toBe('full');
    doc = toggleEpic(lib, doc, 'home') as typeof doc;
    expect(doc.epics).toEqual(['body', 'mind', 'home']);
    doc = toggleEpic(lib, doc, 'body') as typeof doc;
    expect(doc.epics).toEqual(['mind', 'home']);
    expect(areaFull(lib, doc, 'temple')).toBe(false);
  });

  it('forgets an Epic deleted from the library when the plan changes', () => {
    const doc = { ...emptySprint(), epics: ['gone', 'body'] };
    expect((toggleEpic(lib, doc, 'home') as typeof doc).epics).toEqual(['body', 'home']);
  });

  it('groups the Epics by the four life areas, in their order', () => {
    const groups = epicsByLifeArea(lib);
    expect(groups.map((g) => g.area.id)).toEqual(['temple', 'castle']);
    expect(groups[0].epics.map((e) => e.id)).toEqual(['body', 'mind', 'faith']);
  });
});

describe('what was finished in the sprint', () => {
  const sprint = allSprints().find((s) => s.from === '2026-11-23')!;
  const week = weekEveryDay([task('c-run', 'run'), task('c-read', 'read'), task('c-loose', 'loose'), task('c-off', 'run', { active: false })]);

  it('counts the finished cards by Epic, the chosen ones first, up to today', () => {
    const marks = {
      '2026-11-23': { done: { 'c-run': 1, 'c-read': 1, 'c-loose': 1, 'c-off': 1 } },
      '2026-11-24': { done: { 'c-read': 2 }, status: { 'c-run': 'skipped' as const } },
      '2026-11-25': { done: { 'c-read': 3 }, status: { 'c-read': 'late' as const } },
      '2026-11-26': { done: { 'c-run': 4 } },                         // after today: not counted
      '2026-11-22': { done: { 'c-run': 5 } },                         // before the sprint
    };
    const out = finishedByEpic(lib, week, marks, sprint, '2026-11-25', ['body']);
    expect(out.map((e) => e.epicId)).toEqual(['body', 'mind']);
    expect(out[0]).toEqual({ epicId: 'body', title: 'Soy atleta', areaTitle: 'El Templo', chosen: true, activities: [{ id: 'run', title: 'Run', times: 1 }] });
    expect(out[1].activities).toEqual([{ id: 'read', title: 'Read', times: 3 }]);
    expect(out[1].chosen).toBe(false);
  });

  it('is empty when nothing was finished', () => {
    expect(finishedByEpic(lib, week, {}, sprint, '2026-12-20', [])).toEqual([]);
  });
});
