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
    while ((m = pairRe.exec(candidate)) !== null && replies.length < 18) {
      try {
        const style = JSON.parse('\"' + m[1] + '\"');
        const text = JSON.parse('\"' + m[2] + '\"');
        if (style && text) replies.push({ style, text });
      } catch (_) {}
    }
    if (replies.length >= 6) {
      const idxMatch = candidate.match(/\"recommendedIndex\"\s*:\s*(\d+)/);
      const reasonMatch = candidate.match(/\"recommendationReason\"\s*:\s*\"((?:\\.|[^\"\\])*)\"/);
      let reason = 'Questa è la risposta che si adatta meglio al tono e al momento della conversazione.';
      if (reasonMatch) { try { reason = JSON.parse('\"' + reasonMatch[1] + '\"'); } catch (_) {} }
      const recommendedIndex = Math.min(Math.max(parseInt(idxMatch?.[1] || '0', 10), 0), replies.length - 1);
      return { replies, recommendedIndex, recommendationReason: reason };
    }
    throw new Error('Risposta AI non valida.');
  }
}

function promptFor(context, message, aiHint = "") {
  return `Sei RispostaFlirt, un assistente italiano specializzato nel suggerire risposte naturali per conversazioni romantiche e di flirt.
Analizza lo screenshot, se presente, insieme al contesto e al messaggio testuale.

Genera ESATTAMENTE 18 alternative, divise in 6 stili da 3 risposte ciascuno:
- Flirt: 3
- Audace: 3
- Poeta: 3
- Ironico: 3
- Stuzzica: 3
- Dolce: 3

Le 18 risposte devono essere realmente diverse: cambia approccio, ritmo, lunghezza e livello di iniziativa. Non fare semplici variazioni della stessa frase.
Usa italiano naturale da chat. Mantieni ogni risposta breve e pronta da inviare, idealmente entro 1-2 frasi. Evita frasi banali e ripetitive.
Considera la cronologia e le risposte già inviate per evitare di riproporre le stesse formule.
Se lo screenshot contiene più messaggi, interpreta il contesto della conversazione prima di rispondere.
Non inventare dettagli che non sono visibili o presenti nel contesto.

Dopo aver generato le 18 alternative, scegli UNA sola risposta che ritieni più adatta a quel preciso momento della conversazione. La scelta deve tenere conto del tono di lei, di ciò che è stato appena detto, della storia della chat e del rischio di risultare fuori luogo o ripetitivi. Non scegliere automaticamente la più audace: scegli quella con la probabilità migliore di far proseguire bene la conversazione.

Restituisci SOLO JSON valido, senza markdown, nel formato:
{"replies":[{"style":"Flirt","text":"..."}, ...],"recommendedIndex":0,"recommendationReason":"Spiegazione breve e concreta del perché questa è la migliore per questo momento."}

recommendedIndex è l'indice numerico della risposta consigliata nell'array replies, partendo da 0.

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
        maxOutputTokens: 1400,
        responseMimeType: 'application/json',
        thinkingConfig: {
          thinkingLevel: model === 'gemini-3.5-flash-lite' ? 'minimal' : 'low'
        }
      }
    })
  }, 18000);

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

    // Avvia tutti i provider disponibili in parallelo: il primo che risponde
    // vince. In questo modo un provider lento/non disponibile non blocca gli altri.
    const attempts = [];

    if (env.GEMINI_API_KEY) {
      for (const model of ['gemini-3.5-flash-lite', 'gemini-3.8-flash']) {
        attempts.push(
          callGemini(env.GEMINI_API_KEY, model, prompt, image)
            .then(result => ({ result, provider: 'Gemini', model }))
            .catch(err => {
              throw new Error(err?.name === 'AbortError' ? `Gemini ${model}: timeout` : err.message);
            })
        );
      }
    } else {
      errors.push('GEMINI_API_KEY non configurata');
    }

    if (env.OPENROUTER_API_KEY) {
      attempts.push(
        callOpenRouter(env.OPENROUTER_API_KEY, prompt, image)
          .then(result => ({ result, provider: 'OpenRouter', model: 'openrouter/free' }))
          .catch(err => {
            throw new Error(err?.name === 'AbortError' ? 'OpenRouter: timeout' : err.message);
          })
      );
    } else {
      errors.push('OPENROUTER_API_KEY non configurata');
    }

    if (attempts.length) {
      try {
        const winner = await Promise.any(attempts);
        return new Response(JSON.stringify({ ...winner.result, provider: winner.provider, model: winner.model }), { status: 200, headers: { "Content-Type": "application/json" } });
      } catch (aggregate) {
        for (const reason of (aggregate?.errors || [])) errors.push(reason?.message || String(reason));
      }
    }

    return new Response(JSON.stringify({ error: 'Nessun servizio AI gratuito disponibile in questo momento.', details: errors }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || 'Errore del server AI.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
