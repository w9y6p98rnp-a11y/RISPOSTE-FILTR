RISPOSTAFLIRT – VERSIONE GRATUITA CLOUDFLARE

Questa versione mantiene la stessa app finale, ma sostituisce Netlify con Cloudflare Pages + Pages Functions.

FUNZIONI
- Tema scuro.
- Più ragazze con chat/memoria/screenshot separati.
- Screenshot nella chat come messaggio di Lei.
- Salva come mio messaggio: risposta subito sotto lo screenshot.
- Analisi automatica quando carichi/scatti uno screenshot.
- 18 risposte + risposta consigliata.
- Persistenza locale tramite IndexedDB.
- Eliminazione selettiva delle ragazze/chat.
- Gemini 3.5 Flash-Lite / Gemini 3.8 Flash + OpenRouter Free.

DEPLOY GRATUITO CONSIGLIATO
1. Crea un account GitHub gratuito e un nuovo repository pubblico, ad esempio "rispostaflirt".
2. Carica TUTTI i file e le cartelle di questo ZIP nel repository, mantenendo la cartella "functions/api/reply.js".
3. Su Cloudflare vai in Workers & Pages > Create application > Pages > Connect to Git.
4. Collega GitHub e seleziona il repository.
5. Build command: lascia vuoto.
6. Build output directory: lascia la root del progetto / .
7. Pubblica il progetto.
8. Dopo il primo deploy: Workers & Pages > il tuo progetto > Settings > Variables and Secrets.
9. Aggiungi come SECRET:
   GEMINI_API_KEY = la tua chiave Gemini
   OPENROUTER_API_KEY = la tua chiave OpenRouter
10. Salva e fai un nuovo deploy.

IMPORTANTE
- Non mettere mai le API key dentro app.js o dentro i file pubblici.
- Le chiavi restano lato server nella Pages Function.
- Non usare Netlify per questa versione.
- Cloudflare Pages Functions usa la cartella /functions e crea automaticamente la route /api/reply.
