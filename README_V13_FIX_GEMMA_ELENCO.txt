RISPOSTAFLIRT V13 – FIX RISPOSTE GEMMA IN ELENCO NUMERATO

Basata sulla V12 con quantità ridotte.

Modifica:
- Il Worker riconosce anche le risposte di Gemma restituite come elenco numerato, senza JSON.
- Le risposte vengono associate agli stili nell'ordine richiesto dal prompt.
- Il Worker accetta l'elenco solo se contiene esattamente il numero previsto per il blocco e per ciascuno stile.
- Quantità mantenute: 3 per ogni stile normale; 5 Erotica + 5 Hot.
- Il JSON valido continua a essere accettato come prima.
- Gemini e OpenRouter restano disponibili solo come fallback se la risposta locale è vuota, incompleta o non riconoscibile.

Non sono stati modificati memoria, cronologia, profili, tunnel, token, configurazione CPU o impostazioni Cloudflare.

Distribuzione: sostituire i file del progetto con quelli contenuti in questo archivio e distribuire il Worker aggiornato su Cloudflare. Non modificare i segreti o il database.
