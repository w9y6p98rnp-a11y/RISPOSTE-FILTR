RISPOSTAFLIRT — MULTIUTENTE GRATUITO

Questa versione aggiunge:
- account email + password
- password dimenticata / reset tramite email
- accesso Google
- sessioni private per utente
- database Cloudflare D1
- sincronizzazione di ragazze, memoria, messaggi, screenshot compressi, risposte e impostazioni
- protezione dell'endpoint AI con la sessione dell'utente

Il database D1 è già stato creato e il suo ID è già inserito nel wrangler.toml.

1) Cloudflare → Workers & Pages → Storage & databases → D1 → Create database.
   Nome consigliato: rispostaflirt-auth
   Se disponibile, puoi scegliere la giurisdizione EU.

2) Il Database ID è già configurato nel pacchetto.

3) Dopo il deploy, applica la migrazione SQL:
   npx wrangler d1 migrations apply rispostaflirt-auth --remote

   Oppure usa il comando equivalente disponibile nel tuo ambiente Cloudflare.

4) Google:
   Crea un OAuth Client di tipo Web application in Google Cloud.
   Aggiungi come Authorized JavaScript origin:
   https://risposte-filtr.984hg549k6.workers.dev
   Conserva Client ID e Client Secret.

5) Resend (solo per Password dimenticata):
   Il piano Free attuale permette 3.000 email/mese e 100/giorno.
   Crea una API key e, se vuoi inviare da un tuo indirizzo, verifica un dominio.

6) Segreti Cloudflare:
   GOOGLE_CLIENT_SECRET = Client Secret Google
   RESEND_API_KEY = API key Resend
   RESEND_FROM = RispostaFlirt <indirizzo-verificato@tuodominio.it>

7) Variabile non segreta nel wrangler.toml:
   [vars]
   GOOGLE_CLIENT_ID = "Client ID Google"

NON inserire mai Client Secret, API key o password nel repository GitHub.
Usa i Secrets di Cloudflare.
