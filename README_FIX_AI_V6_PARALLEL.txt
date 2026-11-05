RISPOSTAFLIRT — FIX AI V6 PARALLEL

Questa versione parte dal progetto completo caricato dall'utente.

Correzioni:
- Gli 8 stili normali vengono divisi in due blocchi da massimo 4 stili.
- I due blocchi vengono generati in parallelo, invece di attendere otto chiamate AI consecutive.
- I risultati vengono ricomposti nell'ordine personalizzato originale.
- Il timeout della richiesta normale nell'app passa da 62 a 90 secondi.
- L'output per blocco resta limitato a una dimensione gestibile; OpenRouter mantiene il limite di 4500 token e i tentativi di recupero.
- Aggiornato il parametro di versione di app.js per evitare che il browser mobile riutilizzi lo script precedente.

Non sono state modificate autenticazione, database D1, profili, memoria, screenshot, impostazioni, voci, grafica o funzionalità vocali.

DISTRIBUZIONE:
1. Estrai lo ZIP.
2. Carica tutti i contenuti della cartella RISPOSTE-FILTR-main direttamente nella root del repository GitHub RISPOSTE-FILTR, sostituendo i file esistenti.
3. Non creare un nuovo database.
4. Non modificare né condividere i segreti/API key Cloudflare.
5. Attendi il deployment completato prima di testare.

Nota: la generazione parallela riduce il tempo di attesa, ma non può garantire che i provider AI gratuiti siano disponibili o che non applichino limiti di utilizzo.
