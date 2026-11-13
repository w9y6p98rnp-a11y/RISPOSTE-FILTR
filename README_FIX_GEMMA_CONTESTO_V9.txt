RISPOSTAFLIRT – FIX CONTESTO GEMMA 1B (V9)

Questa versione riduce il prompt inviato a OlliteRT/Gemma per evitare l'errore di contesto (es. 1796 token richiesti con limite 1024).

MODIFICHE
- Mantiene 5 risposte per ogni stile e 10 per Hot.
- Elabora al massimo 2 stili per richiesta locale, invece di 4.
- Riduce il contesto inviato a Gemma: ultimi 2 messaggi, memoria e note abbreviate, meno risposte precedenti.
- Limita il testo OCR inviato al modello locale a 1800 caratteri.
- Riduce il limite massimo di output locale a 1400 token.
- Non cancella la cronologia né i dati salvati nell'app.
- Mantiene il Quick Tunnel registrato in D1 e il fallback già presente.

IMPORTANTE
Questa modifica riduce il rischio di superare il limite di contesto, ma non può garantire risposte entro 60 secondi: la velocità dipende dal telefono, dal modello e dalla lunghezza delle risposte. Con Gemma 1B e 8 stili la generazione può richiedere più tempo perché i blocchi sono sequenziali per non sovraccaricare il telefono.

DEPLOY
Carica il contenuto di questa cartella nel repository GitHub, mantenendo la struttura delle cartelle, poi esegui il deploy del Worker. Il wrangler.toml incluso indica Gemma3-1B-IT, il modello mostrato attualmente sul telefono. Se la variabile OLLITERT_MODEL è impostata in Produzione nella dashboard Cloudflare, verifica che abbia lo stesso valore. Non modificare OLLITERT_TOKEN, TUNNEL_UPDATE_TOKEN o altri segreti.
