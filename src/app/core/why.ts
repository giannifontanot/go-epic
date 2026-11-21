import type { Lang } from './i18n';

/**
 * The "Why?" window of every screen (Gianni): which part of your life the screen orders, and why you need it. Only the
 * why, never how to use it. The first section (`lead`) is a brief but complete reason; the sections after it are for
 * whoever wants to know more. Written with a panel of experts (life design, habit and behavioural psychology, time and
 * attention, pastoral care, UX writing), from what each screen really does. English and Spanish (a spec checks both).
 */
export type WhyScreen = 'week' | 'canvas' | 'progress' | 'capture' | 'focus';
export interface WhySection { heading: string; body: string[] }
export interface WhyText {
  /** The window's title: "Why the Week board?" */
  title: string;
  /** The part of life the screen orders, a few words: "your time". */
  orders: string;
  /** The first section: the whole reason in a few sentences. */
  lead: string;
  sections: WhySection[];
}

export const WHY_SCREENS: WhyScreen[] = ['week', 'canvas', 'progress', 'capture', 'focus'];

export const WHY: Record<WhyScreen, Record<Lang, WhyText>> = {
  week: {
    es: {
      title: '¿Por qué la Semana?',
      orders: 'tu tiempo',
      lead: 'La Semana ordena tu tiempo. Todo lo que quieres vivir necesita un lugar en tus horas, y si no se lo das, otras cosas lo ocupan por ti. Aquí cada día tiene bloques, y cada bloque guarda las actividades que te acercan a quien quieres ser. Así lo importante deja de ser un deseo y se convierte en una cita contigo mismo.',
      sections: [
        { heading: 'Tu tiempo ya está ocupado', body: [
          'Tu semana se llena con plan o sin él: correos, urgencias, pantallas y lo que otros necesitan de ti. La pregunta no es si tus horas se van a gastar, sino en qué.',
          'Planear la semana es decidir de antemano, con la cabeza tranquila, lo que de otro modo se decidiría solo, a última hora y casi siempre a favor de lo urgente.',
        ] },
        { heading: 'Una intención con hora se cumple', body: [
          'Decir «voy a hacer ejercicio» casi nunca basta. Decir «el martes a las 6:30, en el bloque de la mañana, camino diez minutos» cambia las cosas. La psicología lo llama intención de implementación: decidir cuándo y dónde harás algo aumenta mucho la probabilidad de hacerlo.',
          'Cada actividad de la Semana es exactamente eso: una intención con día, hora y lugar.',
        ] },
        { heading: 'Bloques: espacios que proteges', body: [
          'Un bloque es un espacio con nombre y con límite. El nombre te recuerda para qué es ese tiempo; el límite te obliga a elegir, porque en una hora no caben tres horas de cosas.',
          'Ese límite no es una cárcel, es honestidad. Te enseña lo que de verdad cabe en tu vida y protege lo que pusiste ahí de todo lo que quiera entrar.',
        ] },
        { heading: 'Siete días, no uno', body: [
          'La vida no ocurre en días sueltos sino en ritmos. Ver la semana entera te deja equilibrar: un día cargado con otro más tranquilo, el trabajo con el descanso, lo que das con lo que recibes.',
          'Desde siempre el ser humano ha vivido en semanas, con días para trabajar y un día para parar. La Semana te ayuda a recuperar ese ritmo en lugar de vivir siempre el mismo día repetido.',
        ] },
        { heading: 'El presente tiene un sitio', body: [
          'La línea del tiempo marca el ahora. No está ahí para presionarte, sino para ubicarte: te dice qué es este momento según lo que tú mismo decidiste, y todo lo demás puede esperar su turno.',
        ] },
        { heading: 'Lo que no cupo, a la vista', body: [
          'Lo que se quedó sin hacer no desaparece ni te persigue en silencio: espera a la vista. Una buena planificación no es la que nunca falla, sino la que te deja ver con calma lo pendiente y decidir qué hacer con ello.',
        ] },
        { heading: 'Contar bien los días', body: [
          'Una vida larga tiene unas cuatro mil semanas. Planear la tuya no es controlar cada minuto: es administrar con sabiduría el tiempo que se te ha dado, como pide el salmista cuando ruega aprender a contar bien nuestros días.',
        ] },
      ],
    },
    en: {
      title: 'Why the Week board?',
      orders: 'your time',
      lead: 'The Week board orders your time. Everything you want to live needs a place in your hours, and if you do not give it one, other things take it for you. Here every day has blocks, and every block holds the activities that bring you closer to who you want to be. What matters stops being a wish and becomes an appointment with yourself.',
      sections: [
        { heading: 'Your time is already taken', body: [
          'Your week fills up with or without a plan: emails, urgencies, screens and what others need from you. The question is not whether your hours will be spent, but on what.',
          'Planning the week is deciding ahead, with a calm head, what would otherwise decide itself, at the last minute and almost always in favour of the urgent.',
        ] },
        { heading: 'An intention with an hour gets done', body: [
          '“I will exercise” is rarely enough. “On Tuesday at 6:30, in the morning block, I walk for ten minutes” changes things. Psychology calls it an implementation intention: deciding when and where you will do something greatly raises the odds that you do it.',
          'Every activity on the Week board is exactly that: an intention with a day, an hour and a place.',
        ] },
        { heading: 'Blocks: spaces you protect', body: [
          'A block is a space with a name and a limit. The name reminds you what that time is for; the limit makes you choose, because three hours of things do not fit in one hour.',
          'That limit is not a cage, it is honesty. It shows you what really fits in your life and guards what you put there from everything else that wants in.',
        ] },
        { heading: 'Seven days, not one', body: [
          'Life does not happen in loose days but in rhythms. Seeing the whole week lets you balance it: a full day with a lighter one, work with rest, what you give with what you receive.',
          'People have always lived in weeks, with days to work and a day to stop. The Week board helps you get that rhythm back instead of living the same day over and over.',
        ] },
        { heading: 'The present has a place', body: [
          'The time line marks the now. It is not there to rush you but to place you: it tells you what this moment is for, by what you yourself decided, and everything else can wait its turn.',
        ] },
        { heading: 'What did not fit, in sight', body: [
          'What was left undone neither disappears nor follows you around in silence: it waits where you can see it. A good plan is not one that never fails, but one that lets you calmly see what is pending and decide what to do with it.',
        ] },
        { heading: 'Numbering our days', body: [
          'A long life has about four thousand weeks. Planning yours is not controlling every minute: it is wisely stewarding the time you have been given, as the psalmist asks when he prays to learn to number our days.',
        ] },
      ],
    },
  },
  canvas: {
    es: {
      title: '¿Por qué el Canvas?',
      orders: 'el sentido de tu vida',
      lead: 'El Canvas ordena el sentido de tu vida. Aquí cada actividad pequeña se conecta con algo más grande: el área de tu vida donde ocurre, la persona que quieres ser, lo que quieres vivir y el camino para llegar. Sin este mapa, tus actividades son una lista de obligaciones; con él, cada una es un paso hacia quien eliges ser.',
      sections: [
        { heading: 'Cinco preguntas, cinco niveles', body: [
          'Cada nivel responde una pregunta. El Área dice dónde: el lugar de tu vida, como el cuerpo y el espíritu, el hogar, el oficio o el juego. La Epic dice quién: la identidad que eliges, en presente, como «Administro con sabiduría». La Feature dice qué: algo que ya vives y quieres seguir viviendo, como «Tengo ahorros».',
          'La Story dice el camino: cómo vas a llegar y para qué. Y la Actividad dice el paso de hoy, tan pequeño que se puede hacer.',
        ] },
        { heading: 'La identidad antes que la meta', body: [
          'Las metas terminan; la identidad permanece. Quien se propone correr un maratón suele dejar de correr al cruzar la meta; quien decide «soy una persona activa» sigue moviéndose.',
          'Por eso la Epic se escribe como alguien que ya eres. Cada actividad cumplida es una prueba más de esa identidad, y poco a poco la crees porque la estás viviendo.',
        ] },
        { heading: 'El porqué sostiene el cómo', body: [
          'Una actividad sin propósito se siente como una carga, y lo que pesa se abandona. Cuando sabes que caminar diez minutos es parte de «Soy fuerte y saludable», el mismo esfuerzo cambia de sentido: ya no es una tarea más, es cuidar el cuerpo que se te confió.',
          'El Canvas guarda ese porqué para los días en que la motivación no alcanza.',
        ] },
        { heading: 'Ver el mapa entero', body: [
          'Cuando ves tu vida dibujada en un solo lugar, salta a la vista lo que falta: un área llena y otra vacía, una Epic que nombraste y nunca tocaste. Esa claridad es el primer paso del equilibrio.',
          'No hace falta que todo esté lleno. Hace falta que lo que está vacío lo esté porque lo elegiste.',
        ] },
        { heading: 'Un lugar para lo que aún no tiene lugar', body: [
          'No todo nace sabiendo a dónde pertenece. El Espacio libre guarda lo que todavía no encuentra su sitio, sin culpa y sin perderlo.',
          'Ordenar la vida no es meter todo a la fuerza en cajas; es darle a cada cosa el tiempo de mostrarte a qué parte de ti pertenece.',
        ] },
        { heading: 'Diseñar con borradores', body: [
          'Diseñar la propia vida se parece más a dibujar bocetos que a firmar contratos: se prueba, se mira y se ajusta. Por eso aquí puedes mover y deshacer con libertad antes de decidir. Una vida bien pensada no se escribe de un tirón.',
        ] },
      ],
    },
    en: {
      title: 'Why the Canvas?',
      orders: 'the meaning of your life',
      lead: 'The Canvas orders the meaning of your life. Here every small activity connects to something bigger: the area of your life where it happens, the person you want to be, what you want to live and the road to get there. Without this map your activities are a list of chores; with it, each one is a step towards who you choose to be.',
      sections: [
        { heading: 'Five questions, five levels', body: [
          'Each level answers a question. The Area says where: the place in your life, like body and spirit, home, craft or play. The Epic says who: the identity you choose, in the present tense, like “I manage wisely”. The Feature says what: something you already live and want to keep living, like “I have savings”.',
          'The Story says the road: how you will get there and what for. And the Activity says today’s step, small enough to be done.',
        ] },
        { heading: 'Identity before goals', body: [
          'Goals end; identity stays. Someone who sets out to run a marathon often stops running after the finish line; someone who decides “I am an active person” keeps moving.',
          'That is why an Epic is written as someone you already are. Every activity you complete is one more proof of that identity, and little by little you believe it because you are living it.',
        ] },
        { heading: 'The why carries the how', body: [
          'An activity without a purpose feels like a burden, and what weighs is dropped. When you know that a ten-minute walk is part of “I am strong and healthy”, the same effort means something else: it is no longer one more task, it is caring for the body you were entrusted with.',
          'The Canvas keeps that why for the days when motivation is not enough.',
        ] },
        { heading: 'Seeing the whole map', body: [
          'When you see your life drawn in one place, what is missing stands out: one area full and another empty, an Epic you named and never touched. That clarity is the first step to balance.',
          'Not everything has to be full. What is empty should be empty because you chose it.',
        ] },
        { heading: 'A place for what has no place yet', body: [
          'Not everything is born knowing where it belongs. Free Space keeps what has not found its place yet, without guilt and without losing it.',
          'Ordering your life is not forcing everything into boxes; it is giving each thing time to show you which part of you it belongs to.',
        ] },
        { heading: 'Designing in drafts', body: [
          'Designing your life is more like sketching than signing contracts: you try, look and adjust. That is why here you can move things and undo freely before you decide. A well thought-out life is not written in one go.',
        ] },
      ],
    },
  },
  progress: {
    es: {
      title: '¿Por qué Progreso?',
      orders: 'tu crecimiento',
      lead: 'Progreso ordena tu crecimiento. Te muestra, con hechos y no con impresiones, si estás siendo constante en lo que elegiste y si estás cuidando todas las áreas de tu vida o solo algunas. Sin esta pantalla tu memoria decide por ti, y la memoria es injusta: recuerda el día que fallaste y olvida los veinte en que cumpliste.',
      sections: [
        { heading: 'Constancia: cada día es un voto', body: [
          'Una racha no mide talento, mide fidelidad. Cada día que cumples una actividad es un voto a favor de la persona que quieres ser. Ningún voto aislado decide, pero muchos juntos sí.',
          'Ver la racha crecer te recuerda que el cambio no llega de golpe: se acumula, día tras día, casi sin hacer ruido.',
        ] },
        { heading: 'Una racha que perdona', body: [
          'Un día saltado, o un día en que no tocaba, no rompe la racha: solo la pausa. Solo la rompe un día en que tocaba y no lo hiciste. Así la constancia mide lo que de verdad importa, y una caída no borra todo lo construido.',
          'Lo que cuenta no es no caer nunca, sino volver pronto.',
        ] },
        { heading: 'Seguir pocas cosas, a propósito', body: [
          'No todo merece medirse. Tú eliges qué actividades seguir, porque lo que se mide recibe atención, y la atención es limitada. Medir demasiado convierte la vida en un tablero de control; medir lo esencial la convierte en una dirección.',
        ] },
        { heading: 'Áreas de la vida: el equilibrio a la vista', body: [
          'Es fácil crecer mucho en un área y abandonar otras sin darte cuenta: el trabajo avanza mientras la salud, la familia o la fe se quedan quietas.',
          'El radar dibuja cada Epic como una dirección. Cuando la figura se deforma, te muestra dónde está faltando cuidado. No es un juicio, es un espejo.',
        ] },
        { heading: 'Compárate contigo mismo', body: [
          'La sombra detrás del radar es tu periodo anterior. La única comparación que te ayuda a crecer es con quien eras hace unas semanas, no con los demás.',
          'Así cada avance se celebra en su justa medida, y cada retroceso se vuelve información en lugar de vergüenza.',
        ] },
        { heading: 'Gratitud por el camino', body: [
          'Mirar lo que ya cumpliste también es una forma de gratitud. Te recuerda que no partes de cero y que hay fruto, aunque el crecimiento verdadero casi siempre es lento y escondido, como la semilla que crece de noche mientras el sembrador duerme.',
        ] },
      ],
    },
    en: {
      title: 'Why Progress?',
      orders: 'your growth',
      lead: 'Progress orders your growth. It shows you, with facts and not impressions, whether you are being consistent in what you chose and whether you are caring for every area of your life or only some. Without this screen your memory decides for you, and memory is unfair: it remembers the day you failed and forgets the twenty days you kept your word.',
      sections: [
        { heading: 'Consistency: every day is a vote', body: [
          'A streak does not measure talent, it measures faithfulness. Every day you complete an activity is a vote for the person you want to be. No single vote decides, but many together do.',
          'Watching the streak grow reminds you that change does not arrive all at once: it adds up, day after day, almost without a sound.',
        ] },
        { heading: 'A streak that forgives', body: [
          'A skipped day, or a day it was not planned, does not break the streak: it only pauses it. Only a day it was planned and not done breaks it. So consistency measures what really matters, and one fall does not erase everything you built.',
          'What counts is not never falling, but coming back soon.',
        ] },
        { heading: 'Tracking a few things, on purpose', body: [
          'Not everything deserves to be measured. You choose which activities to follow, because what is measured gets attention, and attention is limited. Measuring too much turns life into a control panel; measuring what is essential turns it into a direction.',
        ] },
        { heading: 'Areas of life: balance in sight', body: [
          'It is easy to grow a lot in one area and neglect others without noticing: work moves forward while health, family or faith stand still.',
          'The radar draws each Epic as a direction. When the shape bends out of line, it shows you where care is missing. It is not a verdict, it is a mirror.',
        ] },
        { heading: 'Compare yourself with yourself', body: [
          'The shadow behind the radar is your previous period. The only comparison that helps you grow is with who you were a few weeks ago, not with other people.',
          'That way every step forward is celebrated at its true size, and every step back becomes information instead of shame.',
        ] },
        { heading: 'Gratitude for the road', body: [
          'Looking at what you have already done is also a form of gratitude. It reminds you that you do not start from zero and that there is fruit, even though real growth is almost always slow and hidden, like the seed that grows at night while the sower sleeps.',
        ] },
      ],
    },
  },
  capture: {
    es: {
      title: '¿Por qué Capturar?',
      orders: 'tu mente',
      lead: 'Capturar ordena tu mente. Los pendientes sueltos, como llamar, comprar, responder o recordar, no viven en tu agenda sino en tu cabeza, y ahí pesan. Aquí los sacas en segundos y les das un día si lo tienen, y tu mente queda libre para estar en lo que estás haciendo.',
      sections: [
        { heading: 'Lo pendiente no se calla', body: [
          'La psicología lo llama efecto Zeigarnik: lo que dejaste sin terminar sigue dando vueltas en la mente, interrumpiendo y cansando. Y se ha visto que no hace falta resolverlo para calmarlo: basta con anotarlo y decidir cuándo lo harás.',
          'Capturar es eso: un lugar confiable donde tu cabeza puede soltar lo que no necesita cargar.',
        ] },
        { heading: 'Tareas y Actividades no son lo mismo', body: [
          'Una Actividad es parte de quien quieres ser y vuelve una y otra vez. Una tarea es un asunto que se cierra: pagar una factura, llamar al dentista.',
          'Separarlas protege tu semana de llenarse de recados, y protege tus recados de perderse entre tus hábitos. Cada una tiene su sitio.',
        ] },
        { heading: 'De idea a compromiso', body: [
          'Una tarea sin fecha es solo un deseo. Darle un día, y si hace falta una hora, la convierte en un compromiso pequeño que aparece justo donde tu semana lo necesita, al lado de lo que estarás haciendo en ese momento.',
        ] },
        { heading: 'El papel que envejece', body: [
          'Cada tarea está escrita en papel, y el papel envejece con los días. No es un castigo, es una señal honesta: lo que llevas mucho tiempo posponiendo merece una decisión.',
          'Hacerlo, programarlo o soltarlo: las tres son buenas. Lo único que cansa es cargarlo sin decidir.',
        ] },
        { heading: 'Lo resuelto también cuenta', body: [
          'Las tareas terminadas no desaparecen, se guardan aparte. Ver lo que ya resolviste le recuerda a tu mente que avanzas, aunque el día haya sido de muchos asuntos pequeños.',
        ] },
      ],
    },
    en: {
      title: 'Why Capture?',
      orders: 'your mind',
      lead: 'Capture orders your mind. Loose errands, like calling, buying, answering or remembering, do not live in your calendar but in your head, and there they weigh. Here you take them out in seconds and give them a day if they have one, and your mind is free to be in what you are doing.',
      sections: [
        { heading: 'Unfinished things do not go quiet', body: [
          'Psychology calls it the Zeigarnik effect: what you left unfinished keeps circling in your mind, interrupting and tiring you. And it turns out you do not have to solve it to calm it: writing it down and deciding when you will do it is enough.',
          'That is what Capture is: a trusted place where your head can let go of what it does not need to carry.',
        ] },
        { heading: 'Tasks and Activities are not the same', body: [
          'An Activity is part of who you want to be and comes back again and again. A task is a matter that closes: paying a bill, calling the dentist.',
          'Keeping them apart stops your week from filling up with errands, and stops your errands from getting lost among your habits. Each has its place.',
        ] },
        { heading: 'From idea to commitment', body: [
          'A task without a date is only a wish. Giving it a day, and an hour if needed, turns it into a small commitment that shows up right where your week needs it, next to what you will be doing at that moment.',
        ] },
        { heading: 'The paper that ages', body: [
          'Every task is written on paper, and the paper ages with the days. It is not a punishment, it is an honest signal: what you have been putting off for a long time deserves a decision.',
          'Do it, schedule it or let it go: all three are good. The only tiring thing is carrying it without deciding.',
        ] },
        { heading: 'What is done counts too', body: [
          'Finished tasks do not disappear, they are kept aside. Seeing what you have already sorted out reminds your mind that you are moving forward, even on a day made of many small things.',
        ] },
      ],
    },
  },
  focus: {
    es: {
      title: '¿Por qué Enfoque?',
      orders: 'tu atención',
      lead: 'Enfoque ordena tu atención. Muestra solo el día de hoy y, en grande, lo que toca ahora. Todo lo demás se aparta para que puedas estar presente en una sola cosa, que es la única manera en que las cosas de verdad se hacen.',
      sections: [
        { heading: 'Una cosa a la vez', body: [
          'Saltar de una cosa a otra tiene un costo: parte de tu atención se queda pegada a lo que dejaste. Cuando miras solo lo que toca ahora, recuperas tu atención entera y la pones donde estás.',
        ] },
        { heading: 'A cada día le basta lo suyo', body: [
          'Planear la semana sirve para no tener que pensar en ella mientras vives el día. Enfoque te deja apoyarte en lo que ya decidiste y ocuparte solo de hoy, como enseñó Jesús: no angustiarse por el mañana, porque cada día trae lo suyo.',
        ] },
        { heading: 'Terminar con presencia', body: [
          'Cerrar una actividad deja espacio para la siguiente. Ver avanzar el día te da algo que la prisa nunca da: la certeza de haber estado ahí.',
        ] },
      ],
    },
    en: {
      title: 'Why Focus?',
      orders: 'your attention',
      lead: 'Focus orders your attention. It shows only today and, in large, what is happening now. Everything else steps aside so you can be present in one single thing, which is the only way things really get done.',
      sections: [
        { heading: 'One thing at a time', body: [
          'Jumping from one thing to another has a cost: part of your attention stays stuck on what you left. When you look only at what is happening now, you get your whole attention back and put it where you are.',
        ] },
        { heading: 'Each day has enough of its own', body: [
          'Planning the week is so you do not have to think about it while you live the day. Focus lets you lean on what you already decided and care only for today, as Jesus taught: do not worry about tomorrow, for each day brings its own.',
        ] },
        { heading: 'Finishing with presence', body: [
          'Closing one activity makes room for the next. Watching the day move forward gives you something hurry never gives: the certainty that you were there.',
        ] },
      ],
    },
  },
};
