import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
  AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, ChevronDown, Eraser, FileMinus,
  Highlighter, Image as ImageIcon, Italic, Link as LinkIcon, List, ListOrdered, Palette,
  Quote, Redo2, Search, Strikethrough, Type, Underline, Undo2, ZoomIn, ZoomOut
} from 'lucide-react'
import type { ToolbarTool } from '@shared/schemas/settings.schema'

const FONT_FAMILIES = [
  { label: 'Predefinito', value: '' }, { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' }, { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Courier New', value: '"Courier New", monospace' }
]
const FONT_SIZES = [
  { label: '10', value: '10px' }, { label: '11', value: '11px' }, { label: '12', value: '12px' },
  { label: '14', value: '14px' }, { label: '16', value: '16px' }, { label: '18', value: '18px' },
  { label: '24', value: '24px' }, { label: '32', value: '32px' }
]
const COLORS = ['#111827', '#dc2626', '#2563eb', '#16a34a', '#ca8a04', '#7c3aed']

/**
 * Inserisce `open`+`close` nel punto del cursore e riposiziona il cursore
 * subito dopo `open` (v0.3.9, usata dallo strumento "Dialoghi"): insertContent
 * lascia di norma il cursore alla FINE di ciò che ha appena inserito, quindi
 * va spostato indietro esplicitamente per finire "in mezzo" alle due virgolette.
 */
function insertAndPlaceCursorBetween(editor: Editor, open: string, close: string): void {
  const { from } = editor.state.selection
  editor.chain().focus().insertContent(open + close).setTextSelection(from + open.length).run()
}
const HIGHLIGHTS = ['#fef08a', '#fecaca', '#bfdbfe', '#bbf7d0', '#fed7aa', '#e9d5ff']
const LINE_HEIGHTS = [
  { label: '1', value: '1' }, { label: '1,15', value: '1.15' }, { label: '1,5', value: '1.5' }, { label: '2', value: '2' }
]

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

export default function EditorToolbar({
  editor, disabled = false, visibleTools, onInsertImage
}: { editor: Editor; disabled?: boolean; visibleTools: ToolbarTool[]; onInsertImage: () => Promise<void> }): JSX.Element {
  const [zoom, setZoom] = useState(100)
  const [searchOpen, setSearchOpen] = useState(false)
  const [query, setQuery] = useState('')

  useEffect(() => {
    editor.view.dom.style.setProperty('zoom', `${zoom}%`)
    return () => { editor.view.dom.style.removeProperty('zoom') }
  }, [editor, zoom])

  /**
   * Cerca `query` nel documento e seleziona l'occorrenza successiva rispetto
   * al cursore, avvolgendo dall'inizio se non ne trova più avanti — prima
   * partiva sempre dall'inizio del documento, quindi premere Invio più volte
   * restava bloccato sulla prima occorrenza, dando l'impressione che "Cerca"
   * non funzionasse. Il secondo fix è `.scrollIntoView()`: `setTextSelection`
   * da solo sposta la selezione ma non la porta in vista, quindi un risultato
   * fuori dall'area visibile sembrava semplicemente non essere stato trovato.
   */
  const search = () => {
    const q = query.trim().toLocaleLowerCase()
    if (!q) return
    const doc = editor.state.doc
    const cursorPos = editor.state.selection.to

    const findFrom = (startPos: number): { from: number; to: number } | null => {
      let found: { from: number; to: number } | null = null
      doc.descendants((node, pos) => {
        if (found || !node.isText || !node.text) return false
        const nodeEnd = pos + node.text.length
        if (nodeEnd < startPos) return true // nodo già superato dal cursore: salta
        const searchFrom = Math.max(0, startPos - pos)
        const index = node.text.toLocaleLowerCase().indexOf(q, searchFrom)
        if (index >= 0) {
          found = { from: pos + index, to: pos + index + q.length }
          return false
        }
        return true
      })
      return found
    }

    const match = findFrom(cursorPos) ?? findFrom(0) // ricerca "ad anello": ricomincia dall'inizio se non trova più avanti
    if (match) editor.chain().focus().setTextSelection(match).scrollIntoView().run()
  }

  /** Un caso per ogni id di strumento: mappa dichiarativa usata da visibleTools.map(renderTool) qui sotto, così l'ordine di rendering segue le preferenze salvate. */
  const renderTool = (tool: ToolbarTool): JSX.Element | null => {
    switch (tool) {
      case 'zoom':
        return <Group key={tool} icon={<ZoomIn size={15}/>} label="Zoom">
          <Button title="Riduci zoom" onClick={() => setZoom((z) => Math.max(60, z - 10))}><ZoomOut size={15}/></Button>
          <Button title="Zoom 100%" onClick={() => setZoom(100)}>{zoom}%</Button>
          <Button title="Aumenta zoom" onClick={() => setZoom((z) => Math.min(180, z + 10))}><ZoomIn size={15}/></Button>
        </Group>
      case 'undo':
        return <Button key={tool} title="Annulla (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()}><Undo2 size={16}/></Button>
      case 'redo':
        return <Button key={tool} title="Ripeti (Ctrl+Y)" onClick={() => editor.chain().focus().redo().run()}><Redo2 size={16}/></Button>
      case 'heading':
        return <Group key={tool} icon={<Type size={15}/>} label="Titolo">
          <Button title="Testo normale" active={editor.isActive('paragraph')} onClick={() => editor.chain().focus().setParagraph().run()}>Testo normale</Button>
          {[1,2,3].map((level) => <Button key={level} title={`Titolo ${level}`} active={editor.isActive('heading', {level})} onClick={() => editor.chain().focus().toggleHeading({level}).run()}>H{level}</Button>)}
        </Group>
      case 'font':
        return <select key={tool} title="Font" className="rounded border border-gray-300 bg-white px-1.5 py-1.5 text-xs dark:border-gray-600" value={editor.getAttributes('textStyle').fontFamily ?? ''}
          onChange={(e) => e.target.value ? editor.chain().focus().setFontFamily(e.target.value).run() : editor.chain().focus().unsetFontFamily().run()}>{FONT_FAMILIES.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}</select>
      case 'size':
        return <select key={tool} title="Dimensione carattere" className="w-16 rounded border border-gray-300 bg-white px-1.5 py-1.5 text-xs dark:border-gray-600" value={editor.getAttributes('fontSize').size ?? ''}
          onChange={(e) => e.target.value ? editor.chain().focus().setMark('fontSize', {size:e.target.value}).run() : editor.chain().focus().unsetMark('fontSize').run()}>
          <option value="">Size</option>{FONT_SIZES.map((s)=><option key={s.value} value={s.value}>{s.label}</option>)}</select>
      case 'bold':
        return <Button key={tool} title="Grassetto (Ctrl+B)" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}><Bold size={16}/></Button>
      case 'italic':
        return <Button key={tool} title="Corsivo (Ctrl+I)" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic size={16}/></Button>
      case 'underline':
        return <Button key={tool} title="Sottolineato (Ctrl+U)" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}><Underline size={16}/></Button>
      case 'strike':
        return <Button key={tool} title="Barrato" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough size={16}/></Button>
      case 'color':
        return <Group key={tool} icon={<Palette size={15}/>} label="Colore">
          <div className="flex items-center gap-1 px-1">{COLORS.map((c)=><button key={c} type="button" title={`Testo ${c}`} onMouseDown={(e)=>e.preventDefault()} onClick={()=>editor.chain().focus().setColor(c).run()} className="h-5 w-5 rounded-full border" style={{backgroundColor:c}}/>)}
          <Button title="Rimuovi colore" onClick={()=>editor.chain().focus().unsetColor().run()}>×</Button></div>
          <div className="flex items-center gap-1 border-l px-1">{HIGHLIGHTS.map((c)=><button key={c} type="button" title={`Evidenziatore ${c}`} onMouseDown={(e)=>e.preventDefault()} onClick={()=>editor.chain().focus().toggleHighlight({color:c}).run()} className="h-5 w-5 rounded border" style={{backgroundColor:c}}/>)}
          <Button title="Rimuovi evidenziatore" onClick={()=>editor.chain().focus().unsetHighlight().run()}><Highlighter size={15}/></Button></div>
        </Group>
      case 'clearFormatting':
        return <Button key={tool} title="Cancella formattazione" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><Eraser size={16}/></Button>
      case 'lists':
        return <Group key={tool} icon={<List size={16}/>} label="Liste elenchi">
          <Button title="Elenco puntato" active={editor.isActive('bulletList')} onClick={()=>editor.chain().focus().toggleBulletList().run()}><List size={16}/></Button>
          <Button title="Elenco numerato" active={editor.isActive('orderedList')} onClick={()=>editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={16}/></Button>
        </Group>
      case 'alignment':
        return <Group key={tool} icon={<AlignLeft size={15}/>} label="Allineamento">
          <Button title="Sinistra" active={editor.isActive({textAlign:'left'})} onClick={()=>editor.chain().focus().setTextAlign('left').run()}><AlignLeft size={15}/></Button>
          <Button title="Centro" active={editor.isActive({textAlign:'center'})} onClick={()=>editor.chain().focus().setTextAlign('center').run()}><AlignCenter size={15}/></Button>
          <Button title="Destra" active={editor.isActive({textAlign:'right'})} onClick={()=>editor.chain().focus().setTextAlign('right').run()}><AlignRight size={15}/></Button>
          <Button title="Giustificato" active={editor.isActive({textAlign:'justify'})} onClick={()=>editor.chain().focus().setTextAlign('justify').run()}><AlignJustify size={15}/></Button>
        </Group>
      case 'lineHeight':
        return <select key={tool} title="Interlinea" className="rounded border border-gray-300 bg-white px-1.5 py-1.5 text-xs dark:border-gray-600" defaultValue="" onChange={(e)=>e.target.value && editor.chain().focus().updateAttributes('paragraph', {lineHeight:e.target.value}).updateAttributes('heading', {lineHeight:e.target.value}).run()}><option value="">Interlinea</option>{LINE_HEIGHTS.map((l)=><option key={l.value} value={l.value}>{l.label}</option>)}</select>
      case 'dialogues':
        // v0.3.9: tre modi comuni per introdurre un dialogo in narrativa
        // italiana. Le virgolette si inseriscono SENZA spazio interno
        // («Ciao», non « Ciao », come da tipografia corrente) col cursore
        // tra le due, pronto per scrivere; il trattino si inserisce seguito
        // da uno spazio (convenzione più diffusa: "– disse Maria"), col
        // cursore già dopo, per continuare a scrivere subito.
        return <Group key={tool} icon={<Quote size={16}/>} label="Dialoghi">
          <div className="flex flex-col gap-0.5">
            <button type="button" onMouseDown={(e)=>e.preventDefault()} onClick={()=>insertAndPlaceCursorBetween(editor,'«','»')} className="rounded px-2 py-1 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700">« » <span className="text-xs text-gray-400">virgolette basse</span></button>
            <button type="button" onMouseDown={(e)=>e.preventDefault()} onClick={()=>insertAndPlaceCursorBetween(editor,'\u201c','\u201d')} className="rounded px-2 py-1 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700">“ ” <span className="text-xs text-gray-400">virgolette alte</span></button>
            <button type="button" onMouseDown={(e)=>e.preventDefault()} onClick={()=>editor.chain().focus().insertContent('\u2013 ').run()} className="rounded px-2 py-1 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700">– <span className="text-xs text-gray-400">trattino lungo</span></button>
          </div>
        </Group>
      case 'blockquote':
        return <Button key={tool} title="Citazione" active={editor.isActive('blockquote')} onClick={()=>editor.chain().focus().toggleBlockquote().run()}><Quote size={16}/></Button>
      case 'pageSeparator':
        return <Button key={tool} title="Separatore pagina" onClick={()=>editor.chain().focus().setHorizontalRule().run()}><FileMinus size={16}/></Button>
      case 'link':
        return <Button key={tool} title="Link" active={editor.isActive('link')} onClick={()=>{const current=editor.getAttributes('link').href; const url=window.prompt('URL del link', current || 'https://'); if(url===null)return; if(url.trim()) editor.chain().focus().setMark('link',{href:url.trim()}).run(); else editor.chain().focus().unsetMark('link').run()}}><LinkIcon size={16}/></Button>
      case 'image':
        return <Button key={tool} title="Immagine" onClick={()=>void onInsertImage()}><ImageIcon size={16}/></Button>
      case 'search':
        return <div key={tool} className="flex items-center gap-1">
          {searchOpen && <input autoFocus value={query} onChange={(e)=>setQuery(e.target.value)} onKeyDown={(e)=>{if(e.key==='Enter')search(); if(e.key==='Escape')setSearchOpen(false)}} placeholder="Cerca…" spellCheck={false} data-search-input className="w-32 rounded border border-gray-300 px-2 py-1 text-xs dark:border-gray-600"/>}
          <Button title="Cerca (Invio per trovare il successivo)" onClick={()=>{ if (!searchOpen) { setSearchOpen(true) } else { search() } }}><Search size={16}/></Button>
        </div>
      default:
        return null
    }
  }

  return <div className={`mb-2 flex flex-wrap items-center gap-0.5 rounded border border-gray-200 bg-gray-50 p-1.5 dark:border-gray-700 dark:bg-gray-800 ${disabled ? 'pointer-events-none opacity-40' : ''}`}>
    {/* L'ordine di rendering segue visibleTools (impostato in Impostazioni > Editor
        con drag&drop, vedi SettingsPage.tsx) invece di un ordine fisso nel JSX:
        senza questo, riordinare gli strumenti nelle impostazioni non avrebbe
        alcun effetto visibile sulla toolbar reale. Il filter rimuove eventuali
        duplicati residui in vecchie preferenze salvate. */}
    {visibleTools.filter((tool, index) => visibleTools.indexOf(tool) === index).map(renderTool)}
  </div>
}
