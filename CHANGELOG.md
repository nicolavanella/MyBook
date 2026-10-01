# Changelog

## 0.3.9
- **Recap**: il pulsante "Ho capito" prende il focus all'apertura (Invio lo attiva) ed Esc chiude la finestra. Corretto anche un difetto preesistente: il recap non conosceva le etichette dei nuovi tipi di voce (eventi Timeline, nodi/collegamenti della Mappa) aggiunti in 0.3.6.
- **Impostazioni** compare nella navigazione solo con un progetto aperto.
- **Riapertura del progetto dove era stato chiuso**
  - Si riapre nella stessa sezione in cui era stato lasciato (Manoscritto, Personaggi, Statistiche…), non sempre sul Manoscritto. Vale sia aprendo un progetto dall'elenco sia alla ripresa automatica all'avvio. L'azione "Esporta" dall'elenco mantiene la sua destinazione esplicita.
  - Se si stava scrivendo, si riapre la stessa scena con il **cursore nell'ultima posizione salvata**. La posizione viaggia nello stesso autosave del testo (non a ogni movimento del cursore) e non genera mai voci nel registro attività; un salto a un tag da "Dove compare" ha comunque la precedenza.
  - *Dati*: migrazione `021_editor_ui_state.sql` (`document_nodes.cursor_position`); sezione e scena vivono nel blob JSON `project_settings`, già previsto per impostazioni per-progetto ma finora mai usato.
- **Nuovo progetto**: il form ha la stessa altezza in "Dati base", "Struttura" e "Narrazione" (prima la finestra si allargava e restringeva cambiando scheda).
- **Albero del Manoscritto**: "Crea copia" anche per i Gruppi (copia ricorsiva di capitoli e scene); "Rinomina" rimosso dai Capitoli (c'è già "Modifica", che copre il titolo).
- **Menu contestuale dell'editor**: "Mostra commento" apre direttamente il form del commento; "Elimina tag" chiede conferma.
- **Toolbar → Dialoghi** (prima di "Citazione"): « » e “ ” inseriti senza spazio interno con il cursore in mezzo; il trattino – inserito seguito da uno spazio con il cursore dopo. Compare anche tra gli "Strumenti toolbar" in Impostazioni.
  - *Scelta da confermare*: come "trattino lungo" ho usato il carattere esatto indicato nella richiesta (– U+2013, tecnicamente un trattino "en"; il "em" — sarebbe U+2014).
  - *Dati*: migrazione `023_dialogues_toolbar_tool.sql` inserisce "Dialoghi" subito prima di "Citazione" nell'elenco già salvato (altrimenti nessuno, nemmeno chi installa da zero, lo avrebbe visto). Una lista personalizzata senza "Citazione" resta intatta.
- **Impostazioni → Editor → Colori dell'editor**: sfondo e colore del testo dell'area di scrittura, separati per tema chiaro e scuro, con anteprima e "Ripristina default". I default sono gli stessi valori finora fissi nel CSS (chiaro #f1efe8/#374151, scuro #1f1f22/#e4e4e7): nulla cambia finché non li si tocca. Nell'editor vale il tema attivo. *Dati*: migrazione `022_editor_colors.sql`.
  - I titoli (H1–H6) mantengono i colori del tema tipografico: il colore testo personalizzato agisce sul corpo del testo.
- **README.md in inglese** (funzionalità, requisiti, comandi, struttura, sicurezza, versioning, migrazioni, test, licenza). La versione italiana precedente è ora `README.it.md`.
- **Test**: da 242 a 251 (stato UI del progetto, migrazioni 022/023).

## 0.3.8
- **Registro attività — testo delle scene, senza soglia a tempo**
  - Sostituita la soglia "al più una voce ogni 5 minuti" (v0.3.7) con **una voce al giorno per scena**: la primissima modifica del testo della giornata viene registrata subito (nessuna attesa), poi non si ripete più fino al giorno di calendario successivo. Un cambio di titolo/stato resta invece sempre immediato, come prima.
- **Tag salvati nel database, non solo nel testo**
  - Nuova tabella `scene_tags` (migrazione `019_scene_tags.sql`): ogni volta che il testo di una scena viene salvato, i tag al suo interno vengono estratti e scritti qui. Da questa versione, sia il pannello "Dove compare" (Personaggi/Località/Oggetti) sia i conteggi "Tag presenti" dell'Analisi **leggono da questa tabella**, non più riaprendo e rianalizzando il contenuto di ogni scena ad ogni richiesta.
  - *Nota tecnica, per chiarezza*: il segno del tag nel testo (necessario a sapere DOVE si trova mentre scrivi, ed è quello che ProseMirror sposta da solo se aggiungi o togli testo prima) resta comunque nel documento — è l'unico modo per un editor di testo di sapere "questa parola qui è taggata" mentre il testo cambia. Quello che è cambiato è che ORA è la tabella `scene_tags`, non il testo, l'unica fonte interrogata da tutte le funzionalità che mettono in relazione i tag tra loro (Analisi, "Dove compare") — risolvendo esattamente la preoccupazione di prestazioni sollevata in precedenza su progetti molto grandi.
  - I progetti creati prima di questa versione vengono ripopolati automaticamente al primo avvio dopo l'aggiornamento (un solo passaggio, silenzioso).
- **Menu contestuale dell'editor**
  - Cliccando col tasto destro su un **commento** già presente nel testo, il menu propone "Mostra commento" ed "Elimina commento" al posto di "Aggiungi commento…".
  - Cliccando col tasto destro su un **tag** già presente nel testo, il menu propone "Elimina tag" (quello specifico, non tutte le occorrenze dell'entità) al posto di "Aggiungi tag…".
- **Statistiche → Principale**
  - Il riquadro "Scene completate" mostra ora anche Capitoli completati/totali (un capitolo è "completato" quando tutte le sue scene sono Finito), oltre a Scene completate/totali e alla percentuale — ed è colorato come una barra di avanzamento (riempimento proporzionale, ambra sotto al 50%, verde da lì in su).
- **Installer**
  - Il file **LICENSE** (GNU GPL-3.0, già dichiarata in Info) è ora incluso tra le risorse dell'applicazione; in Info è diventato un link cliccabile che lo apre col visualizzatore predefinito del sistema.
  - Un progetto dimostrativo (**"Manuale di MyBook"**) viene importato automaticamente al primo avvio dell'applicazione, con qualche scena che presenta le funzionalità principali (Manoscritto, Personaggi/Località/Oggetti, Timeline, Mappa concettuale, Statistiche, Log/Impostazioni) e un piccolo esempio in ciascuna sezione. Non viene più riproposto in seguito, nemmeno eliminandolo.
  - *Non testabile in questo ambiente*: impacchettare e lanciare l'installer vero e proprio non è possibile qui — ho verificato che il progetto manuale si importi correttamente (test automatico) e cablato la configurazione di electron-builder, ma la prova pratica sull'installer va fatta sulla tua macchina.
- **Dati**: nuove migrazioni `018_activity_log_entity_id.sql` (id reale dell'entità in ogni voce del registro, necessario per il conteggio "una volta al giorno"), `019_scene_tags.sql`, `020_manual_imported.sql`.
- **Test**: da 224 a 242 (giorno di calendario per il registro, tabella `scene_tags`, ripopolamento automatico, capitoli completati, validità del progetto manuale).

## 0.3.7
- **Registro attività (Log) — ora anche il testo delle scene**
  - Il salvataggio automatico del contenuto (content) genera ora una voce "Modificata", non solo i cambi di titolo/stato di prima.
  - Per non sommergere il registro (l'autosave può scattare ogni pochi secondi mentre si scrive), è stata introdotta una soglia: al più **una voce ogni 5 minuti** per scena per le sole modifiche di testo. Un cambio di titolo, stato o altro campo "editoriale" resta invece registrato subito, come prima, senza soglia.
  - *Dati*: nuova migrazione `018_activity_log_entity_id.sql` — ogni voce ora porta anche l'id reale dell'entità coinvolta (oltre al nome), necessario per riconoscere in modo affidabile "la stessa scena" da un salvataggio automatico al successivo anche se nel frattempo viene rinominata. Le voci già esistenti restano valide.
- **Recap — solo all'apertura del Progetto**
  - Rimosso il recap generale mostrato all'avvio dell'app quando nessun progetto era ancora attivo (introdotto in 0.3.6). Ora il recap compare solo aprendo un progetto — dall'elenco Progetti, o quando l'app riprende da sola l'ultimo progetto attivo al riavvio.
- **Personaggi, Località, Oggetti — pannello "Dove compare" responsive**
  - Il pannello si nasconde automaticamente se la finestra non è abbastanza larga da mostrarlo insieme al resto della scheda.
  - Quando c'è spazio, un pulsante permette comunque di collassarlo manualmente (a una sottile striscia con solo l'icona per riaprirlo), per chi preferisce più spazio senza dover ridimensionare la finestra.
- **Statistiche — ordine dei capitoli**
  - In Principale e in Analisi, i capitoli seguono ora lo stesso ordine dell'albero del Manoscritto. Prima, con capitoli distribuiti su più gruppi, l'ordinamento (per `order_index` grezzo) poteva mescolarli, perché la numerazione riparte da zero in ogni gruppo.
- **Statistiche → Impostazioni**
  - La scheda **Log** si è spostata da Statistiche a **Impostazioni**, tra Editor e Avanzate. L'opzione "Registra attività (Log)" (prima nella tab Editor) è stata spostata nella stessa scheda, in cima.
- **Tag su Personaggi/Località/Oggetti: valutazione richiesta (non implementata in questa versione)**
  - È stato chiesto di valutare se salvare i tag in una tabella dedicata (es. `scene_tags`) invece che nel testo. Il ragionamento è nella risposta a parte: in breve, i tag restano nel testo perché la loro posizione ESATTA nel documento (necessaria per "Dove compare" e per il salto alla scena) è propria del contenuto stesso; una tabella `scene_tags` avrebbe senso come **indice derivato** per velocizzare le ricerche su progetti molto grandi, da ricostruire ad ogni salvataggio della scena — un cambiamento strutturale che vale la pena fare come intervento a sé, non incluso qui.
- **Test**: da 210 a 224 (soglia sulle modifiche di testo, ordine dei capitoli come nel Manoscritto, soglia di larghezza del pannello "Dove compare").

## 0.3.6
- **Registro attività (Log) — esteso**
  - Timeline: ora si registrano anche i singoli **eventi** (creazione/rinomina/eliminazione), non solo la timeline come contenitore. Una rinomina è tale solo se cambia il titolo, non ad ogni modifica di data/descrizione/colore.
  - Mappa concettuale: ora si registrano anche i singoli **nodi** (creazione/rinomina/eliminazione) e **collegamenti** (creazione/eliminazione — un collegamento non ha un nome da rinominare).
- **Recap — anche all'apertura del Progetto**
  - Prima compariva solo all'avvio dell'app. Ora compare anche quando si apre un progetto dall'elenco Progetti (recap delle sue ultime operazioni + ToDo, non quello generale su più progetti). All'avvio dell'app, se non c'è ancora un progetto attivo, resta il recap generale su più progetti (utile per scegliere quale riprendere); se l'app riparte riprendendo automaticamente l'ultimo progetto attivo, si vede direttamente il recap di quello.
- **Personaggi, Località, Oggetti — pannello "Dove compare"**
  - A destra della scheda, l'elenco di Capitoli e Scene dove l'entità è taggata nel testo del Manoscritto, con un estratto del testo taggato. Cliccando una riga si apre quella scena nel Manoscritto con il cursore posizionato esattamente su quell'occorrenza del tag (si apre anche il pannello Tag della scena).
- **Statistiche — Principale**
  - Parole totali, Caratteri totali (spazi esclusi/inclusi) e Scene completate ("1/22 · 5%") ora sulla stessa riga, come tre indicatori principali (le altre card precedenti sono state consolidate in queste tre).
  - "Spazi esclusi" è un nuovo dato (prima esisteva solo il totale "con spazi"), calcolato dal contenuto vero — nessuna colonna cache aggiuntiva nel database.
- **Statistiche — nuova scheda "Log"**
  - Tabella con l'intero storico delle operazioni registrate per il progetto aperto (data/ora, operazione, tipo, nome). A differenza del recap, resta consultabile anche se "Registra attività" è stato disattivato nel frattempo.
- **Statistiche — Analisi**
  - "Parole chiave più usate" è ora una sezione richiudibile, chiusa di default (sia a livello di intero progetto sia di singolo capitolo).
  - Nuova sezione per capitolo, richiudibile e chiusa di default: **Tag presenti** (Tag / Tipo / occorrenze), con le occorrenze sommate su tutte le scene del capitolo.
  - Le voci "Tempo di lettura", "Cartelle editoriali" e "Pagine di stampa (stima)" mostrano ora, al passaggio del mouse, la convenzione adottata (rispettivamente ≈200 parole/minuto, 1800 caratteri spazi inclusi, ≈300 parole).
- **Impostazioni**
  - Generale: Aspetto, Dimensione testo e Lingua ora sulla stessa riga (prima Dimensione testo era una sezione a parte, sotto).
  - Editor > Correttore ortografico: disattivando "Controllo ortografico" i "Dizionari" si disattivano di conseguenza (visivamente disabilitati, non modificabili) — la selezione delle lingue resta comunque salvata per quando lo si riattiva.
  - Avanzate > Stato database: "Aggiorna" è stato spostato accanto a "Mostra/Nascondi tabelle vuote" (prima era separato dagli altri due elementi della riga). Corretto anche un bug: cliccando "Aggiorna" con la tabella "Tabelle e record" espansa, ora resta espansa invece di richiudersi (lo stato apri/chiudi è diventato controllato da React invece di dipendere dal solo elemento nativo, che veniva smontato e ricreato ad ogni aggiornamento).
- **Dati**: nessuna nuova migrazione. I nuovi tipi di voce del registro attività (`timeline_event`, `mindmap_node`, `mindmap_edge`) usano la stessa colonna testuale già esistente da `017_activity_log.sql`.
- **Test**: da 191 a 210 (scansione dei tag nel testo, statistiche con caratteri senza spazi, tag per capitolo nell'Analisi, ricerca degli usi di un'entità).
- **Nota di scope**: come discusso in precedenza, il conteggio delle frasi resta euristico e le convenzioni editoriali (cartella/pagina/lettura) sono quelle più diffuse ma non uniche — ora dichiarate anche in interfaccia, non solo nel codice.

## 0.3.5
- **Editor**
  - Le etichette dei pannelli espandibili ("Dettagli scena", i contatori di Commenti/Tag, "Revisioni") diventano in **grassetto** quando il pannello è aperto, per vedere a colpo d'occhio quale sezione è espansa.
- **Statistiche — nuova scheda "Analisi"**
  - Due schede: **Principale** (comportamento della 0.3.4, invariato) e **Analisi** (nuova).
  - Analisi, sull'intero progetto e per ogni capitolo (espandibile): Parole totali e Tempo di lettura, Caratteri (spazi inclusi/esclusi), Frasi, Paragrafi, Dimensioni editoriali (Cartelle e Pagine di stampa stimate), Parole chiave più usate.
  - *Convenzioni adottate (nessuno standard editoriale è unico, quindi dichiarate esplicitamente in `shared/textAnalysis.ts`)*: 1 cartella = 1800 caratteri spazi inclusi (30 righe × 60 battute); 1 pagina di stampa ≈ 300 parole; lettura ≈ 200 parole/minuto. Le parole chiave escludono un elenco di stopword italiane e le parole sotto le 4 lettere.
  - Il conteggio delle frasi è euristico (non un parser linguistico): non riconosce le abbreviazioni come "Sig." — accettabile per un dato indicativo, va detto per chiarezza.
- **Registro attività (Log) — nuovo, per progetto**
  - Traccia creazione/modifica/eliminazione/spostamento di Scena, Capitolo e Gruppo nel Manoscritto, e creazione/modifica/eliminazione di Personaggio, Località e Oggetto.
  - Per Timeline e Mappa concettuale si registra solo il **contenitore** (creazione/rinomina/eliminazione), non i singoli eventi o nodi al suo interno: altrimenti il registro sarebbe dominato da voci minori invece che dalle operazioni davvero rilevanti.
  - Per le scene, il salvataggio automatico del testo (ad ogni pausa di digitazione) **non** genera una voce "Modificata": solo un cambio di titolo, stato o altri campi non testuali lo fa, altrimenti il registro sarebbe sommerso.
  - **Alla chiusura di un progetto** (pulsante "Esci") e **alla chiusura dell'app** (se un progetto è aperto) viene chiesto un campo di testo libero **"To Do"** — cosa fare la prossima volta. È facoltativo ("Salta") e viene precompilato con la nota lasciata l'ultima volta.
  - **All'apertura dell'app**, se c'è attività recente, un recap mostra — per ciascun progetto coinvolto — le ultime operazioni e l'eventuale nota "To Do".
  - **Impostazioni → "Registra attività (Log)"**: disattivandolo, niente più voci nel registro, niente prompt "To Do" e niente recap (comportamento identico a prima della 0.3.5). Riattivandolo si riprende a registrare da quel momento.
  - Le voci più vecchie oltre le 1000 per progetto vengono eliminate automaticamente, per non far crescere il database all'infinito sui progetti di lunga durata.
- **Dati**: nuova migrazione `017_activity_log.sql` (tabelle `activity_log` e `project_todo`, nuova colonna `activity_log_enabled` in `app_settings`, default abilitato). Nessun impatto sui progetti esistenti.
- **Test**: da 158 a 191 (analisi testuale, registro attività a livello di repository e di servizio, spaccato per capitolo dell'analisi).
- **Nota di scope**: come discusso, "Timeline/Mappa concettuale" nel registro si riferisce al contenitore, non ai singoli eventi/nodi al suo interno; se in futuro serve tracciare anche quelli, va valutato separatamente per non rendere il registro troppo rumoroso.

## 0.3.4
- **Generale**
  - **Titolo finestra**: durante l'editing di una scena diventa `MyBook - <Progetto> - Manoscritto - <Capitolo> / <Scena>` (prima si fermava a `Manoscritto`). Si aggiorna anche rinominando la scena. Se la scena non ha un capitolo (o il suo contenitore è un gruppo) compare solo il titolo della scena. Logica estratta in `lib/windowTitle.ts` (testata).
  - Nuovo modulo `lib/truncationTitle.ts`: tooltip col nome completo mostrato **solo se il testo è davvero troncato** (misura `scrollWidth > clientWidth` al passaggio del mouse). *Motivazione*: un `title` fisso comparirebbe anche sui nomi brevi, già leggibili.
- **Manoscritto**
  - Nell'albero, il nome completo della scena compare al passaggio del mouse quando è troncato.
- **Editor**
  - **Selettore Stato** con pallini colorati (Idea, Bozza, Revisione, Finito) come nell'albero. *Motivazione*: le `<option>` di un `<select>` nativo non possono contenere grafica, quindi è stato creato il componente `StatusSelect` (menu personalizzato con ruoli ARIA listbox/option, chiusura con click esterno/Esc, frecce + Invio). Elenco stati e colori unificati in `lib/nodeStatus.ts`, ora fonte unica per albero ed editor.
  - **Commenti — conferma eliminazione**: "Elimina" chiede ora conferma, come le altre eliminazioni.
  - **Commenti — fix sottolineatura residua**: dopo l'eliminazione il testo restava sottolineato in parte. Causa: il mark veniva rimosso solo dal *primo* nodo di testo; un commento su testo con formattazione mista (es. un grassetto nel mezzo) occupa più nodi, e quelli successivi restavano marcati. Ora `removeMarkOccurrences` (`markScan.ts`) rimuove il mark da tutti i suoi intervalli, lasciando intatti testo, altra formattazione e gli altri commenti.
- **Personaggi, Località, Oggetti**
  - Nell'elenco, il nome completo compare al passaggio del mouse se troncato.
  - Nella scheda il campo nome occupa tutto lo spazio tra l'immagine e il bottone elimina (prima si restringeva al minimo: il contenitore non si espandeva).
- **Timeline**
  - **Nuovo campo "Data"** accanto a "Data narrativa", selezionabile dal calendario nativo e mostrato come `Nome giorno, GG/MM/AAAA` (es. `lunedì, 21/09/2026`; il nome del giorno segue la lingua dell'interfaccia). Ha un pulsante per rimuoverla. *Scelte*: la data è salvata come stringa ISO `AAAA-MM-GG` (nuova colonna `calendar_date`, migrazione `016_timeline_calendar_date.sql`, default `''` → gli eventi esistenti restano validi e senza data) perché una data di calendario non ha fuso orario e l'ordine alfabetico coincide con quello cronologico. La "Data narrativa" resta testo libero, invariata. Validazione Zod (rifiuta anche date inesistenti come 30 febbraio) in `shared/calendarDate.ts`.
  - **Ricerca**: la Data è inclusa nei criteri, sia in formato ISO sia come mostrata a schermo (es. `21/09`, `lunedì`).
  - **Vista compatta — ordinamento**: nuovo selettore *Ordina per* (Nessuno = ordine manuale attuale, Data narrativa, Data). Le righe compatte mostrano ora anche la Data. *Scelte*: è solo una vista, non modifica mai l'ordine salvato; gli eventi senza valore vanno in fondo; a parità si mantiene l'ordine manuale; la Data narrativa, essendo testo libero, usa un confronto "naturale" (`Anno 2` prima di `Anno 10`, maiuscole/accenti ignorati). Con un ordinamento attivo il trascinamento è disabilitato (come già durante la ricerca).
  - Esporta/importa e duplica progetto conservano la Data; gli export precedenti alla 0.3.4 si importano senza errori con data vuota.
- **Test**: da 124 a 158 (date, ricerca, ordinamento, tooltip, titolo finestra, stati, rimozione commenti su testo multi-nodo, migrazione 016 su un database v0.3.3, duplica/esporta).
- **Note per il futuro (non modificate in questa versione)**: la duplicazione e l'importazione di un progetto non copiano `color` e `group_name` di personaggi/località/oggetti né `color` degli eventi (limite preesistente).

## 0.3.3
- **Editor**
  - Sezione **Tag**: le colonne sono ora allineate con "Testo taggato" a sinistra (~80% dello spazio) e "Tag"/"Tipo" raggruppate a destra (~20%), invece di tre colonne di uguale larghezza.
  - **Commenti**: "Aggiungi commento" dal menu contestuale apre ora un modal dedicato per scrivere il testo (prima usava un semplice prompt di sistema), con lo stesso comportamento dei Tag — il testo commentato viene evidenziato nel documento.
  - Sezione **Commenti**: ogni voce ha ora anche **Modifica** (riapre il modal con il testo esistente, senza toccare il punto del testo commentato) oltre a **Elimina**; il click su una voce continua a spostare il cursore nella posizione esatta nel testo.
- **Timeline**
  - La barra di ricerca è stata spostata in alto a destra, prima del bottone "Vista compatta/estesa".
- **Impostazioni**
  - **Editor**: le voci sono ora raggruppate in tre sezioni — *Testo e sezioni* (Dimensione testo, Mostra Tag, Mostra Commenti, Mostra Revisioni — quest'ultima è una nuova opzione), *Correttore ortografico e dizionari* (l'elenco dei dizionari è stato ristretto alle sole lingue de-DE, en-GB, en-US, es-ES, fr-FR, it-IT, pt-PT), *Strumenti toolbar*.
- **Database**
  - **Analisi e pulizia**: rimosse 10 tabelle mai utilizzate da alcuna funzionalità reale dell'app (verificato incrociando ogni tabella con l'intero codice del processo main) — un vecchio sistema di tag mai collegato a un'interfaccia (sostituito dai tag inline nel testo di v0.3.0), una tabella di note libere mai esposta, i collegamenti scena→personaggio/località/oggetto/evento (mai popolati da alcuna interazione utente reale) e un log di controllo mai implementato. Le uniche tracce di queste tabelle erano nell'export/duplica progetto, che si limitava a copiarne il contenuto — sempre vuoto in pratica: nessuna perdita di dati reali.

## 0.3.2
- **Generale**
  - **Fix critico**: la sezione Impostazioni non era più raggiungibile ("Rendered more hooks than during the previous render"). Causa: in v0.3.1 avevo aggiunto un nuovo hook (`useState`/`useEffect` per le lingue dizionario disponibili) *dopo* un `return` condizionale già presente nel componente — una violazione delle regole di React sugli hook, innescata solo al primo render (quando le impostazioni non erano ancora caricate). Spostati tutti gli hook prima di qualunque `return` condizionale, e verificato lo stesso pattern in tutte le altre pagine dell'app.
  - Menu contestuale nativo e correttore ortografico ora compaiono **solo sui campi di testo genuini** (input, aree di testo, l'editor della scena) — non più su pulsanti, icone o altri elementi dell'interfaccia — e sono esclusi anche dalle **barre di ricerca**, pur essendo tecnicamente dei campi di testo. La soppressione avviene a livello di evento DOM (`contextmenu` con `preventDefault`), quindi il menu nativo lato Electron non viene proprio generato in quei casi.
- **Editor**
  - La sezione **Tag** ora mostra, per ogni voce, tre informazioni distinte: il **testo taggato** (la parola/frase selezionata nel documento), il **Tag** (il nome dell'entità collegata — può differire dal testo taggato) e il **Tipo** (Personaggio/Località/Oggetto/Evento).

## 0.3.1
- **Manoscritto**
  - **Fix**: bloccare un Gruppo non impediva il drag&drop dei capitoli al suo interno (solo le scene erano protette). Ora bloccare un capitolo (direttamente o perché dentro un gruppo bloccato) ne disabilita anche la maniglia di trascinamento, non solo quella delle sue scene.
- **Editor**
  - **Fix sezione "Commenti"**: l'elenco ora è calcolato scansionando il documento corrente invece di derivare solo dall'ordine di creazione — mostra le voci nell'**ordine in cui compaiono nel testo**, e cliccandone una il cursore si sposta esattamente lì (con scroll automatico). La stessa logica di scansione (nuovo modulo `markScan.ts`, testato) è condivisa con la nuova sezione Tag.
  - Nuova sezione **"Tag"** nel pannello scena, tra "Commenti" e "Revisioni": stesso comportamento dei Commenti (ordine per posizione nel testo, click per saltare al punto esatto), con un pallino colorato per riconoscere il tipo di entità (Personaggio/Località/Oggetto/Evento).
- **Impostazioni**
  - **Generale**: nuova **Dimensione testo** per tutta l'interfaccia (sidebar, albero, modali...) — distinta da quella già esistente per il solo testo dell'editor. Applicata scalando la dimensione carattere della radice del documento, cosa che scala automaticamente ogni utility Tailwind basata su rem.
  - **Editor — Dizionari**: sostituito il precedente "dizionario personalizzato" a file singolo (mai realmente collegato al correttore ortografico) con una selezione multipla delle lingue del correttore di sistema — più lingue possono essere attive insieme (es. Italiano e Inglese), applicate subito tramite `session.setSpellCheckerLanguages`.
  - **Editor — Abilita/Disabilita Tag** e **Abilita/Disabilita Commenti**: due nuovi interruttori che mostrano o nascondono, rispettivamente, i tag e i commenti nel testo (la formattazione visiva, non il dato — nulla viene eliminato), le relative voci nel menu contestuale nativo, e le sezioni dedicate nel pannello scena.

## 0.3.0
- **Generale**
  - La finestra ora ricorda dimensione, posizione e se era massimizzata/a schermo intero: viene salvata alla chiusura e ripristinata alla riapertura. Se il monitor su cui si trovava non è più collegato, la posizione viene scartata (si riapre centrata) invece di finire fuori dallo schermo visibile.
- **Manoscritto**
  - **Blocca Gruppo/Capitolo**: nuova opzione nel menu contestuale che impedisce lo spostamento (drag&drop) delle scene al suo interno — un'icona lucchetto indica i capitoli/gruppi bloccati. Bloccare un gruppo blocca a cascata le scene di tutti i capitoli che contiene.
  - **Verificato il sistema di Revisioni**: analizzata l'intera catena (editor → IPC → servizio → database). Non è disattivato: crea una revisione dopo una pausa di scrittura di almeno 30 secondi, al cambio di scena o al salvataggio manuale. Nessun bug riscontrato — il comportamento può risultare "silenzioso" durante sessioni di scrittura continua senza mai una pausa così lunga.
- **Editor**
  - **Dizionario**: il menu contestuale (click destro) è stato sostituito da un menu nativo del sistema operativo, che sulle parole sottolineate come errate mostra suggerimenti ortografici reali, "Aggiungi al dizionario" e "Ignora" (Electron non distingue un dizionario permanente da un elenco "ignora per questa sessione": entrambe le voci al momento condividono la stessa funzionalità). Copia/Taglia/Incolla restano disponibili nello stesso menu.
  - **Commenti al testo**: nuova voce "Aggiungi commento…" nel menu contestuale (richiede una selezione di testo), con una nuova sezione **Commenti** nel pannello della scena, tra "Dettagli scena" e "Revisioni" — elenca i commenti con testo e data, con possibilità di eliminarli.
  - **Tag al testo**: nuova voce "Aggiungi tag…" nel menu contestuale, con sottomenu Personaggio/Località/Oggetto/Evento — apre una finestra di ricerca per scegliere l'elemento specifico. Il testo taggato viene sottolineato con un colore diverso per tipo; **Ctrl/Cmd+click** su un tag naviga alla sezione corrispondente e seleziona automaticamente l'elemento (per gli eventi, cerca ed evidenzia anche tra le timeline non attualmente aperte). Il nome mostrato nel tooltip resta sempre aggiornato, perché viene risolto al momento e non salvato nel testo.
- **Esporta**
  - Aggiunto il separatore **tra i capitoli** (Nome Capitolo / Niente), analogo a quelli già esistenti tra parti e tra scene: con "Niente" il testo del capitolo prosegue senza un'intestazione visibile (utile per un'impaginazione "romanzo continuo"), senza introdurre interruzioni di pagina indesiderate quando il capitolo è il primo di una parte. Il titolo reale resta comunque nell'indice dell'EPUB anche quando non è mostrato nel testo.
- **Impostazioni**
  - Aggiunta l'opzione **Statistiche** tra gli strumenti configurabili della sidebar (Strumenti), visibile di default anche per i progetti già esistenti.
  - Avanzate → Stato database: aggiunto il pulsante **Nascondi/Mostra tabelle vuote**, accanto ad "Aggiorna" — le tabelle vuote sono nascoste di default.

## 0.2.11
- **Generale**
  - I campi di testo multiriga ora adattano l'altezza al contenuto, fino a un massimo di 10 righe (oltre le quali tornano a scorrere): nuovo componente `AutosizeTextarea`, sostituito ovunque nell'app (Personaggi, Località, Oggetti, editor scena, Timeline, modali di Capitolo/Progetto/Mappa concettuale, campi aggiuntivi).
- **Timeline**
  - La ricerca ora considera anche il titolo dell'evento (prima solo data e descrizione).
- **Esporta**
  - "Capitoli e scene da includere" rispetta ora lo stesso ordine del Manoscritto e mostra anche i Gruppi di Capitoli (con selezione a cascata: un gruppo seleziona/deseleziona tutti i suoi capitoli e le loro scene). L'ordinamento è condiviso con l'albero del Manoscritto tramite un nuovo modulo comune, per evitare che i due possano disallinearsi in futuro.
  - Aggiunto "Deseleziona tutto" accanto a "Seleziona tutto".
  - L'altezza massima della sezione ora si allinea esattamente alla colonna di sinistra, fino al bottone "Esporta come…" (calcolata dinamicamente in base al layout, non più basata su uno spazio disponibile arbitrario).
- **Impostazioni**
  - **Lingua**: primo passo della localizzazione dell'interfaccia. Aggiunta un'infrastruttura di traduzione (dizionario Italiano/Inglese + hook `useTranslation`) applicata per ora alla barra di navigazione principale e alla pagina Impostazioni; il resto dell'app resta in italiano e verrà tradotto incrementalmente nelle prossime versioni.

## 0.2.10
- **Personaggi, Località, Oggetti**
  - La barra di ricerca è ora in fondo alla sidebar, come nell'albero del Manoscritto (prima era in cima).
  - Il selettore colore mostra solo il color picker nativo: rimosso il campo testuale esadecimale.
  - Aggiunte le opzioni **Rinomina** e **Elimina** per i gruppi (icone a comparsa sull'intestazione del gruppo): eliminare un gruppo non elimina gli elementi al suo interno, che passano a "Senza gruppo".
- **Timeline**
  - **Fix**: il colore di un evento non veniva applicato. Causa: `TimelineRepository` (usato per gli eventi) ha un proprio elenco di colonne consentite, separato da quello generico di Personaggi/Località/Oggetti, e non era stato aggiornato in v0.2.9 quando è stato introdotto il campo colore.
  - Il selettore colore, oltre a non mostrare più il campo esadecimale, è stato spostato prima del campo data.
  - Aggiunta una barra di ricerca (per data e testo della descrizione), sulla stessa riga del campo "Nuovo evento", subito prima di esso.
- **Mappa concettuale**
  - **Fix vista Kanban**: le card finivano dietro le altre colonne durante il trascinamento, perché venivano "ritagliate" dall'`overflow-auto` della colonna di destinazione — un semplice z-index più alto non è sufficiente in questo caso. Risolto usando una `DragOverlay` (dnd-kit), che mostra la card trascinata in un livello separato, sopra tutto il resto.
- **Esporta**
  - La sezione "Capitoli e scene da includere" ora usa tutta l'altezza disponibile (prima era limitata a un'altezza fissa).
  - Aggiunto un nuovo **separatore tra le parti** (Nome Parte / Niente), analogo a quello già esistente tra le scene: le "parti" sono i Gruppi di Capitoli introdotti in v0.2.8. Indipendentemente dall'opzione scelta, ogni parte inizia sempre da una nuova pagina; con "Nome Parte" viene mostrato anche il nome del gruppo. Supportato in tutti i formati (DOCX, PDF/HTML, Markdown, testo semplice, EPUB — dove ogni parte diventa naturalmente una pagina a sé, essendo già un file XHTML separato nello spine).
- **Impostazioni**
  - Generale → Backup: rimossa la nota informativa sulle immagini nei backup.
  - Avanzate → Stato database: aggiunto un bottone "Mostra nella cartella" subito dopo il percorso del file del database.
  - Avanzate → Stato database: la tabella di tabelle/record è ora collassata di default (prima era aperta).

## 0.2.9
- **Personaggi, Località, Oggetti**
  - Aggiunto un campo **Colore** (color picker + hex modificabile) su ogni scheda, visibile anche come pallino colorato nella sidebar. Nuove colonne `color` nelle rispettive tabelle (migrazione `009_colors_and_groups.sql`).
  - Aggiunto un campo **Gruppo** (testo libero, con suggerimenti dai gruppi già usati nel progetto): la sidebar ora raggruppa le schede per questo valore, in sezioni collassabili ("Senza gruppo" sempre in fondo). Nuova colonna `group_name`.
  - Aggiunta una **barra di ricerca** in cima alla sidebar che filtra per nome e per il contenuto di tutti gli altri campi (ruolo, descrizione, note, tag, campi aggiuntivi).
  - Le tre pagine, quasi identiche, condividevano molto codice duplicato: la sidebar (ricerca + raggruppamento + pallino colore) e il campo colore sono stati estratti in componenti riutilizzabili (`EntityListSidebar`, `ColorField`), con la logica di filtro/raggruppamento in un modulo puro testato separatamente (`entityGrouping.ts`).
- **Timeline**
  - Aggiunto un campo **Colore** su ogni evento (barretta colorata a sinistra della riga in vista estesa, pallino in vista compatta).
- **Mappa concettuale**
  - Aggiunta l'opzione **Elimina mappa**, mancante rispetto a Timeline: stessa UX (pulsante "×" al passaggio del mouse sulla scheda attiva, richiede conferma, non permette di restare senza nessuna mappa).
  - **Vista Kanban — drag&drop card**: gli elementi (nodi) sono ora trascinabili da una colonna all'altra per cambiarne il gruppo, non solo le colonne stesse (che erano già riordinabili). Il click semplice per aprire il dettaglio di un nodo continua a funzionare (soglia di 5px prima che un movimento venga interpretato come trascinamento).
  - **Vista Kanban — descrizione nelle card**: era già presente nel codice ma limitata a una riga troncata; ora mostra fino a due righe per essere più leggibile.
  - **Vista Kanban — colonne**: aggiunte le opzioni **Rinomina** (doppio click sul titolo), **Elimina** (i nodi al suo interno non vengono eliminati, tornano "Senza gruppo" grazie al vincolo `ON DELETE SET NULL` già presente sullo schema) e **Collassa/Riduci** (la colonna si riduce a una striscia verticale con solo il titolo).

## 0.2.8
- **Sezione Manoscritto — Albero**
  - Aggiunti "Espandi tutto" / "Comprimi tutto" per capitoli e gruppi.
  - Rimosso il tooltip "Doppio click per rinominare" sui capitoli.
  - Aggiunta la voce "Crea copia" nel menu contestuale di capitoli (duplica anche tutte le sue scene) e scene.
  - **Gruppi di Capitoli**: nuovo tipo di nodo `group` (solo di primo livello, senza annidamento), con menu Rinomina/Elimina (l'eliminazione di un gruppo elimina anche i suoi capitoli, con conferma esplicita) e drag&drop per spostare i capitoli dentro/fuori un gruppo o riordinarli. La logica di riordino/spostamento è stata estratta in una funzione pura (`treeDnd.ts`) e testata separatamente dal componente React.
  - **Cerca**: sotto ogni risultato compare ora un'anteprima di alcune parole di contesto attorno al termine cercato (estratte dal testo della scena).
- **Sezione Manoscritto — Editor**
  - Nome capitolo e titolo scena ora sulla stessa riga (prima il capitolo era su una riga separata sopra).
  - **Toolbar**: aggiunta l'opzione "Testo normale" prima di H1/H2/H3.
  - **Fix "Cerca"**: prima restava sempre bloccata sulla prima occorrenza trovata (la ricerca ripartiva sempre dall'inizio del documento) e selezionava il testo senza portarlo in vista se fuori dallo schermo. Ora trova l'occorrenza successiva al cursore (con ricerca "ad anello") e scorre automaticamente alla posizione trovata.
  - Rimossa la percentuale di zoom mostrata a destra della toolbar.
  - **Fix dropdown che sparivano al movimento del mouse** (titoli, colori, liste, allineamento): causato da un gap CSS tra il bottone e il pannello che interrompeva l'hover durante un movimento diagonale del mouse. I dropdown sono ora ad apertura/chiusura via click, immuni al problema per costruzione.
  - La toolbar è ora renderizzata nell'ordine configurato in Impostazioni (prima l'ordine nel codice era fisso, indipendentemente dalle preferenze salvate) — prerequisito per il riordino via drag&drop introdotto in Impostazioni.
- **Sezione Manoscritto — Campo di testo**
  - Rimosso il bordo di focus blu di default del browser sul contenteditable.
  - Aggiunto uno sfondo distinto ("carta") per separare visivamente il campo di testo dalla pagina: più scuro del bianco in tema chiaro; in tema scuro, per non compromettere la leggibilità dato che la pagina è già molto scura, si è scelto un tono leggermente più chiaro anziché più scuro (scelta invertita rispetto alla richiesta originale e documentata nel CSS, dato che il principio — "distinguere nettamente" — resta lo stesso).
  - **Fix selezione testo blu illeggibile in tema scuro**: il colore di evidenziazione della selezione è ora esplicitamente definito per entrambi i temi (`::selection`), invece di ereditare lo stile di sistema.
  - **Nuovo menu contestuale** (click destro): Copia, Taglia, Incolla.
- **Sezione Impostazioni — Generale**
  - "Aspetto" e "Lingua" ora affiancati sulla stessa riga.
  - **Verificato**: le immagini inserite nelle scene sono già incluse in ogni backup, perché salvate come data URL (base64) direttamente nel database — non come file esterni. Aggiunta una nota esplicita nell'interfaccia.
  - **Backup automatico**: sostituito il semplice interruttore "alla chiusura" con una selezione di frequenza (Disattivato / Alla chiusura / ogni 30min, 1h, 2h, 4h — nuove colonne `backup_frequency`/`backup_max_count`, migrazione `008_backup_schedule.sql`). Aggiunto il campo "Numero massimo di backup da conservare": superata la soglia, i backup più vecchi vengono eliminati automaticamente.
- **Sezione Impostazioni — Editor**
  - **Strumenti toolbar**: ora un elenco trascinabile (drag&drop) che determina anche l'ordine reale con cui gli strumenti compaiono nella toolbar dell'editor, non solo la loro visibilità.
- **Sezione Impostazioni — Avanzate**
  - La tabella di stato del database (tabelle/record) è ora collassabile.
  - **Fix riavvio automatico bloccato** per "Svuota", "Reset completo" e "Carica backup": la causa era `app.exit(0)` chiamato nello stesso istante di `app.relaunch()`, che terminava il processo prima che la risposta IPC arrivasse al renderer (la Promise di attesa restava bloccata per sempre, dando l'impressione che il riavvio non partisse). Ora la risposta IPC viene consegnata prima di rimandare relaunch/uscita al giro successivo dell'event loop. "Svuota" ora riavvia l'app anch'esso, per coerenza con le altre due operazioni.

## 0.2.7
- **Generale**
  - Aggiunta l'icona applicativa ("MyBook Logo.svg") per finestra/taskbar e Info, generata in `build/icon.png` (finestra a runtime), `icon.ico` (Windows) e `icon.icns` (macOS).
  - Il titolo della finestra ora mostra `MyBook - <nome progetto> - <sezione attuale>`, aggiornato dinamicamente in base al progetto aperto e alla rotta corrente.
  - Disabilitata la menu bar nativa di Electron (il tasto `Alt` non la mostra più); il fullscreen resta disponibile con `F11`, reimplementato manualmente poiché prima dipendeva dalla voce di menu ora rimossa.
- **Sezione Esporta**
  - **Fix**: deselezionando un capitolo in "Esporta Manoscritto" vengono ora deselezionate automaticamente anche tutte le sue scene (e viceversa in selezione), evitando export con scene "orfane" di un capitolo escluso.
  - **Fix**: immagini, colore di sfondo del testo (evidenziazione) e separatori di pagina, inseriti nell'editor, venivano scartati silenziosamente durante l'export (bug nel livello di conversione condiviso `tiptap-convert.ts`, usato da TXT, Markdown, HTML, DOCX ed EPUB). Ora:
    - le immagini vengono incluse in tutti i formati (in DOCX con dimensioni reali lette dai byte del file, scalate per non sforare il margine pagina);
    - il separatore di pagina viene reso come reale interruzione di pagina in DOCX/PDF/HTML/EPUB, e come `\pagebreak` in Markdown;
    - il colore di sfondo del testo (evidenziazione), già corretto in HTML/EPUB, è stato corretto anche nell'export DOCX (mancava lo `shading` sul run di testo).
  - Rimosso il messaggio "In arrivo: analisi... e ricerche avanzate", non pertinente in questa sezione.
- **Sezione Info**
  - Aggiunta l'icona dell'app.
  - Aggiunta la sezione **Credits** (autore, tecnologie utilizzate).
  - Aggiunta la sezione **Licenza**: MyBook è ora distribuito con licenza **GNU GPL v3.0** (testo completo nel file `LICENSE` incluso nel progetto; `package.json` aggiornato di conseguenza).
  - Aggiunta la sezione **Link** (sito, repository, contatti), con apertura sicura nel browser di sistema tramite un nuovo canale IPC dedicato (`app.openExternal`, limitato ai protocolli http/https/mailto).

## 0.2.6
- Added **Oggetti** as a first-class project entity, with the same fields and UI pattern as Località.
- Added SQLite migration `007_objects.sql`, including `objects` and `scene_objects`.
- Added Object IPC API, repository support, preload bridge and sidebar navigation.
- Added Oggetto as a Mindmap node type.
- Scene selection in the Mindmap now displays scenes as `Capitolo - Scena`.
- Persisted the active project locally and reloads its document tree on application startup.
- Hardened MainLayout so transient IPC failures are not interpreted as a project logout.
- Added cancellation/error handling to Mindmap loading to prevent stale async results from replacing current state.
- Project duplication now copies objects, scene-object relationships and object tag associations, and remaps object references in Mindmap nodes.
