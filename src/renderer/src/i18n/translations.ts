/**
 * Dizionario di traduzioni. Copre, per ora, la navigazione principale e la
 * pagina Impostazioni: è il punto di partenza dell'infrastruttura di
 * localizzazione ("cominciamo a gestire la localizzazione"), non una
 * traduzione completa dell'app — le altre pagine restano in italiano e
 * verranno tradotte incrementalmente in versioni successive.
 *
 * Le chiavi mancanti in una lingua ricadono sull'italiano (vedi
 * useTranslation.ts), così un termine non ancora tradotto non produce mai
 * una stringa vuota o un placeholder tipo "[missing key]".
 */
export type Language = 'it' | 'en'

export const translations = {
  it: {
    'nav.projects': 'Progetti',
    'nav.manuscript': 'Manoscritto',
    'nav.characters': 'Personaggi',
    'nav.locations': 'Località',
    'nav.objects': 'Oggetti',
    'nav.timeline': 'Timeline',
    'nav.mindmap': 'Mappa concettuale',
    'nav.statistics': 'Statistiche',
    'nav.export': 'Esporta',
    'nav.info': 'Info',
    'nav.settings': 'Impostazioni',

    'settings.tab.general': 'Generale',
    'settings.tab.tools': 'Strumenti',
    'settings.tab.editor': 'Editor',
    'settings.tab.log': 'Log',
    'settings.tab.advanced': 'Avanzate',
    'settings.appearance.title': 'Aspetto',
    'settings.appearance.dark': 'Tema scuro',
    'settings.appearance.light': 'Tema chiaro',
    'settings.language.title': 'Lingua',
    'settings.language.description': 'Salvata per la futura localizzazione completa.',
    'settings.language.it': 'Italiano',
    'settings.language.en': 'Inglese',
    'settings.backup.title': 'Backup',
    'settings.backup.description': 'Gestisci backup automatici e backup manuali del database.'
  },
  en: {
    'nav.projects': 'Projects',
    'nav.manuscript': 'Manuscript',
    'nav.characters': 'Characters',
    'nav.locations': 'Locations',
    'nav.objects': 'Objects',
    'nav.timeline': 'Timeline',
    'nav.mindmap': 'Mind map',
    'nav.statistics': 'Statistics',
    'nav.export': 'Export',
    'nav.info': 'Info',
    'nav.settings': 'Settings',

    'settings.tab.general': 'General',
    'settings.tab.tools': 'Tools',
    'settings.tab.editor': 'Editor',
    'settings.tab.log': 'Log',
    'settings.tab.advanced': 'Advanced',
    'settings.appearance.title': 'Appearance',
    'settings.appearance.dark': 'Dark theme',
    'settings.appearance.light': 'Light theme',
    'settings.language.title': 'Language',
    'settings.language.description': 'Saved for future full localization.',
    'settings.language.it': 'Italian',
    'settings.language.en': 'English',
    'settings.backup.title': 'Backup',
    'settings.backup.description': 'Manage automatic and manual database backups.'
  }
} as const satisfies Record<Language, Record<string, string>>

export type TranslationKey = keyof (typeof translations)['it']
