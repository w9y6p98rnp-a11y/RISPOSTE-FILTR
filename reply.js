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
    while ((m = pairRe.exec(candidate)) !== null && replies.length < 45) {
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
      const secretRecommendedIndex = (() => { const m = candidate.match(/"recommendedSecretIndex"\s*:\s*(\d+)/); return m ? parseInt(m[1],10) : 35; })();
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

function promptFor(context, message, aiHint = "", audioTranscript = "") {
  return `Sei RispostaFlirt, un assistente italiano specializzato nel suggerire risposte naturali per conversazioni romantiche e di flirt.
Analizza lo screenshot, se presente, insieme al contesto e al messaggio testuale.

Genera ESATTAMENTE 45 alternative, divise in 9 stili:
- Dolce: 5
- Stuzzica: 5
- Ironico: 5
- Flirt: 5
- Audace: 5
- Poeta: 5
- Seria: 5
- Erotica: 5
- Hot: 5

Le prime 35 risposte sono le RISPOSTE NORMALI (5 per ciascuno dei 7 stili: Dolce, Stuzzica, Ironico, Flirt, Audace, Poeta, Seria).
Le ultime 10 risposte sono le RISPOSTE SEGRETE: 5 Erotica e 5 Hot.
Erotica e Hot devono essere nettamente più intensi delle risposte normali: sensuali, molto provocanti, audaci, cariche di desiderio, tensione fisica, doppisensi e allusioni. Hot deve essere il livello più spinto consentito: diretto, sfacciato e seducente, ma resta non grafico e non descrivere esplicitamente penetrazione, posizioni sessuali, sculacciate o altri atti sessuali.

Le 45 risposte devono essere realmente diverse: cambia approccio, ritmo, lunghezza, struttura e livello di iniziativa. Non fare semplici variazioni della stessa frase.
Usa italiano naturale da chat. Mantieni ogni risposta breve e pronta da inviare: una sola frase, circa 8-16 parole quando serve. Evita frasi banali, intercambiabili o costruite come complimenti generici.

REGOLA FONDAMENTALE SULLA VARIETÀ: non trasformare ogni risposta in un messaggio che riporta continuamente l'attenzione su di lei. Le risposte devono sembrare scritte da una persona vera che sa flirtare ma sa anche scherzare, cambiare ritmo e parlare normalmente. Insieme alle risposte che riprendono direttamente ciò che lei ha detto, inserisci anche alternative che: fanno una battuta sulla situazione, giocano con il contesto, prendono in giro in modo leggero, fanno autoironia, cambiano argomento con naturalezza oppure aprono un piccolo tema nuovo.
- Almeno 12 delle 35 RISPOSTE NORMALI devono evitare di iniziare o chiudere con complimenti su di lei o con frasi del tipo "tu sei...", "mi piace quando...", "vorrei te...".
- Almeno 6 RISPOSTE NORMALI devono essere chiaramente divertenti o ironiche e avere come obiettivo principale farla sorridere, quando il contesto lo permette.
- Almeno 5 RISPOSTE NORMALI devono poter cambiare argomento o alleggerire la conversazione senza sembrare una fuga dal tema.
- Non usare queste proporzioni in modo meccanico: se il contenuto dello screenshot richiede un approccio diverso, privilegia sempre la coerenza con la conversazione.
- Non usare sempre il "tu" come centro della frase: alterna risposte centrate sulla situazione, sulla battuta, su quello che è successo, su un dettaglio della chat e, solo quando funziona, su di lei.

REGOLA TONO SERIO: prima di generare le risposte valuta il tono dell'ultimo messaggio della ragazza. Se lei sta parlando seriamente, esprime preoccupazione, delusione, chiarisce un sentimento, mette un limite, parla del rapporto in modo diretto o sta affrontando un problema reale, devi cambiare registro: tutte le risposte devono essere adeguate a quel momento, mature, sincere e rispettose. In questo caso NON forzare flirt, battute, provocazioni, riferimenti sessuali o inviti a vedersi. Anche Dolce, Stuzzica, Ironico, Flirt, Audace e Poeta devono restare coerenti con il tono serio; "Ironico" può avere solo una leggerezza molto discreta se il contesto la permette. La categoria "Seria" deve essere la più precisa e adulta: 5 risposte sincere, naturali, diverse tra loro, senza frasi da catalogo. Se lei dice esplicitamente che le cose tra voi non vanno bene ma che ci tiene, rispondi al contenuto emotivo senza ignorarlo o trasformarlo automaticamente in seduzione.

REGOLA EMOJI: nella maggior parte delle risposte inserisci almeno 1 emoji, purché sia naturale e coerente con il contenuto. Come obiettivo, circa 30-38 delle 45 risposte dovrebbero avere 1 emoji e alcune possono averne 2 quando il tono lo giustifica; lascia senza emoji solo le risposte in cui il testo risulta chiaramente più forte, elegante o naturale senza. Non mettere sempre la stessa emoji: alterna in base al significato e al tono (per esempio 😂😏😉🙃🤭😌😄😜😎👀🔥 quando appropriate). Evita combinazioni eccessive, infantili o fuori contesto. Se il tono è serio, non mettere emoji salvo quando una singola emoji è davvero naturale. L'emoji deve sembrare parte naturale del messaggio, non aggiunta a forza alla fine.

Considera la cronologia e le risposte già inviate per evitare di riproporre le stesse formule, lo stesso tipo di battuta o lo stesso schema di flirt. Se nelle risposte precedenti hai già usato "vediamo", "curiosità", "misteriosa", "mi piace", "vorrei averti qui" o formule simili, cerca un'impostazione diversa.
Se lo screenshot contiene più messaggi, ricostruisci prima il filo della conversazione: individua cosa ha detto lei, cosa hai detto tu, quale risposta sta aspettando davvero e quale tono sta usando. La risposta deve essere una continuazione naturale di QUELLA conversazione, non una frase da catalogo.
PRIMA DI GENERARE: distingui sempre con precisione i due interlocutori.
- L'utente è IO/ME. La ragazza è LEI.
- Se l'utente scrive nell'INDICAZIONE o nel messaggio testuale qualcosa come "io vado in ferie", "io lavoro", "io sono...", attribuiscilo all'utente, non alla ragazza.
- Attribuisci alla ragazza solo ciò che è chiaramente scritto nei suoi messaggi nello screenshot/trascrizione.
- Non trasformare mai un fatto dell'utente in un fatto della ragazza.

Prima di generare le risposte, individua eventuali limiti o cose che l'utente ha chiesto esplicitamente di NON dire o NON proporre per questa ragazza: quei limiti sono vincolanti e devono essere rispettati in tutte le risposte.
Non inventare dettagli che non sono visibili o presenti nel contesto.

REGOLA SUL MOMENTO IN CUI INVIARE:
- Se dal contesto o dalla tua valutazione consigli di non scrivere oggi e di aspettare domani, 2 giorni, 3 giorni o un altro intervallo, le 40 risposte devono essere pensate ESPLICITAMENTE per essere inviate dopo quell'attesa.
- In questo caso non scrivere messaggi adatti a stasera, non fare riferimenti a una serata imminente e non formulare risposte come se si dovesse continuare subito la conversazione.
- Devono essere messaggi che riaprono naturalmente il contatto dopo il periodo di silenzio, senza sembrare un inseguimento.
- Se invece ritieni corretto scrivere oggi, genera normalmente messaggi adatti al momento presente.

PRIORITÀ DEL CONSIGLIO:
Prima di completare le 40 alternative, determina se l'utente ha chiesto un consiglio sul da farsi. Se sì, il consiglio e il momento di invio sono OBBLIGATORI e devono essere inseriti nel JSON prima di "replies".
- advice: consiglio breve, concreto e specifico alla situazione.
- sendWhen: indica chiaramente "oggi", "domani", "tra 2 giorni", "tra 3 giorni" o altro intervallo motivato.
Non lasciare advice vuoto quando l'utente ha chiesto esplicitamente se/ quando scrivere.

Dopo aver determinato advice e sendWhen, scegli una risposta consigliata PER OGNI STILE.
- categoryRecommendations deve contenere esattamente queste 9 chiavi, in questo ordine: Dolce, Stuzzica, Ironico, Flirt, Audace, Poeta, Seria, Erotica, Hot.
- Per ogni stile indica SEMPRE index: 0. La prima risposta di ogni stile deve essere la risposta consigliata e va generata come la migliore delle 5., e reason con un consiglio specifico di una frase.
- recommendedNormalIndex: indice globale di una delle prime 30 risposte normali.
- recommendedSecretIndex: indice globale di una delle ultime 10 risposte segrete.
- recommendedIndex: indice globale della migliore risposta assoluta.
La scelta deve tenere conto del tono di lei, di ciò che è stato appena detto, della storia della chat e dei vincoli della memoria. Non scegliere automaticamente la più audace: scegli quella con la probabilità migliore di far proseguire bene la conversazione. Per ogni stile, il reason deve spiegare come usare quella risposta, non ripetere semplicemente il testo della risposta.

GESTIONE DEL CONSIGLIO DELL'UTENTE:
- Se l'INDICAZIONE DELL'UTENTE chiede esplicitamente un consiglio o una decisione sul da farsi (per esempio "mi consigli se scriverle?", "le mando un altro messaggio?", "devo aspettare?", "non ha risposto, cosa faccio?"), compila anche il campo "advice" con un consiglio breve, concreto e riferito alla situazione visibile nella chat. Questo consiglio deve comparire prima delle risposte nella schermata. Deve anche dire chiaramente quando conviene inviare il prossimo messaggio (oggi, domani, tra 2 giorni, tra 3 giorni, ecc.) quando la situazione lo richiede.
- Se l'INDICAZIONE DELL'UTENTE chiede solo di cambiare, rifare, rendere più provocatorie, più dolci, più ironiche o comunque modificare le risposte, NON compilare "advice": applica direttamente l'indicazione alle nuove risposte.
- Se l'INDICAZIONE DELL'UTENTE è vuota, NON dare alcun consiglio extra: genera automaticamente le risposte come al solito.
- Non inventare una richiesta di consiglio quando l'utente non l'ha fatta.

Restituisci SOLO JSON valido, senza markdown, nel formato:
{"advice":"Consiglio concreto.","sendWhen":"domani","recommendedIndex":0,"recommendedNormalIndex":0,"recommendedSecretIndex":30,"recommendationReason":"Motivo breve.","categoryRecommendations":{"Dolce":{"index":0,"reason":"..."},"Stuzzica":{"index":0,"reason":"..."},"Ironico":{"index":0,"reason":"..."},"Flirt":{"index":0,"reason":"..."},"Audace":{"index":0,"reason":"..."},"Poeta":{"index":0,"reason":"..."},"Seria":{"index":0,"reason":"..."},"Erotica":{"index":0,"reason":"..."},"Hot":{"index":0,"reason":"..."}},"replies":[{"style":"Flirt","text":"..."}, ...]}

Il campo "advice" DEVE essere sempre valorizzato con il consiglio operativo migliore. Il campo "sendWhen" DEVE essere sempre valorizzato con il momento consigliato per inviare il messaggio.

recommendedIndex, recommendedNormalIndex e recommendedSecretIndex sono gli indici numerici delle risposte consigliate nell'array replies, partendo da 0.


CONTESTO:
${JSON.stringify(context || {})}

COSE DA SAPERE SULL'UTENTE:
${context?.aboutMe || 'Nessuna informazione personale salvata.'}

REGOLA SUL PROFILO DELL'UTENTE:
Le informazioni sopra descrivono come è fatto l'utente, il suo carattere e il modo in cui preferisce comunicare. Usale per rendere le risposte coerenti con lui. Non inventare caratteristiche che non sono presenti e non trasformare il profilo in un elenco esplicito: applicalo naturalmente al tono, alle parole, all'iniziativa e allo stile delle risposte.

MEMORIA DA RICORDARE SULLA RAGAZZA:
${context?.memory || context?.girl?.memory || "Nessuna memoria salvata."}

REGOLA IMPORTANTE SULLA MEMORIA — VINCOLI OBBLIGATORI:
La memoria sopra è informazione persistente fornita dall'utente e ha priorità alta. DEVI applicarla realmente alle risposte, non limitarti a tenerla come semplice contesto.
- Se la memoria contiene un divieto, un limite o una richiesta negativa (per esempio "non dirmi più di vederci", "non proporre di uscire", "non parlare di X"), trattalo come un VINCOLO OBBLIGATORIO per questa ragazza.
- In presenza di un divieto, nessuna delle 40 risposte, il consiglio, la motivazione o il messaggio consigliato deve riproporre direttamente o indirettamente ciò che l'utente ha escluso.
- Esempio: se la memoria dice di NON parlare di vedersi/incontrarsi, evita frasi come "preferirei averti qui", "quando ci vediamo", "vediamoci", "uscire insieme", "incontrarti" o equivalenti. Non sostituire il divieto con una formulazione più elegante che esprime comunque la stessa idea.
- Se un divieto rende inadatta una risposta, cambia completamente approccio: continua il flirt, la battuta o il tema della conversazione senza violare il limite.
- Le regole negative della memoria prevalgono sulle tendenze generiche del modello e sulle proposte automatiche di flirt.
- Non ignorare la memoria e non inventare dettagli oltre a quelli presenti nella memoria e nella conversazione. Usa le informazioni positive in modo naturale quando pertinenti, senza citarle esplicitamente come "memoria".

CONTROLLO FINALE OBBLIGATORIO PRIMA DI RESTITUIRE LE RISPOSTE:
Rileggi tutte le 40 risposte, il consiglio e la motivazione. Verifica che ogni eventuale divieto presente nella memoria sia rispettato. Verifica anche che le risposte non riportino tutte il discorso su di lei, che ci siano davvero alcune alternative divertenti o di cambio argomento quando il contesto lo consente e che la maggior parte delle risposte abbia un'emoji naturale e pertinente, evitando però di inserirla nelle poche risposte che funzionano meglio senza. Se una risposta è troppo simile alle altre, troppo generica o viola un divieto, riscrivila prima di restituire il JSON.

MESSAGGIO TESTUALE:
${message || ''}

TRASCRIZIONE DELLA REGISTRAZIONE VOCALE:
${audioTranscript || 'Nessuna registrazione vocale.'}

REGOLA AUDIO:
Se è presente una trascrizione, considerala parte reale della conversazione. Non correggere arbitrariamente il contenuto e usala insieme allo screenshot per capire cosa ha detto lei.

INDICAZIONE DELL'UTENTE (facoltativa):
${aiHint || 'Nessuna indicazione aggiuntiva.'}`;
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
        maxOutputTokens: 2600,
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

    const serverContext = {
      girl: { id: girl.id, name: girl.name, note: girl.note || '', memory: girl.memory || '' },
      memory: girl.memory || '',
      conversation,
      previousReplies: (previous.results || []).reverse().map(x => x.text).filter(Boolean)
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

    const prompt = promptFor(serverContext, message, aiHint, audioTranscript);
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
            const result = await callGemini(env.GEMINI_API_KEY, model, prompt, image, 25000);
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
