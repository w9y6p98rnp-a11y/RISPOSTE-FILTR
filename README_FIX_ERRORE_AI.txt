RISPOSTAFLIRT - OTTIMIZZAZIONE GENERAZIONE E RETE

Modifiche incluse:
- Primo tentativo Gemini 3.5 Flash Lite: massimo 10 secondi.
- Se non risponde, passaggio anticipato a OpenRouter: massimo 12 secondi per tentativo.
- OpenRouter mantiene un solo nuovo tentativo per errori temporanei o risposta vuota.
- Se OpenRouter non riesce, restano Gemini 3.6 Flash e 3.8 Flash come fallback finali: massimo 8 secondi ciascuno.
- I provider AI restano sequenziali: nessuna chiamata AI parallela e nessun consumo simultaneo di quote.
- Le letture D1 indipendenti restano in parallelo.
- Timeout browser a 70 secondi sia per generazione normale sia segreta.
- Prompt, numero di risposte, categorie, grafica, autenticazione e dati restano invariati.

NOTA SUL WI-FI:
"Nessun servizio AI gratuito disponibile" significa che nessun provider ha restituito una risposta utilizzabile. Le chiamate a Gemini/OpenRouter partono dal Worker Cloudflare. La differenza Wi-Fi/4G può dipendere anche dal percorso browser -> Cloudflare (DNS, IPv6, filtri di rete) o da cache/sessione. Questa modifica migliora il fallback e i tempi, ma non può garantire disponibilità continua dei provider gratuiti.

Dopo il caricamento:
1. Sostituisci app.js e reply.js con quelli inclusi.
2. Lascia invariati gli altri file e i segreti Cloudflare.
3. Attendi il deploy.
4. Chiudi e riapri la PWA su iPhone.

Controlla che database_id in wrangler.toml contenga il tuo ID D1 reale. Non sostituire i segreti API.
