import { Habit } from './status.model';
import { LIFE_AREAS, LibNode, Library, addNode, childrenOf, lifeAreaKey, lifeAreaNodes, newNodeId, pathOf, undefinedTasks } from './library.model';
import { Todo, openTodos } from './todo.model';
import { DAYS, Day, Week, taskStarts, formatClock } from './week.model';
import { YearPlace } from './year.model';

/**
 * Ask Claude (Gianni: the ✨ button on the Week board). Pure rules: what the app tells Claude about the user (`aiContext`,
 * a compact plain text of their own data), the question each preset button sends (`AI_ASKS`), and the plan Claude hands
 * back when it creates an Epic or an Activity (`parsePlan`). The transport lives in ai.service.ts.
 */

/** The preset questions of the ✨ menu, «¿Cómo voy?» first and highlighted (Gianni). `create` is a conversation. */
export const AI_ASKS = ['how', 'attention', 'create'] as const;
export type AiAsk = (typeof AI_ASKS)[number];

/** One turn of a conversation with Claude. */
export interface AiTurn { role: 'user' | 'assistant'; text: string }

/** The most characters of context sent (a large library is cut, so a question stays cheap). */
export const CONTEXT_LIMIT = 24_000;

export interface AiContextInput {
  now: Date;
  todayKey: string;
  today: Day;
  lang: 'en' | 'es' | string;
  library: Library;
  week: Week;
  /** Today's state of each card (by its id). */
  status: (taskId: string) => string;
  /** The habits of Progress (last 14 days of each planned Activity). */
  habits: Habit[];
  todos: Todo[];
  place: YearPlace | null;
  /** The names the user sees for the five levels (the Letreros set in use), Area first; Claude speaks with them. */
  levelNames?: string[];
}

const RESULT: Record<string, string> = { done: '✓', late: 'L', skipped: '»', progress: '½', missed: '✗', pending: '·', none: ' ' };

/** The user's own data as short plain text, for Claude to read: where they are in the year, their Canvas, their week,
 *  today's states, the last 14 days of each habit and Capture's open tasks. Nothing else is sent. */
export function aiContext(input: AiContextInput): string {
  const { library, week } = input;
  const lines: string[] = [];
  const time = `${String(input.now.getHours()).padStart(2, '0')}:${String(input.now.getMinutes()).padStart(2, '0')}`;
  lines.push(`Today: ${input.todayKey} (${input.today}), ${time}. App language: ${input.lang}.`);
  if (input.levelNames?.length === 5) {
    lines.push(`The user sees the five levels named: ${input.levelNames.join(' > ')}. Use these words for them when you talk.`);
  }
  if (input.place) {
    const p = input.place;
    lines.push(p.sprint === null
      ? `Go Epic year: ${p.season} quarter, rest and review week ${p.week}.`
      : `Go Epic year: ${p.season} quarter, sprint ${p.sprint} of 4, week ${p.week} of 3.`);
  }

  // the Canvas: the four life areas › Epic › Feature › Story › Activity
  lines.push('', 'CANVAS (Area > Epic > Feature > Story > Activity):');
  const areas = lifeAreaNodes(library.nodes);
  const tree = (node: LibNode, depth: number) => {
    const extra = node.kind === 'task' && node.minutes ? ` (${node.minutes} min)` : '';
    lines.push(`${'  '.repeat(depth)}- ${node.kind === 'task' ? 'activity' : node.kind}: ${node.title}${extra}`);
    for (const child of childrenOf(library, node.id)) tree(child, depth + 1);
  };
  for (const a of LIFE_AREAS) {
    const node = areas[a.key];
    if (node) tree(node, 0); else lines.push(`- area: ${a.title} (empty)`);
  }
  const loose = undefinedTasks(library.nodes);
  if (loose.length) lines.push(`Undefined activities (no place yet): ${loose.map((n) => n.title).join('; ')}`);

  // the week plan, today's states
  lines.push('', 'WEEK PLAN (each weekday repeats every week):');
  for (const day of DAYS) {
    const blocks = week[day]?.blocks ?? [];
    if (!blocks.length) { lines.push(`${day}: nothing planned`); continue; }
    lines.push(`${day}${day === input.today ? ' (today)' : ''}:`);
    for (const b of blocks) {
      const starts = taskStarts(b);
      lines.push(`  block ${b.name}${b.start ? ` ${b.start}` : ''}${b.end ? `-${b.end}` : ''}`);
      b.tasks.forEach((t, i) => {
        if (!t.active) return;
        const at = starts[i] !== null && starts[i] !== undefined ? `${formatClock(starts[i]!)} ` : '';
        const state = day === input.today ? ` [today: ${input.status(t.id)}]` : '';
        const where = t.ref ? pathOf(library, t.ref).filter((n) => n.kind === 'epic').map((n) => ` {epic: ${n.title}}`).join('') : '';
        lines.push(`    ${at}${t.title || '(untitled)'} ${t.minutes} min${where}${state}`);
      });
    }
  }

  // the last 14 days of each habit
  if (input.habits.length) {
    lines.push('', 'HABITS, last 14 days oldest first (✓ done, L late, » skipped, ½ in progress, ✗ missed, · today open, blank not planned):');
    for (const h of input.habits) {
      lines.push(`- ${h.title}: ${h.days.map((d) => RESULT[d.result] ?? ' ').join('')} streak ${h.streak}${h.streakCapped ? '+' : ''}`);
    }
  }

  // Capture's open tasks
  const open = openTodos(input.todos);
  if (open.length) {
    lines.push('', 'CAPTURE, open tasks:');
    for (const t of open.slice(0, 60)) {
      const when = t.repeat.length ? `repeats ${t.repeat.join(' ')}` : t.date ? `${t.date}${t.date < input.todayKey ? ' (overdue)' : ''}` : 'no day';
      lines.push(`- ${t.title} (${when}${t.time ? ` ${t.time}` : ''})`);
    }
  }
  const text = lines.join('\n');
  return text.length > CONTEXT_LIMIT ? text.slice(0, CONTEXT_LIMIT) + '\n…(cut)' : text;
}

/** How Claude speaks inside Go Epic. */
export function aiSystem(lang: string, context: string): string {
  const language = lang === 'es' ? 'Spanish' : 'English';
  return [
    'You are Claude, inside Go Epic, a personal life planner. Its five levels: Area (one of four life areas: The Temple - health, body, faith and finances; The Castle - home, family and friends; The Tower - work and learning; The Arena - joy, hobbies and adventures) > Epic (who I am, said in the present, e.g. "I am an athlete") > Feature (what I live) > Story (the road: "As a…, I want…, so that…") > Activity (today\'s step, planned in blocks of the week).',
    `Always answer in ${language}, in short plain words, like a warm, honest friend. Lead with the answer. Use at most a few short lines or a short list; no headings, no tables. Never invent data that is not below; say so when something is missing.`,
    'The user\'s own data, as of now:',
    context,
  ].join('\n\n');
}

/** The question each preset button sends, in the user's language. */
export function aiQuestion(ask: Exclude<AiAsk, 'create'>, lang: string): string {
  const es = lang === 'es';
  if (ask === 'how') return es
    ? '¿Cómo voy? Mira mis últimos 14 días, lo de hoy y en qué punto del sprint estoy. Dime en pocas líneas qué va bien, qué se está quedando atrás y una sola cosa para hoy.'
    : 'How am I doing? Look at my last 14 days, today and where I am in the sprint. Tell me in a few lines what is going well, what is falling behind and one single thing for today.';
  return es
    ? '¿En qué debo poner atención? Mira mis hábitos, las áreas que estoy descuidando, las tareas atrasadas y lo que queda de hoy. Dame las 3 cosas más importantes, en orden.'
    : 'What should I pay attention to? Look at my habits, the areas I am neglecting, the overdue tasks and what is left of today. Give me the 3 most important things, in order.';
}

/** The plan Claude hands back to create an Epic or an Activity: each level's name, reused when it already exists. */
export interface AiPlan { area: string; epic: string; feature: string; story: string; activity: string; minutes: number | null }

/** Claude's instructions for the creating conversation: one question at a time, then the whole plan as JSON. */
export function aiCreateSystem(lang: string, context: string): string {
  const language = lang === 'es' ? 'Spanish' : 'English';
  return [
    aiSystem(lang, context),
    `Now you help the user create a new Epic or a new Activity with everything around it (Area, Epic, Feature, Story, Activity). Ask ONE short question at a time, in ${language}, and reuse the names that already exist in the Canvas when they fit. Ask at most 5 questions.`,
    'When you know enough, reply with one short sentence and then exactly one block like this, with the names in the user\'s language and the area being one of "El Templo", "El Castillo", "La Torre", "La Arena":',
    '```json\n{"area":"El Templo","epic":"Soy atleta","feature":"Correr","story":"Como corredor, quiero correr 5 km, para estar sano","activity":"Correr 20 minutos","minutes":20}\n```',
    'Never write that block before you are ready. The app shows it to the user and saves it only when they tap Apply.',
  ].join('\n\n');
}

const AREA_TITLES: string[] = LIFE_AREAS.map((a) => a.title);

/** The plan in a reply of Claude's (its ```json block), or null when there is none or it is not complete. */
export function parsePlan(reply: string): AiPlan | null {
  const match = /```(?:json)?\s*([\s\S]*?)```/.exec(reply);
  if (!match) return null;
  let raw: unknown;
  try { raw = JSON.parse(match[1]); } catch { return null; }
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 200) : '');
  const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const area = AREA_TITLES.find((t) => plain(t) === plain(text(r['area'])));
  const plan: AiPlan = {
    area: area ?? '',
    epic: text(r['epic']),
    feature: text(r['feature']),
    story: text(r['story']),
    activity: text(r['activity']),
    minutes: typeof r['minutes'] === 'number' && r['minutes'] > 0 && r['minutes'] <= 24 * 60 ? Math.round(r['minutes']) : null,
  };
  if (!plan.area || !plan.epic || !plan.feature || !plan.story || !plan.activity) return null;
  return plan;
}

/** A reply's words without its plan block, to show above the plan. */
export function withoutPlan(reply: string): string {
  return reply.replace(/```(?:json)?\s*[\s\S]*?```/g, '').trim();
}

/**
 * Puts a plan in the library (on Apply): each level reuses the same-named node under its parent (case and spaces
 * ignored), else a new one is made; the Activity is new unless its Story already has it. Returns the library and the
 * Activity's id (null when the plan's area is not one of the four).
 */
export function applyPlan(lib: Library, plan: AiPlan, now: number, makeId: () => string = newNodeId): { lib: Library; id: string | null } {
  const key = lifeAreaKey(plan.area);
  if (!key) return { lib, id: null };
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  let next = lib;
  let parent: LibNode | undefined = lifeAreaNodes(next.nodes)[key];
  if (!parent) {
    parent = { id: makeId(), kind: 'area', title: LIFE_AREAS.find((a) => a.key === key)!.title, parentId: null, color: null };
    next = addNode(next, parent);
  }
  const levels: [LibNode['kind'], string][] = [['epic', plan.epic], ['feature', plan.feature], ['story', plan.story], ['task', plan.activity]];
  for (const [kind, title] of levels) {
    const found: LibNode | undefined = next.nodes.find((n) => n.kind === kind && n.parentId === parent!.id && same(n.title, title));
    if (found) { parent = found; continue; }
    const node: LibNode = { id: makeId(), kind, title: title.trim(), parentId: parent.id, color: null };
    if (kind === 'task') { node.created = now; if (plan.minutes) node.minutes = plan.minutes; }
    next = addNode(next, node);
    parent = node;
  }
  return { lib: next, id: parent.id };
}

/**
 * A reply as the window shows it: plain words, no Markdown marks (bold stars, heading hashes, code ticks), so it reads
 * like a message; list lines start with a bullet.
 */
export function plainReply(reply: string): string {
  return withoutPlan(reply)
    .split('\n')
    .map((line) => line
      .replace(/^\s{0,3}#{1,6}\s+/, '')
      .replace(/^(\s*)[-*+]\s+/, '$1• ')
      .replace(/\*\*(.+?)\*\*|__(.+?)__/g, '$1$2')
      .replace(/`([^`]+)`/g, '$1'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
