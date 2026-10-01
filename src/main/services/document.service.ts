import { v4 as uuid } from 'uuid'
import type { DocumentRepository } from '../database/repositories/document.repository'
import type {
  CreateDocumentNodeInput,
  UpdateDocumentNodeInput
} from '@shared/schemas/document.schema'
import { getConfig } from '../config'

/** Estrae testo semplice da un documento TipTap JSON, per contare parole/caratteri. */
import { extractParagraphs, analyzeText } from '@shared/textAnalysis'
import { findAllEntityTagOccurrences } from '@shared/entityTagScan'
import { getRootItems, getChaptersOfGroup } from '@shared/manuscriptTree'
import type { SceneTagsRepository } from '../database/repositories/scene-tags.repository'

function extractPlainText(tiptapJson: string): string {
  try {
    const doc = JSON.parse(tiptapJson)
    const parts: string[] = []
    const walk = (node: any): void => {
      if (!node) return
      if (node.type === 'text' && typeof node.text === 'string') parts.push(node.text)
      if (Array.isArray(node.content)) node.content.forEach(walk)
    }
    walk(doc)
    return parts.join(' ')
  } catch {
    // content non ancora valorizzato come TipTap JSON (es. nodo appena creato)
    return ''
  }
}

function countWords(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
}

export class DocumentService {
  constructor(
    private repo: DocumentRepository,
    private sceneTagsRepo: SceneTagsRepository
  ) {}

  getTree(projectId: string) {
    return this.repo.tree(projectId)
  }

  create(input: CreateDocumentNodeInput) {
    const id = uuid()
    const parentId = input.parentId ?? null
    const orderIndex = this.repo.maxOrderIndex(input.projectId, parentId) + 1
    this.repo.insert({
      id,
      projectId: input.projectId,
      parentId,
      nodeType: input.nodeType,
      title: input.title,
      subtitle: input.subtitle ?? '',
      description: input.description ?? '',
      notes: input.notes ?? '',
      orderIndex
    })
    return this.repo.findById(id)
  }

  /**
   * Aggiorna un nodo. Se il contenuto TipTap cambia, ricalcola le statistiche
   * cache (word_count/char_count) — le statistiche restano comunque derivabili
   * dal contenuto, questa è solo una cache per le query aggregate (sezione 9).
   */
  update(input: UpdateDocumentNodeInput) {
    const patch: Record<string, unknown> = { ...input.fields }
    const contentChanged = typeof input.fields.content === 'string'
    if (contentChanged) {
      const text = extractPlainText(input.fields.content as string)
      patch.word_count = countWords(text)
      patch.char_count = text.length
    }
    // SQLite/better-sqlite3 non supporta il binding di booleani JS: vanno
    // convertiti in 0/1 (stessa convenzione già usata in settings.service.ts).
    if (typeof input.fields.locked === 'boolean') {
      patch.locked = input.fields.locked ? 1 : 0
    }
    this.repo.update(input.id, patch)
    const node = this.repo.findById(input.id)
    // v0.3.8: ogni volta che il testo di una scena cambia, l'indice
    // scene_tags viene rigenerato dal contenuto appena salvato (unica fonte
    // usata da Analisi e dal pannello "Dove compare" — vedi migrazione
    // 019_scene_tags.sql). Non serve rifarlo per gli altri campi (titolo,
    // stato...), che non toccano i tag nel testo.
    if (node && contentChanged) this.syncSceneTags(node)
    return node
  }

  /** Ricostruisce scene_tags per una scena dal suo contenuto attuale. No-op per capitoli/gruppi (non hanno testo proprio). */
  private syncSceneTags(node: { id: string; project_id: string; node_type: string; content?: string | null }): void {
    if (node.node_type !== 'scene' && node.node_type !== 'section') return
    this.sceneTagsRepo.replaceForScene(node.id, node.project_id, findAllEntityTagOccurrences(node.content ?? ''))
  }

  move(id: string, newParentId: string | null, newOrderIndex: number) {
    this.repo.update(id, { parent_id: newParentId, order_index: newOrderIndex })
    return this.repo.findById(id)
  }

  /** Riordino drag&drop di capitoli tra loro, o scene all'interno dello stesso capitolo (o spostate in uno diverso). */
  reorder(orderedIds: string[], movedNodeId?: string, newParentId?: string | null) {
    this.repo.reorder(orderedIds, movedNodeId, newParentId)
  }

  delete(id: string) {
    this.repo.delete(id)
  }

  /**
   * Duplica un nodo (capitolo o scena) e, ricorsivamente, tutti i suoi figli
   * (le scene di un capitolo) — usato da "Crea copia" nell'albero del
   * manoscritto. Solo il nodo di primo livello riceve il suffisso "(copia)":
   * applicarlo anche alle scene copiate insieme al capitolo produrrebbe
   * titoli ridondanti tipo "Capitolo 1 (copia) / Scena 1 (copia)".
   * La copia viene inserita in coda ai fratelli (stesso comportamento di
   * "+ Nuovo capitolo"/"+ Aggiungi scena"): l'utente può poi trascinarla
   * nella posizione desiderata con il drag&drop già presente nell'albero.
   */
  duplicate(id: string) {
    const original = this.repo.findById(id)
    if (!original) throw new Error(`DocumentNode non trovato: ${id}`)

    const copyNode = (node: NonNullable<typeof original>, parentId: string | null, isTop: boolean) => {
      const newId = uuid()
      const orderIndex = this.repo.maxOrderIndex(node.project_id, parentId) + 1
      this.repo.insert({
        id: newId,
        projectId: node.project_id,
        parentId,
        nodeType: node.node_type,
        title: isTop ? `${node.title} (copia)` : node.title,
        subtitle: node.subtitle,
        description: node.description,
        notes: node.notes,
        orderIndex
      })
      // insert() valorizza solo i campi "di creazione": content/word_count/
      // char_count di un nodo nuovo partono vuoti (vedi schema tabella) e
      // vanno copiati con un update separato.
      if (node.content) {
        this.repo.update(newId, { content: node.content, word_count: node.word_count, char_count: node.char_count })
        // v0.3.8: la copia eredita anche i tag della scena originale (stesso testo, stessi tag).
        this.syncSceneTags({ id: newId, project_id: node.project_id, node_type: node.node_type, content: node.content })
      }
      for (const child of this.repo.children(node.id)) {
        copyNode(child, newId, false)
      }
      return this.repo.findById(newId)!
    }

    return copyNode(original, original.parent_id, true)
  }

  /**
   * Crea una revisione immutabile del contenuto corrente. Chiamata da:
   * autosave dopo pausa significativa, cambio nodo attivo, chiusura app,
   * o richiesta manuale (sezione 7). Ogni N revisioni crea anche uno
   * snapshot completo per accelerare i restore futuri.
   */
  createRevision(documentNodeId: string, reason: string) {
    const node = this.repo.findById(documentNodeId)
    if (!node) throw new Error(`DocumentNode non trovato: ${documentNodeId}`)

    const revisionId = uuid()
    this.repo.insertRevision({
      id: revisionId,
      documentNodeId,
      content: node.content,
      reason,
      wordCount: node.word_count,
      charCount: node.char_count
    })

    const revisionCount = this.repo.countRevisionsSince(documentNodeId)
    const { snapshotEveryNRevisions } = getConfig().versioning
    if (revisionCount % snapshotEveryNRevisions === 0) {
      this.repo.insertSnapshot({
        id: uuid(),
        documentNodeId,
        revisionId,
        content: node.content
      })
    }

    return this.repo.findRevision(revisionId)
  }

  listRevisions(documentNodeId: string) {
    return this.repo.listRevisions(documentNodeId)
  }

  /**
   * Il restore NON cancella la cronologia: applica il contenuto della
   * revisione scelta al nodo corrente e crea a sua volta una nuova
   * revisione con reason='restore', così la storia resta append-only.
   */
  compareRevisions(revisionIdA: string, revisionIdB: string) {
    const a = this.repo.findRevision(revisionIdA)
    const b = this.repo.findRevision(revisionIdB)
    if (!a || !b) throw new Error('Una delle revisioni non esiste')
    if (a.document_node_id !== b.document_node_id) throw new Error('Le revisioni appartengono a documenti diversi')
    const linesA = extractPlainText(a.content).split(/\n|(?<=[.!?])\s+/).filter(Boolean)
    const linesB = extractPlainText(b.content).split(/\n|(?<=[.!?])\s+/).filter(Boolean)
    const m=linesA.length,n=linesB.length; const dp=Array.from({length:m+1},()=>Array(n+1).fill(0))
    for(let i=m-1;i>=0;i--) for(let j=n-1;j>=0;j--) dp[i][j]=linesA[i]===linesB[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1])
    const diff:Array<{type:'equal'|'add'|'remove';text:string}>=[]; let i=0,j=0
    while(i<m||j<n){
      if(i<m&&j<n&&linesA[i]===linesB[j]){diff.push({type:'equal',text:linesA[i]});i++;j++}
      else if(j<n&&(i===m||dp[i][j+1]>=dp[i+1][j])){diff.push({type:'add',text:linesB[j++]})}
      else if(i<m){diff.push({type:'remove',text:linesA[i++]})}
    }
    return { revisionIdA, revisionIdB, documentNodeId: a.document_node_id, diff }
  }

  restoreRevision(revisionId: string) {
    const revision = this.repo.findRevision(revisionId)
    if (!revision) throw new Error(`Revisione non trovata: ${revisionId}`)

    this.repo.update(revision.document_node_id, {
      content: revision.content,
      word_count: revision.word_count,
      char_count: revision.char_count
    })

    return this.createRevision(revision.document_node_id, 'restore')
  }

  projectStatistics(projectId: string) {
    const totals = this.repo.projectStatistics(projectId)
    const completionPct =
      totals.totalNodes > 0 ? Math.round((totals.completedNodes / totals.totalNodes) * 100) : 0
    // v0.3.6: "spazi esclusi" non ha una colonna cache dedicata (solo
    // char_count, "spazi inclusi", viene mantenuto ad ogni salvataggio):
    // si calcola qui al volo dal contenuto vero, con la stessa definizione
    // di extractPlainText usata per char_count, per restare coerenti.
    const totalCharsWithoutSpaces = this.repo
      .allSceneContents(projectId)
      .reduce((sum, content) => sum + extractPlainText(content).replace(/\s/g, '').length, 0)
    // v0.3.8: un capitolo è "completato" quando TUTTE le sue scene sono in
    // stato Finito — e ne ha almeno una: un capitolo senza scene non ha
    // nulla da completare, contarlo come "completato" sarebbe fuorviante.
    const chapterRows = this.repo.chapterBreakdown(projectId)
    const chaptersCompleted = chapterRows.filter((c) => c.sceneCount > 0 && c.completo === c.sceneCount).length
    return { ...totals, completionPct, totalCharsWithoutSpaces, chaptersCompleted, chaptersTotal: chapterRows.length }
  }

  chapterBreakdown(projectId: string) {
    const rows = this.repo.chapterBreakdown(projectId)
    return this.sortByManuscriptOrder(projectId, rows, (row) => row.chapterId)
  }

  /**
   * Id dei capitoli nell'ordine reale del Manoscritto (v0.3.7): prima i
   * capitoli fuori da un gruppo e i gruppi (nell'ordine dei loro
   * order_index, che condividono lo stesso spazio essendo tutti a
   * parent_id NULL — vedi getRootItems), poi, per ogni gruppo, i suoi
   * capitoli. Riusa le stesse funzioni pure di ChapterTree.tsx così
   * l'ordine mostrato in Statistiche coincide sempre con quello
   * dell'albero, invece di ordinare solo per order_index globale (che
   * darebbe un ordine sbagliato quando i capitoli sono divisi tra gruppi
   * diversi, ciascuno con la propria numerazione a partire da zero).
   */
  private orderedChapterIds(projectId: string): string[] {
    const tree = this.repo.tree(projectId)
    const ids: string[] = []
    for (const rootItem of getRootItems(tree)) {
      if (rootItem.node_type === 'chapter') ids.push(rootItem.id)
      else if (rootItem.node_type === 'group') {
        for (const chapter of getChaptersOfGroup(tree, rootItem.id)) ids.push(chapter.id)
      }
    }
    return ids
  }

  /** Riordina `rows` secondo orderedChapterIds; righe per capitoli non trovati nell'albero (caso limite) restano in fondo, nell'ordine originale. */
  private sortByManuscriptOrder<T>(projectId: string, rows: T[], chapterIdOf: (row: T) => string): T[] {
    const order = this.orderedChapterIds(projectId)
    const indexOf = new Map(order.map((id, i) => [id, i]))
    return [...rows].sort((a, b) => (indexOf.get(chapterIdOf(a)) ?? Infinity) - (indexOf.get(chapterIdOf(b)) ?? Infinity))
  }

  /** Nodo grezzo per id, usato dal registro attività (v0.3.5) per leggere titolo/tipo prima di un'eliminazione. */
  get(id: string) {
    return this.repo.findById(id)
  }

  /**
   * Analisi testuale (v0.3.5, scheda Statistiche > Analisi): totali di
   * progetto e spaccato per capitolo. Ogni capitolo unisce il contenuto di
   * tutte le sue scene (nell'ordine del Manoscritto) e lo analizza con
   * analyzeText; i totali di progetto si ottengono concatenando a loro volta
   * i paragrafi di tutti i capitoli, così le parole chiave sono calcolate
   * sull'intero testo e non sommando frequenze parziali capitolo per
   * capitolo (che darebbe risultati diversi in caso di pareggio).
   */
  analysis(projectId: string) {
    const chapters = this.repo.chapterContents(projectId)
    // v0.3.8: i conteggi dei tag per capitolo vengono da scene_tags (indice
    // persistente, sempre aggiornato ad ogni salvataggio di una scena), non
    // più da una scansione del JSON di ogni scena ad ogni richiesta.
    const tagsByChapter = new Map<string, { entityType: string; entityId: string; count: number }[]>()
    for (const row of this.sceneTagsRepo.countsByChapter(projectId)) {
      const list = tagsByChapter.get(row.chapterId) ?? []
      list.push({ entityType: row.entityType, entityId: row.entityId, count: row.count })
      tagsByChapter.set(row.chapterId, list)
    }
    const perChapter = chapters.map((c) => {
      const paragraphs = c.sceneContents.flatMap((content) => extractParagraphs(content))
      const tags = (tagsByChapter.get(c.chapterId) ?? []).sort((a, b) => b.count - a.count)
      return { chapterId: c.chapterId, chapterTitle: c.chapterTitle, ...analyzeText(paragraphs), tags }
    })
    const allParagraphs = chapters.flatMap((c) => c.sceneContents.flatMap((content) => extractParagraphs(content)))
    return { total: analyzeText(allParagraphs), chapters: this.sortByManuscriptOrder(projectId, perChapter, (c) => c.chapterId) }
  }

  /**
   * Dove compare, nel Manoscritto, un tag verso un'entità (personaggio/
   * località/oggetto) — v0.3.6, pannello a destra della scheda entità.
   * v0.3.8: legge direttamente da scene_tags invece di riaprire e
   * rianalizzare il contenuto di ogni scena ad ogni richiesta. Un'occorrenza
   * per riga (non una riga per scena): se un'entità è taggata tre volte
   * nella stessa scena, produce tre righe, ciascuna con il proprio
   * occurrenceIndex per poter saltare esattamente a QUELLA occorrenza.
   */
  findEntityTagUsages(projectId: string, entityType: string, entityId: string) {
    return this.sceneTagsRepo.usagesForEntity(projectId, entityType, entityId)
  }
}
