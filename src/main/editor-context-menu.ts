import { ipcMain, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { IpcChannels } from '@shared/ipc/channels'
import { tm } from './i18n'

/**
 * true quando l'editor TipTap della scena ha il focus (comunicato dal
 * renderer via IPC — vedi editor.setFocused in SceneEditor.tsx). Serve a
 * mostrare "Aggiungi commento"/"Aggiungi tag" solo lì, e non su un
 * qualunque altro campo di testo dell'app (titolo progetto, note, ecc.),
 * dove questi concetti non hanno senso.
 */
let isSceneEditorFocused = false
let tagsEnabled = true
let commentsEnabled = true

/**
 * v0.3.8 — cosa c'è sotto l'ultimo click destro nel testo, riportato dal
 * renderer in modo sincrono (editor.reportContextClick) un istante prima che
 * Electron sollevi l'evento 'context-menu' qui sotto. Determina se il menu
 * mostra "Aggiungi…" (niente sotto il cursore) oppure "Mostra/Elimina
 * commento" o "Elimina tag" (si è cliccato su un'annotazione esistente).
 * Se il renderer non manda mai nulla (versione futura del preload
 * disallineata, o l'evento non era nell'editor) resta 'none': il menu si
 * comporta come prima, con "Aggiungi…".
 */
let lastContextClickKind: 'comment' | 'tag' | 'none' = 'none'

export function setSceneEditorFocused(focused: boolean): void {
  isSceneEditorFocused = focused
}

/** Aggiorna il main sullo stato corrente di Impostazioni > Editor > Abilita tag/commenti, per mostrare o nascondere le relative voci nel menu contestuale nativo. */
export function setAnnotationsEnabled(flags: { tagsEnabled?: boolean; commentsEnabled?: boolean }): void {
  if (typeof flags.tagsEnabled === 'boolean') tagsEnabled = flags.tagsEnabled
  if (typeof flags.commentsEnabled === 'boolean') commentsEnabled = flags.commentsEnabled
}

/**
 * Registra il canale sincrono editor.reportContextClick (va chiamata UNA
 * volta sola, in registerAllIpc — a differenza di registerEditorContextMenu,
 * che è per-finestra). ipcMain.on con sendSync richiede di impostare
 * `event.returnValue` esplicitamente, altrimenti il renderer resterebbe in
 * attesa di una risposta che non arriva mai.
 */
export function registerEditorContextClickReporter(): void {
  ipcMain.on(IpcChannels.editor.reportContextClick, (event, info: { kind: 'comment' | 'tag' | 'none' }) => {
    lastContextClickKind = info?.kind ?? 'none'
    event.returnValue = true
  })
}

/**
 * Sostituisce il precedente menu contestuale React fatto a mano (Copia/
 * Taglia/Incolla) con uno nativo Electron, costruito dai `params` che
 * Chromium fornisce sull'evento 'context-menu' del webContents — è l'unico
 * modo per ottenere suggerimenti ortografici reali del correttore di
 * sistema (`params.dictionarySuggestions`), "Aggiungi al dizionario"
 * (`session.addWordToSpellCheckerDictionary`) e "Ignora": Electron non
 * espone un'API per un dizionario di sistema che sappia distinguere le due
 * cose, quindi entrambe le voci usano la stessa aggiunta al dizionario
 * personalizzato — la parola smette di essere segnalata sia ora sia nelle
 * sessioni future, non solo per questa sessione.
 */
export function registerEditorContextMenu(win: BrowserWindow): void {
  win.webContents.on('context-menu', (_event, params) => {
    const items: MenuItemConstructorOptions[] = []

    if (params.misspelledWord) {
      if (params.dictionarySuggestions.length > 0) {
        for (const suggestion of params.dictionarySuggestions.slice(0, 6)) {
          items.push({ label: suggestion, click: () => win.webContents.replaceMisspelling(suggestion) })
        }
      } else {
        items.push({ label: tm('contextMenu.noSuggestions'), enabled: false })
      }
      items.push({ type: 'separator' })
      items.push({
        label: tm('contextMenu.addToDictionary'),
        click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      })
      items.push({
        label: tm('contextMenu.ignore'),
        click: () => win.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
      })
      items.push({ type: 'separator' })
    }

    items.push({ label: tm('contextMenu.copy'), role: 'copy', enabled: params.editFlags.canCopy })
    items.push({ label: tm('contextMenu.cut'), role: 'cut', enabled: params.editFlags.canCut })
    items.push({ label: tm('contextMenu.paste'), role: 'paste', enabled: params.editFlags.canPaste })

    if (params.isEditable && isSceneEditorFocused) {
      const annotationItems: MenuItemConstructorOptions[] = []
      // v0.3.8: se il click è caduto su un commento/tag esistente, il menu
      // propone di gestire QUELLO invece di aggiungerne uno nuovo — vedi
      // lastContextClickKind. Il reset a 'none' subito dopo evita che
      // un'informazione ormai "consumata" resti valida per il prossimo
      // menu contestuale che si apre per un altro motivo (es. dal
      // correttore ortografico, senza passare da un nuovo mousedown).
      const clickedKind = lastContextClickKind
      lastContextClickKind = 'none'

      if (clickedKind === 'comment' && commentsEnabled) {
        annotationItems.push({ label: tm('contextMenu.showComment'), click: () => win.webContents.send(IpcChannels.editor.showComment) })
        annotationItems.push({ label: tm('contextMenu.deleteComment'), click: () => win.webContents.send(IpcChannels.editor.deleteCommentAt) })
      } else if (clickedKind === 'tag' && tagsEnabled) {
        annotationItems.push({ label: tm('contextMenu.deleteTag'), click: () => win.webContents.send(IpcChannels.editor.deleteTagAt) })
      } else {
        if (commentsEnabled) {
          annotationItems.push({
            label: tm('contextMenu.addComment'),
            click: () => win.webContents.send(IpcChannels.editor.addComment)
          })
        }
        if (tagsEnabled) {
          annotationItems.push({
            label: tm('contextMenu.addTag'),
            submenu: [
              { label: `${tm('entityType.character')}…`, click: () => win.webContents.send(IpcChannels.editor.addTag, 'character') },
              { label: `${tm('entityType.location')}…`, click: () => win.webContents.send(IpcChannels.editor.addTag, 'location') },
              { label: `${tm('entityType.object')}…`, click: () => win.webContents.send(IpcChannels.editor.addTag, 'object') },
              { label: `${tm('entityType.event')}…`, click: () => win.webContents.send(IpcChannels.editor.addTag, 'event') }
            ]
          })
        }
      }
      if (annotationItems.length > 0) {
        items.push({ type: 'separator' })
        items.push(...annotationItems)
      }
    }

    if (items.length > 0) Menu.buildFromTemplate(items).popup({ window: win })
  })
}
