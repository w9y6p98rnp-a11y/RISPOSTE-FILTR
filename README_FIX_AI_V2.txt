RISPOSTAFLIRT — FIX AI V2

Questa cartella contiene il progetto completo, mantenendo le funzioni della versione multiutente e la gestione delle registrazioni vocali.

MODIFICA PRINCIPALE
- Gemini 3.5 viene provato per primo con un timeout breve.
- Se Gemini è occupato o ha esaurito la quota, viene provato subito OpenRouter Free.
- OpenRouter può fare al massimo due tentativi brevi.
- Se OpenRouter non restituisce testo, il messaggio di errore indica modello e motivo disponibili.
- Gemini 3.6 e 3.8 restano come fallback, ma vengono saltati quando Gemini segnala quota esaurita.
- I timeout complessivi sono stati ridotti per evitare attese inutili.

NON SONO STATE RIMOSSE
- registrazione e trascrizione vocale;
- account, login e sessioni;
- database D1 e sincronizzazione;
- profili separati delle ragazze, memoria e cronologia;
- categorie, istruzioni personalizzate e risposte segrete;
- interfaccia e tema.

CARICAMENTO
1. Estrai lo ZIP.
2. Carica il contenuto della cartella RispostaFlirt_FIX_AI_V2 nel repository/progetto Cloudflare già collegato.
3. Il wrangler.toml è già allineato al Worker esistente `risposte-filtr` e al database D1 indicato nel log Cloudflare (`9372e6cb-0118-412f-b7f2-9c37e7911b94`). Non sostituire questi valori con segnaposto.
4. Il file .assetsignore evita che file server, configurazioni e migrazioni vengano pubblicati come asset statici.
5. Non sovrascrivere o modificare i Secrets Cloudflare già configurati:
   GEMINI_API_KEY, OPENROUTER_API_KEY e gli eventuali segreti per login/email.
6. Dopo il deploy, ricarica completamente la PWA e prova prima uno screenshot semplice.

IMPORTANTE
Questo aggiornamento non può garantire disponibilità permanente dei modelli gratuiti. OpenRouter Free e Gemini possono applicare limiti o avere momenti di saturazione. Se entrambi i servizi sono indisponibili, l'app mostrerà i dettagli dei tentativi.
