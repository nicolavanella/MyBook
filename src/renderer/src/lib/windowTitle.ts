/**
 * Composizione del titolo della finestra (v0.3.4).
 *
 * Formato base (dalla v0.2.7):  "MyBook - <Progetto> - <Sezione>"
 * Con una scena aperta nel Manoscritto (v0.3.4):
 *                               "MyBook - <Progetto> - Manoscritto - <Capitolo> / <Scena>"
 *
 * Le parti vuote o mancanti vengono semplicemente omesse (mai separatori
 * pendenti), così il titolo resta corretto anche senza progetto attivo o con
 * una scena senza capitolo.
 */
export interface WindowTitleParts {
  projectTitle?: string | null
  sectionLabel?: string | null
  /** Capitolo che contiene la scena in editing (omesso se la scena non ha un capitolo). */
  chapterTitle?: string | null
  /** Scena in editing. */
  sceneTitle?: string | null
}

const isFilled = (s: string | null | undefined): s is string => typeof s === 'string' && s.trim().length > 0

export function buildWindowTitle({ projectTitle, sectionLabel, chapterTitle, sceneTitle }: WindowTitleParts): string {
  const editing = [chapterTitle, sceneTitle].filter(isFilled).join(' / ')
  return ['MyBook', projectTitle, sectionLabel, editing].filter(isFilled).join(' - ')
}
