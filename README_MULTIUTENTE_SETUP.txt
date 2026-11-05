RISPOSTAFLIRT — MULTIUTENTE GRATUITO

Questa versione aggiunge:
- account email + password
- password dimenticata / reset tramite email
- accesso Google
- sessioni private per utente
- database Cloudflare D1
- sincronizzazione di ragazze, memoria, messaggi, screenshot compressi, risposte e impostazioni
- protezione dell'endpoint AI con la sessione dell'utente

NON caricare ancora questa cartella su GitHub/Cloudflare.
Prima va creato il database D1 e poi va inserito il suo database_id nel wrangler.toml.

1) Cloudflare → Workers & Pages → Storage & databases → D1 → Create database.
   Nome consigliato: rispostaflirt-auth
   Se disponibile, puoi scegliere la giurisdizione EU.

2) Copia il Database ID mostrato da Cloudflare.

3) Apri wrangler.toml e aggiungi:

[[d1_databases]]
binding = "DB"
database_name = "rispostaflirt-auth"
database_id = "IL_TUO_DATABASE_ID"

4) Applica il file SQL 0001_auth_and_user_data.sql dalla root del progetto:
   npx wrangler d1 execute rispostaflirt-auth --remote --file=0001_auth_and_user_data.sql

   Esegui la migrazione una sola volta sul database nuovo.

5) Google:
   Crea un OAuth Client di tipo Web application in Google Cloud.
   Aggiungi come Authorized JavaScript origin:
   https://risposte-filtr.984hg549k6.workers.dev
   Conserva Client ID e Client Secret.

6) Resend (solo per Password dimenticata):
   Il piano Free attuale permette 3.000 email/mese e 100/giorno.
   Crea una API key e, se vuoi inviare da un tuo indirizzo, verifica un dominio.

7) Segreti Cloudflare:
   GOOGLE_CLIENT_SECRET = Client Secret Google
   RESEND_API_KEY = API key Resend
   RESEND_FROM = RispostaFlirt <indirizzo-verificato@tuodominio.it>

8) Variabile non segreta nel wrangler.toml:
   [vars]
   GOOGLE_CLIENT_ID = "Client ID Google"

NON inserire mai Client Secret, API key o password nel repository GitHub.
Usa i Secrets di Cloudflare.
