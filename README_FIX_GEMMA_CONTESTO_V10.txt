RISPOSTAFLIRT – OTTIMIZZAZIONE CONTESTO GEMMA (V10)

Questa versione parte dalla V9 e corregge il problema mostrato nei log OlliteRT: input 1195/1024 token e richieste rifiutate per contesto troppo lungo.

MODIFICHE
- Riduce a 900 caratteri il testo OCR inviato nel prompt locale (V9 ne inviava fino a 1800).
- Non invia più lo screenshot come payload immagine a Gemma3-1B-IT: il modello configurato è testuale e l'immagine aumenta inutilmente il contesto. Gemma usa il testo OCR estratto dall'app.
- Mantiene lo screenshot per i fallback cloud Gemini/OpenRouter, se configurati.
- Mantiene 5 risposte per ogni stile normale, 5 per Erotica e 10 per Hot.
- Mantiene blocchi di due stili e la generazione sequenziale per non sovraccaricare il telefono.
- Non cancella né modifica cronologia, profili, memoria, screenshot salvati, database, token o tunnel.

LIMITE DI VELOCITÀ
Questa correzione mira prima di tutto a eliminare il rifiuto per contesto. Non può garantire 60 secondi: con 8 stili e 40 risposte, la generazione locale sul telefono può richiedere più di un minuto. Ridurre ulteriormente il tempo senza diminuire il numero di risposte richiede un modello/dispositivo più veloce o un servizio AI esterno disponibile. Non è corretto promettere un tempo fisso.

DEPLOY
Sostituire nel repository GitHub soltanto reply.js con quello di questo pacchetto e distribuire il Worker. Lasciare invariati wrangler.toml, variabili e segreti Cloudflare. La variabile OLLITERT_MODEL deve corrispondere esattamente al modello effettivamente avviato in OlliteRT (nei log V9: Gemma3-1B-IT).

DOPO IL DEPLOY
1. Lasciare OlliteRT e il Quick Tunnel attivi.
2. Fare una sola prova con uno screenshot contenente poco testo.
3. Controllare Activity Log: il nuovo errore 1195/1024 non dovrebbe più comparire.
4. Misurare il tempo reale; se supera 60 secondi, il limite è la velocità di generazione del dispositivo/modello, non il contesto.
