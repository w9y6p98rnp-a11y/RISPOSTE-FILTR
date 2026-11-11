RISPOSTAFLIRT — URL QUICK TUNNEL AUTOMATICO

COSA CAMBIA
- Il Worker legge l'ultimo URL del Quick Tunnel dalla tabella D1 tunnel_config.
- Termux rileva l'URL trycloudflare appena creato e lo registra automaticamente.
- Non serve più aggiornare OLLITERT_BASE_URL ad ogni riavvio.
- OLLITERT_TOKEN, OLLITERT_MODEL, Gemini/OpenRouter e le funzioni dell'app restano invariati.
- La registrazione accetta solo host HTTPS *.trycloudflare.com e richiede il segreto TUNNEL_UPDATE_TOKEN.

IMPORTANTE
Questa modifica rende stabile l'indirizzo usato dall'app/Worker; il Quick Tunnel sottostante resta temporaneo e può cambiare. Se il telefono/tablet o Termux si ferma, Gemma non è raggiungibile finché il tunnel non riparte. Il dispositivo deve restare acceso e OlliteRT attivo.

INSTALLAZIONE — DA FARE NELL'ORDINE

1) DATABASE D1
Apri Cloudflare > D1 > rispostaflirt-auth > Console SQL.
Esegui tutto il contenuto del file 0002_tunnel_config.sql.

2) SEGRETO WORKER
In Cloudflare > Workers & Pages > risposte-filtr > Settings > Variables and Secrets,
aggiungi TUNNEL_UPDATE_TOKEN come SECRET.
Scegli una password lunga e casuale. Non inserirla in chat e non usare OLLITERT_TOKEN.
Salva e fai deploy del Worker.

3) URL DEL WORKER
Usa l'indirizzo HTTPS stabile con cui apri RispostaFlirt (il dominio workers.dev o il tuo dominio attuale).
Non usare l'URL trycloudflare.

4) TERMUX
Copia TERMUX_TUNNEL_AUTO/avvia_tunnel_automatico.sh nel tablet/telefono che eseguirà cloudflared.
Apri il file e sostituisci:
- INSERISCI_URL_WORKER_RISPOSTAFLIRT con l'indirizzo base stabile di RispostaFlirt, senza slash finale.
- INSERISCI_LO_STESSO_TOKEN_CONFIGURATO_SU_CLOUDFLARE con il valore scelto al punto 2.
Proteggi il file: contiene il segreto di registrazione. Non condividerlo.

5) AVVIO
Assicurati che OlliteRT sia in esecuzione sulla porta 8000.
Da Termux esegui:
  pkg install curl cloudflared
  bash avvia_tunnel_automatico.sh
Quando appare "URL registrato automaticamente in RispostaFlirt", la registrazione è riuscita.
Lascia il comando attivo. Dopo un riavvio, rilancia lo script: rileverà e registrerà il nuovo URL.

6) TEST
Dopo la registrazione, genera una risposta da RispostaFlirt e controlla i log Worker:
[AI-DIAG] Configurazione OlliteRT deve mostrare baseUrlPresent=true.
[AI-DIAG] Avvio richiesta OlliteRT indica che Gemma è stata chiamata.

NOTE DI SICUREZZA
- Non pubblicare il segreto TUNNEL_UPDATE_TOKEN su GitHub.
- Non cambiare né condividere OLLITERT_TOKEN.
- Il file shell contiene un segreto e va conservato solo sul dispositivo.
- Questa versione non aumenta la velocità di Gemma e non risolve il limite di calcolo del telefono.
- Il fallback OLLITERT_BASE_URL resta attivo se la tabella D1 è vuota.
