import { LIFE_AREAS, Library, LibNode, lifeAreaKey, nodeById, pathOf } from './library.model';
import { addDays, daysBetween } from './period.model';
import { DayMarks, isFinished, statusOf } from './status.model';
import { Week, dayOf } from './week.model';
import { GoEpicYear, Season, YEARS, sprintRange, yearPlan } from './year.model';

/**
 * Sprint planning and reflection (Gianni): the page «Planeación y reflexión», under Year in the pages menu. Each sprint
 * of the Year screen (3 weeks) is planned on its first day, choosing the Epics it pushes (at most two per area), and
 * reviewed on its last day with four questions, written by hand: what went well, what did not, what was left pending
 * (Gianni: not Activities, part of the reflection) and what changes. Saved in users/{uid}/sprints/{first day}.
 * On those two days the Week board shows a card at the top of the day, with no hour, that opens the page; the Year
 * screen marks them with a blue edge (red already means a day with notes). Pure rules only, with a spec.
 */
export interface SprintRef {
  /** Its first day (a Monday): the document's id. */
  key: string;
  from: string;
  to: string;
  season: Season;
  /** 1…4 inside its quarter. */
  n: number;
  /** The Go Epic year it belongs to. */
  year: number;
}

/** Every sprint of the Go Epic years, in order. */
export function allSprints(years: GoEpicYear[] = YEARS): SprintRef[] {
  const out: SprintRef[] = [];
  for (const y of years) {
    for (const q of yearPlan(y.seasons, y.next)) {
      for (const s of q.sprints) {
        const { from, to } = sprintRange(s);
        out.push({ key: from, from, to, season: q.season, n: s.n, year: y.year });
      }
    }
  }
  return out;
}

/** The sprint a day falls in, or null (the rest week, or outside the years). */
export function sprintAt(list: SprintRef[], key: string): SprintRef | null {
  return list.find((s) => key >= s.from && key <= s.to) ?? null;
}

/** The sprint the page opens on: the one today is in, else the next to come (in the rest week: plan it), else the last. */
export function focusSprint(list: SprintRef[], today: string): SprintRef | null {
  return sprintAt(list, today) ?? list.find((s) => s.from > today) ?? list[list.length - 1] ?? null;
}

/**
 * The sprints listed under the one in focus, newest first: those already ended that hold something saved, and always
 * the last one ended (so it can be reviewed in the rest week and the days after).
 */
export function pastSprints(list: SprintRef[], today: string, saved: ReadonlySet<string>, focusKey: string | null): SprintRef[] {
  const ended = list.filter((s) => s.to < today && s.key !== focusKey);
  const last = ended[ended.length - 1];
  return ended.filter((s) => s === last || saved.has(s.key)).reverse();
}

/** The sprint's day of 1…21 (0 before it starts, past 21 after it ends). */
export function sprintDay(sprint: SprintRef, today: string): number {
  return daysBetween(sprint.from, today) + 1;
}

export type SprintCardKind = 'plan' | 'review';
/** Whether a day is a sprint's first (plan) or last (review) day; null on any other day. */
export function sprintCardOn(list: SprintRef[], key: string): { kind: SprintCardKind; sprint: SprintRef } | null {
  for (const s of list) {
    if (s.from === key) return { kind: 'plan', sprint: s };
    if (s.to === key) return { kind: 'review', sprint: s };
  }
  return null;
}

/** The sprints' first and last days, for the Year screen's blue edge. */
export function sprintDays(list: SprintRef[]): Map<string, SprintCardKind> {
  const out = new Map<string, SprintCardKind>();
  for (const s of list) { out.set(s.from, 'plan'); out.set(s.to, 'review'); }
  return out;
}

export const QUESTIONS = ['went', 'didnt', 'pending', 'change'] as const;
export type Question = (typeof QUESTIONS)[number];
export const ANSWER_MAX = 4000;
export const EPICS_PER_AREA = 2;

/** A sprint's saved document: the Epics it pushes and the four answers of its reflection. */
export interface SprintDoc {
  epics: string[];
  went: string;
  didnt: string;
  pending: string;
  change: string;
  updated: number;
}

export function emptySprint(): SprintDoc {
  return { epics: [], went: '', didnt: '', pending: '', change: '', updated: 0 };
}

/** A stored document, cleaned: unknown fields dropped, answers trimmed to their limit, Epics unique. */
export function sanitizeSprint(raw: unknown): SprintDoc {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' ? v.slice(0, ANSWER_MAX) : '');
  const epics = Array.isArray(r['epics']) ? [...new Set(r['epics'].filter((e): e is string => typeof e === 'string' && !!e))].slice(0, 40) : [];
  return {
    epics, went: text(r['went']), didnt: text(r['didnt']), pending: text(r['pending']), change: text(r['change']),
    updated: typeof r['updated'] === 'number' ? r['updated'] : 0,
  };
}

/** Whether the sprint holds anything: a chosen Epic or an answer. */
export function hasContent(doc: SprintDoc): boolean {
  return doc.epics.length > 0 || QUESTIONS.some((q) => doc[q].trim() !== '');
}
export function isPlanned(doc: SprintDoc | undefined): boolean {
  return !!doc && doc.epics.length > 0;
}
export function isReviewed(doc: SprintDoc | undefined): boolean {
  return !!doc && QUESTIONS.some((q) => doc[q].trim() !== '');
}

/** The area an Epic sits in (its parent), or null. */
export function areaOf(lib: Library, epicId: string): LibNode | null {
  const epic = nodeById(lib, epicId);
  const area = epic?.kind === 'epic' ? nodeById(lib, epic.parentId) : undefined;
  return area?.kind === 'area' ? area : null;
}

/** The chosen Epics that still exist in the library (one deleted since leaves the plan). */
export function chosenEpics(lib: Library, doc: SprintDoc): string[] {
  return doc.epics.filter((id) => nodeById(lib, id)?.kind === 'epic');
}

/**
 * Choosing or letting go an Epic. Choosing is refused ('full') when its area already has two chosen: the plan stays
 * small on purpose, a sprint pushes only what fits in three weeks.
 */
export function toggleEpic(lib: Library, doc: SprintDoc, epicId: string): SprintDoc | 'full' {
  const live = chosenEpics(lib, doc);
  if (live.includes(epicId)) return { ...doc, epics: live.filter((id) => id !== epicId) };
  const area = areaOf(lib, epicId);
  const same = live.filter((id) => areaOf(lib, id)?.id === area?.id).length;
  if (same >= EPICS_PER_AREA) return 'full';
  return { ...doc, epics: [...live, epicId] };
}

/** Whether an area has its two Epics chosen. */
export function areaFull(lib: Library, doc: SprintDoc, areaId: string): boolean {
  return chosenEpics(lib, doc).filter((id) => areaOf(lib, id)?.id === areaId).length >= EPICS_PER_AREA;
}

export interface FinishedActivity { id: string; title: string; times: number }
export interface FinishedEpic { epicId: string; title: string; areaTitle: string; chosen: boolean; activities: FinishedActivity[] }

/**
 * What was finished in the sprint, by Epic (Gianni: the reflection starts from it): every active card of the weekday's
 * plan, on each day of the sprint up to today, whose library Activity is under an Epic and was marked done or late that
 * day. The current week plan stands for past days, as in Progress. The chosen Epics come first, then the others, each
 * in the library's order; an Epic with nothing finished is left out.
 */
export function finishedByEpic(lib: Library, week: Week, marksByDate: Record<string, DayMarks>, sprint: SprintRef, today: string, chosen: string[]): FinishedEpic[] {
  const epicOf = new Map<string, LibNode | null>();
  const epicFor = (ref: string): LibNode | null => {
    if (!epicOf.has(ref)) {
      const node = nodeById(lib, ref);
      epicOf.set(ref, node?.kind === 'task' ? pathOf(lib, ref).find((n) => n.kind === 'epic') ?? null : null);
    }
    return epicOf.get(ref)!;
  };
  const byEpic = new Map<string, Map<string, FinishedActivity>>();
  const last = sprint.to < today ? sprint.to : today;
  for (let key = sprint.from; key <= last; key = addDays(key, 1)) {
    const [y, m, d] = key.split('-').map(Number);
    for (const block of week[dayOf(new Date(y, m - 1, d))].blocks) {
      for (const task of block.tasks) {
        if (!task.active || !task.ref) continue;
        const epic = epicFor(task.ref);
        if (!epic || !isFinished(statusOf(marksByDate[key], task.id))) continue;
        const acts = byEpic.get(epic.id) ?? new Map<string, FinishedActivity>();
        const act = acts.get(task.ref) ?? { id: task.ref, title: nodeById(lib, task.ref)?.title.trim() || task.title.trim(), times: 0 };
        act.times++;
        acts.set(task.ref, act);
        byEpic.set(epic.id, acts);
      }
    }
  }
  const epics = lib.nodes.filter((n) => n.kind === 'epic' && byEpic.has(n.id));
  const out = epics.map((e) => ({
    epicId: e.id, title: e.title.trim(), areaTitle: areaOf(lib, e.id)?.title.trim() ?? '', chosen: chosen.includes(e.id),
    activities: [...byEpic.get(e.id)!.values()].sort((a, b) => b.times - a.times || a.title.localeCompare(b.title)),
  }));
  return [...out.filter((e) => e.chosen), ...out.filter((e) => !e.chosen)];
}

/** The library's Epics grouped by the four life areas, in their order (an area missing from the library is left out). */
export function epicsByLifeArea(lib: Library): { area: LibNode; epics: LibNode[] }[] {
  const out: { area: LibNode; epics: LibNode[]; order: number }[] = [];
  const seen = new Set<string>();
  for (const n of lib.nodes) {
    if (n.kind !== 'area' || n.parentId !== null) continue;
    const key = lifeAreaKey(n.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ area: n, epics: lib.nodes.filter((e) => e.kind === 'epic' && e.parentId === n.id), order: LIFE_AREAS.findIndex((a) => a.key === key) });
  }
  return out.sort((a, b) => a.order - b.order).map(({ area, epics }) => ({ area, epics }));
}
