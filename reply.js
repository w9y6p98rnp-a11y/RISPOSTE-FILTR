function json(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  };
}

function extractJson(raw) {
  if (!raw) throw new Error('Risposta AI vuota.');
  const cleaned = String(raw).trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Risposta AI non valida.');
  const candidate = match[0];
  try {
    const parsed = JSON.parse(candidate);
    if (!parsed || !Array.isArray(parsed.replies) || !parsed.replies.length) throw new Error('Formato risposta AI non valido.');
    return parsed;
  } catch (e) {
    // Alcuni modelli possono restituire JSON quasi valido anche quando responseMimeType=json è richiesto.
    // Recuperiamo le coppie style/text senza mostrare l'errore grezzo all'utente.
    const replies = [];
    const pairRe = /\"style\"\s*:\s*\"((?:\\.|[^\"\\])*)\"\s*,\s*\"text\"\s*:\s*\"((?:\\.|[^\"\\])*)\"/g;
    let m;
    while ((m = pairRe.exec(candidate)) !== null && replies.length < 26) {
      try {
        const style = JSON.parse('\"' + m[1] + '\"');
        const text = JSON.parse('\"' + m[2] + '\"');
        if (style && text) replies.push({ style, text });
      } catch (_) {}
    }
    if (replies.length >= 12) {
      const idxMatch = candidate.match(/\"recommendedIndex\"\s*:\s*(\d+)/);
      const reasonMatch = candidate.match(/\"recommendationReason\"\s*:\s*\"((?:\\.|[^\"\\])*)\"/);
      let reason = 'Questa è la risposta che si adatta meglio al tono e al momento della conversazione.';
      if (reasonMatch) { try { reason = JSON.parse('\"' + reasonMatch[1] + '\"'); } catch (_) {} }
      const recommendedIndex = Math.min(Math.max(parseInt(idxMatch?.[1] || '0', 10), 0), replies.length - 1);
      const normalRecommendedIndex = (() => { const m = candidate.match(/"recommendedNormalIndex"\s*:\s*(\d+)/); return m ? parseInt(m[1],10) : 0; })();
      const secretRecommendedIndex = (() => { const m = candidate.match(/"recommendedSecretIndex"\s*:\s*(\d+)/); return m ? parseInt(m[1],10) : 18; })();
      const adviceMatch = candidate.match(/"advice"\s*:\s*"((?:\\.|[^"\\])*)"/);
      let advice = "";
      if (adviceMatch) { try { advice = JSON.parse('"' + adviceMatch[1] + '"'); } catch (_) {} }
      const sendWhenMatch = candidate.match(/"sendWhen"\s*:\s*"((?:\\.|[^"\\])*)"/);
      let sendWhen = "";
      if (sendWhenMatch) { try { sendWhen = JSON.parse('"' + sendWhenMatch[1] + '"'); } catch (_) {} }

      // Se il modello ha troncato il JSON ma ha comunque prodotto le risposte,
      // non inventiamo un consiglio: lo lasciamo vuoto salvo richiesta esplicita.
      // Il prompt mette advice/sendWhen all'inizio proprio per farli sopravvivere
      // anche in caso di output molto lungo.
      return { replies, recommendedIndex, recommendedNormalIndex: normalRecommendedIndex, recommendedSecretIndex: secretRecommendedIndex, recommendationReason: reason, advice, sendWhen };
    }
    throw new Error('Risposta AI non valida.');
  }
}

function promptFor(context, message, aiHint = "") {
  return `Sei RispostaFlirt, un assistente italiano specializzato nel suggerire risposte naturali per conversazioni romantiche e di flirt.
Analizza lo screenshot, se presente, insieme al contesto e al messaggio testuale.

Genera ESATTAMENTE 26 alternative, divise in 8 stili:
- Flirt: 3
- Audace: 3
- Poeta: 3
- Ironico: 3
- Stuzzica: 3
- Dolce: 3
- Erotica: 3
- Hot: 5

Le prime 18 risposte sono le RISPOSTE NORMALI (Flirt, Audace, Poeta, Ironico, Stuzzica, Dolce).
Le ultime 8 risposte sono le RISPOSTE SEGRETE: prima 3 Erotica e poi 5 Hot.
Erotica e Hot devono essere nettamente più intensi delle risposte normali: sensuali, molto provocanti, audaci, cariche di desiderio, tensione fisica, doppisensi e allusioni. Hot deve essere il livello più spinto consentito: diretto, sfacciato e seducente, ma resta non grafico e non descrivere esplicitamente penetrazione, posizioni sessuali, sculacciate o altri atti sessuali.

Le 26 risposte devono essere realmente diverse: cambia approccio, ritmo, lunghezza e livello di iniziativa. Non fare semplici variazioni della stessa frase.
Usa italiano naturale da chat. Mantieni ogni risposta molto breve e pronta da inviare: una sola frase, circa 8-14 parole. Evita frasi banali e ripetitive.
Considera la cronologia e le risposte già inviate per evitare di riproporre le stesse formule.
Se lo screenshot contiene più messaggi, interpreta il contesto della conversazione prima di rispondere.
Non inventare dettagli che non sono visibili o presenti nel contesto.

REGOLA SUL MOMENTO IN CUI INVIARE:
- Se dal contesto o dalla tua valutazione consigli di non scrivere oggi e di aspettare domani, 2 giorni, 3 giorni o un altro intervallo, le 26 risposte devono essere pensate ESPLICITAMENTE per essere inviate dopo quell'attesa.
- In questo caso non scrivere messaggi adatti a stasera, non fare riferimenti a una serata imminente e non formulare risposte come se si dovesse continuare subito la conversazione.
- Devono essere messaggi che riaprono naturalmente il contatto dopo il periodo di silenzio, senza sembrare un inseguimento.
- Se invece ritieni corretto scrivere oggi, genera normalmente messaggi adatti al momento presente.

PRIORITÀ DEL CONSIGLIO:
Prima di completare le 26 alternative, determina se l'utente ha chiesto un consiglio sul da farsi. Se sì, il consiglio e il momento di invio sono OBBLIGATORI e devono essere inseriti nel JSON prima di "replies".
- advice: consiglio breve, concreto e specifico alla situazione.
- sendWhen: indica chiaramente "oggi", "domani", "tra 2 giorni", "tra 3 giorni" o altro intervallo motivato.
Non lasciare advice vuoto quando l'utente ha chiesto esplicitamente se/ quando scrivere.

Dopo aver determinato advice e sendWhen, scegli anche una risposta consigliata per ciascuna delle due categorie.
- recommendedNormalIndex: indice di una delle prime 18 risposte normali.
- recommendedSecretIndex: indice di una delle ultime 8 risposte segrete.
- recommendedIndex: mantienilo come consiglio generale, scegliendo una delle due.
La scelta deve tenere conto del tono di lei, di ciò che è stato appena detto, della storia della chat e del rischio di risultare fuori luogo o ripetitivi. Non scegliere automaticamente la più audace: scegli quella con la probabilità migliore di far proseguire bene la conversazione. Per le risposte segrete scegli quella più adatta al livello di confidenza mostrato nella conversazione.

GESTIONE DEL CONSIGLIO DELL'UTENTE:
- Se l'INDICAZIONE DELL'UTENTE chiede esplicitamente un consiglio o una decisione sul da farsi (per esempio "mi consigli se scriverle?", "le mando un altro messaggio?", "devo aspettare?", "non ha risposto, cosa faccio?"), compila anche il campo "advice" con un consiglio breve, concreto e riferito alla situazione visibile nella chat. Questo consiglio deve comparire prima delle risposte nella schermata. Deve anche dire chiaramente quando conviene inviare il prossimo messaggio (oggi, domani, tra 2 giorni, tra 3 giorni, ecc.) quando la situazione lo richiede.
- Se l'INDICAZIONE DELL'UTENTE chiede solo di cambiare, rifare, rendere più provocatorie, più dolci, più ironiche o comunque modificare le risposte, NON compilare "advice": applica direttamente l'indicazione alle nuove risposte.
- Se l'INDICAZIONE DELL'UTENTE è vuota, NON dare alcun consiglio extra: genera automaticamente le risposte come al solito.
- Non inventare una richiesta di consiglio quando l'utente non l'ha fatta.

Restituisci SOLO JSON valido, senza markdown, nel formato:
{"advice":"Consiglio concreto.","sendWhen":"domani","recommendedIndex":0,"recommendedNormalIndex":0,"recommendedSecretIndex":18,"recommendationReason":"Motivo breve.","replies":[{"style":"Flirt","text":"..."}, ...]}

Il campo "advice" deve essere valorizzato solo quando l'utente ha esplicitamente chiesto un consiglio; altrimenti deve essere una stringa vuota.

recommendedIndex, recommendedNormalIndex e recommendedSecretIndex sono gli indici numerici delle risposte consigliate nell'array replies, partendo da 0.


CONTESTO:
${JSON.stringify(context || {})}

MEMORIA DA RICORDARE SULLA RAGAZZA:
${context?.memory || context?.girl?.memory || "Nessuna memoria salvata."}

REGOLA IMPORTANTE SULLA MEMORIA:
La memoria sopra è informazione persistente fornita dall'utente. DEVI tenerla in considerazione quando scegli tono, argomenti, riferimenti, battute e suggerimenti. Non ignorarla e non inventare dettagli oltre a quelli presenti nella memoria e nella conversazione. Se la memoria contiene preferenze o fatti utili, usali in modo naturale quando pertinenti, senza citarla esplicitamente come "memoria".

MESSAGGIO TESTUALE:
${message || ''}

INDICAZIONE DELL'UTENTE (facoltativa):
${aiHint || 'Nessuna indicazione aggiuntiva.'}`;
}

function imagePart(image) {
  if (!image || typeof image !== 'string') return null;
  const match = image.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

async function fetchWithTimeout(url, options, ms = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(apiKey, model, prompt, image, timeoutMs = 18000) {
  const parts = [{ text: prompt }];
  const img = imagePart(image);
  if (img) parts.push({ inlineData: img });

  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        maxOutputTokens: 1350,
        responseMimeType: 'application/json',
        thinkingConfig: {
          thinkingLevel: 'minimal'
        }
      }
    })
  }, timeoutMs);

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Gemini ${model}: servizio non disponibile`);
  }

  const raw = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  return extractJson(raw);
}

async function callOpenRouter(apiKey, prompt, image) {
  const content = [{ type: 'text', text: prompt }];
  if (image) content.push({ type: 'image_url', image_url: { url: image } });

  const response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://rispostaflirt.netlify.app',
      'X-Title': 'RispostaFlirt'
    },
    body: JSON.stringify({
      model: 'openrouter/free',
      messages: [{ role: 'user', content }],
      temperature: 0.85,
      max_tokens: 1000,
      response_format: { type: 'json_object' }
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error('OpenRouter: servizio non disponibile');
  }
  return extractJson(data?.choices?.[0]?.message?.content || '');
}

export async function onRequestPost(context) {
  const request = context.request;
  const env = context.env;

  try {
    const body = await request.json().catch(() => ({}));
    const { message = '', aiHint = '', context = '', image = null } = body;
    if (!message && !image) return json(400, { error: 'Manca messaggio o screenshot.' });

    const prompt = promptFor(context, message, aiHint);
    const errors = [];

    // NON avviare tutti i provider in parallelo: ogni tentativo può consumare quota.
    // Proviamo un solo servizio alla volta e passiamo al successivo solo se il precedente
    // è esaurito/non disponibile. In questo modo una richiesta normale usa una sola quota.
    const attempts = [];

    if (env.GEMINI_API_KEY) {
      // Ordine: modello economico/free prima, poi fallback più robusti.
      for (const model of ['gemini-3.5-flash-lite']) {
        attempts.push(async () => {
          try {
            const result = await callGemini(env.GEMINI_API_KEY, model, prompt, image, 7000);
            return { result, provider: 'Gemini', model };
          } catch (err) {
            throw new Error(err?.name === 'AbortError' ? `Gemini ${model}: timeout` : err.message);
          }
        });
      }
    } else {
      errors.push('GEMINI_API_KEY non configurata');
    }

    if (env.OPENROUTER_API_KEY) {
      attempts.push(async () => {
        try {
          const result = await callOpenRouter(env.OPENROUTER_API_KEY, prompt, image);
          return { result, provider: 'OpenRouter', model: 'openrouter/free' };
        } catch (err) {
          throw new Error(err?.name === 'AbortError' ? 'OpenRouter: timeout' : err.message);
        }
      });
    } else {
      errors.push('OPENROUTER_API_KEY non configurata');
    }

    for (const attempt of attempts) {
      try {
        const winner = await attempt();
        return new Response(JSON.stringify({ ...winner.result, provider: winner.provider, model: winner.model }), { status: 200, headers: { "Content-Type": "application/json" } });
      } catch (err) {
        errors.push(err?.message || String(err));
      }
    }

    return new Response(JSON.stringify({ error: 'Nessun servizio AI gratuito disponibile in questo momento.', details: errors }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || 'Errore del server AI.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
