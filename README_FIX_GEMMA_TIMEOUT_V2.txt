CORREZIONE TIMEOUT GEMMA - V2

Modifiche limitate:
- reply.js: timeout della singola richiesta OlliteRT portato da 90 a 300 secondi.
- app.js: attesa massima del browser portata da 6 a 11 minuti, così può attendere i due blocchi normali in sequenza.
- Elaborazione dei blocchi mantenuta sequenziale per non sovraccaricare il realme.
- Gemma resta il motore principale; Gemini e OpenRouter restano fallback.
- Quantità, stili, cronologie, memoria, screenshot e funzioni dell'app non vengono intenzionalmente modificati.

Perché:
Il log OlliteRT mostrava una generazione ancora in corso dopo circa 130 secondi e poi
"Client disconnected — generation stopped". La versione precedente interrompeva la
chiamata OlliteRT dopo 90 secondi. Il timeout più lungo consente a Gemma più tempo.

Limiti:
- Il timeout è un limite massimo, non una garanzia che Gemma completi la generazione.
- Se Android chiude OlliteRT, il tunnel cade o la richiesta del browser viene interrotta,
  Gemma può ancora fallire e verranno usati i fallback.
- Il browser deve restare aperto durante la generazione.
- I blocchi normali sono due e vengono elaborati uno alla volta; il tempo totale può
  avvicinarsi al limite di attesa del browser.
- Non sono stati modificati i token, le variabili Cloudflare, D1 o lo script Termux.
