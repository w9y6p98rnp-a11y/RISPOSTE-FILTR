RISPOSTAFLIRT – V11 GEMMA3-1B-IT: PROMPT ULTRA-COMPATTO

BASE
Questa versione parte dal pacchetto V10 già caricato dall'utente.

MODIFICA PRINCIPALE
- Riscritto il prompt locale OlliteRT in forma molto più compatta.
- Ridotti i limiti dei dati variabili inviati a Gemma: OCR 320 caratteri (conservando la parte finale), indicazione 150, memoria 130, conversazione recente 2 messaggi da 75 caratteri, audio 120.
- Ridotte le istruzioni fisse e rimosso l'esempio JSON molto esteso.
- Mantenuti ruoli IO/LEI, priorità screenshot, memoria essenziale, istruzioni personalizzate, evitare risposte precedenti e formato JSON.
- Mantenute le generazioni a blocchi di due stili, in sequenza.
- Mantenute le quantità: 5 risposte per stile, Erotica 5 e Hot 10.
- Non viene inviato il payload immagine a Gemma3-1B-IT; il modello usa il testo OCR. I fallback cloud mantengono il loro comportamento.
- Non sono state modificate cronologia salvata, profili, database, autenticazione, token o tunnel.

OBIETTIVO E LIMITE
La modifica riduce sensibilmente la dimensione del prompt che causava l'errore 1300/1024. Il limite effettivo va confermato nel nuovo Activity Log di OlliteRT. Il tempo massimo di 60 secondi non è garantibile: dipende dalla velocità di generazione del telefono e dal numero di risposte richieste.

DEPLOY
Sostituire nel repository GitHub soltanto reply.js con quello di questo pacchetto e distribuire il Worker. Lasciare invariati wrangler.toml, variabili, segreti e tunnel.

TEST
1. Lasciare OlliteRT Gemma3-1B-IT e Quick Tunnel attivi.
2. Eseguire una prova con uno screenshot breve.
3. In Activity Log verificare che non compaia più Context Exceeded e che l'input sia inferiore a 1024 token.
4. Verificare che ogni stile riceva il numero previsto di risposte e che non ci siano duplicati.
