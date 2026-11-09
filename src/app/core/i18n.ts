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
