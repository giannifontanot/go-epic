/**
 * The library: every task once, organised in five levels, Area → Epic → Feature → User story → Task.
 * Anything without a parent (except areas, the top) sits in Free Space until it is filed.
 * The Week board schedules library tasks: a week task points to one with `ref`.
 * Pure functions only, so the rules are easy to test.
 */
import { Block, newId } from './week.model';

export const newNodeId = newId;

export const KINDS = ['area', 'epic', 'feature', 'story', 'task'] as const;
export type Kind = (typeof KINDS)[number];

/** The kind a node's parent must be (null: areas are the top level). */
export const PARENT_KIND: Record<Kind, Kind | null> = { area: null, epic: 'area', feature: 'epic', story: 'feature', task: 'story' };
/** The kind of a node's children (null: tasks have none). */
export const CHILD_KIND: Record<Kind, Kind | null> = { area: 'epic', epic: 'feature', feature: 'story', story: 'task', task: null };

export interface LibNode {
  id: string;
  kind: Kind;
  title: string;
  /** The parent's id, or null: an area, or an object waiting in Free Space. */
  parentId: string | null;
  /** Tasks only: a picked colour, null = the automatic pastel. */
  color: string | null;
  /** Tasks only, optional: when it was captured or created (millis). Its paper ages from then (`paperAge`). */
  created?: number;
}

/** Days a task stays fresh paper, and from when it is old stained paper (as in Epic Manager's Capture). */
export const PAPER_PARCHMENT_DAYS = 5;
export const PAPER_OLD_DAYS = 21;

/**
 * How old a task's paper looks (Gianni: a captured idea left alone should look neglected): 0 fresh (under 5 days),
 * 1 parchment (5 to 20 days), 2 old stained paper (21 days or more); null when the task has no creation time
 * (made before this existed, or by the starter template), which keeps its pastel.
 */
export function paperAge(node: Pick<LibNode, 'created'> | undefined | null, now: number): 0 | 1 | 2 | null {
  const created = node?.created;
  if (typeof created !== 'number' || !Number.isFinite(created)) return null;
  const days = Math.max(0, now - created) / 86_400_000;
  return days >= PAPER_OLD_DAYS ? 2 : days >= PAPER_PARCHMENT_DAYS ? 1 : 0;
}

export interface Library {
  /** In display order. */
  nodes: LibNode[];
}

export function emptyLibrary(): Library {
  return { nodes: [] };
}

export function nodeById(lib: Library, id: string | null | undefined): LibNode | undefined {
  return id ? lib.nodes.find((node) => node.id === id) : undefined;
}

/** The children of a node, in order. */
export function childrenOf(lib: Library, parentId: string): LibNode[] {
  return lib.nodes.filter((node) => node.parentId === parentId);
}

export function areas(lib: Library): LibNode[] {
  return lib.nodes.filter((node) => node.kind === 'area');
}

/** Objects in Free Space: no parent, and not an area. */
export function freeNodes(lib: Library): LibNode[] {
  return lib.nodes.filter((node) => node.parentId === null && node.kind !== 'area');
}

/** The node and its ancestors, from the top down. */
export function pathOf(lib: Library, id: string): LibNode[] {
  const path: LibNode[] = [];
  const seen = new Set<string>();
  let node = nodeById(lib, id);
  while (node && !seen.has(node.id)) {
    path.unshift(node);
    seen.add(node.id);
    node = nodeById(lib, node.parentId);
  }
  return path;
}

/** "Health › Body › Exercise › Run" — the ancestors' titles of a node, without the node itself. */
export function placeLabel(lib: Library, id: string): string {
  return pathOf(lib, id).slice(0, -1).map((node) => node.title).join(' › ');
}

export function descendants(lib: Library, id: string): LibNode[] {
  const out: LibNode[] = [];
  const walk = (parentId: string) => {
    for (const child of lib.nodes.filter((node) => node.parentId === parentId)) {
      out.push(child);
      walk(child.id);
    }
  };
  walk(id);
  return out;
}

/** The tasks under a node (all levels down), or the node itself when it is a task. */
export function tasksUnder(lib: Library, id: string): LibNode[] {
  const node = nodeById(lib, id);
  if (!node) return [];
  if (node.kind === 'task') return [node];
  return descendants(lib, id).filter((child) => child.kind === 'task');
}

/** Whether `parentId` may hold a node of this kind (null = Free Space, never for an epic; the top for an area). */
export function canParent(lib: Library, kind: Kind, parentId: string | null): boolean {
  if (kind === 'area') return parentId === null;
  if (parentId === null) return kind !== 'epic';                         // an epic always needs an area
  return nodeById(lib, parentId)?.kind === PARENT_KIND[kind];
}

export function addNode(lib: Library, node: LibNode): Library {
  if (!canParent(lib, node.kind, node.parentId)) return lib;
  return { nodes: [...lib.nodes, node] };
}

export function updateNode(lib: Library, id: string, change: Partial<Pick<LibNode, 'title' | 'color'>>): Library {
  return { nodes: lib.nodes.map((node) => (node.id === id ? { ...node, ...change } : node)) };
}

/** Moves a node (with everything under it) to a new parent, at the end of its new siblings. */
export function moveNode(lib: Library, id: string, parentId: string | null): Library {
  const node = nodeById(lib, id);
  if (!node || !canParent(lib, node.kind, parentId) || node.parentId === parentId) return lib;
  const moved = { ...node, parentId };
  return { nodes: [...lib.nodes.filter((n) => n.id !== id), moved] };
}

/** Moves a node one place up or down among its siblings of the same kind. */
export function reorderNode(lib: Library, id: string, offset: number): Library {
  const node = nodeById(lib, id);
  if (!node) return lib;
  const siblings = lib.nodes.filter((n) => n.parentId === node.parentId && n.kind === node.kind);
  const at = siblings.findIndex((n) => n.id === id);
  const other = siblings[at + offset];
  if (!other) return lib;
  const nodes = [...lib.nodes];
  const i = nodes.findIndex((n) => n.id === id);
  const j = nodes.findIndex((n) => n.id === other.id);
  [nodes[i], nodes[j]] = [nodes[j], nodes[i]];
  return { nodes };
}

/** A container can be deleted only when empty (like Epic Manager); a task always (its week places go with it). */
export function canRemove(lib: Library, id: string): boolean {
  const node = nodeById(lib, id);
  return !!node && (node.kind === 'task' || !lib.nodes.some((n) => n.parentId === id));
}

export function removeNode(lib: Library, id: string): Library {
  return canRemove(lib, id) ? { nodes: lib.nodes.filter((n) => n.id !== id) } : lib;
}

/** A library task with this title (case- and space-insensitive), to link a week task to instead of creating a twin. */
export function taskByTitle(lib: Library, title: string): LibNode | undefined {
  const key = title.trim().toLowerCase();
  return key ? lib.nodes.find((n) => n.kind === 'task' && n.title.trim().toLowerCase() === key) : undefined;
}

/** Every library task with the place it is filed in, sorted by place then title (for pickers). */
export function taskOptions(lib: Library): { node: LibNode; place: string }[] {
  return lib.nodes
    .filter((n) => n.kind === 'task')
    .map((node) => ({ node, place: placeLabel(lib, node.id) }))
    .sort((a, b) => (a.place || '￿').localeCompare(b.place || '￿') || a.node.title.localeCompare(b.node.title));
}

/** Firestore refuses `undefined`, and bad data is repaired on the way in and out. */
export function sanitizeLibrary(raw: unknown): Library {
  const list = (raw as { nodes?: unknown })?.nodes;
  if (!Array.isArray(list)) return emptyLibrary();
  const nodes: LibNode[] = [];
  for (const item of list) {
    const n = item as Partial<LibNode>;
    if (!n || typeof n.id !== 'string' || !KINDS.includes(n.kind as Kind)) continue;
    const node: LibNode = {
      id: n.id,
      kind: n.kind as Kind,
      title: String(n.title ?? ''),
      parentId: typeof n.parentId === 'string' ? n.parentId : null,
      color: n.kind === 'task' && typeof n.color === 'string' && n.color ? n.color : null,
    };
    // Only when present: Firestore refuses undefined fields.
    if (n.kind === 'task' && typeof n.created === 'number' && Number.isFinite(n.created)) node.created = n.created;
    nodes.push(node);
  }
  // A parent that no longer exists, or of the wrong kind, sends the node to Free Space instead of hiding it.
  const lib = { nodes };
  return { nodes: nodes.map((n) => (n.parentId && !canParent(lib, n.kind, n.parentId) ? { ...n, parentId: null } : n)) };
}

/** A library task with this title (case- and space-insensitive) right under this parent (a story, or null = Free Space). */
export function twinTask(lib: Library, title: string, parentId: string | null): LibNode | undefined {
  const key = title.trim().toLowerCase();
  return key ? lib.nodes.find((n) => n.kind === 'task' && n.parentId === parentId && n.title.trim().toLowerCase() === key) : undefined;
}

/**
 * Files a week task in the library: the same-titled task of that story (or of Free Space) when there is one,
 * else a new library task there. Returns the library (unchanged when it reused one) and the task's id.
 */
export function fileTask(lib: Library, title: string, parentId: string | null, color: string | null): { lib: Library; id: string } {
  const story = parentId && nodeById(lib, parentId)?.kind === 'story' ? parentId : null;
  const twin = twinTask(lib, title, story);
  if (twin) return { lib, id: twin.id };
  const node: LibNode = { id: newNodeId(), kind: 'task', title: title.trim(), parentId: story, color, created: Date.now() };
  return { lib: addNode(lib, node), id: node.id };
}

/** The tasks of a story or any container above it (everything when `id` is empty), for the "Existing task" picker. */
export function tasksWithin(lib: Library, id: string): LibNode[] {
  return id ? tasksUnder(lib, id) : lib.nodes.filter((n) => n.kind === 'task');
}

/** Every week task that schedules a library task takes its title and colour (the library is the truth). */
export function followLibrary<T extends { title: string; color: string | null; ref: string | null }>(tasks: T[], lib: Library): T[] {
  return tasks.map((task) => {
    const node = task.ref ? nodeById(lib, task.ref) : undefined;
    return node && (node.title !== task.title || node.color !== task.color) ? { ...task, title: node.title, color: node.color } : task;
  });
}

/**
 * A draft saved over a library that changed meanwhile (another tab or device): three-way merge by node.
 * What the draft changed wins; what changed elsewhere (added, edited, deleted) and the draft left alone is kept.
 */
export function rebaseLibrary(base: LibNode[], mine: LibNode[], theirs: LibNode[]): LibNode[] {
  const same = (a: LibNode | undefined, b: LibNode | undefined) => JSON.stringify(a) === JSON.stringify(b);
  const baseById = new Map(base.map((n) => [n.id, n]));
  const theirsById = new Map(theirs.map((n) => [n.id, n]));
  const out: LibNode[] = [];
  for (const node of mine) {
    const was = baseById.get(node.id);
    const now = theirsById.get(node.id);
    if (!was) out.push(node);                                    // created in the draft
    else if (!now) { if (!same(node, was)) out.push(node); }      // deleted elsewhere: gone, unless the draft changed it
    else out.push(same(node, was) ? now : node);                  // the draft's change wins, else theirs
  }
  const mineIds = new Set(mine.map((n) => n.id));
  const mineById = new Map(mine.map((n) => [n.id, n]));
  for (const node of theirs) {
    if (!mineIds.has(node.id) && !baseById.has(node.id)) out.push(node);   // added elsewhere
  }
  // A container deleted on one side while the other side filed something in it stays (only empty containers can go):
  // never leave children without their parent. Their copy wins, else the draft's, else the base's.
  for (let changed = true; changed;) {
    changed = false;
    const ids = new Set(out.map((n) => n.id));
    for (const node of out) {
      if (!node.parentId || ids.has(node.parentId)) continue;
      const parent = theirsById.get(node.parentId) ?? mineById.get(node.parentId) ?? baseById.get(node.parentId);
      if (parent) { out.push(parent); changed = true; break; }
    }
  }
  return sanitizeLibrary({ nodes: out }).nodes;
}

/**
 * The starter structure (Gianni's choice, names in Spanish): 4 Areas, 8 Epics, 13 Features, and in each Feature a first
 * Story with one small Activity (start small; Activities are library tasks, planned in the Week via "Existing Activity").
 */
/**
 * A Feature is written as an outcome already lived (present tense, positive, first person, and believable: something
 * you DO, e.g. "Manejo un presupuesto y tengo ahorros"). A Story is the road, written like a user story in Azure DevOps
 * ("As a…, I want…, so that…"): "Como [who the Epic says I am], quiero [the route, with its when], para [what the
 * Feature lives]"; long on purpose, it gives the Activities their meaning. `was` / `storyWas` keep the names an earlier
 * template used, so applying the template again renames those Features and Stories instead of adding twins.
 */
export interface TemplateFeature { title: string; was: string[]; story: string; storyWas: string[]; activity: string }
/** An Epic is who you are (identity, present tense, short enough for a tab); `was` = its earlier template names. */
export interface TemplateEpic { title: string; was: string[]; features: TemplateFeature[] }
export interface TemplateArea { area: string; epics: TemplateEpic[] }
const f = (title: string, was: string, story: string, storyWas: string, activity: string): TemplateFeature =>
  ({ title, was: [was], story, storyWas: [storyWas], activity });
export const STARTER_TEMPLATE: TemplateArea[] = [
  { area: 'El Templo', epics: [
    { title: 'Soy fuerte y saludable', was: ['Cuerpo Fuerte'], features: [
      f('Me muevo cada día y como sano', 'Ejercicio y comida',
        'Como persona activa, quiero caminar cada mañana después del café, para tener energía todo el día', 'Moverme cada día', 'Caminar 10 min'),
      f('Duermo bien y descanso', 'Descanso',
        'Como alguien que cuida su descanso, quiero desconectarme temprano por la noche, para dormir profundo', 'Dormir bien', 'Apagar pantallas a las 10 pm')] },
    { title: 'Camino con Dios', was: ['Fe Viva'], features: [
      f('Oro y leo la Biblia cada día', 'Oración y Biblia',
        'Como persona de fe, quiero empezar el día con la Palabra, para caminar cerca de Dios', 'Leer la Biblia', 'Leer 1 versículo y orar 2 min')] },
    { title: 'Administro con sabiduría', was: ['Finanzas Sanas'], features: [
      f('Manejo un presupuesto y tengo ahorros', 'Presupuesto y ahorro',
        'Como alguien que administra con sabiduría, quiero revisar mis gastos cada domingo, para saber a dónde va mi dinero', 'Revisar gastos', 'Revisar gastos 10 min')] },
  ] },
  { area: 'El Castillo', epics: [
    { title: 'Mi hogar es paz', was: ['Hogar y Familia'], features: [
      f('Mantengo mi casa en orden', 'Casa',
        'Como parte de un hogar en paz, quiero dejar la casa en orden cada noche, para despertar sin caos', 'Casa en orden', 'Ordenar 10 min'),
      f('Comparto tiempo de calidad con mi familia', 'Tiempo juntos',
        'Como parte de mi familia, quiero cenar con ellos sin teléfonos, para estar presente de verdad', 'Tiempo en familia', 'Cenar juntos sin teléfono')] },
    { title: 'Construyo comunidad', was: ['Amigos y Comunidad'], features: [
      f('Cuido a mis amigos', 'Amistades',
        'Como alguien que cuida a sus amigos, quiero buscar a uno cada semana, para que la amistad no se enfríe', 'Cuidar amistades', 'Escribir a un amigo'),
      f('Sirvo a los demás', 'Servir a otros',
        'Como alguien que sirve, quiero hacer un acto de servicio cada semana, para ser útil a los demás', 'Servir', 'Un acto de servicio')] },
  ] },
  { area: 'La Torre', epics: [
    { title: 'Crezco en mi oficio', was: ['Subir de Nivel'], features: [
      f('Hago trabajo profundo y de calidad', 'Trabajo',
        'Como profesional que crece, quiero proteger mis mañanas para el trabajo profundo, para entregar trabajo de calidad', 'Trabajo profundo', 'Bloque de trabajo profundo 50 min'),
      f('Aprendo algo nuevo cada semana', 'Aprender',
        'Como aprendiz de por vida, quiero estudiar un poco cada día, para seguir mejorando en mi oficio', 'Aprender algo nuevo', 'Estudiar 20 min')] },
  ] },
  { area: 'La Arena', epics: [
    { title: 'Vivo con alegría', was: ['Recargar Energía'], features: [
      f('Disfruto y recargo energía', 'Diversión',
        'Como persona alegre, quiero darme tiempo para descansar sin culpa, para recargar energía', 'Descansar y divertirme', 'Ver un episodio')] },
    { title: 'Vivo con curiosidad', was: ['Crear y Explorar'], features: [
      f('Practico mis pasatiempos', 'Pasatiempos',
        'Como persona curiosa, quiero practicar mi pasatiempo un rato, para disfrutar creando algo mío', 'Practicar un pasatiempo', 'Practicar 15 min'),
      f('Vivo aventuras y conozco lugares nuevos', 'Viajes y aventuras',
        'Como persona curiosa, quiero planear una salida nueva cada mes, para vivir aventuras', 'Planear aventuras', 'Planear la próxima salida')] },
  ] },
];

/** A template Epic, Feature or Story found under an old name: it gets the template's current name. */
export interface TemplateRename { id: string; kind: 'epic' | 'feature' | 'story'; from: string; title: string }

const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Epics, Features and Stories of an earlier template still under an old name (`was`, `storyWas`), with none of the new
 * name next to them: they are renamed rather than duplicated (each is looked for in its parent, under its new or old name).
 */
export function templateRenames(nodes: LibNode[], template: TemplateArea[]): TemplateRename[] {
  const out: TemplateRename[] = [];
  for (const { area, epics } of template) {
    const areaNode = nodes.find((n) => n.kind === 'area' && n.parentId === null && sameTitle(n.title, area));
    if (!areaNode) continue;
    const epicNodes = nodes.filter((n) => n.kind === 'epic' && n.parentId === areaNode.id);
    for (const epic of epics) {
      // The Epic under its current name, else under an earlier one (then it is renamed too).
      let epicNode = epicNodes.find((n) => sameTitle(n.title, epic.title));
      if (!epicNode) {
        epicNode = epicNodes.find((n) => epic.was.some((w) => sameTitle(n.title, w)) && !out.some((r) => r.id === n.id));
        if (epicNode) out.push({ id: epicNode.id, kind: 'epic', from: epicNode.title, title: epic.title });
      }
      if (!epicNode) continue;
      const parentId = epicNode.id;
      const features = nodes.filter((n) => n.kind === 'feature' && n.parentId === parentId);
      for (const feature of epic.features) {
        let featureNode = features.find((n) => sameTitle(n.title, feature.title));
        if (!featureNode) {
          featureNode = features.find((n) => feature.was.some((w) => sameTitle(n.title, w)) && !out.some((r) => r.id === n.id));
          if (featureNode) out.push({ id: featureNode.id, kind: 'feature', from: featureNode.title, title: feature.title });
        }
        if (!featureNode) continue;
        const storyParent = featureNode.id;
        const stories = nodes.filter((n) => n.kind === 'story' && n.parentId === storyParent);
        if (stories.some((n) => sameTitle(n.title, feature.story))) continue;
        const oldStory = stories.find((n) => feature.storyWas.some((w) => sameTitle(n.title, w)) && !out.some((r) => r.id === n.id));
        if (oldStory) out.push({ id: oldStory.id, kind: 'story', from: oldStory.title, title: feature.story });
      }
    }
  }
  return out;
}

/** Everything applying a template changes: the renames first, then the nodes still missing after them. */
export function planTemplateChanges(nodes: LibNode[], template: TemplateArea[], makeId: () => string = newNodeId): { renames: TemplateRename[]; add: LibNode[] } {
  const renames = templateRenames(nodes, template);
  const renamed = nodes.map((n) => { const r = renames.find((x) => x.id === n.id); return r ? { ...n, title: r.title } : n; });
  return { renames, add: planTemplate(renamed, template, makeId) };
}

/**
 * What a template still needs: the nodes to add, in parent-first order. Whatever already exists with the same name
 * (case- and space-insensitive) in the same place is reused, so applying it twice adds nothing.
 */
export function planTemplate(nodes: LibNode[], template: TemplateArea[], makeId: () => string = newNodeId): LibNode[] {
  const out: LibNode[] = [];
  const all = () => [...nodes, ...out];
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const ensure = (kind: Kind, title: string, parentId: string | null): string => {
    const found = all().find((n) => n.kind === kind && n.parentId === parentId && same(n.title, title));
    if (found) return found.id;
    const node: LibNode = { id: makeId(), kind, title, parentId, color: null };
    out.push(node);
    return node.id;
  };
  for (const { area, epics } of template) {
    const areaId = ensure('area', area, null);
    for (const epic of epics) {
      const epicId = ensure('epic', epic.title, areaId);
      for (const feature of epic.features) {
        const featureId = ensure('feature', feature.title, epicId);   // renames of old names come first (planTemplateChanges)
        const storyId = ensure('story', feature.story, featureId);
        ensure('task', feature.activity, storyId);
      }
    }
  }
  return out;
}

/**
 * A day's blocks after a library change: cards of a library task that changed take its title and colour, cards of
 * one that was deleted leave (an emptied block goes). `before` = the task ids the library had before the change.
 * Returns null when nothing in the day changes.
 */
export function followDay(blocks: Block[], before: Set<string>, after: Map<string, LibNode>): Block[] | null {
  let changed = false;
  const next = blocks
    .map((block) => ({
      ...block,
      tasks: block.tasks.flatMap((task) => {
        if (!task.ref || !before.has(task.ref)) return [task];
        const node = after.get(task.ref);
        if (!node) { changed = true; return []; }
        if (node.title !== task.title || node.color !== task.color) { changed = true; return [{ ...task, title: node.title, color: node.color }]; }
        return [task];
      }),
    }))
    .filter((block) => block.tasks.length > 0);
  return changed ? next : null;
}

/** Every story with its place ("Area › Epic › Feature › Story"), sorted, for filing a task. */
export function storyOptions(lib: Library): { node: LibNode; place: string }[] {
  return lib.nodes
    .filter((n) => n.kind === 'story')
    .map((node) => ({ node, place: pathOf(lib, node.id).map((n) => n.title).join(' › ') }))
    .sort((a, b) => a.place.localeCompare(b.place));
}

/** The tasks waiting in Free Space (no story yet), newest first: what Capture shows. */
export function inboxTasks(lib: Library): LibNode[] {
  return lib.nodes.filter((n) => n.kind === 'task' && n.parentId === null).reverse();
}
