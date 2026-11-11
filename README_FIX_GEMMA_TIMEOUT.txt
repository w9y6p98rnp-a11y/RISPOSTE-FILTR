FIX GEMMA / TIMEOUT 524

Questa versione modifica solo la gestione delle richieste AI in reply.js.
- I blocchi di stili vengono elaborati uno alla volta, non in parallelo, per non sovraccaricare il telefono.
- La chiamata OlliteRT ha un limite locale di 90 secondi, inferiore al timeout tipico del proxy Cloudflare.
- Se OlliteRT restituisce HTTP 524/522/504 o va in timeout, viene aperto un circuito per il resto della richiesta: i blocchi successivi usano i fallback e non inviano altro lavoro a Gemma.
- Il segnale di annullamento della richiesta in ingresso viene propagato alla fetch verso OlliteRT; se il client annulla, non vengono avviati altri fallback.
- Non vengono ridotti il numero di risposte, gli stili, la memoria o la cronologia salvata. Restano 5 risposte per stile e 10 per Hot.

LIMITAZIONE IMPORTANTE
Se OlliteRT continua a calcolare dopo che la connessione HTTP è stata interrotta, il Worker non può forzare il processo interno del server a fermarsi: questa modifica evita soprattutto richieste Gemma simultanee e nuove richieste locali dopo il primo timeout.
