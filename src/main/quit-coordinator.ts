/**
 * Coordinatore della chiusura della finestra (v0.4.2).
 *
 * PROBLEMA CORRETTO. Dalla 0.3.5 la chiusura viene intercettata per far
 * comparire il prompt "To Do" nel renderer. La rete di sicurezza era un
 * timer fisso di 5 secondi: se la persona stava ancora scrivendo la nota, la
 * finestra si chiudeva da sola e la nota andava persa.
 *
 * NUOVO MODELLO. Il timer non scade più sull'attesa della PERSONA, ma solo
 * sull'attesa della RISPOSTA DEL RENDERER (una "presa in carico" immediata):
 *
 *   idle ──close──▶ awaiting-ack ──ack──▶ awaiting-user ──confirm──▶ confirmed
 *                        │                     │
 *                        │ (nessun ack         └──cancel──▶ idle  (la finestra resta aperta)
 *                        │  entro il timeout:
 *                        │  renderer non caricato/bloccato)
 *                        └──────────────────────────────────▶ confirmed (chiusura forzata)
 *
 *  - awaiting-ack: il renderer deve rispondere subito (millisecondi) con
 *    ack(); se non lo fa il renderer è assente o bloccato e la chiusura
 *    procede comunque, così l'app non può restare impossibile da chiudere.
 *  - awaiting-user: il renderer ha preso in carico la richiesta e sta
 *    mostrando il prompt; si aspetta senza limite di tempo la scelta
 *    (confirm = salva/salta e chiudi; cancel = resta nell'app).
 *
 * La classe NON importa Electron: riceve le azioni da eseguire tramite
 * `deps`, così la logica è verificabile con i test (vedi
 * tests/main/quit-coordinator.test.ts).
 */

export type QuitState = 'idle' | 'awaiting-ack' | 'awaiting-user' | 'confirmed'

export interface QuitCoordinatorDeps {
  /** Chiede al renderer di mostrare l'eventuale prompt (push IpcChannels.app.quitRequested). */
  sendQuitRequested: () => void
  /** Chiude davvero la finestra (win.close()), da chiamare solo a chiusura autorizzata. */
  closeWindow: () => void
  /** Porta in primo piano la finestra se la persona prova a chiuderla di nuovo mentre il prompt è aperto. */
  focusWindow?: () => void
  /** Tempo massimo per la presa in carico del renderer. Default: QUIT_ACK_TIMEOUT_MS. */
  ackTimeoutMs?: number
}

/** Il renderer sano risponde in pochi ms: 3 s distinguono "lento" da "assente" senza far attendere troppo. */
export const QUIT_ACK_TIMEOUT_MS = 3_000

export class QuitCoordinator {
  private state: QuitState = 'idle'
  private ackTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly deps: QuitCoordinatorDeps) {}

  /** Stato corrente (esposto per i test e per la diagnostica). */
  getState(): QuitState {
    return this.state
  }

  /**
   * Da chiamare nell'evento 'close' della finestra.
   * Ritorna true se la chiusura va BLOCCATA (event.preventDefault()),
   * false se può procedere perché già autorizzata.
   */
  handleCloseEvent(): boolean {
    switch (this.state) {
      case 'confirmed':
        return false
      case 'awaiting-ack':
        return true // richiesta già inviata, si attende ancora la presa in carico
      case 'awaiting-user':
        // Il prompt è già aperto: un secondo tentativo di chiusura non deve
        // né chiudere né rimandare la richiesta, solo riportare la finestra in primo piano.
        this.deps.focusWindow?.()
        return true
      case 'idle':
        this.state = 'awaiting-ack'
        this.deps.sendQuitRequested()
        this.ackTimer = setTimeout(() => {
          this.ackTimer = null
          // Nessuna presa in carico: renderer non caricato o bloccato → si chiude comunque.
          if (this.state === 'awaiting-ack') this.confirm()
        }, this.deps.ackTimeoutMs ?? QUIT_ACK_TIMEOUT_MS)
        return true
    }
  }

  /** Il renderer ha preso in carico la richiesta: da qui si attende la persona, senza timeout. */
  ack(): void {
    if (this.state !== 'awaiting-ack') return
    this.clearTimer()
    this.state = 'awaiting-user'
  }

  /** Chiusura autorizzata (scelta della persona, o renderer assente): chiude la finestra. */
  confirm(): void {
    if (this.state === 'confirmed') return
    this.clearTimer()
    this.state = 'confirmed'
    this.deps.closeWindow()
  }

  /** La persona ha annullato la chiusura: la finestra resta aperta e una nuova richiesta ripartirà da capo. */
  cancel(): void {
    if (this.state === 'confirmed') return // troppo tardi: la chiusura è già autorizzata
    this.clearTimer()
    this.state = 'idle'
  }

  private clearTimer(): void {
    if (this.ackTimer) clearTimeout(this.ackTimer)
    this.ackTimer = null
  }
}
