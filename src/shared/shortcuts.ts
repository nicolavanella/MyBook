/**
 * MyBook — scorciatoie da tastiera dell'editor (v0.4.0).
 *
 * Modulo PURO (nessuna dipendenza da React/DOM/Electron) così da poterlo
 * testare per intero con vitest. Contiene:
 *   - il catalogo delle AZIONI configurabili e i loro default;
 *   - il formato canonico delle combinazioni ("Mod+Shift+B");
 *   - conversione evento-tastiera → combinazione, validazione, conflitti;
 *   - la risoluzione "default + personalizzazioni dell'utente".
 *
 * Scelte (vedi CHANGELOG 0.4.0):
 *
 * 1. Una scorciatoia per AZIONE, non per strumento: "Titolo", "Liste",
 *    "Allineamento", "Dialoghi" e "Zoom" raggruppano più azioni.
 *
 * 2. Formato canonico `Mod+Alt+Shift+Tasto`, modificatori sempre in
 *    quest'ordine. `Mod` = Ctrl su Windows/Linux, Cmd (⌘) su macOS: si salva
 *    "Mod" e non "Ctrl", così le impostazioni restano valide su qualunque
 *    sistema (e se il database viene copiato da un PC a un Mac).
 *
 * 3. Il tasto si ricava da `event.code` (posizione fisica: KeyB, Digit7…) e
 *    NON da `event.key`: con Shift o Alt il carattere prodotto cambia
 *    secondo il layout (Shift+7 è "/" su tastiera italiana, Alt+1 è "¡" su
 *    Mac) e la scorciatoia non sarebbe più riconoscibile.
 *
 * 4. Si salvano solo le PERSONALIZZAZIONI (override), non l'intera mappa:
 *    se una versione futura aggiunge un'azione, chi non ha toccato nulla
 *    riceve subito il suo default. Valore "" = azione volutamente senza
 *    scorciatoia.
 *
 * 5. AltGr: su Windows AltGr è riportato come Ctrl+Alt, quindi una
 *    scorciatoia "Mod+Alt+…" scatterebbe mentre si digita un carattere con
 *    AltGr (es. le parentesi quadre su tastiera italiana). Gli eventi con
 *    AltGraph attivo sono quindi ignorati: sono testo, non comandi.
 */

// ───────────────────────────── Catalogo azioni ─────────────────────────────

/** Strumento della toolbar a cui un'azione appartiene (serve a raggrupparle nelle Impostazioni). */
export type ShortcutTool =
  | 'zoom' | 'undo' | 'redo' | 'heading' | 'bold' | 'italic' | 'underline' | 'strike'
  | 'clearFormatting' | 'lists' | 'alignment' | 'dialogues' | 'blockquote'
  | 'pageSeparator' | 'link' | 'image' | 'search'

export interface ShortcutActionDef {
  id: string
  tool: ShortcutTool
  /** Combinazione predefinita ("" = nessuna). I valori coincidono con le scorciatoie native di TipTap, così chi non personalizza nulla non nota differenze. */
  default: string
}

/**
 * Elenco ordinato delle azioni. L'ordine conta: determina la presentazione
 * nelle Impostazioni e, in caso di collisione fra due personalizzazioni
 * salvate, quale delle due prevale (la prima).
 */
export const SHORTCUT_ACTIONS = [
  { id: 'undo', tool: 'undo', default: 'Mod+Z' },
  { id: 'redo', tool: 'redo', default: 'Mod+Y' },
  { id: 'zoomIn', tool: 'zoom', default: 'Mod+=' },
  { id: 'zoomOut', tool: 'zoom', default: 'Mod+-' },
  { id: 'zoomReset', tool: 'zoom', default: 'Mod+0' },
  { id: 'paragraph', tool: 'heading', default: 'Mod+Alt+0' },
  { id: 'heading1', tool: 'heading', default: 'Mod+Alt+1' },
  { id: 'heading2', tool: 'heading', default: 'Mod+Alt+2' },
  { id: 'heading3', tool: 'heading', default: 'Mod+Alt+3' },
  { id: 'bold', tool: 'bold', default: 'Mod+B' },
  { id: 'italic', tool: 'italic', default: 'Mod+I' },
  { id: 'underline', tool: 'underline', default: 'Mod+U' },
  { id: 'strike', tool: 'strike', default: 'Mod+Shift+S' },
  { id: 'clearFormatting', tool: 'clearFormatting', default: 'Mod+\\' },
  { id: 'bulletList', tool: 'lists', default: 'Mod+Shift+8' },
  { id: 'orderedList', tool: 'lists', default: 'Mod+Shift+7' },
  { id: 'alignLeft', tool: 'alignment', default: 'Mod+Shift+L' },
  { id: 'alignCenter', tool: 'alignment', default: 'Mod+Shift+E' },
  { id: 'alignRight', tool: 'alignment', default: 'Mod+Shift+R' },
  { id: 'alignJustify', tool: 'alignment', default: 'Mod+Shift+J' },
  // Dialoghi: nessun default. Le combinazioni "naturali" (Mod+Alt+lettera) collidono con AltGr
  // su molte tastiere europee; meglio lasciare scegliere all'utente che imporne una scomoda.
  { id: 'dialogueGuillemets', tool: 'dialogues', default: '' },
  { id: 'dialogueQuotes', tool: 'dialogues', default: '' },
  { id: 'dialogueDash', tool: 'dialogues', default: '' },
  { id: 'blockquote', tool: 'blockquote', default: 'Mod+Shift+B' },
  { id: 'pageSeparator', tool: 'pageSeparator', default: '' },
  { id: 'link', tool: 'link', default: 'Mod+K' },
  { id: 'image', tool: 'image', default: '' },
  { id: 'find', tool: 'search', default: 'Mod+F' },
  { id: 'replace', tool: 'search', default: 'Mod+H' }
] as const satisfies readonly ShortcutActionDef[]

export type ShortcutActionId = (typeof SHORTCUT_ACTIONS)[number]['id']

export const SHORTCUT_ACTION_IDS: readonly ShortcutActionId[] = SHORTCUT_ACTIONS.map((a) => a.id)

/** Azioni che non modificano il testo: restano disponibili anche con la scena bloccata ("Finito"). */
export const VIEW_ONLY_ACTIONS: ReadonlySet<ShortcutActionId> = new Set<ShortcutActionId>([
  'zoomIn', 'zoomOut', 'zoomReset', 'find', 'replace'
])

/**
 * Scorciatoie aggiuntive, NON configurabili, che l'editor già rispondeva
 * prima della 0.4.0 (TipTap/ProseMirror le registra da solo). Restano attive
 * finché la combinazione non viene assegnata a un'altra azione.
 */
const FIXED_ALIASES: Partial<Record<ShortcutActionId, readonly string[]>> = {
  redo: ['Mod+Shift+Z']
}

/** Tutte le azioni che hanno uno strumento della toolbar → utile alle Impostazioni per mostrare le scorciatoie accanto a ogni strumento. */
export function actionsOfTool(tool: ShortcutTool): ShortcutActionId[] {
  return SHORTCUT_ACTIONS.filter((a) => a.tool === tool).map((a) => a.id)
}

export function defaultShortcutOf(id: ShortcutActionId): string {
  return SHORTCUT_ACTIONS.find((a) => a.id === id)?.default ?? ''
}

// ───────────────────────────── Formato canonico ─────────────────────────────

/** Combinazioni riservate: appartengono al sistema/Chromium (appunti, seleziona tutto) e non vanno intercettate. */
const RESERVED: ReadonlySet<string> = new Set(['Mod+C', 'Mod+V', 'Mod+X', 'Mod+A'])

/** Traduzione di event.code → token del tasto (solo tasti che hanno senso in una scorciatoia). */
const CODE_TO_KEY: Record<string, string> = {
  Equal: '=', Minus: '-', Backslash: '\\', BracketLeft: '[', BracketRight: ']',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backquote: '`',
  Enter: 'Enter', Tab: 'Tab', Space: 'Space', Backspace: 'Backspace', Delete: 'Delete',
  Insert: 'Insert', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown',
  ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight'
}

const NAMED_KEYS: ReadonlySet<string> = new Set(
  Object.values(CODE_TO_KEY).filter((k) => k.length > 1)
)
const PUNCTUATION_KEYS: ReadonlySet<string> = new Set(
  Object.values(CODE_TO_KEY).filter((k) => k.length === 1)
)

/** Tasto "da solo" (senza modificatori) già utilizzabile? Solo F1–F12 e tasti di navigazione: lettere/cifre/punteggiatura scriverebbero testo. */
function isStandaloneKey(key: string): boolean {
  return /^F([1-9]|1[0-2])$/.test(key)
}

function isValidKeyToken(key: string): boolean {
  return (
    /^[A-Z0-9]$/.test(key) ||
    /^F([1-9]|1[0-2])$/.test(key) ||
    NAMED_KEYS.has(key) ||
    PUNCTUATION_KEYS.has(key)
  )
}

export interface ParsedShortcut {
  mod: boolean
  alt: boolean
  shift: boolean
  key: string
}

/** Scompone una combinazione; null se la sintassi non è valida. Non verifica regole d'uso (vedi validateShortcut). */
export function parseShortcut(input: string): ParsedShortcut | null {
  if (typeof input !== 'string' || input.length === 0) return null
  // Nessun token è "+": il tasto = si salva come "=" (vedi CODE_TO_KEY), quindi split('+') è sicuro.
  const parts = input.split('+')
  const key = parts[parts.length - 1]
  const modifiers = parts.slice(0, -1)
  if (!isValidKeyToken(key)) return null
  const seen = new Set<string>()
  for (const m of modifiers) {
    if (m !== 'Mod' && m !== 'Alt' && m !== 'Shift') return null
    if (seen.has(m)) return null
    seen.add(m)
  }
  return { mod: seen.has('Mod'), alt: seen.has('Alt'), shift: seen.has('Shift'), key }
}

export function stringifyShortcut(p: ParsedShortcut): string {
  return [p.mod ? 'Mod' : null, p.alt ? 'Alt' : null, p.shift ? 'Shift' : null, p.key]
    .filter((x): x is string => x !== null)
    .join('+')
}

/** Riporta una combinazione scritta in qualunque ordine ("Shift+Mod+b") alla forma canonica; null se non valida. */
export function normalizeShortcut(input: string): string | null {
  if (typeof input !== 'string') return null
  const parts = input.split('+').map((p) => p.trim())
  if (parts.some((p) => p === '')) return null
  const rawKey = parts[parts.length - 1]
  const key = /^[a-z]$/.test(rawKey) ? rawKey.toUpperCase() : rawKey
  const parsed = parseShortcut([...parts.slice(0, -1), key].join('+'))
  return parsed ? stringifyShortcut(parsed) : null
}

export type ShortcutValidation =
  | { ok: true; shortcut: string }
  | { ok: false; reason: 'invalid' | 'needsModifier' | 'reserved' }

/**
 * Una scorciatoia è utilizzabile se ha almeno Mod o Alt (Shift da solo
 * produce solo lettere maiuscole: scriverebbe testo) oppure è un tasto F1–F12,
 * e non è fra le combinazioni riservate al sistema.
 */
export function validateShortcut(input: string): ShortcutValidation {
  const normalized = normalizeShortcut(input)
  if (!normalized) return { ok: false, reason: 'invalid' }
  const parsed = parseShortcut(normalized) as ParsedShortcut
  if (!parsed.mod && !parsed.alt && !isStandaloneKey(parsed.key)) return { ok: false, reason: 'needsModifier' }
  if (RESERVED.has(normalized)) return { ok: false, reason: 'reserved' }
  return { ok: true, shortcut: normalized }
}

// ───────────────────────────── Eventi tastiera ─────────────────────────────

/** Sottoinsieme di KeyboardEvent usato qui: permette di testare senza DOM. */
export interface KeyEventLike {
  code: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  shiftKey: boolean
  getModifierState?: (key: string) => boolean
}

function keyTokenFromCode(code: string): string | null {
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter) return letter[1]
  const digit = /^Digit([0-9])$/.exec(code)
  if (digit) return digit[1]
  if (/^F([1-9]|1[0-2])$/.test(code)) return code
  return CODE_TO_KEY[code] ?? null
}

/**
 * Converte un evento tastiera nella combinazione canonica, oppure null se:
 * è la pressione di un solo modificatore (l'utente sta ancora componendo la
 * combinazione), il tasto non è supportato, c'è un modificatore estraneo
 * (Ctrl su Mac, tasto Windows altrove) oppure AltGr è attivo (vedi nota 5).
 */
export function eventToShortcut(e: KeyEventLike, isMac: boolean): string | null {
  if (e.getModifierState?.('AltGraph')) return null
  const key = keyTokenFromCode(e.code)
  if (!key) return null
  // Il modificatore "Mod" è Cmd su Mac, Ctrl altrove; l'altro è un intruso e rende l'evento non una nostra scorciatoia.
  const mod = isMac ? e.metaKey : e.ctrlKey
  const stranger = isMac ? e.ctrlKey : e.metaKey
  if (stranger) return null
  return stringifyShortcut({ mod, alt: e.altKey, shift: e.shiftKey, key })
}

// ───────────────────────────── Visualizzazione ─────────────────────────────

const MAC_SYMBOLS: Record<string, string> = { Mod: '⌘', Alt: '⌥', Shift: '⇧' }
const KEY_DISPLAY: Record<string, string> = { Space: 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' }

/** Testo da mostrare all'utente: "Ctrl+Shift+B" su Windows/Linux, "⌘⇧B" su Mac. Stringa vuota → "". */
export function formatShortcut(shortcut: string, isMac: boolean): string {
  const parsed = parseShortcut(shortcut)
  if (!parsed) return ''
  const key = KEY_DISPLAY[parsed.key] ?? parsed.key
  if (isMac) {
    return [parsed.mod ? MAC_SYMBOLS.Mod : '', parsed.alt ? MAC_SYMBOLS.Alt : '', parsed.shift ? MAC_SYMBOLS.Shift : '', key].join('')
  }
  return [parsed.mod ? 'Ctrl' : null, parsed.alt ? 'Alt' : null, parsed.shift ? 'Shift' : null, key]
    .filter((x): x is string => x !== null)
    .join('+')
}

// ───────────────────────────── Risoluzione ─────────────────────────────

/** Personalizzazioni salvate: solo le azioni che l'utente ha cambiato. "" = nessuna scorciatoia. */
export type ShortcutOverrides = Partial<Record<ShortcutActionId, string>>
export type ResolvedShortcuts = Record<ShortcutActionId, string>

const KNOWN_IDS: ReadonlySet<string> = new Set(SHORTCUT_ACTION_IDS)

/**
 * Ripulisce un valore proveniente dal database o dall'IPC: scarta id
 * sconosciuti (azioni rimosse in una versione futura) e combinazioni non
 * valide, normalizza le altre. Non lancia mai: dati corrotti → "nessuna
 * personalizzazione" per quella voce, non un editor rotto.
 */
export function sanitizeShortcutOverrides(raw: unknown): ShortcutOverrides {
  const result: ShortcutOverrides = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!KNOWN_IDS.has(id) || typeof value !== 'string') continue
    if (value === '') {
      result[id as ShortcutActionId] = ''
      continue
    }
    const validated = validateShortcut(value)
    if (validated.ok) result[id as ShortcutActionId] = validated.shortcut
  }
  return result
}

/**
 * Mappa finale azione → combinazione, unendo default e personalizzazioni.
 * Regole di precedenza, deterministiche:
 *   1. le personalizzazioni vincono sui default;
 *   2. se una personalizzazione occupa il default di un'altra azione, quella
 *      azione resta senza scorciatoia (l'utente ha scelto: non la si ripristina in silenzio);
 *   3. se due personalizzazioni coincidono, vale quella dell'azione che viene prima nel catalogo.
 */
export function resolveShortcuts(overridesInput?: unknown): ResolvedShortcuts {
  const overrides = sanitizeShortcutOverrides(overridesInput)
  const resolved = {} as ResolvedShortcuts
  const taken = new Set<string>()

  for (const { id } of SHORTCUT_ACTIONS) {
    if (!(id in overrides)) continue
    const value = overrides[id] ?? ''
    if (value && taken.has(value)) {
      resolved[id] = ''
      continue
    }
    resolved[id] = value
    if (value) taken.add(value)
  }
  for (const { id, default: def } of SHORTCUT_ACTIONS) {
    if (id in resolved) continue
    resolved[id] = def && !taken.has(def) ? def : ''
    if (resolved[id]) taken.add(resolved[id])
  }
  return resolved
}

/** Se `candidate` è già usata da un'ALTRA azione, la restituisce. Serve alla UI per rifiutare i duplicati con un messaggio chiaro. */
export function findShortcutConflict(
  resolved: ResolvedShortcuts,
  actionId: ShortcutActionId,
  candidate: string
): ShortcutActionId | null {
  if (!candidate) return null
  for (const { id } of SHORTCUT_ACTIONS) {
    if (id !== actionId && resolved[id] === candidate) return id
  }
  return null
}

/**
 * Dalla mappa risolta alle personalizzazioni da salvare: solo le differenze
 * rispetto ai default (così "ripristina" = togliere la chiave).
 */
export function diffFromDefaults(resolved: ResolvedShortcuts): ShortcutOverrides {
  const overrides: ShortcutOverrides = {}
  for (const { id, default: def } of SHORTCUT_ACTIONS) {
    if (resolved[id] !== def) overrides[id] = resolved[id]
  }
  return overrides
}

export interface ShortcutLookup {
  /** combinazione → azione da eseguire */
  actions: Map<string, ShortcutActionId>
  /**
   * Combinazioni che l'editor gestiva "di suo" prima (default nativi + alias)
   * e che ORA non sono assegnate a nessuna azione: vanno inghiottite, altrimenti
   * togliere/spostare "Grassetto" lascerebbe Ctrl+B ancora attivo via TipTap.
   */
  suppressed: Set<string>
}

/** Costruisce le tabelle di ricerca usate dal gestore di tastiera dell'editor. */
export function buildShortcutLookup(resolved: ResolvedShortcuts): ShortcutLookup {
  const actions = new Map<string, ShortcutActionId>()
  for (const { id } of SHORTCUT_ACTIONS) {
    if (resolved[id]) actions.set(resolved[id], id)
  }
  // Alias fissi (es. Mod+Shift+Z per Ripeti): attivi solo se la combinazione è libera.
  for (const [id, aliases] of Object.entries(FIXED_ALIASES) as [ShortcutActionId, readonly string[]][]) {
    for (const alias of aliases) if (!actions.has(alias)) actions.set(alias, id)
  }
  const suppressed = new Set<string>()
  const nativeCombos = [
    ...SHORTCUT_ACTIONS.map((a) => a.default),
    ...Object.values(FIXED_ALIASES).flatMap((v) => v ?? [])
  ]
  for (const combo of nativeCombos) if (combo && !actions.has(combo)) suppressed.add(combo)
  return { actions, suppressed }
}
