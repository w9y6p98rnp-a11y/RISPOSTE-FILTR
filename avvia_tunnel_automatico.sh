#!/data/data/com.termux/files/usr/bin/bash
# Avvia Quick Tunnel verso OlliteRT e registra automaticamente il nuovo URL.
# Prima dell'uso, compilare WORKER_URL e TUNNEL_UPDATE_TOKEN qui sotto.
set -u

WORKER_URL="INSERISCI_URL_WORKER_RISPOSTAFLIRT"
TUNNEL_UPDATE_TOKEN="INSERISCI_LO_STESSO_TOKEN_CONFIGURATO_SU_CLOUDFLARE"
ORIGIN="http://127.0.0.1:8000"

if [[ "$WORKER_URL" == INSERISCI_* || "$TUNNEL_UPDATE_TOKEN" == INSERISCI_* ]]; then
  echo "Configura WORKER_URL e TUNNEL_UPDATE_TOKEN nel file prima di avviare."
  exit 1
fi

if ! curl -fsS "$ORIGIN/v1" >/dev/null 2>&1; then
  echo "OlliteRT non risponde su $ORIGIN. Avvia prima il server OlliteRT."
  exit 1
fi

echo "Avvio Quick Tunnel. Lascia Termux aperto e il processo in esecuzione."
cloudflared tunnel --protocol http2 --no-autoupdate --url "$ORIGIN" 2>&1 |
while IFS= read -r line; do
  echo "$line"
  url="$(printf '%s\n' "$line" | grep -Eo 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' | head -n 1 || true)"
  if [[ -n "$url" ]]; then
    echo "Nuovo tunnel rilevato: $url"
    code="$(curl -sS -o /tmp/rf-tunnel-register.json -w '%{http_code}' \
      -X POST "$WORKER_URL/api/tunnel/register" \
      -H "Authorization: Bearer $TUNNEL_UPDATE_TOKEN" \
      -H 'Content-Type: application/json' \
      --data "{\"url\":\"$url\"}" || true)"
    if [[ "$code" == "200" ]]; then
      echo "URL registrato automaticamente in RispostaFlirt."
    else
      echo "Registrazione non riuscita (HTTP ${code:-errore}). Dettaglio:"
      cat /tmp/rf-tunnel-register.json 2>/dev/null || true
      echo
    fi
  fi
done
