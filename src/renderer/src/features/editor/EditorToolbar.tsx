import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, ChevronDown, Eraser, FileMinus,
  Highlighter, Image as ImageIcon, Italic, Link as LinkIcon, List, ListOrdered, Palette,
  Quote, Redo2, Search, Strikethrough, Type, Underline, Undo2, ZoomIn, ZoomOut
} from 'lucide-react'
import type { ToolbarTool } from '@shared/schemas/settings.schema'
import { formatShortcut, type ResolvedShortcuts, type ShortcutActionId } from '@shared/shortcuts'
import { useTranslation } from '@renderer/i18n/useTranslation'
import { IS_MAC } from '@renderer/lib/platform'
import { runEditorAction, type EditorActionHandlers } from './editorActions'

/** I nomi dei font sono nomi propri (non si traducono); solo "Predefinito" dipende dalla lingua e si risolve al render. */
const FONT_FAMILIES = [
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' }, { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Courier New', value: '"Courier New", monospace' }
]
const FONT_SIZES = [
  { label: '10', value: '10px' }, { label: '11', value: '11px' }, { label: '12', value: '12px' },
  { label: '14', value: '14px' }, { label: '16', value: '16px' }, { label: '18', value: '18px' },
  { label: '24', value: '24px' }, { label: '32', value: '32px' }
]
const COLORS = ['#111827', '#dc2626', '#2563eb', '#16a34a', '#ca8a04', '#7c3aed']
const HIGHLIGHTS = ['#fef08a', '#fecaca', '#bfdbfe', '#bbf7d0', '#fed7aa', '#e9d5ff']
/** Valori numerici dell'interlinea: l'etichetta ("1,15" in italiano, "1.15" in inglese) si formatta al render secondo la lingua. */
const LINE_HEIGHTS = ['1', '1.15', '1.5', '2']

/**
 * Strumenti che NON modificano il testo: restano utilizzabili anche quando la
 * scena è bloccata ("Finito"). Prima l'intera toolbar veniva disattivata,
 * ma cercare in una scena finita (o ingrandirla per rileggerla) è proprio
 * ciò che serve.
 */
const VIEW_ONLY_TOOLS: ReadonlySet<ToolbarTool> = new Set<ToolbarTool>(['zoom', 'search'])

function Button({ title, active, disabled, onClick, children }: any): JSX.Element {
  return <button type="button" title={title} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={onClick}
    className={`rounded px-2 py-1.5 text-sm font-medium transition-colors disabled:opacity-30 ${active ? 'bg-gray-800 text-white' : 'text-gray-700 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-700'}`}>{children}</button>
}

/**
 * Dropdown a click (non più a :hover). Prima, il gap CSS (`mt-1`) tra il
 * bottone e il pannello creava una "zona morta" che interrompeva l'hover
 * mentre il mouse si spostava in diagonale verso il pannello: bastava un
 * movimento non perfettamente verticale perché il pannello sparisse prima
 * di riuscire a cliccare un'opzione. Un dropdown a click è immune a questo
 * problema per costruzione (nessun hover coinvolto) ed è anche più
 * accessibile/touch-friendly. Si chiude cliccando fuori, con Escape, o
 * cliccando una qualunque opzione al suo interno (l'onClick del pannello
 * intercetta in bubbling il click già gestito dal bottone figlio).
 */
function Group({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        title={label}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded px-2 py-1.5 text-sm ${open ? 'bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100' : 'text-gray-700 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-700'}`}
      >
        {icon}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="absolute left-0 top-full z-30 mt-1 flex min-w-max gap-1 rounded border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          {children}
        </div>
      )}
    </div>
  )
}

export interface EditorToolbarProps {
  editor: Editor
  disabled?: boolean
  visibleTools: ToolbarTool[]
  /** v0.4.0: scorciatoie effettive, per mostrarle nei tooltip ("Grassetto (Ctrl+B)"). */
  shortcuts: ResolvedShortcuts
  /** v0.4.0: lo zoom vive in SceneEditor (così anche la scorciatoia da tastiera lo modifica). */
  zoom: number
  handlers: EditorActionHandlers
  /** La finestra Cerca e sostituisci è aperta: il pulsante appare "premuto". */
  findOpen: boolean
}

export default function EditorToolbar({
  editor, disabled = false, visibleTools, shortcuts, zoom, handlers, findOpen
}: EditorToolbarProps): JSX.Element {
  const { t, locale } = useTranslation()

  const run = (id: ShortcutActionId) => runEditorAction(editor, id, handlers)
  /** "Grassetto" → "Grassetto (Ctrl+B)" con la scorciatoia REALE (anche se personalizzata); senza scorciatoia, solo l'etichetta. */
  const hint = (label: string, id: ShortcutActionId): string => {
    const combo = formatShortcut(shortcuts[id], IS_MAC)
    return combo ? `${label} (${combo})` : label
  }

  /** Un caso per ogni id di strumento: mappa dichiarativa usata da visibleTools.map, così l'ordine di rendering segue le preferenze salvate. */
  const renderTool = (tool: ToolbarTool): JSX.Element | null => {
    switch (tool) {
      case 'zoom':
        return <Group icon={<ZoomIn size={15}/>} label={t('toolbar.tool.zoom')}>
          <Button title={hint(t('toolbar.zoomOut'), 'zoomOut')} onClick={() => run('zoomOut')}><ZoomOut size={15}/></Button>
          <Button title={hint(t('toolbar.zoomReset'), 'zoomReset')} onClick={() => run('zoomReset')}>{zoom}%</Button>
          <Button title={hint(t('toolbar.zoomIn'), 'zoomIn')} onClick={() => run('zoomIn')}><ZoomIn size={15}/></Button>
        </Group>
      case 'undo':
        return <Button title={hint(t('toolbar.tool.undo'), 'undo')} onClick={() => run('undo')}><Undo2 size={16}/></Button>
      case 'redo':
        return <Button title={hint(t('toolbar.tool.redo'), 'redo')} onClick={() => run('redo')}><Redo2 size={16}/></Button>
      case 'heading':
        return <Group icon={<Type size={15}/>} label={t('toolbar.tool.heading')}>
          <Button title={hint(t('toolbar.paragraph'), 'paragraph')} active={editor.isActive('paragraph')} onClick={() => run('paragraph')}>{t('toolbar.paragraph')}</Button>
          {([1, 2, 3] as const).map((level) => {
            const id = `heading${level}` as const
            return <Button key={level} title={hint(t('toolbar.headingLevel', { level }), id)} active={editor.isActive('heading', { level })} onClick={() => run(id)}>H{level}</Button>
          })}
        </Group>
      case 'font':
        return <select title={t('toolbar.tool.font')} className="rounded border border-gray-300 bg-white px-1.5 py-1.5 text-xs dark:border-gray-600" value={editor.getAttributes('textStyle').fontFamily ?? ''}
          onChange={(e) => e.target.value ? editor.chain().focus().setFontFamily(e.target.value).run() : editor.chain().focus().unsetFontFamily().run()}>
          <option value="">{t('toolbar.fontDefault')}</option>
          {FONT_FAMILIES.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
        </select>
      case 'size':
        return <select title={t('toolbar.fontSize')} className="w-16 rounded border border-gray-300 bg-white px-1.5 py-1.5 text-xs dark:border-gray-600" value={editor.getAttributes('fontSize').size ?? ''}
          onChange={(e) => e.target.value ? editor.chain().focus().setMark('fontSize', {size:e.target.value}).run() : editor.chain().focus().unsetMark('fontSize').run()}>
          <option value="">{t('toolbar.tool.size')}</option>{FONT_SIZES.map((s)=><option key={s.value} value={s.value}>{s.label}</option>)}</select>
      case 'bold':
        return <Button title={hint(t('toolbar.tool.bold'), 'bold')} active={editor.isActive('bold')} onClick={() => run('bold')}><Bold size={16}/></Button>
      case 'italic':
        return <Button title={hint(t('toolbar.tool.italic'), 'italic')} active={editor.isActive('italic')} onClick={() => run('italic')}><Italic size={16}/></Button>
      case 'underline':
        return <Button title={hint(t('toolbar.tool.underline'), 'underline')} active={editor.isActive('underline')} onClick={() => run('underline')}><Underline size={16}/></Button>
      case 'strike':
        return <Button title={hint(t('toolbar.tool.strike'), 'strike')} active={editor.isActive('strike')} onClick={() => run('strike')}><Strikethrough size={16}/></Button>
      case 'color':
        return <Group icon={<Palette size={15}/>} label={t('toolbar.tool.color')}>
          <div className="flex items-center gap-1 px-1">{COLORS.map((c)=><button key={c} type="button" title={t('toolbar.textColor', { color: c })} onMouseDown={(e)=>e.preventDefault()} onClick={()=>editor.chain().focus().setColor(c).run()} className="h-5 w-5 rounded-full border" style={{backgroundColor:c}}/>)}
          <Button title={t('toolbar.removeColor')} onClick={()=>editor.chain().focus().unsetColor().run()}>×</Button></div>
          <div className="flex items-center gap-1 border-l px-1">{HIGHLIGHTS.map((c)=><button key={c} type="button" title={t('toolbar.highlightColor', { color: c })} onMouseDown={(e)=>e.preventDefault()} onClick={()=>editor.chain().focus().toggleHighlight({color:c}).run()} className="h-5 w-5 rounded border" style={{backgroundColor:c}}/>)}
          <Button title={t('toolbar.removeHighlight')} onClick={()=>editor.chain().focus().unsetHighlight().run()}><Highlighter size={15}/></Button></div>
        </Group>
      case 'clearFormatting':
        return <Button title={hint(t('toolbar.tool.clearFormatting'), 'clearFormatting')} onClick={() => run('clearFormatting')}><Eraser size={16}/></Button>
      case 'lists':
        return <Group icon={<List size={16}/>} label={t('toolbar.tool.lists')}>
          <Button title={hint(t('toolbar.bulletList'), 'bulletList')} active={editor.isActive('bulletList')} onClick={()=>run('bulletList')}><List size={16}/></Button>
          <Button title={hint(t('toolbar.orderedList'), 'orderedList')} active={editor.isActive('orderedList')} onClick={()=>run('orderedList')}><ListOrdered size={16}/></Button>
        </Group>
      case 'alignment':
        return <Group icon={<AlignLeft size={15}/>} label={t('toolbar.tool.alignment')}>
          <Button title={hint(t('toolbar.alignLeft'), 'alignLeft')} active={editor.isActive({textAlign:'left'})} onClick={()=>run('alignLeft')}><AlignLeft size={15}/></Button>
          <Button title={hint(t('toolbar.alignCenter'), 'alignCenter')} active={editor.isActive({textAlign:'center'})} onClick={()=>run('alignCenter')}><AlignCenter size={15}/></Button>
          <Button title={hint(t('toolbar.alignRight'), 'alignRight')} active={editor.isActive({textAlign:'right'})} onClick={()=>run('alignRight')}><AlignRight size={15}/></Button>
          <Button title={hint(t('toolbar.alignJustify'), 'alignJustify')} active={editor.isActive({textAlign:'justify'})} onClick={()=>run('alignJustify')}><AlignJustify size={15}/></Button>
        </Group>
      case 'lineHeight':
        return <select title={t('toolbar.tool.lineHeight')} className="rounded border border-gray-300 bg-white px-1.5 py-1.5 text-xs dark:border-gray-600" defaultValue="" onChange={(e)=>e.target.value && editor.chain().focus().updateAttributes('paragraph', {lineHeight:e.target.value}).updateAttributes('heading', {lineHeight:e.target.value}).run()}>
          <option value="">{t('toolbar.tool.lineHeight')}</option>
          {LINE_HEIGHTS.map((v)=><option key={v} value={v}>{Number(v).toLocaleString(locale)}</option>)}
        </select>
      case 'dialogues': {
        // Tre modi comuni per introdurre un dialogo (v0.3.9). Le virgolette si inseriscono SENZA spazio interno,
        // col cursore tra le due; il trattino è seguito da uno spazio, col cursore già dopo.
        const row = 'rounded px-2 py-1 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700'
        const item = (id: ShortcutActionId, glyph: string, label: string) => (
          <button type="button" title={hint(label, id)} onMouseDown={(e)=>e.preventDefault()} onClick={()=>run(id)} className={row}>
            {glyph} <span className="text-xs text-gray-400">{label}</span>
          </button>
        )
        return <Group icon={<Quote size={16}/>} label={t('toolbar.tool.dialogues')}>
          <div className="flex flex-col gap-0.5">
            {item('dialogueGuillemets', '« »', t('toolbar.dialogueGuillemets'))}
            {item('dialogueQuotes', '\u201c \u201d', t('toolbar.dialogueQuotes'))}
            {item('dialogueDash', '\u2013', t('toolbar.dialogueDash'))}
          </div>
        </Group>
      }
      case 'blockquote':
        return <Button title={hint(t('toolbar.tool.blockquote'), 'blockquote')} active={editor.isActive('blockquote')} onClick={()=>run('blockquote')}><Quote size={16}/></Button>
      case 'pageSeparator':
        return <Button title={hint(t('toolbar.tool.pageSeparator'), 'pageSeparator')} onClick={()=>run('pageSeparator')}><FileMinus size={16}/></Button>
      case 'link':
        return <Button title={hint(t('toolbar.tool.link'), 'link')} active={editor.isActive('link')} onClick={()=>run('link')}><LinkIcon size={16}/></Button>
      case 'image':
        return <Button title={hint(t('toolbar.tool.image'), 'image')} onClick={()=>run('image')}><ImageIcon size={16}/></Button>
      case 'search':
        // v0.4.0: non più un campo inline ma la finestra "Cerca e sostituisci" (FindReplaceDialog).
        return <Button title={hint(t('toolbar.tool.search'), 'find')} active={findOpen} onClick={()=>run('find')}><Search size={16}/></Button>
      default:
        return null
    }
  }

  const renderWrapped = (tool: ToolbarTool): JSX.Element | null => {
    const element = renderTool(tool)
    if (!element) return null
    // Con la scena bloccata si disattivano solo gli strumenti che modificano il testo (vedi VIEW_ONLY_TOOLS).
    const locked = disabled && !VIEW_ONLY_TOOLS.has(tool)
    return <div key={tool} className={locked ? 'pointer-events-none opacity-40' : ''}>{element}</div>
  }

  return <div className="mb-2 flex flex-wrap items-center gap-0.5 rounded border border-gray-200 bg-gray-50 p-1.5 dark:border-gray-700 dark:bg-gray-800">
    {/* L'ordine di rendering segue visibleTools (impostato in Impostazioni > Editor
        con drag&drop, vedi SettingsPage.tsx) invece di un ordine fisso nel JSX:
        senza questo, riordinare gli strumenti nelle impostazioni non avrebbe
        alcun effetto visibile sulla toolbar reale. Il filter rimuove eventuali
        duplicati residui in vecchie preferenze salvate. */}
    {visibleTools.filter((tool, index) => visibleTools.indexOf(tool) === index).map(renderWrapped)}
  </div>
}
