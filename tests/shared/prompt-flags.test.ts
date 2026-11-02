import { describe, expect, it } from 'vitest'
import {
  backupFrequencyAfterFolderChosen,
  shouldShowBackupPrompt,
  shouldShowRecap,
  shouldShowTodoPrompt
} from '../../src/shared/promptFlags'

describe('shouldShowTodoPrompt / shouldShowRecap', () => {
  it('di default (tutto acceso o mancante) si mostrano', () => {
    expect(shouldShowTodoPrompt({ activity_log_enabled: 1, todo_recap_enabled: 1 })).toBe(true)
    expect(shouldShowTodoPrompt({})).toBe(true) // impostazioni molto vecchie: comportamento storico
  })

  it('"Non mostrare più" (todo_recap_enabled = 0) nasconde sia il To Do sia il recap', () => {
    expect(shouldShowTodoPrompt({ activity_log_enabled: 1, todo_recap_enabled: 0 })).toBe(false)
    expect(shouldShowRecap({ activity_log_enabled: 1, todo_recap_enabled: 0 })).toBe(false)
  })

  it('con il registro attività spento non si mostra nulla, qualunque sia il flag', () => {
    expect(shouldShowTodoPrompt({ activity_log_enabled: 0, todo_recap_enabled: 1 })).toBe(false)
    expect(shouldShowTodoPrompt({ activity_log_enabled: false, todo_recap_enabled: true })).toBe(false)
  })

  it('i due flag sono indipendenti: spegnere "Non mostrare più" non riaccende il registro spento', () => {
    expect(shouldShowTodoPrompt({ activity_log_enabled: 0, todo_recap_enabled: 1 })).toBe(false)
    expect(shouldShowTodoPrompt({ activity_log_enabled: 1, todo_recap_enabled: 1 })).toBe(true)
  })

  it('accetta anche i booleani veri', () => {
    expect(shouldShowTodoPrompt({ activity_log_enabled: true, todo_recap_enabled: true })).toBe(true)
    expect(shouldShowTodoPrompt({ activity_log_enabled: true, todo_recap_enabled: false })).toBe(false)
  })

  it('senza impostazioni caricate non si mostra nulla (evita un lampo prima del caricamento)', () => {
    expect(shouldShowTodoPrompt(null)).toBe(false)
    expect(shouldShowTodoPrompt(undefined)).toBe(false)
  })
})

describe('shouldShowBackupPrompt', () => {
  it('senza cartella e mai mostrata → si mostra', () => {
    expect(shouldShowBackupPrompt({ backup_folder: '', backup_prompt_shown: 0 })).toBe(true)
  })

  it('con una cartella già scelta non si mostra mai', () => {
    expect(shouldShowBackupPrompt({ backup_folder: '/home/me/backup', backup_prompt_shown: 0 })).toBe(false)
  })

  it('una cartella fatta solo di spazi equivale a nessuna cartella', () => {
    expect(shouldShowBackupPrompt({ backup_folder: '   ', backup_prompt_shown: 0 })).toBe(true)
  })

  it('già mostrata in passato → non si ripropone (una volta sola)', () => {
    expect(shouldShowBackupPrompt({ backup_folder: '', backup_prompt_shown: 1 })).toBe(false)
    expect(shouldShowBackupPrompt({ backup_folder: '', backup_prompt_shown: true })).toBe(false)
  })

  it('senza impostazioni caricate non si mostra', () => {
    expect(shouldShowBackupPrompt(null)).toBe(false)
    expect(shouldShowBackupPrompt(undefined)).toBe(false)
  })
})

describe('backupFrequencyAfterFolderChosen', () => {
  it('"Disattivato" (o un valore sconosciuto) diventa "alla chiusura": chi sceglie la cartella vuole i backup', () => {
    expect(backupFrequencyAfterFolderChosen('off')).toBe('onClose')
    expect(backupFrequencyAfterFolderChosen('boh')).toBe('onClose')
    expect(backupFrequencyAfterFolderChosen(undefined)).toBe('onClose')
    expect(backupFrequencyAfterFolderChosen(null)).toBe('onClose')
  })

  it('una frequenza già scelta si rispetta', () => {
    for (const f of ['onClose', '30min', '60min', '120min', '240min']) expect(backupFrequencyAfterFolderChosen(f)).toBe(f)
  })
})
