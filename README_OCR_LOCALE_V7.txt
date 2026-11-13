RISPOSTAFLIRT — OCR LOCALE PER SCREENSHOT (V7)

COSA CAMBIA
- Quando viene caricato uno screenshot, RispostaFlirt prova a estrarre il testo direttamente nel browser con Tesseract.js 7 (lingue italiano + inglese).
- Il testo OCR viene salvato nello stato locale separato della singola ragazza e riutilizzato per la generazione delle risposte segrete.
- Se l'OCR riesce, al Worker viene inviato il testo estratto e non l'immagine: Gemma riceve testo invece di dover eseguire la lettura visiva.
- Lo screenshot originale/compresso resta nella cronologia visiva dell'app.
- Se il motore OCR non si carica, il testo è insufficiente o la confidenza è troppo bassa, l'app torna automaticamente al percorso precedente e invia l'immagine a OlliteRT.
- Il worker OCR viene riutilizzato durante la sessione per evitare di ricrearlo a ogni immagine.
- Il file index.html aggiorna il parametro di versione di app.js per evitare la cache della vecchia logica.

REQUISITI E LIMITI
- Al primo utilizzo serve una connessione Internet per caricare Tesseract.js e i dati linguistici; Tesseract.js usa la cache del browser per riutilizzare i dati nelle analisi successive.
- L'OCR viene eseguito sul dispositivo che apre RispostaFlirt (per esempio iPhone), non sul realme.
- La disposizione delle bolle può essere appiattita dall'OCR: il modello deve ricostruire i turni dal testo e dalla cronologia. Se il testo è poco leggibile, si usa la visione originale.
- Questa modifica non garantisce un tempo specifico: va misurata sul dispositivo reale, soprattutto al primo avvio.
- Il numero di risposte, le categorie, le cronologie, le schede delle ragazze, il tunnel e i segreti Cloudflare non vengono modificati.

FILE MODIFICATI
- app.js: caricamento OCR, estrazione testo, stato OCR per ragazza, invio del testo al Worker e riuso per risposte segrete.
- reply.js: accetta analisi basate su testo OCR e aggiorna le istruzioni dei prompt.
- index.html: aggiornamento cache-buster di app.js.

INSTALLAZIONE
Caricare i file del progetto mantenendo la struttura completa e fare il deploy del Worker/Assets su Cloudflare come per le versioni precedenti. Non modificare token, database D1, tunnel o configurazioni di sicurezza.
