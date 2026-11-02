import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuitCoordinator, QUIT_ACK_TIMEOUT_MS } from '../../src/main/quit-coordinator'

/**
 * Chiusura della finestra con prompt "To Do" (v0.4.2).
 * Il difetto corretto: dopo 5 secondi la finestra si chiudeva da sola anche
 * se la persona stava ancora scrivendo la nota. Qui si verifica che il
 * tempo di attesa della PERSONA non abbia limite, che l'assenza del renderer
 * non blocchi mai la chiusura e che la chiusura sia annullabile.
 */
function setup(ackTimeoutMs?: number) {
  const deps = {
    sendQuitRequested: vi.fn(),
    closeWindow: vi.fn(),
    focusWindow: vi.fn(),
    ackTimeoutMs
  }
  return { deps, coordinator: new QuitCoordinator(deps) }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('QuitCoordinator — flusso normale', () => {
  it('la prima richiesta di chiusura viene bloccata e chiede al renderer di mostrare il prompt', () => {
    const { deps, coordinator } = setup()
    expect(coordinator.handleCloseEvent()).toBe(true) // true = event.preventDefault()
    expect(deps.sendQuitRequested).toHaveBeenCalledTimes(1)
    expect(coordinator.getState()).toBe('awaiting-ack')
    expect(deps.closeWindow).not.toHaveBeenCalled()
  })

  it('REGRESSIONE: dopo la presa in carico si attende la persona SENZA limite di tempo', () => {
    const { deps, coordinator } = setup()
    coordinator.handleCloseEvent()
    coordinator.ack()
    expect(coordinator.getState()).toBe('awaiting-user')
    vi.advanceTimersByTime(60 * 60 * 1000) // un'ora davanti al prompt: prima della 0.4.2 bastavano 5 secondi
    expect(deps.closeWindow).not.toHaveBeenCalled()
    expect(coordinator.getState()).toBe('awaiting-user')
  })

  it('confirm chiude la finestra e la successiva richiesta di chiusura passa', () => {
    const { deps, coordinator } = setup()
    // win.close() fa scattare di nuovo l'evento 'close': lo si simula come in Electron.
    deps.closeWindow.mockImplementation(() => {
      expect(coordinator.handleCloseEvent()).toBe(false) // false = la chiusura procede
    })
    coordinator.handleCloseEvent()
    coordinator.ack()
    coordinator.confirm()
    expect(deps.closeWindow).toHaveBeenCalledTimes(1)
    expect(coordinator.getState()).toBe('confirmed')
  })

  it('confirm è idempotente: una doppia conferma non chiude due volte', () => {
    const { deps, coordinator } = setup()
    coordinator.handleCloseEvent()
    coordinator.ack()
    coordinator.confirm()
    coordinator.confirm()
    expect(deps.closeWindow).toHaveBeenCalledTimes(1)
  })

  it('confirm senza ack (renderer che conferma subito, es. nessun prompt da mostrare) chiude comunque', () => {
    const { deps, coordinator } = setup()
    coordinator.handleCloseEvent()
    coordinator.confirm()
    expect(deps.closeWindow).toHaveBeenCalledTimes(1)
    // e il timer dell'ack non deve far chiudere una seconda volta
    vi.advanceTimersByTime(QUIT_ACK_TIMEOUT_MS * 2)
    expect(deps.closeWindow).toHaveBeenCalledTimes(1)
  })
})

describe('QuitCoordinator — rete di sicurezza (renderer assente o bloccato)', () => {
  it('senza ack entro il timeout la chiusura viene forzata, così l\'app non resta impossibile da chiudere', () => {
    const { deps, coordinator } = setup()
    coordinator.handleCloseEvent()
    vi.advanceTimersByTime(QUIT_ACK_TIMEOUT_MS - 1)
    expect(deps.closeWindow).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(deps.closeWindow).toHaveBeenCalledTimes(1)
    expect(coordinator.getState()).toBe('confirmed')
  })

  it('rispetta un timeout personalizzato', () => {
    const { deps, coordinator } = setup(500)
    coordinator.handleCloseEvent()
    vi.advanceTimersByTime(500)
    expect(deps.closeWindow).toHaveBeenCalledTimes(1)
  })

  it('un ack arrivato in tempo disinnesca la chiusura forzata', () => {
    const { deps, coordinator } = setup()
    coordinator.handleCloseEvent()
    vi.advanceTimersByTime(QUIT_ACK_TIMEOUT_MS - 1)
    coordinator.ack()
    vi.advanceTimersByTime(QUIT_ACK_TIMEOUT_MS * 10)
    expect(deps.closeWindow).not.toHaveBeenCalled()
  })

  it('un ack tardivo dopo la chiusura forzata viene ignorato', () => {
    const { coordinator } = setup()
    coordinator.handleCloseEvent()
    vi.advanceTimersByTime(QUIT_ACK_TIMEOUT_MS)
    coordinator.ack()
    expect(coordinator.getState()).toBe('confirmed')
  })
})

describe('QuitCoordinator — annullamento', () => {
  it('cancel riporta a riposo: la finestra resta aperta e non viene chiusa dal timer', () => {
    const { deps, coordinator } = setup()
    coordinator.handleCloseEvent()
    coordinator.ack()
    coordinator.cancel()
    expect(coordinator.getState()).toBe('idle')
    vi.advanceTimersByTime(QUIT_ACK_TIMEOUT_MS * 10)
    expect(deps.closeWindow).not.toHaveBeenCalled()
  })

  it('dopo un annullamento una nuova richiesta di chiusura riparte da capo', () => {
    const { deps, coordinator } = setup()
    coordinator.handleCloseEvent()
    coordinator.ack()
    coordinator.cancel()
    expect(coordinator.handleCloseEvent()).toBe(true)
    expect(deps.sendQuitRequested).toHaveBeenCalledTimes(2)
    expect(coordinator.getState()).toBe('awaiting-ack')
  })

  it('cancel durante l\'attesa dell\'ack disinnesca il timer', () => {
    const { deps, coordinator } = setup()
    coordinator.handleCloseEvent()
    coordinator.cancel()
    vi.advanceTimersByTime(QUIT_ACK_TIMEOUT_MS * 2)
    expect(deps.closeWindow).not.toHaveBeenCalled()
  })

  it('cancel dopo la conferma è ignorato (troppo tardi)', () => {
    const { coordinator } = setup()
    coordinator.handleCloseEvent()
    coordinator.confirm()
    coordinator.cancel()
    expect(coordinator.getState()).toBe('confirmed')
  })
})

describe('QuitCoordinator — richieste ripetute', () => {
  it('un secondo tentativo di chiusura mentre il prompt è aperto non chiude né rimanda la richiesta: porta la finestra in primo piano', () => {
    const { deps, coordinator } = setup()
    coordinator.handleCloseEvent()
    coordinator.ack()
    expect(coordinator.handleCloseEvent()).toBe(true)
    expect(deps.sendQuitRequested).toHaveBeenCalledTimes(1)
    expect(deps.focusWindow).toHaveBeenCalledTimes(1)
    expect(deps.closeWindow).not.toHaveBeenCalled()
  })

  it('un secondo tentativo prima dell\'ack non rimanda la richiesta e non riavvia il timer', () => {
    const { deps, coordinator } = setup()
    coordinator.handleCloseEvent()
    vi.advanceTimersByTime(QUIT_ACK_TIMEOUT_MS - 100)
    expect(coordinator.handleCloseEvent()).toBe(true)
    expect(deps.sendQuitRequested).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(100) // il timer ORIGINALE scade: nessun "rinnovo" a ogni click
    expect(deps.closeWindow).toHaveBeenCalledTimes(1)
  })

  it('funziona anche senza focusWindow opzionale', () => {
    const coordinator = new QuitCoordinator({ sendQuitRequested: vi.fn(), closeWindow: vi.fn() })
    coordinator.handleCloseEvent()
    coordinator.ack()
    expect(() => coordinator.handleCloseEvent()).not.toThrow()
  })
})
