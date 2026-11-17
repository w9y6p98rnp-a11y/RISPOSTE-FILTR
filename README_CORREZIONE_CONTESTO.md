# Correzione RispostaFlirt: ruoli IO/LEI e quantità delle risposte

File aggiornato: `reply.js`.

Modifiche:
- Istruzioni esplicite per riconoscere le bolle WhatsApp: verdi/destra = IO; grigie/sinistra = LEI.
- Il modello deve identificare l'ultima bolla ricevuta da LEI e non rispondere a una bolla scritta da IO.
- Le risposte devono essere restituite in un unico array, con 5 elementi per stile (10 per Hot).
- Il server controlla il numero effettivo di risposte per stile. Se il modello restituisce un risultato incompleto, non lo mostra come valido: passa al motore successivo configurato.
- Temperatura leggermente aumentata per favorire risposte meno ripetitive.

Non sono stati modificati `app.js`, `index.html`, `style.css`, `auth.js` o `worker.js`.

Verifiche eseguite: controllo sintattico Node.js sui file JavaScript. Non è stato eseguito un test live su Cloudflare e non è stato effettuato un deploy.
