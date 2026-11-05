RISPOSTAFLIRT – FIX AI V4

Correzione del troncamento delle risposte AI:
- La generazione viene suddivisa in blocchi da massimo 4 stili.
- Le 40 risposte normali non vengono più richieste tutte in una singola risposta JSON.
- I risultati dei blocchi vengono riuniti prima di essere restituiti all'app.
- Il timeout del browser è stato aumentato per consentire il completamento dei due blocchi.
- Restano invariati i profili separati, la memoria, le impostazioni, gli screenshot, le risposte vocali e il database.

IMPORTANTE
Il codice non può superare le quote giornaliere dei provider gratuiti. Se Gemini ha esaurito la quota, l'app passa a OpenRouter. La suddivisione riduce il rischio di finish_reason=length, ma non garantisce la disponibilità dei provider gratuiti.

Distribuzione
Sostituire i file del repository con il contenuto di questa cartella. Non creare un nuovo database e non modificare i segreti Cloudflare.
