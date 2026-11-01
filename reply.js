function json(statusCode, payload) {
  return new Response(JSON.stringify(payload), {
    status: statusCode,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
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
    while ((m = pairRe.exec(candidate)) !== null && replies.length < 50) {
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
      const secretRecommendedIndex = (() => { const m = candidate.match(/"recommendedSecretIndex"\s*:\s*(\d+)/); return m ? parseInt(m[1],10) : 40; })();
      const adviceMatch = candidate.match(/"advice"\s*:\s*"((?:\\.|[^"\\])*)"/);
      let advice = "";
      if (adviceMatch) { try { advice = JSON.parse('"' + adviceMatch[1] + '"'); } catch (_) {} }
      const sendWhenMatch = candidate.match(/"sendWhen"\s*:\s*"((?:\\.|[^"\\])*)"/);
      let sendWhen = "";
      if (sendWhenMatch) { try { sendWhen = JSON.parse('"' + sendWhenMatch[1] + '"'); } catch (_) {} }
      let categoryRecommendations = {};
      const catMatch = candidate.match(/"categoryRecommendations"\s*:\s*(\{[\s\S]*?\})\s*,\s*"replies"/);
      if (catMatch) { try { categoryRecommendations = JSON.parse(catMatch[1]); } catch (_) {} }

      // Se il modello ha troncato il JSON ma ha comunque prodotto le risposte,
      // non inventiamo un consiglio: lo lasciamo vuoto salvo richiesta esplicita.
      // Il prompt mette advice/sendWhen all'inizio proprio per farli sopravvivere
      // anche in caso di output molto lungo.
      return { replies, recommendedIndex, recommendedNormalIndex: normalRecommendedIndex, recommendedSecretIndex: secretRecommendedIndex, recommendationReason: reason, advice, sendWhen, categoryRecommendations };
    }
    throw new Error('Risposta AI non valida.');
  }
}

function decodeBasicHtmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/g, ' ');
}

function extractPreviousGeneratedReplies(html) {
  // Le analisi precedenti vengono salvate come HTML in girl_states.results_html.
  // Recuperiamo solo il testo delle card delle risposte, così l'AI può evitarne
  // la ripetizione alla generazione successiva. Se il campo è vuoto o il markup
  // è diverso, restituiamo semplicemente un array vuoto senza bloccare l'analisi.
  if (!html || typeof html !== 'string') return [];
  const out = [];
  const re = /<div[^>]*class=["'][^"']*reply-text[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi;
  let match;
  while ((match = re.exec(html)) !== null && out.length < 50) {
    const text = decodeBasicHtmlEntities(
      match[1]
        .replace(/<br\s*\/?>(?:\n)?/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .trim()
    );
    if (text) out.push(text);
  }
  return [...new Set(out)];
}

function promptFor(context, message, aiHint = "", audioTranscript = "", previousGeneratedReplies = []) {
  const prev = Array.isArray(previousGeneratedReplies)
    ? [...new Set(previousGeneratedReplies.map(x => String(x).trim()).filter(Boolean))].slice(-24)
    : [];
  return `Sei RispostaFlirt. Analizza con precisione lo screenshot e la cronologia: distingui sempre IO da LEI e rispondi al suo ultimo messaggio, non a una frase isolata.

GENERA ESATTAMENTE 50 RISPOSTE, 5 PER STILE, in questo ordine:
1 Dolce
2 Stuzzica
3 Ironico
4 Flirt
5 Seria
6 Audace
7 Battuta
8 Poeta
9 Erotica
10 Hot
Le prime 40 sono normali; le ultime 10 sono segrete. La prima risposta di OGNI stile deve essere la migliore di quello stile.

LUNGHEZZA: varia naturalmente. Non fare tutto breve: se il messaggio di lei è lungo, serio, emotivo o richiede una spiegazione, usa anche risposte più articolate (circa 20-45 parole quando servono). Se basta una battuta, resta breve. Non allungare artificialmente.

VARIETÀ: le 50 risposte devono essere realmente diverse. Evita la stessa frase, quasi-parafrasi o lo stesso schema. Non riportare sempre il discorso su di lei: alterna risposte centrate sulla situazione, battute, autoironia, cambio argomento naturale e flirt quando appropriato. Almeno alcune normali devono farla sorridere senza parlare sempre di lei.

EMOJI: nella maggior parte delle risposte normali usa 1 emoji naturale e pertinente; non forzarla nei messaggi seri. Varia le emoji.

TONO SERIO: se LEI parla seriamente, esprime delusione, chiarisce sentimenti, mette un limite o affronta un problema reale, tutte le risposte devono essere mature e coerenti. Niente flirt forzato, battute fuori luogo, sesso o inviti a vedersi. La categoria Seria deve essere particolarmente precisa e sincera.

BATTUTA: è diversa da Ironico e serve soprattutto a farla sorridere, ma solo se il contesto lo permette. Se il momento è serio, rendila comunque rispettosa oppure privilegia una risposta più adatta.

MEMORIA E VINCOLI: le Cose da ricordare sono obbligatorie. Se contengono un divieto come "non dirmi più di vederci", nessuna risposta, consiglio o motivazione può proporre quell'idea nemmeno indirettamente. Non trasformare mai un fatto di IO in un fatto di LEI. Non inventare dettagli.

PROFILO IO: usa il profilo dell'utente per rendere le risposte coerenti con il suo modo di parlare, senza citarlo esplicitamente.

RIPETIZIONI: considera anche le risposte già generate e quelle già inviate. Non riproporre la stessa frase o lo stesso schema. Evita formule già usate come "vediamo", "curiosità", "misteriosa", "mi piace", "vorrei averti qui" quando sono già comparse. Cambia davvero idea, ritmo o angolazione.

CONSIGLIO: advice e sendWhen devono essere sempre valorizzati con il consiglio operativo migliore e il momento corretto per inviare. Se l'indicazione dell'utente chiede una decisione, rispettala. Non inventare il motivo del consiglio.

RECOMMENDATIONS: categoryRecommendations deve avere esattamente queste 10 chiavi nell'ordine Dolce, Stuzzica, Ironico, Flirt, Seria, Audace, Battuta, Poeta, Erotica, Hot. Ogni chiave ha index:0 e un reason specifico. recommendedNormalIndex deve indicare una delle prime 40; recommendedSecretIndex una delle ultime 10; recommendedIndex la migliore assoluta.

SEGRETE: Erotica e Hot possono essere sensuali e provocanti, ma non grafici e non descrivere esplicitamente atti sessuali.

Rispondi SOLO con JSON valido, senza markdown, esattamente nel formato:
{"advice":"...","sendWhen":"oggi","recommendedIndex":0,"recommendedNormalIndex":0,"recommendedSecretIndex":40,"recommendationReason":"...","categoryRecommendations":{"Dolce":{"index":0,"reason":"..."},"Stuzzica":{"index":0,"reason":"..."},"Ironico":{"index":0,"reason":"..."},"Flirt":{"index":0,"reason":"..."},"Seria":{"index":0,"reason":"..."},"Audace":{"index":0,"reason":"..."},"Battuta":{"index":0,"reason":"..."},"Poeta":{"index":0,"reason":"..."},"Erotica":{"index":0,"reason":"..."},"Hot":{"index":0,"reason":"..."}},"replies":[{"style":"Dolce","text":"..."}]}

CONTESTO:
${JSON.stringify(context || {})}

COSE DA SAPERE SULL'UTENTE:
${context?.aboutMe || 'Nessuna informazione personale salvata.'}

MEMORIA DELLA RAGAZZA:
${context?.memory || context?.girl?.memory || 'Nessuna memoria salvata.'}

RISPOSTE PRECEDENTI DA EVITARE:
${prev.length ? prev.map((x,i)=>`${i+1}. ${x}`).join('\n') : 'Nessuna.'}

MESSAGGIO TESTUALE:
${message || ''}

TRASCRIZIONE VOCALE:
${audioTranscript || 'Nessuna.'}

INDICAZIONE DELL'UTENTE:
${aiHint || 'Nessuna.'}`;
}

function imagePart(image) {
  if (!image || typeof image !== 'string') return null;
  const match = image.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

function audioPart(audio) {
  if (!audio || typeof audio !== 'string') return null;
  const match = audio.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

async function transcribeAudio(apiKey, audio, timeoutMs = 16000) {
  const part = audioPart(audio);
  if (!part) throw new Error('Registrazione vocale non valida.');
  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-transcribe:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [
        { text: 'Trascrivi fedelmente questa registrazione vocale in italiano. Non riassumere, non inventare parole e mantieni il significato originale. Restituisci solo la trascrizione.' },
        { inlineData: part }
      ] }],
      generationConfig: {
        audioTranscriptionConfig: { languageCodes: [] }
      }
    })
  }, timeoutMs);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error('Trascrizione audio non disponibile.');
  const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim() || '';
  if (!text) throw new Error('Non è stato possibile trascrivere la registrazione.');
  return text;
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
        maxOutputTokens: 3000,
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
      max_tokens: 2600,
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
    const { message = '', aiHint = '', image = null, audio = null, girlId = '' } = body;
    if (!image && !audio) return json(400, { error: 'Aggiungi uno screenshot oppure una registrazione vocale.' });
    if (!env.DB || !context.user?.id || !girlId) return json(401, { error: 'Sessione o ragazza non valide.' });

    // Il contesto usato dall'AI viene letto dal database del proprietario della sessione.
    // Non ci fidiamo del contesto inviato dal browser, così un utente non può
    // chiedere all'AI i dati di un'altra persona modificando la richiesta.
    const girl = await env.DB.prepare(
      'SELECT id,name,note,memory FROM girls WHERE id=? AND user_id=? LIMIT 1'
    ).bind(String(girlId), context.user.id).first();
    if (!girl) return json(404, { error: 'Conversazione non trovata.' });

    const history = await env.DB.prepare(
      'SELECT role,text,created_at AS createdAt FROM messages WHERE user_id=? AND girl_id=? ORDER BY created_at DESC LIMIT 16'
    ).bind(context.user.id, String(girlId)).all();
    const conversation = (history.results || []).reverse();
    const previous = await env.DB.prepare(
      "SELECT text FROM messages WHERE user_id=? AND girl_id=? AND role='me' ORDER BY created_at DESC LIMIT 12"
    ).bind(context.user.id, String(girlId)).all();
    const previousState = await env.DB.prepare(
      'SELECT results_html AS resultsHtml FROM girl_states WHERE user_id=? AND girl_id=? LIMIT 1'
    ).bind(context.user.id, String(girlId)).first();
    const previousGeneratedReplies = extractPreviousGeneratedReplies(previousState?.resultsHtml || '').slice(-24);

    const serverContext = {
      girl: { id: girl.id, name: girl.name, note: girl.note || '', memory: girl.memory || '' },
      memory: girl.memory || '',
      conversation,
      previousReplies: (previous.results || []).reverse().map(x => x.text).filter(Boolean),
      previousGeneratedReplies
    };

    let audioTranscript = '';
    if (audio) {
      if (!env.GEMINI_API_KEY) return json(503, { error: 'La trascrizione vocale richiede il servizio Gemini configurato.' });
      try {
        audioTranscript = await transcribeAudio(env.GEMINI_API_KEY, audio, 16000);
      } catch (err) {
        return json(502, { error: err?.message || 'Non riesco a trascrivere la registrazione vocale.' });
      }
    }

    const prompt = promptFor(serverContext, message, aiHint, audioTranscript, previousGeneratedReplies);
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
            const result = await callGemini(env.GEMINI_API_KEY, model, prompt, image, 24000);
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
        return new Response(JSON.stringify({ ...winner.result, audioTranscript, provider: winner.provider, model: winner.model }), { status: 200, headers: { "Content-Type": "application/json" } });
      } catch (err) {
        errors.push(err?.message || String(err));
      }
    }

    return new Response(JSON.stringify({ error: 'Nessun servizio AI gratuito disponibile in questo momento.', details: errors }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || 'Errore del server AI.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
