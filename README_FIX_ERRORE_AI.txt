FIX ERRORE AI - RISPOSTAFLIRT

Questa versione mantiene le funzioni e i file del progetto completo.

Modifica in reply.js:
- I provider AI restano in sequenza: non vengono avviati in parallelo.
- Se OpenRouter risponde HTTP 200 ma senza testo, viene eseguito un solo nuovo tentativo automatico.
- Se OpenRouter restituisce un errore temporaneo (HTTP 429 o 5xx), viene eseguito un solo nuovo tentativo.
- Vengono gestite anche le risposte OpenRouter il cui contenuto testuale arriva come array.
- In caso di errore definitivo viene mostrato un messaggio più chiaro.

INSTALLAZIONE GITHUB:
1. Scaricare ed estrarre lo ZIP.
2. Caricare/sostituire nella root del repository tutti i file della cartella del progetto.
3. Conservare la cartella migrations.
4. Verificare wrangler.toml e impostare il database_id corretto per il proprio database D1.
5. Non pubblicare chiavi API o segreti nel repository: configurarli come Cloudflare Worker Secrets.

Il retry automatico non può risolvere un'interruzione generale dei provider o una chiave API mancante/non valida. In quel caso il messaggio finale indica di controllare la configurazione o riprovare più tardi.
