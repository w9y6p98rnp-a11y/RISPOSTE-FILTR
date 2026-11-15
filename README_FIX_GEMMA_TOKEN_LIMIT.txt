CORREZIONE LIMITE CONTESTO GEMMA3-1B-IT / OLLITERT

Questa versione modifica soltanto reply.js per ridurre i token inviati a Gemma locale:
- Prompt OlliteRT abbreviato: conserva istruzioni essenziali, OCR, indicazione e pochi dati di contesto.
- Cronologia, memoria, note e istruzioni personalizzate vengono limitate per non superare facilmente il contesto di 1024 token.
- Quando è già disponibile testo OCR, non viene reinviata anche l'immagine a Gemma: evita token visivi ridondanti.
- La richiesta a OlliteRT limita max_tokens a 650 per contenere la generazione.
- Le 3 risposte per voce restano invariate; Hot resta a 10.
- Gemini e OpenRouter mantengono il prompt completo originale come fallback.

Il limite di contesto del modello resta 1024: questa modifica riduce il contenuto della richiesta, non cambia il modello né il suo limite interno. La tokenizzazione può variare in base al testo e al modello; se l'OCR è molto lungo viene accorciato per proteggere il contesto.

INSTALLAZIONE
1. Sostituire/caricare i file dello ZIP nel repository, mantenendo la struttura delle cartelle.
2. Pubblicare il progetto con il metodo Cloudflare già configurato.
3. Lasciare attivi OlliteRT e Cloudflare Tunnel sul telefono Android.
4. Provare una generazione e controllare l'Activity Log: non dovrebbe più apparire 1550 / 1024 ctx per una richiesta normale.

Nota: se non è presente testo OCR, l'immagine viene ancora inviata a Gemma; un'immagine complessa può consumare una parte significativa del contesto disponibile.
