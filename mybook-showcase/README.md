# MyBook — sito vetrina

Sito statico responsive per MyBook. Include screenshot originali del manuale, carosello con lightbox e una pagina download dedicata (`download.html`).

## Download dedicato e statistiche

Tutti i pulsanti/link di download nella home (header, hero e sezione finale) e il collegamento Download nel footer portano a `download.html`. Anche la pagina download ha collegamenti per tornare al progetto.

Umami registra le visualizzazioni di `download.html` come pageview separata (percorso `/MyBook/download.html`) e invia anche l'evento personalizzato `download_page_view`. I clic sull'installer generano `download_click` con nome asset e versione. Il normale pageview tracking di Umami deve essere attivo.

Per attivare Umami, crea un sito su [Umami Cloud](https://cloud.umami.is/) e sostituisci `INSERISCI-UMAMI-WEBSITE-ID` nell'attributo `data-website-id` **sia in `index.html` sia in `download.html`**. Fino a quel momento non vengono raccolte visite.

## Download dinamico e contatore

`download.html` interroga l'API pubblica GitHub `repos/nicolavanella/MyBook/releases/latest`, sceglie l'installer in base al sistema operativo e mostra la somma dei download degli installer della release più recente. Il conteggio non è il totale storico di tutte le release. La pagina usa `/releases/latest`, quindi mostra solo l'ultima release stabile e non seleziona le prerelease Nightly. Sotto il pulsante principale elenca anche gli altri installer pubblicati nella stessa release; i link alle release GitHub consentono di raggiungere Nightly e versioni precedenti. Se la API non è disponibile, il pulsante rimanda all'ultima release stabile.

## Pubblicazione

Pubblica l'intero contenuto della cartella con GitHub Pages / GitHub Actions. Mantieni `index.html`, `download.html` e `assets/` allo stesso livello. URL della pagina download: `https://nicolavanella.github.io/MyBook/download.html`.


## Aggiornamento pagina Download

La pagina mostra la versione stabile, la data di pubblicazione, il conteggio dei download degli installer della release e gli altri asset disponibili. Il collegamento alle release GitHub permette di consultare separatamente Nightly/prerelease e versioni precedenti. Il rilevamento del sistema operativo seleziona un installer compatibile; su macOS, dove il browser non espone sempre in modo affidabile l'architettura, gli altri installer restano disponibili come link alternativi.
