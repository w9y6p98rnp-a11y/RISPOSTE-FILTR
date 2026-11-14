RISPOSTAFLIRT V13 – FIX COMPATIBILITÀ GEMMA3 / ELENCO NUMERATO

Basata sull'archivio V13 corretto precedente.

Modifiche in reply.js:
- Il Worker continua ad accettare il JSON valido come prima.
- Se Gemma restituisce un elenco numerato, il Worker recupera le risposte e le converte nel formato { style, text } richiesto dall'app.
- Se Gemma fornisce intestazioni STILE: NOME per tutti gli stili del blocco, vengono rispettate.
- Se Gemma omette le intestazioni, gli stili vengono assegnati usando l'ordine noto della richiesta: prima tutte le risposte del primo stile, poi quelle del secondo.
- Se le intestazioni sono incomplete, viene usato l'ordine della richiesta invece di attribuire tutte le risposte al primo stile.
- Un output realmente incompleto continua a essere rifiutato: non vengono inventate le risposte mancanti e resta disponibile il fallback Gemini/OpenRouter.
- Il prompt locale specifica anche un formato testuale alternativo con intestazioni di stile, se Gemma non riesce a produrre JSON.
- Il limite di generazione locale passa da 1400 a 1800 token per ridurre il rischio di troncamento dell'output.

Quantità mantenute: 3 risposte per ogni stile normale; 5 per ogni stile segreto.
Non sono stati modificati worker.js, app.js, interfaccia, memoria, cronologia, profili, tunnel, token, database o configurazione Cloudflare.

Verifiche eseguite:
- controllo sintassi JavaScript con node --check;
- test parser su elenco numerato senza etichette;
- test parser con intestazioni esplicite per ogni stile;
- test parser con intestazione parziale e assegnazione secondo l'ordine richiesto;
- verifica che un elenco incompleto venga ancora rifiutato.

Distribuzione: sostituire i file del progetto con quelli contenuti nell'archivio e distribuire il Worker aggiornato su Cloudflare. Non modificare i segreti o il database.
