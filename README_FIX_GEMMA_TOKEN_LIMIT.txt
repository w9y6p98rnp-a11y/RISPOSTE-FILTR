CORREZIONE LIMITE TOKEN GEMMA / OLLITERT

Questa versione modifica soltanto reply.js per la generazione AI:
- Gemma tramite OlliteRT riceve un prompt dedicato più compatto, con contesto selezionato e limiti di lunghezza sui campi accessori.
- Gemini e OpenRouter continuano a ricevere il prompt completo originale come fallback.
- Restano invariati il numero di risposte (5 per stile, 10 per Hot), gli stili configurati, la cronologia salvata nell'app e le altre funzioni.
- Non vengono registrati prompt, messaggi privati, screenshot o token nei log.

INSTALLAZIONE
1. Sostituire/caricare su GitHub tutti i file contenuti nello ZIP, mantenendo la cartella del progetto.
2. Eseguire il normale deploy Cloudflare.
3. Lasciare attivi OlliteRT e Cloudflare Tunnel sul telefono Android.
4. Provare una generazione e controllare il log POST /api/reply.

NOTA
La correzione riduce il testo inviato a Gemma, ma non può garantire che ogni screenshot rientri nel limite di contesto: immagini molto grandi possono consumare token aggiuntivi. Se resta un errore, usare il nuovo log diagnostico per distinguere prompt testuale e immagine.
