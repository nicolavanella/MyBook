/**
 * MyBook — azioni dell'editor eseguibili da toolbar E da scorciatoia (v0.4.0).
 *
 * Prima ogni pulsante della toolbar conteneva inline il proprio comando
 * TipTap. Con le scorciatoie configurabili lo stesso comando deve partire
 * anche da tastiera: tenerlo in due posti avrebbe prima o poi prodotto
 * comportamenti diversi (es. il pulsante "Barrato" che fa una cosa e la sua
 * scorciatoia un'altra). Qui c'è l'UNICA definizione di cosa fa ogni azione;
 * toolbar e gestore di tastiera si limitano a chiamarla per id.
 *
 * Le azioni che richiedono interfaccia (link, immagine, ricerca, zoom) non
 * conoscono la UI: delegano a `EditorActionHandlers`, fornito da SceneEditor.
 */
import type { Editor } from '@tiptap/react'
import type { ShortcutActionId } from '@shared/shortcuts'

export interface EditorActionHandlers {
  /** Apre (o porta in primo piano) la finestra Cerca e sostituisci, con il focus sul campo indicato. */
  openFind: (mode: 'find' | 'replace') => void
  openLink: () => void
  insertImage: () => void
  zoomIn: () => void
  zoomOut: () => void
  zoomReset: () => void
}

/**
 * Inserisce `open`+`close` nel punto del cursore e riposiziona il cursore
 * subito dopo `open` (strumento "Dialoghi", v0.3.9): insertContent lascia di
 * norma il cursore alla FINE di ciò che ha inserito, quindi va spostato
 * indietro per finire "in mezzo" alle due virgolette.
 */
export function insertAndPlaceCursorBetween(editor: Editor, open: string, close: string): void {
  const { from } = editor.state.selection
  editor.chain().focus().insertContent(open + close).setTextSelection(from + open.length).run()
}

/** Esegue l'azione `id` sull'editor. Lo `switch` è esaustivo: aggiungere un'azione al catalogo senza gestirla qui non compila. */
export function runEditorAction(editor: Editor, id: ShortcutActionId, handlers: EditorActionHandlers): void {
  const chain = () => editor.chain().focus()
  switch (id) {
    case 'undo': chain().undo().run(); return
    case 'redo': chain().redo().run(); return
    case 'zoomIn': handlers.zoomIn(); return
    case 'zoomOut': handlers.zoomOut(); return
    case 'zoomReset': handlers.zoomReset(); return
    case 'paragraph': chain().setParagraph().run(); return
    case 'heading1': chain().toggleHeading({ level: 1 }).run(); return
    case 'heading2': chain().toggleHeading({ level: 2 }).run(); return
    case 'heading3': chain().toggleHeading({ level: 3 }).run(); return
    case 'bold': chain().toggleBold().run(); return
    case 'italic': chain().toggleItalic().run(); return
    case 'underline': chain().toggleUnderline().run(); return
    case 'strike': chain().toggleStrike().run(); return
    case 'clearFormatting': chain().unsetAllMarks().clearNodes().run(); return
    case 'bulletList': chain().toggleBulletList().run(); return
    case 'orderedList': chain().toggleOrderedList().run(); return
    case 'alignLeft': chain().setTextAlign('left').run(); return
    case 'alignCenter': chain().setTextAlign('center').run(); return
    case 'alignRight': chain().setTextAlign('right').run(); return
    case 'alignJustify': chain().setTextAlign('justify').run(); return
    // Virgolette senza spazio interno («Ciao», non « Ciao »); trattino lungo seguito da uno spazio ("– disse Maria").
    case 'dialogueGuillemets': insertAndPlaceCursorBetween(editor, '«', '»'); return
    case 'dialogueQuotes': insertAndPlaceCursorBetween(editor, '\u201c', '\u201d'); return
    case 'dialogueDash': chain().insertContent('\u2013 ').run(); return
    case 'blockquote': chain().toggleBlockquote().run(); return
    case 'pageSeparator': chain().setHorizontalRule().run(); return
    case 'link': handlers.openLink(); return
    case 'image': handlers.insertImage(); return
    case 'find': handlers.openFind('find'); return
    case 'replace': handlers.openFind('replace'); return
    default: {
      const unreachable: never = id
      throw new Error(`Unhandled editor action: ${String(unreachable)}`)
    }
  }
}
