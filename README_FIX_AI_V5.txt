RISPOSTAFLIRT - FIX AI V5

Correzioni rispetto alla V4:
- Genera uno stile per chiamata AI (5 risposte per richiesta) invece di quattro stili insieme.
- Aumenta il limite di output OpenRouter da 2600 a 4500 token.
- Tratta l'esaurimento quota Gemini per singolo modello: se Gemini 3.6 ha esaurito la quota, prova comunque Gemini 3.8.
- Mantiene le funzioni esistenti, il database D1, la memoria separata, gli screenshot e la gestione vocale.

DEPLOY:
Sostituire i file del repository RISPOSTE-FILTR con i contenuti di questa cartella. Non creare un nuovo database e non modificare i segreti/API key.
Attendere che Cloudflare completi il deployment prima di testare.
