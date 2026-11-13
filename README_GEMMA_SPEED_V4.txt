RISPOSTAFLIRT - GEMMA SPEED V4

Questa versione parte dalla V3 STREAM FIX.

Modifiche in reply.js:
- Mantiene Gemma/OlliteRT come motore principale e lo streaming SSE.
- Riduce il contesto secondario inviato a Gemma: ultimi 4 messaggi conversazione, ultimi 3 messaggi dell'utente e ultime 3 risposte generate da evitare.
- Riduce i limiti di note/memoria/profilo inclusi nel prompt locale, senza cancellare né modificare i dati salvati.
- Chiede risposte più concise (circa 10-18 parole) per ridurre i token generati. Le istruzioni personalizzate esplicite di lunghezza diversa restano prioritarie.
- Riduce max_tokens per blocco da 4500 a 3000 come limite massimo, non come quantità obbligatoria.

Non modifica il numero di risposte: 5 per stile normale, 5 Erotiche e 10 Hot. Non modifica cronologie, schede ragazze, database, tunnel, token o configurazione Cloudflare.

Installazione:
Sostituire nel repository GitHub soltanto reply.js con quello contenuto nello ZIP e distribuire il Worker Cloudflare. Il resto dei file non va sostituito.

Nota: la riduzione dei tempi è attesa ma va misurata sul realme; la velocità dipende anche dal dispositivo, dal modello e dalla lettura dello screenshot. Le quantità di risposte sono mantenute.
