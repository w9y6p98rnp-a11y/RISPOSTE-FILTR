RispostaFlirt — Cloudflare Worker + PWA (iPhone ottimizzata)

Questa versione mantiene l'interfaccia attuale e aggiunge ottimizzazioni per iPhone/PWA:
- manifest con start_url/scope/id corretti;
- icona Apple 180x180;
- meta tag iOS per apertura come app web;
- safe-area per notch e indicatore Home;
- pulsante + in alto: su Android usa il prompt nativo quando disponibile, su iPhone mostra le istruzioni Safari;
- archivio conversazioni e memoria restano nel dispositivo tramite IndexedDB/localStorage.

Per iPhone: apri l'URL in Safari > Condividi > Aggiungi a Home > attiva "Apri come app web" se compare > Aggiungi.
