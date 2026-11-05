RISPOSTAFLIRT - FIX FALLBACK AI E RISPOSTE VUOTE

Modifiche incluse in questa versione:
- Gemini 3.5 Flash Lite resta il primo tentativo rapido.
- OpenRouter viene provato subito dopo Gemini, con timeout di 22 secondi per tentativo.
- OpenRouter effettua un secondo tentativo se riceve una risposta vuota o non valida, oppure un errore temporaneo HTTP.
- Se OpenRouter risponde senza testo, il dettaglio indica modello e finish_reason quando disponibili, invece di mostrare soltanto «Risposta AI vuota».
- Se Gemini segnala quota esaurita, gli altri modelli Gemini vengono saltati: si evita di perdere tempo riprovando modelli della stessa quota.
- Gemini 3.6 Flash e 3.8 Flash restano fallback quando la quota Gemini non risulta esaurita.
- I provider AI restano sequenziali: nessuna chiamata AI parallela.
- Le letture D1 indipendenti restano in parallelo.
- Il timeout del browser resta a 70 secondi.
- Prompt, numero di risposte, categorie, grafica, autenticazione, dati e funzioni dell'app non sono stati modificati.
- La funzione dei messaggi vocali resta rimossa.

NOTA IMPORTANTE:
OpenRouter usa il router gratuito «openrouter/free». La disponibilità e la velocità dipendono dai modelli gratuiti disponibili in quel momento: questa correzione migliora i tentativi e rende gli errori più leggibili, ma non può garantire disponibilità continua dei provider gratuiti.

DOPO IL CARICAMENTO:
1. Estrai la cartella RispostaFlirt.
2. Carica i file contenuti direttamente nella root del repository GitHub, sostituendo quelli precedenti.
3. Non modificare o ricreare le chiavi API e i segreti Cloudflare.
4. Attendi il deploy Cloudflare.
5. Chiudi e riapri la PWA su iPhone.

Controlla che database_id in wrangler.toml contenga il tuo ID D1 reale. Non condividere mai le chiavi API.
