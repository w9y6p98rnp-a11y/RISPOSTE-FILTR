RISPOSTAFLIRT — OTTIMIZZAZIONE LLAMA ESCLUSIVO

Modifiche:
- L'unico modello utilizzato è @cf/meta/llama-3.2-11b-vision-instruct tramite env.AI.
- Non esiste fallback automatico verso Gemini, Groq o OpenRouter.
- Lo screenshot Llama viene ridimensionato al massimo a 896x1600 e JPEG qualità 0,66.
- Il browser invia al Worker una sola immagine dedicata a Llama, evitando i duplicati per altri provider.
- La richiesta client e il controllo interno attendono più a lungo (fino a circa 100-115 secondi).
- Il massimo output è stato portato a 2048 token per contenere il tempo di generazione mantenendo il numero di risposte richiesto.
- Se Llama fallisce o restituisce un numero incompleto di risposte, l'app mostra l'errore e non cambia modello.

DEPLOY
Caricare/sostituire i file canonici index.html, app.js e reply.js nella cartella principale del progetto e mantenere worker.js, auth.js, style.css e wrangler.toml già presenti. Il binding [ai] binding = "AI" deve rimanere attivo in wrangler.toml/Cloudflare.

NOTA
L'ottimizzazione riduce il peso dell'immagine e la duplicazione del payload; non può garantire un tempo fisso di risposta perché la velocità dipende anche dalla capacità e dai limiti di Workers AI. La documentazione Cloudflare segnala errori distinti per timeout (3007/3008) e capacità temporaneamente esaurita (3040).
