import { Injectable, signal } from '@angular/core';

export type Lang = 'en' | 'es';

const LABELS: Record<string, { en: string; es: string }> = {
  'app.title': { en: 'Go Epic', es: 'Go Epic' },
  'nav.week': { en: 'Week board', es: 'Semana' },
  'nav.focus': { en: 'Focus', es: 'Enfoque' },
  'nav.signOut': { en: 'Sign out', es: 'Salir' },
  'login.lead': { en: 'Plan your week in blocks, then live each day one task at a time.', es: 'Planea tu semana en bloques y vive cada día una tarea a la vez.' },
  'login.google': { en: 'Sign in with Google', es: 'Entrar con Google' },
  'login.failed': { en: 'Sign-in failed', es: 'No se pudo entrar' },
  'setup.title': { en: 'Firebase is not configured yet', es: 'Falta configurar Firebase' },
  'setup.body': { en: 'Fill in src/app/firebase.config.ts with your Firebase web app config, then build again.', es: 'Llena src/app/firebase.config.ts con la configuración de tu app web de Firebase y vuelve a compilar.' },
  'loading': { en: 'Loading…', es: 'Cargando…' },
  'pwa.update': { en: 'A new version of Go Epic is ready.', es: 'Hay una versión nueva de Go Epic.' },
  'pwa.reload': { en: 'Update', es: 'Actualizar' },
  'saveFailed': { en: 'Could not save', es: 'No se pudo guardar' },

  'day.MONDAY': { en: 'Monday', es: 'Lunes' },
  'day.TUESDAY': { en: 'Tuesday', es: 'Martes' },
  'day.WEDNESDAY': { en: 'Wednesday', es: 'Miércoles' },
  'day.THURSDAY': { en: 'Thursday', es: 'Jueves' },
  'day.FRIDAY': { en: 'Friday', es: 'Viernes' },
  'day.SATURDAY': { en: 'Saturday', es: 'Sábado' },
  'day.SUNDAY': { en: 'Sunday', es: 'Domingo' },
  'dayShort.MONDAY': { en: 'Mon', es: 'Lun' },
  'dayShort.TUESDAY': { en: 'Tue', es: 'Mar' },
  'dayShort.WEDNESDAY': { en: 'Wed', es: 'Mié' },
  'dayShort.THURSDAY': { en: 'Thu', es: 'Jue' },
  'dayShort.FRIDAY': { en: 'Fri', es: 'Vie' },
  'dayShort.SATURDAY': { en: 'Sat', es: 'Sáb' },
  'dayShort.SUNDAY': { en: 'Sun', es: 'Dom' },

  'week.arrange': { en: 'Arrange the week', es: 'Organizar la semana' },
  'week.finish': { en: 'Finish arranging', es: 'Terminar' },
  'week.addBlock': { en: 'Add block', es: 'Agregar bloque' },
  'week.newBlock': { en: 'New block', es: 'Bloque nuevo' },
  'week.empty': { en: 'Nothing planned', es: 'Nada planeado' },
  'week.quickAdd': { en: '+ Add task (Enter)', es: '+ Agregar tarea (Enter)' },
  'week.blockName': { en: 'Block name', es: 'Nombre del bloque' },
  'week.start': { en: 'Start', es: 'Inicio' },
  'week.end': { en: 'End', es: 'Fin' },
  'week.free': { en: '{n} min free', es: '{n} min libres' },
  'week.full': { en: '✓ Full', es: '✓ Lleno' },
  'week.over': { en: '⚠ {n} min over', es: '⚠ {n} min de más' },
  'week.blockUp': { en: 'Move block up', es: 'Subir bloque' },
  'week.blockDown': { en: 'Move block down', es: 'Bajar bloque' },
  'week.transfer': { en: 'Copy or move block', es: 'Copiar o mover bloque' },
  'week.addTask': { en: 'Add a task to this block', es: 'Agregar una tarea a este bloque' },
  'week.deleteBlock': { en: 'Delete block', es: 'Eliminar bloque' },
  'week.confirmDeleteBlock': { en: 'Delete the block "{block}" and its tasks?', es: '¿Eliminar el bloque "{block}" y sus tareas?' },
  'week.taskActions': { en: 'Edit or move', es: 'Editar o mover' },
  'week.deleteTask': { en: 'Delete task', es: 'Eliminar tarea' },
  'week.taskUp': { en: 'Move up', es: 'Subir' },
  'week.taskDown': { en: 'Move down', es: 'Bajar' },
  'week.confirmDeleteTask': { en: 'Delete "{task}"?', es: '¿Eliminar "{task}"?' },
  'week.noRoom': { en: 'No room in "{block}": {n} min free.', es: 'No cabe en "{block}": {n} min libres.' },
  'week.newTask': { en: 'New task', es: 'Tarea nueva' },
  'week.min': { en: 'min', es: 'min' },
  'window.end_without_start': { en: 'Set a start first.', es: 'Primero pon el inicio.' },
  'window.end_before_start': { en: 'The end must be after the start.', es: 'El fin debe ser después del inicio.' },
  'window.too_small': { en: 'Too short for its tasks.', es: 'Muy corto para sus tareas.' },

  'task.title': { en: 'Task', es: 'Tarea' },
  'task.newTitle': { en: 'New task', es: 'Tarea nueva' },
  'task.name': { en: 'Name', es: 'Nombre' },
  'task.minutes': { en: 'Minutes', es: 'Minutos' },
  'task.day': { en: 'Day', es: 'Día' },
  'task.block': { en: 'Block', es: 'Bloque' },
  'task.color': { en: 'Color', es: 'Color' },
  'task.auto': { en: 'Automatic', es: 'Automático' },
  'task.active': { en: 'Active', es: 'Activa' },
  'task.delete': { en: 'Delete', es: 'Eliminar' },
  'task.cancel': { en: 'Cancel', es: 'Cancelar' },
  'task.done': { en: 'Done', es: 'Listo' },
  'task.nameRequired': { en: 'Give it a name.', es: 'Ponle un nombre.' },
  'task.where': { en: 'Where', es: 'Dónde' },
  'task.none': { en: '—', es: '—' },
  'task.freeHint': { en: 'Without a user story it waits in Free Space (Canvas).', es: 'Sin historia de usuario espera en el Espacio libre (Canvas).' },
  'task.existing': { en: 'Existing task', es: 'Tarea existente' },
  'task.unlink': { en: 'Use a new task instead', es: 'Usar una tarea nueva' },
  'task.noTasksHere': { en: 'No tasks here yet', es: 'Aún no hay tareas aquí' },
  'task.alreadyExists': { en: 'Already exists. Linked to it.', es: 'Ya existe. Se enlaza con ella.' },

  'transfer.copy': { en: 'Copy', es: 'Copiar' },
  'transfer.move': { en: 'Move', es: 'Mover' },
  'transfer.hintCopy': { en: 'Pick one or more days. The block stays here too.', es: 'Elige uno o más días. El bloque también se queda aquí.' },
  'transfer.hintMove': { en: 'Pick the day to move it to.', es: 'Elige el día al que se mueve.' },

  'focus.title': { en: 'Focus', es: 'Enfoque' },
  'focus.now': { en: 'Now', es: 'Ahora' },
  'focus.next': { en: 'Next', es: 'Sigue' },
  'focus.left': { en: '{n} min left', es: 'quedan {n} min' },
  'focus.startsIn': { en: 'starts in {n} min', es: 'empieza en {n} min' },
  'focus.progress': { en: '{done} of {total} done', es: '{done} de {total} hechas' },
  'focus.empty': { en: 'Nothing planned for today. Plan it on the Week board.', es: 'No hay nada para hoy. Planéalo en la Semana.' },
  'focus.markDone': { en: 'Mark as done', es: 'Marcar como hecha' },
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
  'canvas.area': { en: 'Area', es: 'Área' },
  'canvas.epic': { en: 'Epic', es: 'Epic' },
  'canvas.feature': { en: 'Feature', es: 'Feature' },
  'canvas.story': { en: 'User story', es: 'Historia de usuario' },
  'canvas.task': { en: 'Task', es: 'Tarea' },
  'canvas.epics': { en: 'Epics', es: 'Epics' },
  'canvas.workspace': { en: 'Epic workspace', es: 'Espacio del Epic' },
  'canvas.editEpic': { en: 'Edit Epic', es: 'Editar Epic' },
  'canvas.editArea': { en: 'Edit area', es: 'Editar área' },
  'canvas.allAreas': { en: 'All areas', es: 'Todas las áreas' },
  'canvas.freeSpace': { en: 'Free Space', es: 'Espacio libre' },
  'canvas.showFree': { en: 'Show or hide Free Space', es: 'Mostrar u ocultar el Espacio libre' },
  'canvas.freeHint': { en: 'What is not filed yet waits here.', es: 'Lo que aún no tiene lugar espera aquí.' },
  'canvas.search': { en: 'Search Free Space', es: 'Buscar en el Espacio libre' },
  'canvas.emptyFree': { en: 'Free Space is empty', es: 'El Espacio libre está vacío' },
  'canvas.emptyFreeHint': { en: 'Create a feature, story or task here, or drag one out of an Epic.', es: 'Crea aquí un feature, una historia o una tarea, o arrastra uno fuera de un Epic.' },
  'canvas.noResults': { en: 'Nothing matches', es: 'Nada coincide' },
  'canvas.emptyEpic': { en: 'This Epic is empty', es: 'Este Epic está vacío' },
  'canvas.emptyEpicHint': { en: 'Add a feature, or drag one in from Free Space.', es: 'Agrega un feature o arrastra uno desde el Espacio libre.' },
  'canvas.noEpic': { en: 'No Epic yet', es: 'Aún no hay Epics' },
  'canvas.noEpicHint': { en: 'Create an Epic inside an area to start.', es: 'Crea un Epic dentro de un área para empezar.' },
  'canvas.noAreaHint': { en: 'Create an area first (+ Area), then an Epic inside it.', es: 'Crea primero un área (+ Área) y luego un Epic dentro.' },
  'canvas.resize': { en: 'Resize Free Space', es: 'Cambiar el ancho del Espacio libre' },
  'canvas.undo': { en: 'Undo', es: 'Deshacer' },
  'canvas.redo': { en: 'Redo', es: 'Rehacer' },
  'canvas.discard': { en: 'Discard', es: 'Descartar' },
  'canvas.save': { en: 'Save', es: 'Guardar' },
  'canvas.saved': { en: 'Saved', es: 'Guardado' },
  'canvas.unsaved': { en: 'Unsaved changes', es: 'Cambios sin guardar' },
  'canvas.saveError': { en: 'Could not save yet: the library is still loading.', es: 'Aún no se puede guardar: la biblioteca sigue cargando.' },
  'canvas.confirmDiscard': { en: 'Discard every change since the last save?', es: '¿Descartar todos los cambios desde que guardaste?' },
  'canvas.confirmLeave': { en: 'You have unsaved changes. Leave anyway?', es: 'Tienes cambios sin guardar. ¿Salir de todos modos?' },
  'canvas.draftUpdated': { en: 'Draft updated. Save to keep it.', es: 'Borrador actualizado. Guarda para conservarlo.' },
  'canvas.draftHint': { en: 'Changes stay in the draft until you press Save.', es: 'Los cambios quedan en el borrador hasta que presiones Guardar.' },
  'canvas.deleteHint': { en: 'Only an empty container can be deleted: move or delete what is inside first.', es: 'Solo se puede eliminar un contenedor vacío: mueve o elimina primero lo que tiene dentro.' },
  'canvas.confirmDelete': { en: 'Delete it? (Save makes it final.)', es: '¿Eliminarlo? (Guardar lo hace definitivo.)' },
  'canvas.confirmDeleteTask': { en: 'This task is planned {n} time(s) in your week. Delete it everywhere? (Save makes it final.)', es: 'Esta tarea está {n} vez/veces en tu semana. ¿Eliminarla de todos lados? (Guardar lo hace definitivo.)' },
  'canvas.create': { en: 'New', es: 'Nuevo' },
  'canvas.edit': { en: 'Edit', es: 'Editar' },
  'canvas.name': { en: 'Name', es: 'Nombre' },
  'canvas.moveTo': { en: 'Move to', es: 'Mover a' },
  'canvas.choose': { en: 'Choose…', es: 'Elige…' },
  'canvas.noneHere': { en: 'None here yet', es: 'Aún no hay aquí' },
  'canvas.inFreeSpace': { en: 'Inside', es: 'Dentro de' },
  'canvas.earlier': { en: 'Earlier', es: 'Antes' },
  'canvas.later': { en: 'Later', es: 'Después' },
  'canvas.apply': { en: 'Apply', es: 'Aplicar' },
  'canvas.drag': { en: 'Drag', es: 'Arrastrar' },
  'canvas.actions': { en: 'Actions for', es: 'Acciones de' },
  'canvas.expand': { en: 'Expand', es: 'Expandir' },
  'canvas.collapse': { en: 'Collapse', es: 'Contraer' },
  'canvas.addStory': { en: 'User story', es: 'Historia de usuario' },
  'canvas.addTask': { en: 'Task', es: 'Tarea' },
  'canvas.contained': { en: 'inside', es: 'dentro' },
};

const STORAGE_KEY = 'go-epic-lang';

/** English and Spanish labels; the choice is remembered on the device. */
@Injectable({ providedIn: 'root' })
export class I18n {
  readonly lang = signal<Lang>(this.initial());

  t(key: string, params: Record<string, string | number> = {}): string {
    const label = LABELS[key]?.[this.lang()] ?? key;
    return Object.entries(params).reduce((text, [name, value]) => text.split(`{${name}}`).join(String(value)), label);
  }

  toggle(): void {
    const next: Lang = this.lang() === 'en' ? 'es' : 'en';
    this.lang.set(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* a view preference only */ }
  }

  private initial(): Lang {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'es') return saved;
    } catch { /* private mode */ }
    return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
  }
}

/** Every label key, for the spec that checks both languages are filled in. */
export const LABEL_KEYS = Object.keys(LABELS);
export const labelFor = (key: string, lang: Lang): string | undefined => LABELS[key]?.[lang];
