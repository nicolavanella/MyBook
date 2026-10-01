import { useEditor, EditorContent } from '@tiptap/react'
import AutosizeTextarea from '@renderer/components/AutosizeTextarea'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import FontFamily from '@tiptap/extension-font-family'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import { ChevronDown, ChevronUp, History, Lock, MessageSquare, Pencil, Tag as TagIcon, Trash2 } from 'lucide-react'
import { useProjectStore } from '@renderer/stores/useProjectStore'
import { useEntityNavigationStore, type EntityTagType } from '@renderer/stores/useEntityNavigationStore'
import type { RendererConfig } from '@shared/ipc/channels'
import type { NodeStatus } from '@shared/schemas/document.schema'
import EditorToolbar from './EditorToolbar'
import TagPickerModal from './TagPickerModal'
import CommentModal from './CommentModal'
import { findMarkOccurrences, removeMarkOccurrences } from './markScan'
import StatusSelect from '@renderer/components/StatusSelect'
import { useConfirm } from '@renderer/components/ConfirmDialog'
import { useEditorPreferences, FONT_SIZE_CLASS } from '@renderer/hooks/useEditorPreferences'
import { FontSize, LinkMark, ImageNode, LineHeight, CommentMark, EntityTagMark } from './extensions/editorExtensions'

interface SceneComment {
  id: string
  document_node_id: string
  mark_id: string
  text: string
  created_at: string
}

// Fallback usati solo finché la config non è ancora arrivata da main via IPC
// (vedi config.get) — i valori reali vengono da config/database.yml, unica
// fonte di verità condivisa con il main process.
const FALLBACK_AUTOSAVE_DEBOUNCE_MS = 800
const FALLBACK_REVISION_AFTER_IDLE_MS = 30000
const TAG_TYPE_LABEL: Record<EntityTagType, string> = {
  character: 'Personaggio',
  location: 'Località',
  object: 'Oggetto',
  event: 'Evento'
}

// Elenco stati e colori dei pallini: vedi lib/nodeStatus.ts (condiviso con l'albero del Manoscritto).

// Le revisioni si creano per qualunque stato (Idea/Bozza/Revisione/Finito),
// ma SOLO quando il contenuto è davvero cambiato — vedi flushSave/maybeCreateRevision.
// "Finito" blocca comunque la modifica del testo (editor non editabile), quindi
// in pratica non genera nuove revisioni finché non si torna a un altro stato.

interface Revision {
  id: string
  reason: string
  word_count: number
  char_count: number
  created_at: string
}

/** Conteggio parole/caratteri dal testo puro dell'editor, per feedback immediato mentre si digita (non dipende dal round-trip di salvataggio). */
function countWordsAndChars(text: string): { words: number; chars: number } {
  const trimmed = text.trim()
  return {
    words: trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length,
    chars: text.length
  }
}

function extractEditorText(content: unknown): string {
  const parts: string[] = []
  const walk = (node: any): void => {
    if (!node) return
    if (node.type === 'text' && typeof node.text === 'string') parts.push(node.text)
    if (Array.isArray(node.content)) node.content.forEach(walk)
  }
  walk(content)
  return parts.join(' ')
}

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
}

/** "+12" in verde se sono state aggiunte parole rispetto alla revisione precedente, "-5" in rosso se rimosse. */
function WordDiffBadge({ diff }: { diff: number }): JSX.Element | null {
  if (diff === 0) return null
  return (
    <span className={diff > 0 ? 'text-green-600' : 'text-red-600'}>
      {diff > 0 ? `+${diff}` : diff}
    </span>
  )
}

/**
 * Menu contestuale del campo di testo (click destro): sostituito dal menu
 * nativo Electron (vedi src/main/editor-context-menu.ts), che offre anche
 * suggerimenti ortografici reali del correttore di sistema — cosa che un
 * menu React fatto a mano non può fare. Copia/Taglia/Incolla restano
 * disponibili lì tramite i ruoli nativi 'copy'/'cut'/'paste'.
 */

export default function SceneEditor(): JSX.Element {
  const { tree, activeProjectId, activeNodeId, loadTree, patchNodeLocally, pendingTagJump, setPendingTagJump } = useProjectStore()
  const navigate = useNavigate()
  const activeNode = tree.find((n) => n.id === activeNodeId)
  const parentChapter = activeNode?.parent_id ? tree.find((n) => n.id === activeNode.parent_id) : null
  const confirm = useConfirm()
  const editorPrefs = useEditorPreferences()

  // Stato di autosave indicizzato per scena. Un singolo pending globale può
  // associare il contenuto di una scena all'ID di un'altra durante cambi rapidi.
  const autosaveTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const revisionTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const pendingContentRef = useRef(new Map<string, string>())
  // v0.3.9: posizione del cursore al momento dell'ultima modifica, per
  // salvarla insieme al contenuto nello stesso autosave (vedi onUpdate e
  // flushSave) — non è un "campo" come gli altri, quindi ha la sua mappa
  // invece di essere infilata dentro pendingContentRef.
  const pendingCursorRef = useRef(new Map<string, number>())
  const activeNodeIdRef = useRef<string | null>(activeNodeId)
  activeNodeIdRef.current = activeNodeId
  // L'ID selezionato nella UI può cambiare un istante prima che TipTap riceva
  // il contenuto della nuova scena. Per l'autosave usiamo quindi l'ID del
  // documento effettivamente caricato nell'editor, non quello della sidebar.
  const editorDocumentIdRef = useRef<string | null>(null)
  // setContent/setEditable sono operazioni di sincronizzazione della UI, non
  // modifiche dell'utente: non devono mai entrare nell'autosave.
  const isProgrammaticEditorUpdateRef = useRef(false)
  /**
   * v0.3.8: cosa c'era esattamente sotto l'ultimo click destro nel testo —
   * aggiornato in editorProps.handleDOMEvents.mousedown, letto quando arriva
   * "Mostra/Elimina commento" o "Elimina tag" dal menu contestuale nativo
   * (main/editor-context-menu.ts). Un ref e non uno stato: cambia più volte
   * per singola interazione (ogni click destro) senza che serva un
   * re-render, ed è comunque letto solo dentro gestori di eventi.
   */
  const lastRightClickRef = useRef<
    | { kind: 'comment'; comment: SceneComment }
    | { kind: 'tag'; from: number; to: number; entityType: string; entityId: string }
    | null
  >(null)
  // Contenuto dell'ultima revisione creata (o ripristinata): permette di non
  // salvare una nuova revisione se il testo non è cambiato da allora.
  const lastRevisionContentRef = useRef<string | null>(null)

  const [saveState, setSaveState] = useState<'saved' | 'pending' | 'saving'>('saved')
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [liveCounts, setLiveCounts] = useState({ words: 0, chars: 0 })
  const [showDetails, setShowDetails] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [showTags, setShowTags] = useState(false)
  const [showRevisions, setShowRevisions] = useState(false)
  const [revisions, setRevisions] = useState<Revision[]>([])
  const [comments, setComments] = useState<SceneComment[]>([])
  const [commentEntries, setCommentEntries] = useState<{ comment: SceneComment; from: number; to: number }[]>([])
  const [tagEntries, setTagEntries] = useState<
    { entityType: EntityTagType; entityId: string; name: string; taggedText: string; from: number; to: number }[]
  >([])
  const [tagPickerType, setTagPickerType] = useState<EntityTagType | null>(null)
  const [tagPickerItems, setTagPickerItems] = useState<{ id: string; name: string }[]>([])
  const [entityNameCache, setEntityNameCache] = useState<Record<string, string>>({})

  const timingRef = useRef({
    autosaveDebounceMs: FALLBACK_AUTOSAVE_DEBOUNCE_MS,
    revisionAfterIdleMs: FALLBACK_REVISION_AFTER_IDLE_MS
  })

  useEffect(() => {
    let cancelled = false
    window.mybook.config.get().then((config: RendererConfig) => {
      if (cancelled) return
      timingRef.current = {
        autosaveDebounceMs: config.autosaveDebounceMs,
        revisionAfterIdleMs: config.revisionAfterIdleMs
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const loadRevisions = (nodeId: string) => {
    window.mybook.revisions.list(nodeId).then(setRevisions)
  }

  /**
   * Scrive subito su SQLite il contenuto pendente per il nodo indicato, se
   * presente, e riallinea lo store locale (tree) col risultato — questo è il
   * fix del bug per cui cambiare scena e tornare indietro mostrava contenuto/
   * conteggi non aggiornati: prima flushSave scriveva su DB ma non toccava
   * mai `tree`, quindi la selezione successiva rileggeva dati vecchi.
   *
   * Restituisce il contenuto effettivamente scritto, o null se non c'era
   * nulla in sospeso: i chiamanti (revisioni) DEVONO usare questo valore di
   * ritorno, non rileggere pendingContentRef dopo — a quel punto è già stato
   * azzerato qui sotto, ed era la causa delle revisioni "a 0 modifiche".
   */
  const flushSave = (nodeId: string | null): Promise<string | null> => {
    if (!nodeId) return Promise.resolve(null)
    const content = pendingContentRef.current.get(nodeId)
    if (content === undefined) return Promise.resolve(null)

    const timer = autosaveTimersRef.current.get(nodeId)
    if (timer) {
      clearTimeout(timer)
      autosaveTimersRef.current.delete(nodeId)
    }
    pendingContentRef.current.delete(nodeId)
    const cursorPosition = pendingCursorRef.current.get(nodeId)
    pendingCursorRef.current.delete(nodeId)
    setSaveState('saving')

    return window.mybook.documents.update(nodeId, {
      content,
      ...(cursorPosition !== undefined ? { cursor_position: cursorPosition } : {})
    }).then(() => {
      const text = extractEditorText(safeParse(content))
      const { words, chars } = countWordsAndChars(text)
      patchNodeLocally(nodeId, {
        content,
        word_count: words,
        char_count: chars,
        updated_at: new Date().toISOString()
      })
      if (activeNodeIdRef.current === nodeId) {
        setSaveState('saved')
        setLastSavedAt(new Date())
      }
      return content
    }).catch((error) => {
      // Il contenuto non viene perso se l'IPC/DB fallisce: torna in coda.
      if (!pendingContentRef.current.has(nodeId)) pendingContentRef.current.set(nodeId, content)
      if (activeNodeIdRef.current === nodeId) setSaveState('pending')
      throw error
    })
  }

  /**
   * Crea una revisione SOLO se il contenuto passato è non-nullo (cioè
   * flushSave ha davvero scritto qualcosa: "salva revisione solo se è stato
   * digitato del testo") e diverso dall'ultima revisione registrata (evita
   * di riempire lo storico di snapshot identici).
   */
  const maybeCreateRevision = (nodeId: string, reason: string, content: string | null) => {
    if (content === null) return Promise.resolve()
    if (content === lastRevisionContentRef.current) return Promise.resolve()
    return window.mybook.revisions.create(nodeId, reason).then(() => {
      lastRevisionContentRef.current = content
      if (activeNodeIdRef.current === nodeId) loadRevisions(nodeId)
    })
  }

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      FontFamily,
      Highlight,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      FontSize,
      LinkMark,
      ImageNode,
      LineHeight,
      CommentMark,
      EntityTagMark
    ],
    content: activeNode?.content ? safeParse(activeNode.content) : '',
    editable: activeNode?.status !== 'completo',
    editorProps: {
      attributes: { spellcheck: String(editorPrefs.spellcheck) },
      handleClick: (view, pos, event) => {
        // Ctrl/Cmd+click su un tag naviga alla sezione corrispondente; un
        // click semplice continua a limitarsi a posizionare il cursore, per
        // non intralciare la normale scrittura/modifica del testo taggato.
        if (!(event.metaKey || event.ctrlKey)) return false
        const target = event.target as HTMLElement
        const tagEl = target.closest('[data-entity-type][data-entity-id]') as HTMLElement | null
        if (!tagEl) return false
        const entityType = tagEl.getAttribute('data-entity-type')
        const entityId = tagEl.getAttribute('data-entity-id')
        if (entityType && entityId) {
          navigateToEntity(entityType as EntityTagType, entityId)
          return true
        }
        return false
      },
      handleDOMEvents: {
        // v0.3.8: al tasto destro, se il click cade su un commento o un tag
        // esistente, lo memorizza in lastRightClickRef e lo segnala al main
        // (in modo SINCRONO: il menu contestuale nativo si costruisce
        // subito dopo, nello stesso giro di eventi — vedi preload/index.ts).
        // Non blocca nulla (return false): il menu contestuale di Electron
        // deve comunque aprirsi normalmente subito dopo.
        mousedown: (view, event) => {
          if (event.button !== 2) return false
          const target = event.target as HTMLElement
          const commentEl = target.closest('[data-comment-id]') as HTMLElement | null
          const tagEl = !commentEl ? (target.closest('[data-entity-type][data-entity-id]') as HTMLElement | null) : null

          if (commentEl) {
            const commentId = commentEl.getAttribute('data-comment-id')
            const comment = comments.find((c) => c.mark_id === commentId)
            lastRightClickRef.current = comment ? { kind: 'comment', comment } : null
            window.mybook.editor.reportContextClick(comment ? { kind: 'comment' } : { kind: 'none' })
          } else if (tagEl) {
            const entityType = tagEl.getAttribute('data-entity-type')
            const entityId = tagEl.getAttribute('data-entity-id')
            // posAtDOM converte l'elemento cliccato in una posizione nel
            // documento ProseMirror, per capire QUALE occorrenza di questo
            // tag (potrebbero essercene più di una nella scena) è stata
            // cliccata: findMarkOccurrences le unisce già per nodi di testo
            // adiacenti (formattazione mista), esattamente come altrove.
            const clickedPos = view.posAtDOM(tagEl, 0)
            const occurrence = findMarkOccurrences(view.state.doc, 'entityTag').find(
              (occ) => occ.attrs.entityType === entityType && occ.attrs.entityId === entityId && clickedPos >= occ.from && clickedPos < occ.to
            )
            lastRightClickRef.current =
              occurrence && entityType && entityId
                ? { kind: 'tag', from: occurrence.from, to: occurrence.to, entityType, entityId }
                : null
            window.mybook.editor.reportContextClick(occurrence ? { kind: 'tag' } : { kind: 'none' })
          } else {
            lastRightClickRef.current = null
            window.mybook.editor.reportContextClick({ kind: 'none' })
          }
          return false
        }
      }
    },
    onFocus: () => {
      void window.mybook.editor.setFocused(true)
    },
    onBlur: () => {
      void window.mybook.editor.setFocused(false)
    },
    onUpdate: ({ editor, transaction }) => {
      // TipTap emette anche update per alcune operazioni programmatiche (per
      // esempio setEditable). Salviamo esclusivamente modifiche reali al doc.
      if (isProgrammaticEditorUpdateRef.current || !transaction.docChanged) return
      const nodeId = editorDocumentIdRef.current
      if (!nodeId) return
      const json = JSON.stringify(editor.getJSON())
      pendingContentRef.current.set(nodeId, json)
      pendingCursorRef.current.set(nodeId, editor.state.selection.to)
      setSaveState('pending')
      setLiveCounts(countWordsAndChars(editor.getText()))

      const oldAutosave = autosaveTimersRef.current.get(nodeId)
      if (oldAutosave) clearTimeout(oldAutosave)
      autosaveTimersRef.current.set(nodeId, setTimeout(() => {
        autosaveTimersRef.current.delete(nodeId)
        void flushSave(nodeId).catch(() => undefined)
      }, timingRef.current.autosaveDebounceMs))

      const oldRevision = revisionTimersRef.current.get(nodeId)
      if (oldRevision) clearTimeout(oldRevision)
      revisionTimersRef.current.set(nodeId, setTimeout(() => {
        revisionTimersRef.current.delete(nodeId)
        void flushSave(nodeId).then((flushedContent) => {
          return maybeCreateRevision(nodeId, 'pause', flushedContent)
        }).catch(() => undefined)
      }, timingRef.current.revisionAfterIdleMs))
    }
  })

  // Mantiene editor.editable sincronizzato con lo stato scena: "completo" =
  // testo non modificabile finché non si torna a "revisione". Il secondo
  // argomento evita che TipTap emetta un onUpdate artificiale con il testo
  // della scena precedente durante un cambio di selezione.
  useEffect(() => {
    if (!editor) return
    isProgrammaticEditorUpdateRef.current = true
    editor.setEditable(activeNode?.status !== 'completo', false)
    isProgrammaticEditorUpdateRef.current = false
  }, [editor, activeNode?.status])

  // editorProps viene letto solo alla creazione dell'editor: le preferenze
  // (fetch asincrono) arrivano dopo, quindi il controllo ortografico va
  // riapplicato manualmente quando cambiano.
  useEffect(() => {
    editor?.view.dom.setAttribute('spellcheck', String(editorPrefs.spellcheck))
  }, [editor, editorPrefs.spellcheck])

  // Il menu contestuale nativo (main process) deve sapere se tag/commenti
  // sono abilitati, per mostrare o nascondere le relative voci — vedi
  // editor-context-menu.ts.
  useEffect(() => {
    void window.mybook.editor.setAnnotationsEnabled({
      tagsEnabled: editorPrefs.tagsEnabled,
      commentsEnabled: editorPrefs.commentsEnabled
    })
  }, [editorPrefs.tagsEnabled, editorPrefs.commentsEnabled])

  // "Aggiungi commento…"/"Aggiungi tag…" scelti nel menu contestuale nativo
  // (vedi editor-context-menu.ts): agiscono sulla selezione TipTap corrente,
  // che il click destro nativo non altera.
  useEffect(() => {
    const offComment = window.mybook.editor.onAddComment(() => {
      addCommentAtSelection()
    })
    const offTag = window.mybook.editor.onAddTag((entityType: EntityTagType) => {
      void openTagPicker(entityType)
    })
    // v0.3.8 — "Mostra/Elimina commento" ed "Elimina tag" sul commento/tag
    // già esistente su cui è caduto l'ultimo click destro (lastRightClickRef,
    // valorizzato in editorProps.handleDOMEvents.mousedown qui sopra).
    const offShowComment = window.mybook.editor.onShowComment(() => {
      // v0.3.9: apre direttamente la scheda di modifica del commento (la
      // stessa che si apre cliccando "Modifica" nell'elenco), non solo il
      // pannello Commenti — è quello che "Mostra commento" lascia intendere.
      if (lastRightClickRef.current?.kind === 'comment') setEditingComment(lastRightClickRef.current.comment)
    })
    const offDeleteCommentAt = window.mybook.editor.onDeleteCommentAt(() => {
      const info = lastRightClickRef.current
      if (info?.kind === 'comment') void deleteComment(info.comment)
    })
    const offDeleteTagAt = window.mybook.editor.onDeleteTagAt(() => {
      const info = lastRightClickRef.current
      if (info?.kind !== 'tag' || !editor || !activeNodeIdRef.current) return
      // v0.3.9: chiede conferma prima di eliminare, come le altre eliminazioni dell'app (coerente con "Elimina commento").
      void confirm({ message: 'Eliminare questo tag?', confirmLabel: 'Elimina', danger: true }).then((ok) => {
        if (!ok) return
        const tagMarkType = editor.schema.marks.entityTag
        editor.chain().command(({ tr }) => {
          tr.removeMark(info.from, info.to, tagMarkType)
          return true
        }).run()
        void flushSave(activeNodeIdRef.current).catch(() => undefined)
        refreshAnnotationPositions()
      })
    })
    return () => {
      offComment()
      offTag()
      offShowComment()
      offDeleteCommentAt()
      offDeleteTagAt()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, activeNodeId, activeProjectId])

  // Tooltip col nome dell'entità sui tag esistenti nel testo: il mark porta
  // solo tipo+id (vedi EntityTagMark), il nome va risolto qui per restare
  // aggiornato anche se l'entità viene rinominata altrove.
  useEffect(() => {
    if (!editor) return
    const els = editor.view.dom.querySelectorAll('[data-entity-type][data-entity-id]')
    els.forEach((el) => {
      const key = `${el.getAttribute('data-entity-type')}:${el.getAttribute('data-entity-id')}`
      const name = entityNameCache[key]
      if (name) el.setAttribute('title', `${name} (Ctrl/Cmd+click per aprire)`)
    })
  }, [editor, entityNameCache, activeNode?.content])

  // Precarica i nomi di tutte le entità del progetto, per i tooltip dei tag
  // già presenti nel testo quando si apre una scena (vedi effect sopra).
  useEffect(() => {
    if (!activeProjectId) return
    let cancelled = false
    Promise.all([
      window.mybook.characters.list(activeProjectId),
      window.mybook.locations.list(activeProjectId),
      window.mybook.objects.list(activeProjectId),
      window.mybook.timelines.list(activeProjectId).then((timelines: any[]) =>
        Promise.all(timelines.map((t) => window.mybook.timelineEvents.list(t.id))).then((lists) => lists.flat())
      )
    ]).then(([characters, locations, objects, events]) => {
      if (cancelled) return
      const cache: Record<string, string> = {}
      characters.forEach((c: any) => { cache[`character:${c.id}`] = c.name })
      locations.forEach((l: any) => { cache[`location:${l.id}`] = l.name })
      objects.forEach((o: any) => { cache[`object:${o.id}`] = o.name })
      events.forEach((e: any) => { cache[`event:${e.id}`] = e.title })
      setEntityNameCache(cache)
    })
    return () => {
      cancelled = true
    }
  }, [activeProjectId])

  // Ricalcola la sezione "Tag" quando arrivano i nomi delle entità (fetch
  // asincrono sopra): senza questo, i tag già presenti in una scena appena
  // aperta comparirebbero con "(nome non disponibile)" finché l'utente non
  // tocca qualcos'altro nell'editor. Il refresh al cambio scena è già
  // garantito da loadComments (chiamato nell'effect che carica il contenuto
  // nell'editor), che a sua volta chiama refreshAnnotationPositions — non va
  // ripetuto qui tenendo activeNode?.id in dipendenza, altrimenti questo
  // effect girerebbe PRIMA che il nuovo contenuto sia stato caricato
  // nell'editor (gli effect vengono eseguiti nell'ordine di dichiarazione).
  useEffect(() => {
    refreshAnnotationPositions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityNameCache])

  // Salvataggio manuale, esplicito (bottone "Salva" nella toolbar in alto)
  const handleManualSave = () => {
    if (!activeNodeId) return
    void flushSave(activeNodeId).then((flushedContent) => {
      return maybeCreateRevision(activeNodeId, 'manual', flushedContent)
    }).catch(() => undefined)
  }

  const handleRestoreRevision = async (revisionId: string) => {
    if (!activeNodeId) return
    const ok = await confirm({
      message: 'Ripristinare questa revisione? Il testo attuale verrà sostituito (resterà comunque nella cronologia).',
      confirmLabel: 'Ripristina'
    })
    if (!ok) return
    const newRevision = await window.mybook.revisions.restore(revisionId)
    await loadTree()
    loadRevisions(activeNodeId)
    setLastSavedAt(new Date())
    if (newRevision?.content) lastRevisionContentRef.current = newRevision.content
    // Il contenuto ripristinato arriva dal reload di `tree`; l'effect sotto,
    // che osserva activeNode?.id, non si riattiverebbe (stesso id) — quindi
    // applichiamo esplicitamente il nuovo contenuto all'editor qui.
    if (editor && newRevision?.content) {
      editor.commands.setContent(safeParse(newRevision.content), false)
    }
  }

  // Salva sempre prima di uscire dall'app (autosave 800ms potrebbe non aver
  // ancora fatto in tempo se l'utente chiude subito dopo aver digitato).
  useEffect(() => {
    const handler = () => {
      void flushSave(activeNodeIdRef.current).catch(() => undefined)
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // Cambio scena: flush esclusivo della scena precedente.
  useEffect(() => {
    const nodeIdAtThisRender = activeNodeId
    return () => {
      if (!nodeIdAtThisRender) return
      const revisionTimer = revisionTimersRef.current.get(nodeIdAtThisRender)
      if (revisionTimer) {
        clearTimeout(revisionTimer)
        revisionTimersRef.current.delete(nodeIdAtThisRender)
      }
      void flushSave(nodeIdAtThisRender).then((flushedContent) => {
        return maybeCreateRevision(nodeIdAtThisRender, 'manual', flushedContent)
      }).catch(() => undefined)
    }
  }, [activeNodeId])

  useEffect(() => {
    if (!editor) return
    if (!activeNode) {
      editorDocumentIdRef.current = null
      return
    }
    isProgrammaticEditorUpdateRef.current = true
    try {
      // Caricare una scena non è una modifica: impediamo a TipTap di emettere
      // onUpdate, evitando che il contenuto appena caricato entri nell'autosave.
      editor.commands.setContent(activeNode.content ? safeParse(activeNode.content) : '', false)
      // L'ownership viene aggiornata solo dopo aver sincronizzato TipTap: fra
      // selezione nella sidebar e questo punto il vecchio contenuto non potrà
      // essere associato per errore alla nuova scena.
      editorDocumentIdRef.current = activeNode.id
      setSaveState('saved')
      setLastSavedAt(activeNode.updated_at ? new Date(activeNode.updated_at) : null)
      setLiveCounts(countWordsAndChars(editor.getText()))
      setShowRevisions(false)
      lastRevisionContentRef.current = activeNode.content
      if (activeNode.id) {
        loadRevisions(activeNode.id)
        loadComments(activeNode.id)
      }
      // v0.3.6: se si è arrivati qui cliccando "Dove compare" nella scheda di
      // un personaggio/località/oggetto, salta subito all'occorrenza esatta
      // del tag. findMarkOccurrences legge lo STESSO editor.state.doc appena
      // sincronizzato da setContent qui sopra, nello stesso ordine con cui
      // findEntityTagOccurrences (lato main) ha calcolato occurrenceIndex:
      // l'indice combacia. Va consumato una volta sola (altrimenti si
      // rifarebbe il salto anche riaprendo la stessa scena in seguito per
      // altri motivi), quindi si azzera subito dopo averlo usato.
      if (pendingTagJump) {
        const { entityType, entityId, occurrenceIndex } = pendingTagJump
        const occurrences = findMarkOccurrences(editor.state.doc, 'entityTag').filter(
          (occ) => occ.attrs.entityType === entityType && occ.attrs.entityId === entityId
        )
        const target = occurrences[occurrenceIndex]
        if (target) {
          setShowTags(true)
          // scrollIntoView ha bisogno che il documento sia già montato: un tick dopo il render basta.
          setTimeout(() => jumpToRange(target.from, target.to), 0)
        }
        setPendingTagJump(null)
      } else if (activeNode.cursor_position) {
        // v0.3.9: nessun salto a un tag in sospeso -> riapre la scena
        // esattamente dov'era rimasto l'ultimo salvataggio. Il clamp evita
        // un errore se il documento risultasse più corto di quella
        // posizione (caso limite: contenuto modificato altrove nel
        // frattempo, che per un'app locale mono-utente non dovrebbe capitare).
        const clampedPos = Math.min(activeNode.cursor_position, editor.state.doc.content.size)
        editor.commands.setTextSelection(clampedPos)
        editor.commands.scrollIntoView()
      }
    } finally {
      isProgrammaticEditorUpdateRef.current = false
    }
  }, [activeNode?.id])

  const insertImage = async () => {
    const path = await window.mybook.media.pickImage()
    if (!path || !editor) return
    const src = await window.mybook.media.readAsDataUrl(path)
    if (!src) return
    editor.chain().focus().insertContent({ type: 'image', attrs: { src, alt: path.split(/[\\/]/).pop() || 'Immagine' } }).run()
  }

  const updateStatus = async (status: NodeStatus) => {
    if (!activeNodeId) return
    await window.mybook.documents.update(activeNodeId, { status })
    patchNodeLocally(activeNodeId, { status })
  }

  const updateField = async (field: 'subtitle' | 'description' | 'notes', value: string) => {
    if (!activeNodeId) return
    await window.mybook.documents.update(activeNodeId, { [field]: value })
    patchNodeLocally(activeNodeId, { [field]: value })
  }

  /**
   * Ricalcola commentEntries/tagEntries scansionando il documento corrente
   * (findMarkOccurrences), così l'elenco riflette sempre l'ORDINE REALE nel
   * testo — non l'ordine di creazione, che è quanto mostrava la versione
   * precedente e che sembrava "non funzionare" perché disallineato da dove
   * i commenti/tag comparivano davvero.
   */
  const refreshAnnotationPositions = (commentRows: SceneComment[] = comments) => {
    if (!editor) return
    const doc = editor.state.doc

    const commentOccurrences = findMarkOccurrences(doc, 'comment')
    const nextCommentEntries = commentOccurrences
      .map((occ) => {
        const row = commentRows.find((c) => c.mark_id === occ.attrs.commentId)
        return row ? { comment: row, from: occ.from, to: occ.to } : null
      })
      .filter((e): e is { comment: SceneComment; from: number; to: number } => e !== null)
    setCommentEntries(nextCommentEntries)

    const tagOccurrences = findMarkOccurrences(doc, 'entityTag')
    setTagEntries(
      tagOccurrences.map((occ) => ({
        entityType: occ.attrs.entityType,
        entityId: occ.attrs.entityId,
        name: entityNameCache[`${occ.attrs.entityType}:${occ.attrs.entityId}`] ?? '(nome non disponibile)',
        taggedText: doc.textBetween(occ.from, occ.to, ' '),
        from: occ.from,
        to: occ.to
      }))
    )
  }

  /** Sposta il cursore/la selezione sul testo di un commento o tag e lo porta in vista, cliccando la relativa voce in elenco. */
  const jumpToRange = (from: number, to: number) => {
    editor?.chain().focus().setTextSelection({ from, to }).scrollIntoView().run()
  }

  const loadComments = (nodeId: string) => {
    window.mybook.comments.list(nodeId).then((rows: SceneComment[]) => {
      setComments(rows)
      refreshAnnotationPositions(rows)
    })
  }

  const [commentModalRange, setCommentModalRange] = useState<{ from: number; to: number } | null>(null)
  const [editingComment, setEditingComment] = useState<SceneComment | null>(null)

  /** Apre il modal per un nuovo commento, catturando subito la selezione corrente (l'apertura del modal, essendo un overlay, non dovrebbe alterarla, ma catturarla esplicitamente evita ogni ambiguità). */
  const addCommentAtSelection = () => {
    if (!editor || editor.state.selection.empty) return
    const { from, to } = editor.state.selection
    setCommentModalRange({ from, to })
  }

  /** Salva un nuovo commento: applica il mark sull'intervallo catturato all'apertura del modal, poi crea la riga in scene_comments. */
  const saveNewComment = async (text: string) => {
    if (!editor || !activeNodeId || !commentModalRange) {
      setCommentModalRange(null)
      return
    }
    const markId = uuidv4()
    editor.chain().focus().setTextSelection(commentModalRange).setMark('comment', { commentId: markId }).run()
    await flushSave(activeNodeId).catch(() => undefined) // persiste subito il mark appena applicato
    const created = await window.mybook.comments.create(activeNodeId, markId, text)
    setComments((prev) => {
      const next = [...prev, created]
      refreshAnnotationPositions(next)
      return next
    })
    setCommentModalRange(null)
  }

  /** Salva la modifica del testo di un commento esistente: il mark nel documento non cambia, solo la riga in scene_comments. */
  const saveEditedComment = async (text: string) => {
    if (!editingComment) return
    const updated = { ...editingComment, text }
    await window.mybook.comments.update(editingComment.id, text)
    setComments((prev) => {
      const next = prev.map((c) => (c.id === editingComment.id ? updated : c))
      refreshAnnotationPositions(next)
      return next
    })
    setEditingComment(null)
  }

  /**
   * Rimuove un commento: sia la riga in scene_comments sia il mark dal
   * documento (altrimenti resterebbe una sottolineatura "orfana" senza testo
   * associato).
   *
   * v0.3.4:
   *  - chiede prima conferma (come per le altre eliminazioni dell'app);
   *  - fix sottolineatura residua: il mark viene rimosso da TUTTI i nodi di
   *    testo che lo portano, non solo dal primo (vedi removeMarkOccurrences).
   *    Il mark è cercato per commentId su tutto il documento invece di
   *    richiedere una posizione esatta, più robusto rispetto a spostamenti
   *    del testo avvenuti dopo la creazione del commento.
   */
  const deleteComment = async (comment: SceneComment) => {
    if (!editor || !activeNodeId) return
    const ok = await confirm({
      message: 'Eliminare questo commento? Il testo commentato resta, ma perde la sottolineatura.',
      confirmLabel: 'Elimina',
      danger: true
    })
    if (!ok) return

    const commentMark = editor.schema.marks.comment
    let removed = 0
    editor
      .chain()
      .command(({ tr }) => {
        removed = removeMarkOccurrences(tr, commentMark, { commentId: comment.mark_id })
        return removed > 0
      })
      .run()
    if (removed > 0) await flushSave(activeNodeId).catch(() => undefined)

    await window.mybook.comments.delete(comment.id)
    setComments((prev) => {
      const next = prev.filter((c) => c.id !== comment.id)
      refreshAnnotationPositions(next)
      return next
    })
  }

  /** Apre il picker per il tipo di entità scelto nel menu contestuale nativo, precaricandone l'elenco (o le note per la scelta rapida di un evento). */
  const openTagPicker = async (entityType: EntityTagType) => {
    if (!activeProjectId) return
    let items: { id: string; name: string }[] = []
    if (entityType === 'character') items = (await window.mybook.characters.list(activeProjectId)).map((c: any) => ({ id: c.id, name: c.name }))
    else if (entityType === 'location') items = (await window.mybook.locations.list(activeProjectId)).map((l: any) => ({ id: l.id, name: l.name }))
    else if (entityType === 'object') items = (await window.mybook.objects.list(activeProjectId)).map((o: any) => ({ id: o.id, name: o.name }))
    else if (entityType === 'event') {
      const timelines = await window.mybook.timelines.list(activeProjectId)
      const allEvents = await Promise.all(timelines.map((t: any) => window.mybook.timelineEvents.list(t.id)))
      items = allEvents.flat().map((e: any) => ({ id: e.id, name: e.title }))
    }
    setTagPickerItems(items)
    setTagPickerType(entityType)
  }

  const applyEntityTag = (item: { id: string; name: string }) => {
    if (!editor || !tagPickerType || editor.state.selection.empty) {
      setTagPickerType(null)
      return
    }
    editor.chain().focus().setMark('entityTag', { entityType: tagPickerType, entityId: item.id }).run()
    setEntityNameCache((prev) => ({ ...prev, [`${tagPickerType}:${item.id}`]: item.name }))
    setTagPickerType(null)
    // Il mark è appena stato applicato in questo stesso tick: la scansione può girare subito.
    setTimeout(() => refreshAnnotationPositions(), 0)
  }

  const requestEntitySelect = useEntityNavigationStore((s) => s.requestSelect)
  const navigateToEntity = (entityType: EntityTagType, entityId: string) => {
    requestEntitySelect(entityType, entityId)
    const routes: Record<EntityTagType, string> = {
      character: '/characters',
      location: '/locations',
      object: '/objects',
      event: '/timeline'
    }
    navigate(routes[entityType])
  }

  if (!activeNodeId || !editor || !activeNode) {
    return <div className="p-6 text-sm text-gray-400">Seleziona una scena dall'albero a sinistra.</div>
  }

  const isReadOnly = activeNode.status === 'completo'

  return (
    <div className="flex h-full flex-col">
      {/* Intestazione + toolbar: sticky in cima all'area scrollabile, sempre visibile durante la scrittura. */}
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white px-6 pt-4 dark:border-gray-700">
        <div className="mb-2 flex items-center justify-between gap-4">
          {/* Capitolo e titolo scena ora sulla stessa riga (prima il capitolo
              stava su una riga separata sopra): il prefisso capitolo è un'
              etichetta non editabile, il titolo resta un campo modificabile. */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {parentChapter && (
              <span
                className="shrink-0 truncate text-xs font-medium uppercase tracking-wide text-gray-400"
                title={parentChapter.title}
              >
                {parentChapter.title}
                <span className="mx-1.5 text-gray-300 dark:text-gray-600">/</span>
              </span>
            )}
            {/* key forza il remount dell'input al cambio scena: senza, React riusa
                lo stesso nodo DOM e defaultValue resta bloccato al primo valore
                mostrato, indipendentemente dalla scena selezionata in seguito. */}
            <input
              key={activeNode.id}
              className="min-w-0 flex-1 bg-transparent text-lg font-medium outline-none"
              defaultValue={activeNode.title}
              onBlur={(e) => {
                window.mybook.documents.update(activeNodeId, { title: e.target.value })
                patchNodeLocally(activeNodeId, { title: e.target.value })
              }}
            />
          </div>
          {/* Selettore Stato con pallini colorati (come nell'albero): un <select> nativo non può mostrare grafica dentro le <option>, da qui il componente dedicato. */}
          <StatusSelect value={activeNode.status} onChange={updateStatus} />
          <button
            onClick={handleManualSave}
            disabled={saveState === 'saved' || isReadOnly}
            className="shrink-0 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:bg-gray-300"
          >
            {saveState === 'saving' ? 'Salvataggio…' : saveState === 'pending' ? 'Salva' : 'Salvato ✓'}
          </button>
          <div className="shrink-0 text-right text-xs text-gray-400">
            <div>{liveCounts.words} parole · {liveCounts.chars} caratteri</div>
            {lastSavedAt && <div>Salvato alle {formatTimestamp(lastSavedAt)}</div>}
          </div>
        </div>

        {isReadOnly && (
          <div className="mb-2 flex items-center gap-1.5 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
            <Lock size={12} />
            Testo non editabile: la scena è contrassegnata come "Finito". Riporta lo stato su
            "Revisione" per modificarla.
          </div>
        )}

        <div className="mb-2 flex items-center gap-3 text-xs text-gray-500">
          {/* v0.3.5: l'etichetta del pannello è in grassetto quando è espanso, così si vede a colpo d'occhio quale sezione è aperta. */}
          <button
            onClick={() => setShowDetails((v) => !v)}
            className={`flex items-center gap-1 hover:text-gray-800 ${showDetails ? 'font-semibold text-gray-800 dark:text-gray-200' : ''}`}
          >
            {showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            Dettagli scena
          </button>
          {editorPrefs.commentsEnabled && (
            <button
              onClick={() => {
                setShowComments((v) => !v)
                if (!showComments) refreshAnnotationPositions() // aggiorna sempre all'apertura
              }}
              className={`flex items-center gap-1 hover:text-gray-800 ${showComments ? 'font-semibold text-gray-800 dark:text-gray-200' : ''}`}
            >
              <MessageSquare size={12} />
              {commentEntries.length} {commentEntries.length === 1 ? 'commento' : 'commenti'}
            </button>
          )}
          {editorPrefs.tagsEnabled && (
            <button
              onClick={() => {
                setShowTags((v) => !v)
                if (!showTags) refreshAnnotationPositions() // aggiorna sempre all'apertura
              }}
              className={`flex items-center gap-1 hover:text-gray-800 ${showTags ? 'font-semibold text-gray-800 dark:text-gray-200' : ''}`}
            >
              <TagIcon size={12} />
              {tagEntries.length} tag
            </button>
          )}
          {editorPrefs.revisionsEnabled && (
            <button
              onClick={() => {
                setShowRevisions((v) => !v)
                if (!showRevisions) loadRevisions(activeNodeId) // aggiorna sempre all'apertura
              }}
              className={`flex items-center gap-1 hover:text-gray-800 ${showRevisions ? 'font-semibold text-gray-800 dark:text-gray-200' : ''}`}
            >
              <History size={12} />
              {revisions.length} {revisions.length === 1 ? 'revisione' : 'revisioni'}
            </button>
          )}
        </div>

        {showDetails && (
          <div className="mb-3 space-y-3 rounded border border-gray-100 bg-gray-50 p-3">
            {parentChapter && (
              <div className="rounded border border-gray-200 bg-white p-2">
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Capitolo: {parentChapter.title}
                </div>
                {parentChapter.subtitle && (
                  <div className="text-xs text-gray-500">{parentChapter.subtitle}</div>
                )}
                {parentChapter.description && (
                  <div className="mt-1 text-xs text-gray-600">{parentChapter.description}</div>
                )}
                {parentChapter.notes && (
                  <div className="mt-1 text-xs italic text-gray-400">{parentChapter.notes}</div>
                )}
              </div>
            )}
            <input
              key={`subtitle-${activeNode.id}`}
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              placeholder="Sottotitolo scena (opzionale)"
              defaultValue={activeNode.subtitle}
              onBlur={(e) => updateField('subtitle', e.target.value)}
            />
            <AutosizeTextarea
              key={`description-${activeNode.id}`}
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              placeholder="Descrizione scena"
              rows={2}
              defaultValue={activeNode.description}
              onBlur={(e) => updateField('description', e.target.value)}
            />
            <AutosizeTextarea
              key={`notes-${activeNode.id}`}
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
              placeholder="Note scena"
              rows={2}
              defaultValue={activeNode.notes}
              onBlur={(e) => updateField('notes', e.target.value)}
            />
          </div>
        )}

        {showComments && (
          <div className="mb-3 max-h-48 overflow-auto rounded border border-gray-100">
            {commentEntries.length === 0 ? (
              <p className="p-3 text-xs text-gray-400">Nessun commento su questa scena.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {commentEntries.map(({ comment, from, to }) => (
                  <li key={comment.id} className="flex items-start justify-between gap-2 px-3 py-1.5 text-xs">
                    <button
                      onClick={() => jumpToRange(from, to)}
                      className="min-w-0 flex-1 text-left hover:underline"
                      title="Vai al punto del testo commentato"
                    >
                      <div className="text-gray-700">{comment.text}</div>
                      <div className="mt-0.5 text-gray-400">{new Date(comment.created_at).toLocaleString('it-IT')}</div>
                    </button>
                    <div className="flex shrink-0 gap-1">
                      <button
                        onClick={() => setEditingComment(comment)}
                        className="text-gray-300 hover:text-blue-600"
                        title="Modifica commento"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => void deleteComment(comment)}
                        className="text-gray-300 hover:text-red-600"
                        title="Elimina commento"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {showTags && (
          <div className="mb-3 max-h-48 overflow-auto rounded border border-gray-100">
            {tagEntries.length === 0 ? (
              <p className="p-3 text-xs text-gray-400">Nessun tag su questa scena.</p>
            ) : (
              <>
                <div className="grid grid-cols-[8fr_2fr_auto] gap-2 border-b border-gray-100 bg-gray-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  <span>Testo taggato</span>
                  <span>Tag</span>
                  <span>Tipo</span>
                </div>
                <ul className="divide-y divide-gray-100">
                  {tagEntries.map((t, i) => (
                    <li key={`${t.entityType}-${t.entityId}-${i}`}>
                      <button
                        onClick={() => jumpToRange(t.from, t.to)}
                        className="grid w-full grid-cols-[8fr_2fr_auto] items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-gray-50"
                        title="Vai al punto del testo taggato"
                      >
                        <span className="min-w-0 truncate text-gray-700">{t.taggedText || '—'}</span>
                        <span className="flex min-w-0 items-center gap-1.5 truncate text-gray-700">
                          <span className={`h-2 w-2 shrink-0 rounded-full mybook-entity-dot--${t.entityType}`} />
                          <span className="min-w-0 truncate">{t.name}</span>
                        </span>
                        <span className="shrink-0 text-gray-400">{TAG_TYPE_LABEL[t.entityType]}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {showRevisions && (
          <div className="mb-3 max-h-48 overflow-auto rounded border border-gray-100">
            {revisions.length === 0 ? (
              <p className="p-3 text-xs text-gray-400">Nessuna revisione ancora salvata.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {revisions.map((r, i) => {
                  // revisions è ordinato DESC (più recente prima): il diff si
                  // calcola rispetto alla revisione cronologicamente precedente,
                  // cioè quella al'indice successivo nell'array.
                  const older = revisions[i + 1]
                  const diff = older ? r.word_count - older.word_count : 0
                  return (
                    <li key={r.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                      <span className="flex items-center gap-1.5">
                        {new Date(r.created_at).toLocaleString('it-IT')} — {r.reason} · {r.word_count} parole
                        <WordDiffBadge diff={diff} />
                      </span>
                      <button
                        onClick={() => handleRestoreRevision(r.id)}
                        className="shrink-0 text-blue-600 hover:underline"
                      >
                        Ripristina
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

        <EditorToolbar editor={editor} disabled={isReadOnly} visibleTools={editorPrefs.toolbarTools} onInsertImage={insertImage} />
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        <div
          // v0.3.9: colori personalizzabili per tema (Impostazioni > Editor). Lo stile inline vince sulle regole CSS di styles/index.css (.editor-surface, .dark .editor-surface), che restano come ripiego con gli stessi valori di default.
          style={{ backgroundColor: editorPrefs.editorBackground }}
          className={`editor-surface rounded-lg border border-gray-200 p-6 shadow-sm dark:border-gray-700 ${
            editorPrefs.tagsEnabled ? '' : 'mybook-tags-hidden'
          } ${editorPrefs.commentsEnabled ? '' : 'mybook-comments-hidden'}`}
        >
          <EditorContent
            editor={editor}
            style={{ color: editorPrefs.editorTextColor }}
            className={`prose max-w-none ${FONT_SIZE_CLASS[editorPrefs.fontSize]}`}
          />
        </div>
      </div>

      {tagPickerType && (
        <TagPickerModal
          entityType={tagPickerType}
          items={tagPickerItems}
          onSelect={applyEntityTag}
          onClose={() => setTagPickerType(null)}
        />
      )}

      {commentModalRange && (
        <CommentModal onSave={(text) => void saveNewComment(text)} onClose={() => setCommentModalRange(null)} />
      )}

      {editingComment && (
        <CommentModal
          initialText={editingComment.text}
          onSave={(text) => void saveEditedComment(text)}
          onClose={() => setEditingComment(null)}
        />
      )}
    </div>
  )
}

function safeParse(json: string) {
  try {
    return JSON.parse(json)
  } catch {
    return ''
  }
}
