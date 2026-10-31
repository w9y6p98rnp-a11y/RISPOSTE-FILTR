RISPOSTAFLIRT — CLOUDFLARE WORKER + STATIC ASSETS

Questa versione usa un vero Cloudflare Worker, non solo risorse statiche.
In questo modo la sezione Variables and Secrets è disponibile e le chiavi API
possono essere usate server-side.

STRUTTURA
- public/ contiene l'app web originale
- worker.js gestisce /api/reply e serve gli asset
- reply.js contiene la logica AI
- wrangler.toml configura il Worker

SECRET DA AGGIUNGERE IN CLOUDFLARE
GEMINI_API_KEY
OPENROUTER_API_KEY

NON inserire le chiavi nel repository GitHub.
