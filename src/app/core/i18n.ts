import { Injectable, computed, effect, signal } from '@angular/core';
import { LevelSetId, levelText, parseLevelSet } from './levels.model';

/**
 * The app's languages, in the order the language picker shows them. Adding a language is one more entry here plus its
 * translations: its labels below (and in `why.ts`, `changes.json`, `year.model.ts`), each one optional, since a label a
 * language does not have yet falls back to English, then Spanish (`inLang`). `name` is the language in its own words,
 * `locale` what dates and numbers are formatted with.
 */
export const LANGS = [
  { code: 'en', name: 'English', locale: 'en' },
  { code: 'es', name: 'Español', locale: 'es' },
] as const;

export type Lang = (typeof LANGS)[number]['code'];
export type LangInfo = (typeof LANGS)[number];

/** A text in every language: English and Spanish always, any other language when it has been translated. */
export type Texts<T = string> = { en: T; es: T } & Partial<Record<Lang, T>>;

/** The order a missing translation is looked for in. */
const FALLBACK: readonly Lang[] = ['en', 'es'];

export const LANG_CODES: readonly Lang[] = LANGS.map((l) => l.code);

export function isLang(value: unknown): value is Lang {
  return typeof value === 'string' && (LANG_CODES as readonly string[]).includes(value);
}

export function langInfo(lang: Lang): LangInfo {
  return LANGS.find((l) => l.code === lang) ?? LANGS[0];
}

/** `texts` in `lang`, or in English, then Spanish, when that language has no translation yet. */
export function inLang<T>(texts: Partial<Record<Lang, T>>, lang: Lang): T | undefined {
  const own = texts[lang];
  if (own !== undefined) return own;
  for (const fallback of FALLBACK) if (texts[fallback] !== undefined) return texts[fallback];
  return undefined;
}

/** The first of these language tags the app has, by its main code (`es-MX` is `es`); English when none is. */
export function langFromBrowser(languages: readonly string[]): Lang {
  for (const tag of languages) {
    const code = tag?.toLowerCase().split('-')[0];
    if (isLang(code)) return code;
  }
  return 'en';
}

/** The language after `lang` in the list, going round (the sign-in screen's one switch). */
export function nextLang(lang: Lang): Lang {
  const i = LANG_CODES.indexOf(lang);
  return LANG_CODES[(i + 1) % LANG_CODES.length];
}

const LABELS: Record<string, Texts> = {
  'app.title': { en: 'Go Epic', es: 'Go Epic' },
  'nav.week': { en: 'Week board', es: 'Semana' },
  'nav.focus': { en: 'Focus', es: 'Enfoque' },
  'nav.progress': { en: 'Progress', es: 'Progreso' },
  'capture.title': { en: 'Capture', es: 'Capturar' },
  'capture.open': { en: 'Capture a task', es: 'Capturar una tarea' },
  'capture.placeholder': { en: 'A task… (Enter)', es: 'Una tarea… (Enter)' },
  'capture.empty': { en: 'No tasks pending. Write one above.', es: 'No hay tareas pendientes. Escribe una arriba.' },
  'capture.current': { en: 'Current', es: 'Actuales' },
  'capture.finished': { en: 'Finished', es: 'Finalizadas' },
  'capture.noneFinished': { en: 'No finished tasks yet.', es: 'Todavía no hay tareas finalizadas.' },
  'capture.check': { en: 'Mark as done', es: 'Marcar como terminada' },
  'capture.uncheck': { en: 'Open again', es: 'Volver a abrir' },
  'capture.noDay': { en: 'No day', es: 'Sin día' },
  'capture.today': { en: 'Today', es: 'Hoy' },
  'capture.tomorrow': { en: 'Tomorrow', es: 'Mañana' },
  'capture.task': { en: 'Task', es: 'Tarea' },
  'capture.new': { en: 'New task', es: 'Nueva tarea' },
  'capture.repeat': { en: 'Repeat', es: 'Repetir' },
  'capture.day': { en: 'Day', es: 'Día' },
  'capture.hour': { en: 'Hour', es: 'Hora' },
  'capture.anyHour': { en: 'Leave the hour empty for any time that day.', es: 'Deja la hora vacía para cualquier momento del día.' },
  'capture.add': { en: 'Add', es: 'Agregar' },
  'capture.edit': { en: 'Edit', es: 'Editar' },
  'capture.delete': { en: 'Delete', es: 'Eliminar' },
  'status.title': { en: 'State', es: 'Estado' },
  'week.openInfo': { en: 'See where this [task.l] lives', es: 'Ver dónde vive [task:este|esta] [task.l]' },
  'week.markTodo': { en: 'Mark as to do', es: 'Marcar como pendiente' },
  'week.infoTitle': { en: 'Where this [task.l] lives', es: 'Dónde vive [task:este|esta] [task.l]' },
  'week.infoClose': { en: 'Close', es: 'Cerrar' },
  'status.todo': { en: 'To do', es: 'Pendiente' },
  'status.done': { en: 'Done', es: 'Hecho' },
  'status.late': { en: 'Late', es: 'Tarde' },
  'status.progress': { en: 'In progress', es: 'En progreso' },
  'status.skipped': { en: 'Skipped', es: 'Saltado' },
  'status.hint': { en: 'Tap: done. Long press: choose a state.', es: 'Toque: hecho. Toque largo: elige un estado.' },
  'progress.title': { en: 'Progress', es: 'Progreso' },
  'progress.streak': { en: '🔥 {n} days', es: '🔥 {n} días' },
  'progress.streak1': { en: '🔥 1 day', es: '🔥 1 día' },
  'progress.streakMore': { en: '🔥 {n}+ days', es: '🔥 {n}+ días' },
  'progress.none': { en: 'No streak yet', es: 'Aún sin racha' },
  'progress.pickHint': { en: 'No [task] is tracked yet. Arrange the week (✎) and tick “Track in Progress” on [task.a] [task].', es: 'Aún no sigues [task:ningún|ninguna] [task]. Organiza la semana (✎) y marca «Seguir en Progreso» en [task.a] [task].' },
  'progress.empty': { en: 'Plan [task.p] in the Week board to see your streaks here.', es: 'Planea [task.p] en la Semana para ver aquí tus rachas.' },
  'progress.legend': { en: 'Last 14 days: ● done · ◐ late · ▶ in progress · ⤼ skipped · ✕ missed · ○ today · blank: not planned', es: 'Últimos 14 días: ● hecho · ◐ tarde · ▶ en progreso · ⤼ saltado · ✕ no hecho · ○ hoy · vacío: no tocaba' },
  'progress.tasks': { en: 'Repeating tasks', es: 'Tareas que se repiten' },
  'progress.tabStreaks': { en: 'Consistency', es: 'Constancia' },
  'progress.tabBalance': { en: '[area.p] of life', es: '[area.p] de la vida' },
  'progress.tabs': { en: 'Progress views', es: 'Vistas de Progreso' },
  'progress.gridOpen': { en: 'Open the tracking grid of {title}', es: 'Abrir la cuadrícula de {title}' },
  'progress.gridTitle': { en: 'Tracking grid', es: 'Cuadrícula de seguimiento' },
  'progress.gridStart': { en: 'Start', es: 'Inicio' },
  'progress.gridEnd': { en: 'End', es: 'Fin' },
  'progress.gridDay': { en: 'Day {n} of {total}', es: 'Día {n} de {total}' },
  'progress.gridLegend': { en: '● done · ◐ late · ▶ in progress · ⤼ skipped · ✕ missed · ○ today · blank: not planned, no data yet or still to come', es: '● hecho · ◐ tarde · ▶ en progreso · ⤼ saltado · ✕ no hecho · ○ hoy · vacío: no tocaba, sin datos aún o por venir' },
  'balance.period': { en: 'Period', es: 'Periodo' },
  'balance.3w': { en: '3 weeks', es: '3 semanas' },
  'balance.quarter': { en: 'Quarter', es: 'Trimestre' },
  'balance.range3w': { en: 'Last 3 weeks: {from} – {to}', es: 'Últimas 3 semanas: {from} – {to}' },
  'balance.rangeQ': { en: 'This quarter: {from} – {to}', es: 'Este trimestre: {from} – {to}' },
  'balance.done': { en: 'of what was planned, done', es: 'de lo planeado, cumplido' },
  'balance.before': { en: 'before {n}', es: 'antes {n}' },
  'balance.chart': { en: 'Radar of your [epic.p]: how much of what was planned you did', es: 'Radar de tus [epic.p]: cuánto de lo planeado cumpliste' },
  'balance.keyNow': { en: 'this period', es: 'este periodo' },
  'balance.keyPrev': { en: 'the one before', es: 'el anterior' },
  'balance.noPlan': { en: 'no plan', es: 'sin plan' },
  'balance.noEpics': { en: 'Create [area.p] and [epic.p] in the Canvas, and plan their [task.p] in the Week, to see your balance here.', es: 'Crea [area.p] y [epic.p] en el Canvas, y planea sus [task.p] en la Semana, para ver aquí tu balance.' },
  'balance.noMarks': { en: 'Mark [task.p] as done in the Week and the radar will fill in.', es: 'Marca [task.p] como [task:hechos|hechas] en la Semana y el radar se irá llenando.' },
  'balance.nothingPlanned': { en: 'Nothing was planned in this [epic] during the period.', es: 'No había nada planeado en [epic:este|esta] [epic] en el periodo.' },
  'balance.summary': { en: '{done} of {planned} done ({pct})', es: '{done} de {planned} hechas ({pct})' },
  'balance.pending': { en: '{n} pending', es: '{n} pendientes' },
  'balance.note': { en: 'One axis per [epic], coloured by its [area]. Each counts the planned [task.p] you finished (today only once done; skipped ones are left out), from the first day you marked anything. It reads your current week plan.', es: 'Un eje por [epic], con el color de su [area]. Cuenta [task.los] [task.p] [task:planeados|planeadas] que terminaste (hoy solo [task.los] ya [task:hechos|hechas]; [task.los] [task:saltados|saltadas] no cuentan), desde el primer día que marcaste algo. Usa tu plan de semana actual.' },
  'progress.note': { en: 'Streaks read your current week plan.', es: 'Las rachas usan tu plan de semana actual.' },
  'settings.title': { en: 'Settings', es: 'Ajustes' },
  'settings.redLine': { en: 'Red time line', es: 'Línea de la hora en rojo' },
  'settings.redCountdown': { en: 'Red countdown bar', es: 'Barra de cuenta regresiva en rojo' },
  'settings.redHint': { en: 'Off, it takes the theme’s colour.', es: 'Apagada, toma el color del tema.' },
  'week.centreNow': { en: 'It is {time}: centre the line', es: 'Son las {time}: centrar la línea' },
  'settings.theme': { en: 'Theme', es: 'Tema' },
  'theme.epic': { en: 'Epic', es: 'Épico' },
  'theme.office': { en: 'Office', es: 'Oficina' },
  'theme.pinkpop': { en: 'Pink Pop', es: 'Pink Pop' },
  'theme.petalpunk': { en: 'Petal Punk', es: 'Petal Punk' },
  'theme.squeezeme': { en: 'Clear Sky', es: 'Cielo claro' },
  'theme.sunburnt': { en: 'Sunburnt Toast', es: 'Sunburnt Toast' },
  'theme.smokedcitrus': { en: 'Smoked Citrus', es: 'Smoked Citrus' },
  'theme.graphite': { en: 'Graphite', es: 'Grafito' },
  'theme.goepiclight': { en: 'Go Epic Light', es: 'Go Epic Claro' },
  'theme.goepicdark': { en: 'Go Epic Dark', es: 'Go Epic Oscuro' },
  'palette.title': { en: 'Palettes', es: 'Paletas' },
  'palette.suggested': { en: 'Suggested', es: 'Sugerido' },
  'palette.edge': { en: 'Only the edge', es: 'Solo el filo' },
  'palette.edgeHint': { en: 'The activity keeps the theme’s plain card and the colour goes only on its left edge.', es: 'La actividad queda con la tarjeta normal del tema y el color va solo en su filo izquierdo.' },
  'palette.epic': { en: 'Epic', es: 'Épico' },
  'palette.pinkpop': { en: 'Pink Pop', es: 'Pink Pop' },
  'palette.squeezeme': { en: 'Clear Sky', es: 'Cielo claro' },
  'palette.sunburnt': { en: 'Sunburnt Toast', es: 'Sunburnt Toast' },
  'palette.petalpunk': { en: 'Pinks', es: 'Rosas' },
  'palette.lightroses': { en: 'Light Roses', es: 'Rosas Claros' },
  'palette.smokedcitrus': { en: 'Oranges', es: 'Naranjas' },
  'palette.lightoranges': { en: 'Light Oranges', es: 'Naranjas Claros' },
  'palette.office': { en: 'Office', es: 'Oficina' },
  'palette.graphite': { en: 'Graphite', es: 'Grafito' },
  'palette.goepiclight': { en: 'Go Epic Light', es: 'Go Epic Claro' },
  'palette.goepicdark': { en: 'Go Epic Dark', es: 'Go Epic Oscuro' },
  'palette.sunrise': { en: 'Sunrise', es: 'Sunrise' },
  'palette.neon': { en: 'Neon', es: 'Neón' },
  'palette.orchard': { en: 'Orchard', es: 'Orchard' },
  'palette.terra': { en: 'Terra', es: 'Terra' },
  'palette.sober': { en: 'Sober', es: 'Sobria' },
  'nav.pages': { en: 'Pages', es: 'Páginas' },
  'nav.edit': { en: 'Edit', es: 'Editar' },
  'settings.language': { en: 'Language', es: 'Idioma' },
  'nav.actions': { en: 'Actions', es: 'Acciones' },
  'nav.close': { en: 'Close', es: 'Cerrar' },
  'settings.size': { en: 'Text size', es: 'Tamaño de letra' },
  'settings.pxPerMin': { en: 'Pixels per minute', es: 'Píxeles por minuto' },
  'settings.shorter': { en: 'Fewer pixels per minute', es: 'Menos píxeles por minuto' },
  'settings.longer': { en: 'More pixels per minute', es: 'Más píxeles por minuto' },
  'settings.spacing': { en: 'Space between letters', es: 'Espacio entre letras' },
  'settings.smaller': { en: 'Smaller text', es: 'Letra más chica' },
  'settings.bigger': { en: 'Bigger text', es: 'Letra más grande' },
  'settings.tighter': { en: 'Less space between letters', es: 'Menos espacio entre letras' },
  'settings.wider': { en: 'More space between letters', es: 'Más espacio entre letras' },
  'nav.tilt': { en: 'Weighted buttons', es: 'Botones con peso' },
  'nav.tiltHint': { en: 'Buttons lean when the phone leans', es: 'Los botones se cargan a un lado cuando el teléfono se inclina' },
  'login.lead': { en: 'Plan your week in blocks, then live each day one [task] at a time.', es: 'Planea tu semana en bloques y vive cada día [task.a] [task] a la vez.' },
  'login.google': { en: 'Sign in with Google', es: 'Entrar con Google' },
  'login.failed': { en: 'Sign-in failed', es: 'No se pudo entrar' },
  'setup.title': { en: 'Firebase is not configured yet', es: 'Falta configurar Firebase' },
  'setup.body': { en: 'Fill in src/app/firebase.config.ts with your Firebase web app config, then build again.', es: 'Llena src/app/firebase.config.ts con la configuración de tu app web de Firebase y vuelve a compilar.' },
  'loading': { en: 'Loading…', es: 'Cargando…' },
  'pwa.update': { en: 'A new version of Go Epic is ready.', es: '¡Hay una versión nueva de Go Epic!' },
  'pwa.reload': { en: 'Tap to update', es: 'Presiona para actualizar' },
  'pwa.whatsNew': { en: 'What is new', es: 'Qué hay de nuevo' },
  'pwa.version': { en: 'Version {n}', es: 'Versión {n}' },
  'pwa.newTag': { en: 'New', es: 'Nueva' },
  'pwa.older': { en: 'Earlier version', es: 'Versión anterior' },
  'pwa.newer': { en: 'Later version', es: 'Versión siguiente' },
  'saveFailed': { en: 'Could not save', es: 'No se pudo guardar' },

  'day.MONDAY': { en: 'Monday', es: 'Lunes' },
  'day.TUESDAY': { en: 'Tuesday', es: 'Martes' },
  'day.WEDNESDAY': { en: 'Wednesday', es: 'Miércoles' },
  'day.THURSDAY': { en: 'Thursday', es: 'Jueves' },
  'day.FRIDAY': { en: 'Friday', es: 'Viernes' },
  'day.SATURDAY': { en: 'Saturday', es: 'Sábado' },
  'day.SUNDAY': { en: 'Sunday', es: 'Domingo' },
  'dayMini.MONDAY': { en: 'Mo', es: 'Lu' },
  'dayMini.TUESDAY': { en: 'Tu', es: 'Ma' },
  'dayMini.WEDNESDAY': { en: 'We', es: 'Mi' },
  'dayMini.THURSDAY': { en: 'Th', es: 'Ju' },
  'dayMini.FRIDAY': { en: 'Fr', es: 'Vi' },
  'dayMini.SATURDAY': { en: 'Sa', es: 'Sá' },
  'dayMini.SUNDAY': { en: 'Su', es: 'Do' },
  'dayShort.MONDAY': { en: 'Mon', es: 'Lun' },
  'dayShort.TUESDAY': { en: 'Tue', es: 'Mar' },
  'dayShort.WEDNESDAY': { en: 'Wed', es: 'Mié' },
  'dayShort.THURSDAY': { en: 'Thu', es: 'Jue' },
  'dayShort.FRIDAY': { en: 'Fri', es: 'Vie' },
  'dayShort.SATURDAY': { en: 'Sat', es: 'Sáb' },
  'dayShort.SUNDAY': { en: 'Sun', es: 'Dom' },

  'week.arrange': { en: 'Arrange the week', es: 'Organizar la semana' },
  'week.finish': { en: 'Finish arranging', es: 'Terminar' },
  'week.overdue': { en: 'Overdue, still open', es: 'Atrasadas, sin hacer' },
  'week.todoFrom': { en: 'from {day}', es: 'del {day}' },
  'week.allDay': { en: 'All day', es: 'Todo el día' },
  'week.overview': { en: 'Day overview', es: 'Resumen del día' },
  'week.overviewDays': { en: 'Days of the week', es: 'Días de la semana' },
  'week.overviewEmpty': { en: 'Nothing planned for today.', es: 'No hay nada planeado para hoy.' },
  'week.overviewOther': { en: 'Other tasks', es: 'Otras tareas' },
  'week.trayFold': { en: 'Fold the list down', es: 'Bajar la lista' },
  'week.trayOpen': { en: 'Show the list', es: 'Mostrar la lista' },
  'week.todos': { en: 'Tasks', es: 'Tareas' },
  'week.foldBlock': { en: 'Close this block', es: 'Cerrar este bloque' },
  'week.unfoldBlock': { en: 'Open this block', es: 'Abrir este bloque' },
  'week.foldAll': { en: 'Close all blocks', es: 'Cerrar todos los bloques' },
  'week.unfoldAll': { en: 'Open all blocks', es: 'Abrir todos los bloques' },
  'week.addBlock': { en: 'Create new Block + [task]', es: 'Crear nuevo Block + [task]' },
  'week.newBlock': { en: 'New block', es: 'Bloque nuevo' },
  'week.empty': { en: 'Nothing planned', es: 'Nada planeado' },
  'week.quickAdd': { en: '+ Add [task] (Enter)', es: '+ Agregar [task] (Enter)' },
  'week.blockName': { en: 'Block name', es: 'Nombre del bloque' },
  'week.start': { en: 'Start', es: 'Inicio' },
  'week.end': { en: 'End', es: 'Fin' },
  'week.free': { en: '{n} min free', es: '{n} min libres' },
  'week.full': { en: '✓ Full', es: '✓ Lleno' },
  'week.dragTask': { en: 'Drag to move', es: 'Arrastra para mover' },
  'week.resize': { en: 'Pull to change the minutes', es: 'Jala para cambiar los minutos' },
  'week.over': { en: '⚠ {n} min over', es: '⚠ {n} min de más' },
  'week.blockUp': { en: 'Move block up', es: 'Subir bloque' },
  'week.blockDown': { en: 'Move block down', es: 'Bajar bloque' },
  'week.transfer': { en: 'Copy or move block', es: 'Copiar o mover bloque' },
  'week.transferDay': { en: 'Copy or move the whole day', es: 'Copiar o mover el día entero' },
  'week.addTask': { en: 'Add [task.a] [task] to this block', es: 'Agregar [task.a] [task] a este bloque' },
  'week.deleteBlock': { en: 'Delete block', es: 'Eliminar bloque' },
  'week.confirmDeleteBlock': { en: 'Delete the block "{block}" and its [task.p]?', es: '¿Eliminar el bloque "{block}" y sus [task.p]?' },
  'week.taskActions': { en: 'Edit or move', es: 'Editar o mover' },
  'week.deleteTask': { en: 'Delete [task]', es: 'Eliminar [task]' },
  'week.taskUp': { en: 'Move up', es: 'Subir' },
  'week.taskDown': { en: 'Move down', es: 'Bajar' },
  'capture.toActivity': { en: 'Convert to [task.l]', es: 'Convertir en [task.l]' },
  'capture.activityMinutes': { en: 'Minutes of the [task.l]', es: 'Minutos de [task.el] [task.l]' },
  'capture.toActivityAskWeek': { en: 'Convert "{task}" to [task.a] [task.l]? It takes the task\'s place on the Week board and leaves your tasks.', es: '¿Convertir "{task}" en [task.l]? Toma el lugar de la tarea en la semana y sale de tus tareas.' },
  'capture.toActivityNoRoom': { en: 'Its block cannot grow past midnight. Shorten it and try again.', es: 'Su bloque no puede pasar de medianoche. [task:Acórtalo|Acórtala] e inténtalo de nuevo.' },
  'capture.toActivityWait': { en: 'The library is still loading. Try again in a moment.', es: 'La biblioteca aún se está cargando. Inténtalo en un momento.' },
  'week.minutesLeft': { en: '{n} min left', es: 'Quedan {n} min' },
  'week.confirmDeleteTask': { en: 'Delete "{task}"?', es: '¿Eliminar "{task}"?' },
  'week.noRoom': { en: 'No room in "{block}": {n} min free.', es: 'No cabe en "{block}": {n} min libres.' },
  'week.newTask': { en: 'New [task]', es: '[task:Nuevo|Nueva] [task]' },
  'week.min': { en: 'min', es: 'min' },
  'window.end_without_start': { en: 'Set a start first.', es: 'Primero pon el inicio.' },
  'window.end_before_start': { en: 'The end must be after the start.', es: 'El fin debe ser después del inicio.' },
  'window.too_small': { en: 'Too short for its [task.p].', es: 'Muy corto para sus [task.p].' },

  'task.title': { en: '[task]', es: '[task]' },
  'task.newTitle': { en: 'New [task]', es: '[task:Nuevo|Nueva] [task]' },
  'task.newBlockTitle': { en: 'Create new Block + [task]', es: 'Crear nuevo Block + [task]' },
  'task.pickActivity': { en: 'Open the list', es: 'Abrir la lista' },
  'task.pickCount': { en: '{n} [task.pl]', es: '{n} [task.pl]' },
  'task.twoWays': { en: '[task]: from the list or typed', es: '[task]: de la lista o [task:escrito|escrita]' },
  'task.orNew': { en: 'or name a new one', es: 'o escribe [task:uno nuevo|una nueva]' },
  'task.allEpics': { en: 'All', es: '[epic:Todos|Todas]' },
  'task.pickFromList': { en: 'Choose from the list ({n})', es: 'Elegir de la lista ({n})' },
  'task.pickTitle': { en: 'Pick [task.a] [task.l]', es: 'Elige [task.a] [task.l]' },
  'task.delete': { en: 'Delete', es: 'Eliminar' },
  'task.choose': { en: 'Choose', es: 'Elegir' },
  'task.pickSearch': { en: 'Search [task.a] [task.l], [story.l], [feature.l] or [epic.l]…', es: 'Busca [task.a] [task.l], [story.l], [feature.l] o [epic.l]…' },
  'task.name': { en: 'Name', es: 'Nombre' },
  'task.minutesOther': { en: 'Other minutes', es: 'Otros minutos' },
  'task.track': { en: 'Track in Progress', es: 'Seguir en Progreso' },
  'task.minutes': { en: 'Minutes', es: 'Minutos' },
  'task.day': { en: 'Day', es: 'Día' },
  'task.block': { en: 'Block', es: 'Bloque' },
  'task.blockName': { en: 'Block name', es: 'Nombre del bloque' },
  'task.color': { en: 'Color', es: 'Color' },
  'task.auto': { en: 'Automatic', es: 'Automático' },
  'task.active': { en: 'Active', es: 'Activo' },
  'task.cancel': { en: 'Cancel', es: 'Cancelar' },
  'undo.deleting': { en: 'Deleting "{name}"…', es: 'Eliminando "{name}"…' },
  'undo.second': { en: 'second before it is deleted', es: 'segundo antes de borrar' },
  'undo.seconds': { en: 'seconds before it is deleted', es: 'segundos antes de borrar' },
  'undo.now': { en: 'Delete now', es: 'Eliminar ya' },
  'undo.keep': { en: "Don't delete", es: 'No borrar' },
  'look.tools': { en: 'Edit tools', es: 'Herramientas de edición' },
  'ask.ok': { en: 'OK', es: 'Entendido' },
  'task.done': { en: 'Done', es: 'Listo' },
  'task.nameRequired': { en: 'Give it a name.', es: 'Ponle un nombre.' },
  'task.where': { en: 'Where', es: 'Dónde' },
  'task.none': { en: '—', es: '—' },
  'task.freeHint': { en: 'Without [story.a] [story] it waits in Free Space (Canvas).', es: 'Sin [story] espera en el Espacio libre (Canvas).' },
  'task.existing': { en: 'Existing [task]', es: '[task] existente' },
  'task.unlink': { en: 'Use a new [task] instead', es: 'Usar [task.a] [task] [task:nuevo|nueva]' },
  'task.noTasksHere': { en: 'No [task.p] here yet', es: 'Aún no hay [task.p] aquí' },
  'task.alreadyExists': { en: 'Already exists. Linked to it.', es: 'Ya existe. Se enlaza con él.' },

  'transfer.copy': { en: 'Copy', es: 'Copiar' },
  'transfer.move': { en: 'Move', es: 'Mover' },
  'transfer.hintCopy': { en: 'Pick one or more days. The block stays here too.', es: 'Elige uno o más días. El bloque también se queda aquí.' },
  'transfer.hintMove': { en: 'Pick the day to move it to.', es: 'Elige el día al que se mueve.' },
  'transfer.dayHintCopy': { en: 'Pick one or more days. Its blocks join the ones there, each at its hour; this day stays as it is.', es: 'Elige uno o más días. Sus bloques se suman a los que ya hay, cada uno a su hora; este día queda igual.' },
  'transfer.dayHintMove': { en: 'Pick the day to move it to. Its blocks join the ones there; this day is left empty.', es: 'Elige el día al que se mueve. Sus bloques se suman a los que ya hay; este día queda vacío.' },

  'focus.title': { en: 'Focus', es: 'Enfoque' },
  'focus.now': { en: 'Now', es: 'Ahora' },
  'focus.next': { en: 'Next', es: 'Sigue' },
  'focus.left': { en: '{n} min left', es: 'quedan {n} min' },
  'focus.startsIn': { en: 'starts in {n} min', es: 'empieza en {n} min' },
  'focus.progress': { en: '{done} of {total} done', es: '{done} de {total} hechos' },
  'focus.empty': { en: 'Nothing planned for today. Plan it on the Week board.', es: 'No hay nada para hoy. Planéalo en la Semana.' },
  'focus.markDone': { en: 'Mark as done', es: 'Marcar como hecho' },
  'focus.markTodo': { en: 'Mark as not done', es: 'Marcar como pendiente' },
  'focus.allDone': { en: 'All done for today!', es: '¡Todo listo por hoy!' },

  'color.lagoon': { en: 'Lagoon', es: 'Laguna' },
  'color.foam': { en: 'Foam', es: 'Espuma' },
  'color.lilac': { en: 'Lilac', es: 'Lila' },
  'color.peach': { en: 'Peach', es: 'Durazno' },
  'color.rose': { en: 'Rose', es: 'Rosa' },
  'color.butter': { en: 'Butter', es: 'Mantequilla' },
  'color.sky': { en: 'Sky', es: 'Cielo' },
  'color.sand': { en: 'Sand', es: 'Arena' },

  'nav.canvas': { en: 'Canvas', es: 'Canvas' },
  'nav.year': { en: 'Year', es: 'Año' },
  'nav.products': { en: 'Product history', es: 'Historial de productos' },
  'products.title': { en: 'Product history', es: 'Historial de productos' },
  'products.empty': { en: 'The products you have viewed will appear here.', es: 'Aquí aparecerán los productos que has visto.' },
  'products.soon': { en: 'We will connect it soon.', es: 'Pronto lo conectamos.' },
  'nav.guide': { en: 'How to use', es: 'Instrucciones de uso' },
  'guide.title': { en: 'How to use', es: 'Instrucciones de uso' },
  'guide.cards': { en: 'How to use Go Epic, card by card', es: 'Cómo usar Go Epic, tarjeta por tarjeta' },
  'guide.prev': { en: 'Previous card', es: 'Tarjeta anterior' },
  'guide.next': { en: 'Next card', es: 'Tarjeta siguiente' },
  'guide.of': { en: '{n} of {total}', es: '{n} de {total}' },
  'guide.start': { en: 'Go to the Canvas', es: 'Ir al Canvas' },
  'guide.again': { en: 'Start over', es: 'Ver desde el principio' },
  'guide.welcome.title': { en: 'Welcome to Go Epic', es: 'Bienvenido a Go Epic' },
  'guide.welcome.body': { en: 'Go Epic orders your life in four [area.pl], your time in weeks and your year in seasons. These cards show where to start: swipe or use the arrows.', es: 'Go Epic ordena tu vida en cuatro [area.pl], tu tiempo en semanas y tu año en temporadas. Estas tarjetas te muestran por dónde empezar: desliza o usa las flechas.' },
  'guide.menu.title': { en: 'The round menu', es: 'El menú redondo' },
  'guide.menu.body': { en: 'The round button at the bottom right opens everything: the day overview, the pages, the themes, ✎ Edit and ⚙ Settings. The 💡 under it captures a task. A tap on a page’s title also opens the pages.', es: 'El botón redondo de abajo a la derecha lo abre todo: el resumen del día, las páginas, los temas, ✎ Editar y ⚙ Ajustes. El 💡 de abajo captura una tarea. Tocar el título de una página también abre las páginas.' },
  'guide.areas.title': { en: 'The four [area.pl]', es: '[area.Los] cuatro [area.pl]' },
  'guide.areas.body': { en: 'Everything you do lives in [area.a] [area.l]: The Temple (health), The Castle (family), The Tower (career) and The Arena (fun). They come ready: you never create them.', es: 'Todo lo que haces vive en [area.a] [area.l]: El Templo (salud), El Castillo (familia), La Torre (carrera) y La Arena (diversión). Ya vienen [area:hechos|hechas]: no hay que [area:crearlos|crearlas].' },
  'guide.epics.title': { en: 'First: your [epic.p]', es: 'Primero: tus [epic.p]' },
  'guide.epics.body': { en: 'On the Canvas, choose [area.a] [area.l] at the top of the panel, open the [epic] menu under it and create one with «+ [epic]». [epic.A] [epic] says who you want to be, like «Athlete» or «Reader».', es: 'En el Canvas, elige [area.a] [area.l] arriba del panel, abre el menú [epic] debajo y crea [epic:uno|una] con «+ [epic]». [epic.A] [epic] dice quién quieres ser, por ejemplo «Atleta» o «Lector».' },
  'guide.levels.title': { en: '[feature], [story] and [task]', es: '[feature], [story] y [task]' },
  'guide.levels.body': { en: 'Inside each [epic] go its [feature.p] (what you live), inside them the [story.p] (the road: «As…, I want…, so that…») and inside those the [task.p], today’s steps. [story.A] [story]’s «+ [task]» creates [task.a] [task] right there, with all its data.', es: 'Dentro de cada [epic] van sus [feature.p] (lo que vives), dentro [story.los] [story.p] (el camino: «Como…, quiero…, para…») y dentro [task.los] [task.p], los pasos de hoy. El «+ [task]» de [story.a] [story] crea [task.a] [task] ahí mismo, con todos sus datos.' },
  'guide.undefined.title': { en: 'A place, when you want one', es: 'Un lugar, cuando quieras' },
  'guide.undefined.body': { en: '[task.A] [task] can also live with no [story] or [feature]. «+ New [task.l]», inside the Canvas’s «Undefined» button, makes one with only its name: it waits there and can already go in your day. When you want, open it and choose its [area], [epic], [feature] and [story]: it is saved once all four are chosen.', es: '[task.A] [task] también puede vivir sin [story] ni [feature]. «+ [task:Nuevo|Nueva] [task.l]», dentro del botón «Sin definir» del Canvas, [task:crea uno|crea una] solo con su nombre: ahí espera y ya puede ir en tu día. Cuando quieras, [task:ábrelo|ábrela] y elige su [area], [epic], [feature] y [story]: se guarda al elegir los cuatro.' },
  'guide.plan.title': { en: 'From your Canvas to your day', es: 'Del Canvas a tu día' },
  'guide.plan.body': { en: 'The Canvas’s [task.p], in [story.a] [story] or still undefined, are what fill your day: on the Week board, when you make or edit [task.a] [task], choose it from the list and it takes its place in today’s plan. It stays in the Canvas too, so it can go on as many days as you like.', es: '[task.Los] [task.p] del Canvas, en [story.a] [story] o sin definir, son [task:los|las] que llenan tu día: en la Semana, al crear o editar [task.a] [task], [task:elígelo|elígela] de la lista y toma su lugar en la agenda de hoy. En el Canvas sigue en su sitio, así que puede ir en todos los días que quieras.' },
  'guide.week.title': { en: 'Build your week', es: 'Arma tu semana' },
  'guide.week.body': { en: 'On the Week board, tap ✎ Edit in the round menu. A day’s + makes a block with its first [task]; the block’s + adds another. Write the block’s start and end: its [task.p] never pass the end. ▲ ▼ and the grip ⠿ move them, and ✓ Finish closes the editing.', es: 'En la Semana, toca ✎ Editar en el menú redondo. El + de un día crea un bloque con [task:su primer|su primera] [task]; el + del bloque agrega [task:otro|otra]. Escribe el inicio y el fin del bloque: sus [task.p] nunca pasan del fin. ▲ ▼ y el agarre ⠿ [task:los|las] mueven, y ✓ Terminar cierra la edición.' },
  'guide.size.title': { en: 'Every minute shows', es: 'Cada minuto se ve' },
  'guide.size.body': { en: 'On the Week board, [task.a] [task] is as tall as its name plus its minutes, so a long one looks long. While editing, pull the handle at its foot to change its minutes, 5 by 5. px, Aa and AV at the bottom right change the size of a minute, of the letters and of the space between them.', es: 'En la Semana, [task.a] [task] mide su nombre más sus minutos, así que lo largo se ve largo. Al editar, jala la manija de su pie para cambiar sus minutos de 5 en 5. px, Aa y AV, abajo a la derecha, cambian el tamaño de un minuto, de las letras y del espacio entre ellas.' },
  'guide.today.title': { en: 'Live your day', es: 'Vive tu día' },
  'guide.today.body': { en: 'The time line shows where you are. Tap [task.a] [task]’s circle to mark it done; hold the card down to choose another state: late, in progress or skipped. A tap on the rest of the card shows where it lives: its [area], [epic], [feature] and [story].', es: 'La línea de la hora te dice dónde vas. Toca el círculo de [task.a] [task] para [task:marcarlo hecho|marcarla hecha]; deja presionada la tarjeta para elegir otro estado: [task:atrasado|atrasada], en progreso o [task:saltado|saltada]. Un toque en el resto de la tarjeta te dice dónde vive: su [area], [epic], [feature] y [story].' },
  'guide.focus.title': { en: 'What is happening now', es: 'Lo que pasa ahora' },
  'guide.focus.body': { en: 'Leave the Week still and the time line centres itself: the header slides up out of the way and the other blocks dim. The bar at the foot of the screen shows the minutes left for the [task] running now. Scroll and everything comes back.', es: 'Deja quieta la Semana y la línea de la hora se centra sola: el encabezado sube y se va, y los demás bloques se apagan un poco. La barra al pie de la pantalla muestra los minutos que le quedan [task:al|a la] [task] en curso. Mueve la pantalla y todo vuelve.' },
  'guide.capture.title': { en: 'Capture your tasks', es: 'Captura tus tareas' },
  'guide.capture.body': { en: 'The 💡 keeps loose tasks with a day, an hour or the days they repeat; tick their ☐ and they go to Finished. Those left undone wait in the Overdue folder at the foot of the Week: its tab folds it, and do not let it fill up. A task already inside a block can become [task.a] [task] with its ✎.', es: 'El 💡 guarda tareas sueltas con su día, su hora o los días en que se repiten; marca su ☐ y pasan a Finalizadas. Las que se quedan sin hacer esperan en la carpeta de Atrasadas, al pie de la Semana: su pestaña la pliega, y no dejes que se llene. Una tarea que ya está en un bloque puede volverse [task.a] [task] con su ✎.' },
  'guide.progress.title': { en: 'See your progress', es: 'Mira tu progreso' },
  'guide.progress.body': { en: 'Progress has two tabs. Consistency shows the streaks of the [task.p] with «Track in Progress» ticked (tick it while arranging the week), and ▦ shows their days in a grid. [area.p] of life shows, [epic] by [epic], how much of what you planned you finished.', es: 'Progreso tiene dos pestañas. En Constancia ves las rachas de [task.los] [task.p] con «Seguir en Progreso» marcado (márcalo al organizar la semana), y ▦ muestra sus días en una cuadrícula. En [area.p] de la vida ves, [epic] por [epic], cuánto cumpliste de lo planeado.' },
  'guide.year.title': { en: 'Review your year', es: 'Revisa tu año' },
  'guide.year.body': { en: 'The Year has four seasons, each with four three-week sprints and a rest week to look back. Hold your finger on a day to write down something important, or bring your dates from Google Calendar.', es: 'El Año tiene cuatro temporadas, cada una con cuatro sprints de tres semanas y una semana de descanso para revisar. Deja el dedo sobre un día para anotar algo importante, o trae tus fechas de Google Calendar.' },
  'guide.delete.title': { en: 'Careful when deleting', es: 'Cuidado al borrar' },
  'guide.delete.body': { en: 'Before deleting, Go Epic asks and then counts down 8 seconds. If it was a mistake, tap «Don’t delete» and nothing is lost.', es: 'Antes de borrar, Go Epic pregunta y luego cuenta 8 segundos. Si te equivocaste, toca «No borrar» y nada se pierde.' },
  'guide.themes.title': { en: 'Make it yours', es: 'Hazlo tuyo' },
  'guide.themes.body': { en: 'In the round menu, the palette button opens the themes. Tap one to try it on: its window has the colours for your [task.p], «Only the edge» and the boxes for the red time line and the red countdown bar. OK keeps it. The language is in ⚙ Settings.', es: 'En el menú redondo, el botón de la paleta abre los temas. Toca uno para probarlo: su ventana trae los colores de tus [task.p], «Solo el filo» y los checks de la línea de la hora y la barra de cuenta regresiva en rojo. OK lo guarda. El idioma está en ⚙ Ajustes.' },
  'guide.labels.title': { en: 'Name your levels', es: 'Ponle nombre a tus niveles' },
  'guide.labels.body': { en: 'In the themes, «Labels» lets you choose one of six sets of names for the five levels, from Current to Epic. Apply changes them all over Go Epic, these cards too. Now they are: [area], [epic], [feature], [story] and [task].', es: 'En los temas, «Letreros» te deja elegir uno de seis juegos de nombres para los cinco niveles, del Actual al Épico. Aplicar los cambia en todo Go Epic, también en estas tarjetas. Ahora son: [area], [epic], [feature], [story] y [task].' },
  'guide.d.health': { en: 'Health', es: 'Salud' },
  'guide.d.family': { en: 'Family', es: 'Familia' },
  'guide.d.career': { en: 'Career', es: 'Carrera' },
  'guide.d.fun': { en: 'Fun', es: 'Diversión' },
  'guide.d.athlete': { en: 'Athlete', es: 'Atleta' },
  'guide.d.activity': { en: '[task.u]', es: '[task.u]' },
  'guide.d.note': { en: 'Birthday', es: 'Cumpleaños' },
  'year.title': { en: 'Year {year}', es: 'Año {year}' },
  'year.pick': { en: 'Choose the year', es: 'Elige el año' },
  'year.winter': { en: 'Winter', es: 'Invierno' },
  'year.spring': { en: 'Spring', es: 'Primavera' },
  'year.summer': { en: 'Summer', es: 'Verano' },
  'year.autumn': { en: 'Autumn', es: 'Otoño' },
  'year.sprint': { en: 'Sprint {n}', es: 'Sprint {n}' },
  'year.rest': { en: 'Rest and review', es: 'Descanso y revisión' },
  'year.week': { en: 'week {n}', es: 'semana {n}' },
  'year.startsIn': { en: 'Begins in {n} days', es: 'Empieza en {n} días' },
  'year.startsIn1': { en: 'Begins tomorrow', es: 'Empieza mañana' },
  'year.dayOf': { en: 'Day {n} of {total}', es: 'Día {n} de {total}' },
  'year.over': { en: 'This year is over', es: 'Este año ya terminó' },
  'year.begins.winter': { en: 'Winter begins', es: 'Empieza el invierno' },
  'year.begins.spring': { en: 'Spring begins', es: 'Empieza la primavera' },
  'year.begins.summer': { en: 'Summer begins', es: 'Empieza el verano' },
  'year.begins.autumn': { en: 'Autumn begins', es: 'Empieza el otoño' },
  'year.legend': { en: 'Each line is a sprint of 3 weeks; the last one is the rest and review week. Each square shows its day. Grey number: days gone by · green edge: today · red edge: a day with notes, or the day the season begins (with a dot in its corner). Hold a day and slide along the line to go from day to day.', es: 'Cada línea es un sprint de 3 semanas; la última es la semana de descanso y revisión. Cada cuadrito lleva su número de día. Número gris: días que ya pasaron · borde verde: hoy · borde rojo: un día con notas, o el día en que empieza la estación (con un punto en la esquina). Mantén el dedo en un día y deslízalo por la línea para ir de día en día.' },
  'year.dates': { en: 'Important dates', es: 'Fechas importantes' },
  'year.noDates': { en: 'Tap any day to add a note about why it matters.', es: 'Toca cualquier día para agregarle una nota de por qué es importante.' },
  'year.notes': { en: 'Notes of the day', es: 'Notas del día' },
  'year.noteNew': { en: 'New note', es: 'Nota nueva' },
  'year.notePlaceholder': { en: 'Why it matters (a birthday, a trip…)', es: 'Por qué es importante (un cumpleaños, un viaje…)' },
  'year.add': { en: 'Add', es: 'Agregar' },
  'year.editNote': { en: 'Rename “{name}”', es: 'Cambiar «{name}»' },
  'year.removeNote': { en: 'Remove “{name}”', es: 'Quitar «{name}»' },
  'year.cancel': { en: 'Cancel', es: 'Cancelar' },
  'year.remove': { en: 'Remove', es: 'Quitar' },
  'year.removeAsk': { en: 'Remove the note “{name}”?', es: '¿Quitar la nota «{name}»?' },
  'year.removing': { en: 'Removing “{name}”…', es: 'Quitando «{name}»…' },
  'year.dayLabel': { en: '{date}, {place}', es: '{date}, {place}' },
  'gcal.button': { en: 'Import from Google Calendar', es: 'Importar de Google Calendar' },
  'gcal.title': { en: 'Import from Google Calendar', es: 'Importar de Google Calendar' },
  'gcal.intro': { en: 'Bring the events of one of your Google calendars for {year} as important dates. Go Epic only reads it, never changes it.', es: 'Trae como fechas importantes los eventos de {year} de uno de tus calendarios de Google. Go Epic solo lo lee, nunca lo cambia.' },
  'gcal.warning': { en: 'Google will ask you to allow it. It may say the app is not verified: tap Advanced and continue to go-epic.', es: 'Google te pedirá permiso. Puede decir que la app no está verificada: toca Configuración avanzada y continúa a go-epic.' },
  'gcal.connect': { en: 'Connect with Google', es: 'Conectar con Google' },
  'gcal.connecting': { en: 'Connecting…', es: 'Conectando…' },
  'gcal.pick': { en: 'Which calendar?', es: '¿Qué calendario?' },
  'gcal.noCalendars': { en: 'No calendars were found in this Google account.', es: 'No se encontraron calendarios en esta cuenta de Google.' },
  'gcal.rules': { en: 'Each event becomes a note on its day, beside your own notes, which are never touched. Importing the same calendar again updates its notes without repeating them.', es: 'Cada evento se vuelve una nota en su día, junto a tus propias notas, que nunca se tocan. Importar otra vez el mismo calendario actualiza sus notas sin repetirlas.' },
  'gcal.import': { en: 'Import', es: 'Importar' },
  'gcal.importing': { en: 'Importing…', es: 'Importando…' },
  'gcal.added': { en: '{n} notes added.', es: '{n} notas agregadas.' },
  'gcal.removed': { en: '{n} removed because they are no longer in the calendar.', es: '{n} quitadas porque ya no están en el calendario.' },
  'gcal.kept': { en: '{n} were already among your own notes.', es: '{n} ya estaban entre tus propias notas.' },
  'gcal.problem.blocked': { en: 'The browser blocked Google’s window. Allow pop-ups for Go Epic and try again.', es: 'El navegador bloqueó la ventana de Google. Permite las ventanas emergentes para Go Epic e inténtalo otra vez.' },
  'gcal.problem.denied': { en: 'Google did not give permission to read the calendar. Try again and tick the calendar box.', es: 'Google no dio permiso para leer el calendario. Inténtalo otra vez y marca la casilla del calendario.' },
  'gcal.problem.mismatch': { en: 'Choose the same Google account you use in Go Epic.', es: 'Elige la misma cuenta de Google que usas en Go Epic.' },
  'gcal.problem.disabled': { en: 'Google Calendar is not switched on for Go Epic yet. It has to be enabled once in the Google project.', es: 'Google Calendar todavía no está activado para Go Epic. Hay que activarlo una vez en el proyecto de Google.' },
  'gcal.problem.expired': { en: 'Google’s permission ran out. Connect again.', es: 'El permiso de Google venció. Conecta otra vez.' },
  'gcal.problem.offline': { en: 'No connection. Try again when you are online.', es: 'Sin conexión. Inténtalo cuando tengas internet.' },
  'gcal.problem.loading': { en: 'Your dates are still loading. Try again in a moment.', es: 'Tus fechas todavía se están cargando. Inténtalo en un momento.' },
  'gcal.problem.failed': { en: 'Google Calendar did not answer. Try again in a moment.', es: 'Google Calendar no respondió. Inténtalo en un momento.' },
  'canvas.area': { en: '[area]', es: '[area]' },
  'canvas.epic': { en: '[epic]', es: '[epic]' },
  'canvas.feature': { en: '[feature]', es: '[feature]' },
  'canvas.story': { en: '[story]', es: '[story]' },
  'canvas.task': { en: '[task]', es: '[task]' },
  'canvas.epics': { en: '[epic.p]', es: '[epic.p]' },
  'canvas.areas': { en: '[area.p]', es: '[area.p]' },
  'canvas.workspace': { en: '[epic] workspace', es: 'Espacio [epic:del|de la] [epic]' },
  'canvas.editEpic': { en: 'Edit [epic]', es: 'Editar [epic]' },
  'canvas.noEpicYet': { en: 'No [epic] yet', es: '[epic:Ningún|Ninguna] [epic] todavía' },
  'canvas.freeSpace': { en: 'Free Space', es: 'Espacio libre' },
  'canvas.emptyEpic': { en: 'This [epic] is empty', es: '[epic:Este|Esta] [epic] está [epic:vacío|vacía]' },
  'canvas.emptyEpicHint': { en: 'Give [task.a] [task.l] from Undefined its place here with its ✎, or drag it into [story.a] [story].', es: 'Dale lugar aquí a [task.a] [task.l] de Sin definir con su ✎, o [task:arrástralo|arrástrala] a [story.a] [story].' },
  'canvas.noEpic': { en: 'No [epic] yet', es: 'Aún no hay [epic.p]' },
  'canvas.noEpicHint': { en: 'Create [epic.a] [epic] in this [area.l] with + [epic], or give [task.a] [task.l] from Undefined its place here.', es: 'Crea [epic.a] [epic] en [area:este|esta] [area.l] con + [epic], o dale lugar aquí a [task.a] [task.l] de Sin definir.' },
  'canvas.saved': { en: 'Saved', es: 'Guardado' },
  'canvas.saveError': { en: 'Could not save yet: the library is still loading.', es: 'Aún no se puede guardar: la biblioteca sigue cargando.' },
  'canvas.rejected': { en: 'The library could not be saved, so it went back to its saved copy.', es: 'No se pudo guardar la biblioteca, así que volvió a la copia guardada.' },
  'canvas.restore': { en: 'Restore my changes', es: 'Recuperar mis cambios' },
  'canvas.deleteHint': { en: 'Only an empty container can be deleted: move or delete what is inside first.', es: 'Solo se puede eliminar un contenedor vacío: mueve o elimina primero lo que tiene dentro.' },
  'canvas.confirmDelete': { en: 'Delete it?', es: '¿Eliminarlo?' },
  'canvas.confirmDeleteTask': { en: 'This [task] is planned {n} time(s) in your week. Delete it everywhere?', es: '[task:Este|Esta] [task] está {n} vez/veces en tu semana. ¿[task:Eliminarlo|Eliminarla] de todos lados?' },
  'canvas.edit': { en: 'Edit', es: 'Editar' },
  'canvas.name': { en: 'Name', es: 'Nombre' },
  'canvas.rename': { en: 'Rename', es: 'Cambiar nombre' },
  'canvas.choose': { en: 'Choose…', es: 'Elige…' },
  'canvas.apply': { en: 'Apply', es: 'Aplicar' },
  'canvas.drag': { en: 'Drag', es: 'Arrastrar' },
  'canvas.actions': { en: 'Actions for', es: 'Acciones de' },
  'canvas.expand': { en: 'Expand', es: 'Expandir' },
  'canvas.collapse': { en: 'Collapse', es: 'Contraer' },
  'canvas.addStory': { en: '[story]', es: '[story]' },
  'canvas.addTask': { en: '[task]', es: '[task]' },
  'canvas.contained': { en: 'inside', es: 'dentro' },
  'canvas.undefined': { en: 'Undefined', es: 'Sin definir' },
  'canvas.undefinedHint': { en: '[task.p] with no place yet. Tap one and choose its [area.l], [epic], [feature] and [story] on its card: it is saved once all four are chosen.', es: '[task.p] que aún no tienen lugar. Toca [task:uno|una] y elige en su tarjeta su [area.l], [epic], [feature.l] y [story.l]: se guarda al elegir los cuatro.' },
  'canvas.undefinedEmpty': { en: 'Every [task.l] has its place.', es: '[task:Todos|Todas] [task.los] [task.pl] tienen su lugar.' },
  'canvas.newActivity': { en: 'New [task.l]', es: '[task:Nuevo|Nueva] [task.l]' },
  'canvas.new.epic': { en: 'New [epic]…', es: '[epic:Nuevo|Nueva] [epic]…' },
  'canvas.new.feature': { en: 'New [feature]…', es: '[feature:Nuevo|Nueva] [feature.l]…' },
  'canvas.new.story': { en: 'New [story]…', es: '[story:Nuevo|Nueva] [story.l]…' },
  'canvas.toDefine': { en: 'To be defined', es: 'Por definir' },
  'canvas.placeHint': { en: 'It is saved once all four are chosen.', es: 'Se guarda al elegir los cuatro.' },
  'canvas.create.area': { en: 'New', es: '[area:Nuevo|Nueva]' },
  'canvas.create.epic': { en: 'New', es: '[epic:Nuevo|Nueva]' },
  'canvas.create.feature': { en: 'New', es: '[feature:Nuevo|Nueva]' },
  'canvas.create.story': { en: 'New', es: '[story:Nuevo|Nueva]' },
  'canvas.create.task': { en: 'New', es: '[task:Nuevo|Nueva]' },
  'canvas.chooseFirst.area': { en: 'Choose the [area] above first.', es: 'Primero elige [area.el] [area] de arriba.' },
  'canvas.chooseFirst.epic': { en: 'Choose the [epic] above first.', es: 'Primero elige [epic.el] [epic] de arriba.' },
  'canvas.chooseFirst.feature': { en: 'Choose the [feature] above first.', es: 'Primero elige [feature.el] [feature] de arriba.' },
  'canvas.chooseFirst.story': { en: 'Choose the [story] above first.', es: 'Primero elige [story.el] [story] de arriba.' },
  'canvas.noneYet': { en: 'None yet. Type a name below.', es: 'Todavía no hay. Escribe un nombre abajo.' },
  'place.create': { en: 'Create', es: 'Crear' },
  'area.all': { en: 'All', es: '[area:Todos|Todas]' },
  'area.temple': { en: 'The Temple - Health', es: 'El Templo - Salud' },
  'area.castle': { en: 'The Castle - Family', es: 'El Castillo - Familia' },
  'area.tower': { en: 'The Tower - Career', es: 'La Torre - Carrera' },
  'area.arena': { en: 'The Arena - Fun', es: 'La Arena - Diversión' },
  'area.allHint': { en: 'The [epic.p] of all four [area.pl]', es: '[epic.Los] [epic.p] de [area.los] cuatro [area.pl]' },
  'area.templeHint': { en: 'Body, faith and finances', es: 'Cuerpo, fe y finanzas' },
  'area.castleHint': { en: 'Home, family and friends', es: 'Hogar, familia y amigos' },
  'area.towerHint': { en: 'Work and learning', es: 'Trabajo y aprendizaje' },
  'area.arenaHint': { en: 'Joy, hobbies and adventures', es: 'Alegría, pasatiempos y aventuras' },
  'levels.button': { en: 'Labels', es: 'Letreros' },
  'levels.title': { en: 'Labels', es: 'Letreros' },
  'levels.hint': { en: 'Choose the names of the five levels. They change everywhere in Go Epic.', es: 'Elige los nombres de los cinco niveles. Cambian en todo Go Epic.' },
  'why.button': { en: 'Why this screen?', es: '¿Por qué esta pantalla?' },
  'why.inShort': { en: 'In short', es: 'En pocas palabras' },
  'why.orders': { en: 'It orders', es: 'Ordena' },
  'why.more': { en: 'If you want to know more', es: 'Si quieres saber más' },
};

const STORAGE_KEY = 'go-epic-lang';
const LEVELS_KEY = 'go-epic-levels';

/** The labels in the chosen language (`LANGS`); the choice is remembered on the device and set on `<html lang>`.
 *  The level names (Área, Epic, Feature, Story, Actividad) come from the chosen Letreros set (levels.model): every
 *  label that names a level writes a token. */
@Injectable({ providedIn: 'root' })
export class I18n {
  readonly lang = signal<Lang>(this.initial());
  /** What dates and numbers are formatted with in the chosen language. */
  readonly locale = computed(() => langInfo(this.lang()).locale);
  readonly langs = LANGS;
  /** The chosen set of level names (Letreros), kept on this device like the theme. */
  readonly levels = signal<LevelSetId>(this.initialLevels());

  constructor() {
    effect(() => {
      const lang = this.lang();
      if (typeof document !== 'undefined') document.documentElement.lang = lang;
    });
  }

  t(key: string, params: Record<string, string | number> = {}): string {
    const label = this.levelsIn(translate(key, this.lang()));
    return Object.entries(params).reduce((text, [name, value]) => text.split(`{${name}}`).join(String(value)), label);
  }

  /** Fills in the level names of any text written with level tokens (the Why texts, for instance). */
  levelsIn(text: string): string {
    return levelText(text, this.levels(), this.lang());
  }

  /** Shows a set at once without keeping it (the Letreros window, until Apply). */
  previewLevels(id: LevelSetId): void {
    this.levels.set(id);
  }

  /** Keeps a set on this device. */
  setLevels(id: LevelSetId): void {
    this.levels.set(id);
    try { localStorage.setItem(LEVELS_KEY, id); } catch { /* a view preference only */ }
  }

  /** The set kept on this device. */
  storedLevels(): LevelSetId {
    return this.initialLevels();
  }

  private initialLevels(): LevelSetId {
    try { return parseLevelSet(localStorage.getItem(LEVELS_KEY)); } catch { return parseLevelSet(null); }
  }

  /** Steps to the next language in the list. */
  toggle(): void {
    this.setLang(nextLang(this.lang()));
  }

  setLang(next: Lang): void {
    if (!isLang(next)) return;
    this.lang.set(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* a view preference only */ }
  }

  private initial(): Lang {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (isLang(saved)) return saved;
    } catch { /* private mode */ }
    if (typeof navigator === 'undefined') return 'en';
    // The browser's main language only, as before: a later one in its list does not change the app's first look.
    return langFromBrowser([navigator.language ?? '']);
  }
}

/** A label in `lang`, falling back to English, then Spanish, then the key itself. */
export function translate(key: string, lang: Lang): string {
  const texts = LABELS[key];
  return (texts && inLang(texts, lang)) ?? key;
}

/** Every label key, for the spec that checks English and Spanish are filled in. */
export const LABEL_KEYS = Object.keys(LABELS);
export const labelFor = (key: string, lang: Lang): string | undefined => LABELS[key]?.[lang];
