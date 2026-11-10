AGGIORNAMENTO GEMMA + OLLITERT PER RISPOSTAFLIRT

Questa versione mantiene la struttura del progetto e le funzioni già presenti.

FILE AGGIORNATI
- reply.js: usa OlliteRT/Gemma come primo provider AI. Se OlliteRT non risponde o restituisce un errore, prova i provider di riserva già supportati (Gemini e OpenRouter), se le rispettive chiavi sono configurate.
- app.js: timeout lato browser portati da 90 a 360 secondi per dare più tempo alle generazioni lente.

IMPOSTAZIONI CLOUDFLARE RICHIESTE (AMBIENTE PRODUZIONE)
Configurare in Workers & Pages > progetto > Impostazioni > Variabili e segreti di runtime:

1) OLLITERT_BASE_URL (variabile di testo): URL base del tunnel Cloudflare che termina con /v1
   Esempio di formato: https://NOME-TUNNEL.trycloudflare.com/v1
   Non aggiungere /chat/completions: lo aggiunge il backend.

2) OLLITERT_MODEL (variabile di testo): nome modello esatto esposto da OlliteRT.
   Esempio usato nei test: Gemma-4-E2B-it

3) OLLITERT_TOKEN (SEGRETO): token Bearer configurato in OlliteRT.
   Non inserirlo in app.js, index.html, GitHub, README o URL.

MANTENERE ANCHE I SEGRETI ESISTENTI
Non eliminare GEMINI_API_KEY o OPENROUTER_API_KEY se si desidera conservarli come provider di riserva. La trascrizione audio, se usata, continua a richiedere GEMINI_API_KEY.

PUBBLICAZIONE
Caricare i file della cartella principale nella root del repository GitHub, mantenendo worker.js, reply.js e auth.js nella stessa cartella. Poi attendere il deploy Cloudflare.

NOTE IMPORTANTI
- Le categorie e le quantità di risposte non sono state ridotte: il backend continua a richiedere 5 risposte per stile; Hot mantiene la regola speciale già presente nel progetto.
- Il timeout di 6 minuti in app.js riguarda il browser. Non garantisce da solo che Cloudflare, il tunnel o il telefono possano mantenere ogni richiesta aperta per 6 minuti.
- Il telefono Android deve essere acceso, con OlliteRT in esecuzione e il tunnel attivo. Se si usa un Quick Tunnel, il suo URL può cambiare dopo il riavvio: in quel caso aggiornare OLLITERT_BASE_URL su Cloudflare.
- Il pacchetto non contiene il token OlliteRT né modifica i segreti del tuo account.
