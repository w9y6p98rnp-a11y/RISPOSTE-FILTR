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
    if (replies.length >= 1) {
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

function promptFor(context, message, aiHint = "", audioTranscript = "", previousGeneratedReplies = [], mode = "normal") {
  const defaultOrder = ["Dolce","Stuzzica","Ironico","Flirt","Seria","Audace","Battuta","Poeta","Erotica","Hot"];
  const normalOrder = Array.isArray(context?.voiceSettings?.normal) && context.voiceSettings.normal.length ? context.voiceSettings.normal.map(v => String(v.id || "")).filter(Boolean) : defaultOrder.slice(0,8);
  const secretOrder = Array.isArray(context?.voiceSettings?.secret) && context.voiceSettings.secret.length ? context.voiceSettings.secret.map(v => String(v.id || "")).filter(Boolean) : defaultOrder.slice(8);
  const styleOrder = mode === "secret" ? secretOrder : normalOrder;
  const categoryExample = Object.fromEntries(styleOrder.map(style => [style, {index:0, reason:"..."}]));
  const prev = Array.isArray(previousGeneratedReplies)
    ? [...new Set(previousGeneratedReplies.map(x => String(x).trim()).filter(Boolean))].slice(-12)
    : [];
  const countForStyle = style => style === "Hot" ? 10 : 5;
  const totalReplies = styleOrder.reduce((sum, style) => sum + countForStyle(style), 0);
  const sectionName = mode === "secret" ? "SOLO RISPOSTE SEGRETE" : "SOLO RISPOSTE NORMALI";
  const settingsById = new Map();
  for (const group of [context?.voiceSettings?.normal, context?.voiceSettings?.secret]) {
    if (Array.isArray(group)) for (const v of group) if (v?.id) settingsById.set(String(v.id), v);
  }
  const lengthRules = styleOrder.map(style => {
    const instruction = String(settingsById.get(style)?.instruction || "").toLowerCase();
    const wantsLong = /(più\s+lung|piu\s+lung|lunghe|lunghezza|articolat|dettagliat|più\s+ampie|piu\s+ampie)/i.test(instruction);
    const wantsShort = /(più\s+brev|piu\s+brev|corte|concise|sintetiche)/i.test(instruction);
    if (wantsLong) return `${style}: LUNGHEZZA OBBLIGATORIA, circa 30-50 parole per risposta (non meno di 25 salvo che il contesto renda impossibile).`;
    if (wantsShort) return `${style}: LUNGHEZZA BREVE OBBLIGATORIA, circa 8-18 parole per risposta.`;
    if (style === "Hot" || style === "Erotica") return `${style}: circa 18-32 parole per risposta, con contenuto sostanzioso ma naturale.`;
    return `${style}: circa 18-32 parole per risposta; evita risposte di una sola frase telegrafica quando il contesto consente di sviluppare meglio l'idea.`;
  }).join("\n");
  return `Sei RispostaFlirt. Analizza con precisione lo screenshot, la cronologia e soprattutto l'INDICAZIONE DELL'UTENTE. Devi distinguere SEMPRE e senza eccezioni IO (l'utente che sta usando l'app) da LEI (la persona con cui sta parlando). Rispondi ESCLUSIVAMENTE all'ultimo messaggio realmente ricevuto da LEI.

DATA E ORA ATTUALI DEL DISPOSITIVO: ${context?.currentTime?.weekday || ''}, ${context?.currentTime?.date || ''}, ore ${context?.currentTime?.time || ''} (${context?.currentTime?.timeZone || 'fuso locale'}). USA QUESTO COME RIFERIMENTO TEMPORALE PER INTERPRETARE E GENERARE LE RISPOSTE. Se una risposta contiene riferimenti a oggi, domani, ieri, stamattina, stasera o giorni della settimana, devono essere coerenti con questa data e ora. NON scrivere per esempio "iniziare il lunedì" se oggi non è lunedì, salvo che tu stia parlando esplicitamente di un altro giorno. Se il contesto non richiede un riferimento temporale, non inserirlo artificialmente.

PRIORITÀ DELLO SCREENSHOT E DEL TURNO CORRENTE: se è presente uno screenshot, trattalo come la fonte primaria per capire il turno corrente. Leggi la conversazione visibile e identifica l'ULTIMA BOLLA SCRITTA DA LEI. Quella è la frase a cui devi rispondere. Le bolle precedenti servono solo come contesto. Non rispondere a un messaggio vecchio, a una frase precedente o a un dettaglio secondario dello screenshot. Prima di generare, ricostruisci mentalmente: 1) ultimo messaggio di LEI da rispondere; 2) ultimo messaggio di IO che lo precede; 3) eventuali fatti personali rilevanti. Se lo screenshot e una vecchia cronologia salvata sembrano riferirsi a turni diversi, per il turno corrente prevale lo screenshot.

L'INDICAZIONE DELL'UTENTE NON È UN MESSAGGIO DI LEI: è una nota/informazione che spiega come interpretare la situazione e come vuoi che vengano costruite le risposte. Non trasformare mai il testo dell'indicazione in un messaggio da parte di LEI e non rispondere direttamente all'indicazione.

REGOLA ASSOLUTA SULLA PROSPETTIVA: ogni fatto espresso dall'utente con "io", "sono", "ho", "mi", "me", "per me", "sto", "vado", "parto" appartiene all'UTENTE e non può essere attribuito a LEI. Ogni fatto espresso come "lei", "ha", "sta", "va", "parte" appartiene a LEI. NON invertire mai i soggetti. Se l'utente scrive "io sono in ferie", significa che È L'UTENTE ad essere in ferie: non scrivere "ti godi le vacanze", "mentre sei in vacanza", "come vanno le tue vacanze" o equivalenti riferiti a LEI. In quel caso puoi invece scrivere, per esempio, "anche se sono io quello in ferie..." oppure costruire la risposta senza attribuire la vacanza alla persona sbagliata. Se un fatto non è chiaramente attribuibile, non inventare a chi appartenga. Questa regola vale anche per advice, sendWhen, recommendationReason e per le motivazioni delle singole categorie. Prima di generare le risposte, costruisci mentalmente un piccolo elenco dei fatti: FATTI DI IO = utente; FATTI DI LEI = ragazza; poi usa quell'elenco senza scambiarli.

RICOSTRUZIONE DEI RUOLI E DEI POSSESSIVI: prima di generare qualsiasi risposta, identifica chiaramente chi parla in ogni bolla. Nell'ultima bolla di LEI, i riferimenti "tu", "te", "ti", "tuo", "tua", "tuoi", "tue" indicano l'UTENTE; i riferimenti "io", "me", "mi", "mio", "mia", "miei", "mie" indicano LEI. Nelle bolle di IO vale l'opposto. Esempio fondamentale: se LEI scrive "la tua estetista", l'estetista è quella dell'UTENTE; se LEI scrive "la mia estetista", è quella di LEI. Non invertire questi riferimenti e non decidere il proprietario in base a supposizioni o al tono della frase. Se una risposta parla di una persona, oggetto, lavoro, familiare o attività citata con un possessivo, conserva esattamente il proprietario indicato dal parlante. Prima di scrivere, costruisci mentalmente una tabella: IO = utente; LEI = ragazza; "tuo/tua" detto da LEI = IO; "mio/mia" detto da LEI = LEI.

GENERA ESATTAMENTE ${totalReplies} RISPOSTE, con 5 risposte per ogni stile tranne Hot che deve avere ESATTAMENTE 10 risposte. Nell'ordine personalizzato scelto dall'utente. MODALITÀ: ${sectionName}:
${styleOrder.map((style,i)=>`${i+1} ${style}`).join("\n")}
Genera SOLO gli stili elencati sopra. La prima risposta di OGNI stile deve essere la migliore di quello stile. Rispetta esattamente questo ordine anche nell'array replies.

PERSONALIZZAZIONE DELLE VOCI: l'utente può aver modificato il nome visualizzato e/o l'istruzione di ciascuna voce. Devi rispettare le istruzioni personalizzate qui sotto quando generi quella voce. Mantieni però nei campi JSON "style" i nomi tecnici esatti Dolce, Stuzzica, Ironico, Flirt, Seria, Audace, Battuta, Poeta, Erotica, Hot, così l'app può riconoscere correttamente ogni categoria.

ISTRUZIONI PERSONALIZZATE DELLE VOCI:
${JSON.stringify(context?.voiceSettings || {})}

PRIORITÀ DELLE ISTRUZIONI PERSONALIZZATE: le istruzioni scritte dall'utente per una voce sono vincolanti e hanno priorità sulle regole generali di stile e lunghezza, purché siano compatibili con il contesto, la memoria, i vincoli dell'utente e la sicurezza. Non ignorarle e non ridurle a un semplice suggerimento. Se l'utente chiede esplicitamente "risposte più lunghe", "più corte", "più dirette", "più dolci", "più provocatorie" o qualcosa di analogo, applica quella richiesta in modo concreto a TUTTE le risposte previste per quella voce (5 per gli altri stili, 10 per Hot).

OUTPUT E VELOCITÀ: mantieni il JSON compatto. I reason delle categorie devono essere brevi (una frase), advice e sendWhen devono essere sintetici. Non aggiungere spiegazioni fuori dal JSON.

LUNGHEZZA: la lunghezza NON dipende dal telefono, dal browser o dal sistema operativo. Applica ESATTAMENTE le regole per voce qui sotto a ogni dispositivo. Le risposte standard devono essere mediamente articolate e non telegrafiche. Se una voce personalizzata richiede risposte più lunghe, rispettala concretamente in TUTTE le risposte di quella voce. Se richiede risposte più corte, accorciale. Non compensare una richiesta di risposte lunghe con frasi brevi.
REGOLE DI LUNGHEZZA PER VOCE:
${lengthRules}

VARIETÀ: tutte le risposte devono essere realmente diverse e, soprattutto, le risposte dello stesso stile devono sembrare cinque idee differenti. Per ogni gruppo di 5 cambia apertura, struttura della frase, ritmo, vocabolario, angolazione e tipo di risposta. Non creare cinque parafrasi della prima. Evita di iniziare più risposte con le stesse parole. Almeno una risposta può essere centrata sulla situazione, una su un'osservazione o autoironia, una su un cambio naturale di argomento e le altre su angolazioni diverse, quando il contesto lo permette. Confronta sempre le 50 risposte tra loro e con le RISPOSTE PRECEDENTI DA EVITARE prima di finalizzare.

EMOJI: nella maggior parte delle risposte normali usa 1 emoji naturale e pertinente; non forzarla nei messaggi seri. Varia le emoji.

TONO SERIO: se LEI parla seriamente, esprime delusione, rabbia, fastidio, chiarisce sentimenti, mette un limite o affronta un problema reale, tutte le risposte devono essere mature e coerenti. Niente flirt forzato, battute fuori luogo, sesso o inviti a vedersi. La categoria Seria deve essere particolarmente precisa e sincera.

ANALISI DELLA SITUAZIONE — PRIORITÀ ASSOLUTA: prima di scegliere le parole, identifica mentalmente il significato del turno corrente. Devi determinare: (1) cosa sta dicendo realmente LEI; (2) quale emozione prevale — per esempio calma, scherzo, curiosità, interesse, irritazione, rabbia, tristezza, delusione, freddezza; (3) se sta facendo una domanda, accusando, mettendo un limite, chiedendo spiegazioni, provocando, flirtando o semplicemente raccontando qualcosa; (4) quale sarebbe una risposta naturale che fa avanzare quella specifica conversazione. Solo DOPO questa analisi applica lo stile richiesto. Lo stile NON può cambiare il significato della situazione.

GATE DI COERENZA: ogni risposta deve essere una continuazione plausibile dell'ULTIMO messaggio di LEI. Se l'ultimo messaggio è arrabbiato, infastidito, accusatorio o contiene un limite, privilegia calma, leggerezza controllata, assunzione di responsabilità o de-escalation. In quel caso non trasformare la rabbia in flirt, seduzione, complimenti, desiderio o allusioni solo perché stai generando una categoria Flirt, Audace, Erotica o Hot. Se l'ultimo messaggio è scherzoso o complice, puoi stuzzicare. Se è affettuoso o flirtante, puoi ricambiare. Se chiede una spiegazione, rispondi alla domanda invece di cambiare argomento. Se mette un limite, rispettalo. Se non c'è alcun elemento che giustifichi romanticismo o sessualità, non inventarlo.

ESEMPIO DI CONTROLLO: se LEI scrive qualcosa come "non mi far perdere la pazienza perché sono già arrabbiata di mio", il nucleo della risposta deve riconoscere che LEI è arrabbiata e che non vuoi peggiorare la situazione. Sono inappropriate frasi come "mi piace quando tiri fuori gli artigli", "monopolizzare i miei pensieri" o altre formule generiche da flirt che non rispondono a quel messaggio. Una versione Stuzzica può essere leggera ma deve comunque disinnescare la tensione; una versione Flirt può contenere al massimo una sfumatura molto lieve se il resto della conversazione la sostiene; la versione Seria deve essere calma e diretta.

NESSUNA FRASE GENERICA FUORI CONTESTO: non inserire automaticamente concetti come "mi fai pensare a te", "monopolizzi i miei pensieri", "sei bellissima", "mi piace il tuo sorriso", "vorrei averti qui", "non vedo l'ora di vederti", "sei misteriosa" o equivalenti se l'ultimo messaggio di LEI non li rende naturali. Ogni frase deve nascere da un dettaglio reale del turno corrente o dalla cronologia immediatamente rilevante.

BATTUTA: è diversa da Ironico e serve soprattutto a farla sorridere, ma solo se il contesto lo permette. Se il momento è serio, rendila comunque rispettosa oppure privilegia una risposta più adatta.

MEMORIA E VINCOLI: le Cose da ricordare sono obbligatorie. Se contengono un divieto come "non dirmi più di vederci", nessuna risposta, consiglio o motivazione può proporre quell'idea nemmeno indirettamente. Non trasformare mai un fatto di IO in un fatto di LEI. Non inventare dettagli.

PROFILO IO: usa il profilo dell'utente per rendere le risposte coerenti con il suo modo di parlare, senza citarlo esplicitamente.

RIPETIZIONI: considera anche le risposte già generate e quelle già inviate. Non riproporre la stessa frase, quasi-parafrasi, apertura, punchline o struttura. Evita formule già usate come "vediamo", "curiosità", "misteriosa", "mi piace", "vorrei averti qui" quando sono già comparse. Cambia davvero idea, ritmo, angolazione e lessico. Se una risposta precedente esprime già lo stesso concetto, scegli un concetto diverso invece di riscriverlo con sinonimi.

PERTINENZA AL MESSAGGIO: ogni risposta deve poter essere letta subito dopo l'ULTIMA FRASE DI LEI nello screenshot e risultare naturale come continuazione della chat. Non usare complimenti generici, frasi romantiche o osservazioni sul suo sorriso/aspetto se l'ultimo messaggio non li giustifica. Il contenuto deve nascere dalla situazione reale mostrata nello screenshot.

TEST DI RISPOSTA: prima di finalizzare ogni frase, immagina di incollarla subito sotto l'ultimo messaggio di LEI. Chiediti: "Sembra davvero una risposta a quello che ha appena detto, oppure potrebbe essere stata scritta a qualsiasi ragazza in qualsiasi conversazione?" Se potrebbe andare bene ovunque, scartala e riscrivila usando il contesto reale. Per ogni stile cambia il tono, ma conserva lo stesso nucleo conversazionale.

CONSIGLIO: advice e sendWhen devono essere sempre valorizzati con il consiglio operativo migliore e il momento corretto per inviare. Se l'indicazione dell'utente chiede una decisione, rispettala. Non inventare il motivo del consiglio.

RECOMMENDATIONS: categoryRecommendations deve avere esattamente queste 10 chiavi nell'ordine personalizzato ${styleOrder.join(", ")}. Ogni chiave ha index:0 e un reason specifico. recommendedNormalIndex deve indicare una delle prime 40; recommendedSecretIndex deve indicare una delle risposte segrete (Erotica o Hot); recommendedIndex la migliore assoluta.

SEGRETE: Erotica e Hot devono essere le voci più sensuali, intense, audaci e provocanti dell'app QUANDO IL CONTESTO LE RENDE APPROPRIATE. HOT deve spingersi al massimo livello consentito: forte tensione, desiderio, doppi sensi, allusioni e linguaggio seducente, senza diventare freddo o timido. Mantieni comunque il contenuto non grafico: non descrivere esplicitamente atti sessuali, genitali o dettagli pornografici. Se il contesto permette un tono molto caldo, non annacquarlo con frasi innocue o generiche. Se invece LEI è arrabbiata, infastidita, sta mettendo un limite o il contesto non sostiene la sessualità, non forzare Hot/Erotica: anche queste risposte devono restare pertinenti al momento e non peggiorare la situazione.

Rispondi SOLO con JSON valido, senza markdown, esattamente nel formato:
${JSON.stringify({advice:"...",sendWhen:"oggi",recommendedIndex:0,recommendedNormalIndex:0,recommendedSecretIndex:(mode === "secret" ? 0 : 40),recommendationReason:"...",categoryRecommendations:categoryExample,replies:[{style:styleOrder[0],text:"..."}]})}

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
${aiHint || 'Nessuna.'}

CONTROLLO FINALE OBBLIGATORIO PRIMA DEL JSON:
- Verifica sempre il giorno della settimana e l'ora rispetto alla DATA E ORA ATTUALI DEL DISPOSITIVO sopra indicata. Non confondere lunedì, martedì, ecc. e non usare riferimenti temporali incoerenti con oggi.
- Se nell'indicazione compare "io sono in ferie", nessuna risposta può parlare delle ferie come se fossero di LEI.
- Se compare un altro fatto personale introdotto da "io", "ho", "sono", "sto", "vado", "parto" o simili, mantienilo riferito all'UTENTE.
- Non correggere o reinterpretare la prospettiva dell'utente in base a supposizioni.
- Ricontrolla ogni risposta, advice e reason per assicurarti che IO e LEI non siano stati invertiti.
- Ricontrolla anche i possessivi: se LEI dice "la tua X", X appartiene all'UTENTE; se dice "la mia X", X appartiene a LEI.
- Ricontrolla che ogni risposta sia realmente collegata all'ultimo messaggio di LEI e non sia una frase generica da flirt riciclata.
- Se LEI è arrabbiata o infastidita, verifica che nessuna risposta la provochi inutilmente o trasformi la situazione in flirt/sesso senza una base reale.
- Verifica che ogni stile sia diverso nel tono ma coerente con la stessa situazione concreta.
- Se una risposta non supera il TEST DI RISPOSTA, scartala e sostituiscila prima di produrre il JSON.`;
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

async function callGemini(apiKey, model, prompt, image, timeoutMs = 55000) {
  const parts = [{ text: prompt }];
  const img = imagePart(image);
  if (img) parts.push({ inlineData: img });

  // Gemini 3.8 Flash non accetta thinkingLevel: 'minimal'.
  // Per 3.5/3.6 manteniamo la modalità rapida; per 3.8 lasciamo
  // che il modello usi il proprio livello predefinito supportato.
  const generationConfig = {
    maxOutputTokens: 3000,
    responseMimeType: 'application/json'
  };
  if (model !== 'gemini-3.8-flash') {
    generationConfig.thinkingConfig = { thinkingLevel: 'minimal' };
  }

  const response = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig
    })
  }, timeoutMs);

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiMessage = data?.error?.message || data?.error?.status || `HTTP ${response.status}`;
    const err = new Error(`Gemini ${model}: ${apiMessage}`);
    err.status = response.status;
    err.apiStatus = data?.error?.status || '';
    throw err;
  }

  const raw = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
  return extractJson(raw);
}

async function callOpenRouter(apiKey, prompt, image, timeoutMs = 55000) {
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
  }, timeoutMs);

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error('OpenRouter: servizio non disponibile');
  }
  return { result: extractJson(data?.choices?.[0]?.message?.content || ''), actualModel: data?.model || 'openrouter/free' };
}

function compactGroqPrompt(context, message, aiHint = '', audioTranscript = '', previousGeneratedReplies = [], mode = 'normal', selectedStyles = null) {
  const defaults = ['Dolce','Stuzzica','Ironico','Flirt','Seria','Audace','Battuta','Poeta','Erotica','Hot'];
  const normal = Array.isArray(context?.voiceSettings?.normal) && context.voiceSettings.normal.length
    ? context.voiceSettings.normal.map(v => String(v.id || '')).filter(Boolean) : defaults.slice(0, 8);
  const secret = Array.isArray(context?.voiceSettings?.secret) && context.voiceSettings.secret.length
    ? context.voiceSettings.secret.map(v => String(v.id || '')).filter(Boolean) : defaults.slice(8);
  const allStyles = mode === 'secret' ? secret : normal;
  const styles = Array.isArray(selectedStyles) && selectedStyles.length
    ? selectedStyles.filter(style => allStyles.includes(style))
    : allStyles;
  const settings = new Map();
  for (const group of [context?.voiceSettings?.normal, context?.voiceSettings?.secret]) {
    if (Array.isArray(group)) for (const item of group) if (item?.id) settings.set(String(item.id), item);
  }
  const styleRules = styles.map(style => {
    const item = settings.get(style);
    const label = String(item?.name || style).replace(/\s+/g, ' ').slice(0, 32);
    const instruction = String(item?.instruction || '').replace(/\s+/g, ' ').slice(0, 100);
    return `${style} (${label})${instruction ? ': ' + instruction : ''}`;
  }).join('\n');
  const history = (Array.isArray(context?.conversation) ? context.conversation : []).slice(-10).map(x => ({
    speaker: x.role === 'me' ? 'IO' : x.role === 'her' ? 'LEI' : 'NON IDENTIFICATO',
    text: String(x.text || '').replace(/\s+/g, ' ').slice(0, 220)
  })).filter(x => x.text);
  const lastHerMessage = [...history].reverse().find(x => x.speaker === 'LEI')?.text || '';
  const previous = [...new Set((Array.isArray(previousGeneratedReplies) ? previousGeneratedReplies : [])
    .map(x => String(x).trim()).filter(Boolean))].slice(-8).map(x => x.slice(0, 100));
  const compactContext = {
    girl: String(context?.girl?.name || '').slice(0, 40),
    note: String(context?.girl?.note || '').replace(/\s+/g, ' ').slice(0, 140),
    memory: String(context?.girl?.memory || context?.memory || '').replace(/\s+/g, ' ').slice(0, 220),
    userProfile: String(context?.aboutMe || '').replace(/\s+/g, ' ').slice(0, 100),
    recentChat: history
  };
  const perStyle = styles.map(style => `${style}: ${style === 'Hot' ? 10 : 5}`).join(', ');
  const total = styles.reduce((sum, style) => sum + (style === 'Hot' ? 10 : 5), 0);
  return `Sei RispostaFlirt. Il tuo compito è leggere lo screenshot della chat e scrivere risposte da inviare a LEI. Italiano naturale, concreto e coerente. Non inventare dettagli.

IDENTIFICAZIONE OBBLIGATORIA DEI DUE PARTECIPANTI:
- IO = proprietario dell'app, cioè l'utente. LEI = la ragazza con cui parla.
- Nelle schermate WhatsApp: bolle VERDI a DESTRA = IO; bolle GRIGIE a SINISTRA = LEI. Leggi le bolle dall'alto verso il basso; quella più in basso è normalmente la più recente.
- Se l'app di messaggistica è diversa, usa posizione e stile visivo delle bolle per distinguere mittente e destinatario. Non assegnare un testo a qualcuno solo in base al suo contenuto.
- La risposta va scritta come se IO rispondessi all'ULTIMA bolla ricevuta da LEI. Non rispondere a una mia bolla verde/destra.
- Se non riesci a distinguere con sicurezza l'ultima bolla di LEI, non inventare: segnala nel campo advice che il mittente o il testo non è leggibile e basa le risposte solo sull'ultimo messaggio LEI chiaramente presente nella cronologia.
- Nei messaggi scritti da LEI, "io/mio/mia/mi" si riferisce a LEI e "tu/tuo/tua/ti" si riferisce a IO. Nelle bolle scritte da IO vale il contrario. Non scambiare mai i proprietari di lavoro, ferie, familiari, oggetti o attività.

CONTESTO SALVATO (ruoli espliciti):
${JSON.stringify(compactContext)}
ULTIMO MESSAGGIO LEI PRESENTE NELLA CRONOLOGIA: ${lastHerMessage || 'Non disponibile; identifica la bolla nello screenshot.'}
TESTO/INDICAZIONE DELL'UTENTE: ${String(message || '').replace(/\s+/g, ' ').slice(0, 300)}
ISTRUZIONE AGGIUNTIVA: ${String(aiHint || '').replace(/\s+/g, ' ').slice(0, 160)}
TRASCRIZIONE AUDIO: ${String(audioTranscript || '').replace(/\s+/g, ' ').slice(0, 120)}
RISPOSTE GIÀ USATE DA NON RIPETERE: ${JSON.stringify(previous)}
STILI RICHIESTI: ${styleRules}
NUMERO OBBLIGATORIO: ${perStyle}. Totale esatto: ${total} risposte.

PRIMA DI SCRIVERE:
1. Individua nello screenshot le ultime 2-4 bolle visibili e annota mentalmente mittente e testo.
2. Conferma quale sia l'ultima bolla di LEI. Se la cronologia salvata e lo screenshot sono in conflitto, considera lo screenshot più recente.
3. Riassumi mentalmente il senso della sua ultima frase, la sua emozione e l'eventuale domanda o limite.
4. Ogni risposta deve essere una replica diretta a quella frase, non una frase generica da flirt.
5. Varia davvero le risposte: non usare parafrasi, aperture o concetti ripetuti. Se LEI è seria, arrabbiata o mette un limite, rispondi con rispetto e senza flirt forzato.

REGOLE DI OUTPUT:
- Restituisci SOLO JSON valido, senza markdown.
- replies deve essere un ARRAY PIATTO con esattamente ${total} oggetti.
- Inserisci ESATTAMENTE 5 oggetti per ciascuno stile, tranne Hot che ne richiede 10. Ripeti il nome tecnico dello stile in ogni oggetto.
- Ogni oggetto deve avere solo queste due proprietà: "style" e "text".
- Non raggruppare le risposte in un unico testo. Non produrre una sola risposta per stile.
- Ogni risposta deve essere distinta, naturale, direttamente collegata all'ultima frase di LEI, senza inventare eventi. Mantieni lunghezza indicativa 10-22 parole.
- categoryRecommendations deve contenere una chiave per ciascuno stile richiesto, con index:0 e reason breve e specifico.
- recommendedIndex e recommendedNormalIndex devono essere 0; recommendedSecretIndex deve essere 0 in modalità segreta e 40 in modalità normale.
- advice deve essere un consiglio operativo breve e coerente; sendWhen deve indicare quando inviare.
- Se il messaggio di LEI non è leggibile, dichiaralo in advice: non fingere di aver capito lo screenshot.

SCHEMA JSON (compila i campi, non copiare segnaposto):
{"advice":"consiglio breve","sendWhen":"ora","recommendedIndex":0,"recommendedNormalIndex":0,"recommendedSecretIndex":${mode === 'secret' ? 0 : 40},"recommendationReason":"motivo breve","categoryRecommendations":{${styles.map(style => `"${style}":{"index":0,"reason":"motivo specifico"}`).join(',')}},"replies":[${styles.map(style => `{"style":"${style}","text":"prima risposta"},{"style":"${style}","text":"seconda risposta"},{"style":"${style}","text":"terza risposta"},{"style":"${style}","text":"quarta risposta"},{"style":"${style}","text":"quinta risposta"}`).join(',')}${styles.includes('Hot') ? ',{"style":"Hot","text":"sesta risposta"},{"style":"Hot","text":"settima risposta"},{"style":"Hot","text":"ottava risposta"},{"style":"Hot","text":"nona risposta"},{"style":"Hot","text":"decima risposta"}' : ''}]}`;
}

async function callCloudflareAI(aiBinding, prompt, image, timeoutMs = 100000, maxTokens = 2048) {
  if (!aiBinding || typeof aiBinding.run !== 'function') {
    throw new Error('Cloudflare AI: binding AI non disponibile.');
  }
  const cleanPrompt = String(prompt || '').trim();
  if (!cleanPrompt) throw new Error('Cloudflare AI: prompt vuoto.');

  const messages = [
    {
      role: 'system',
      content: 'Sei RispostaFlirt. Rispondi esclusivamente in italiano. Segui le istruzioni e restituisci SOLO JSON valido, senza markdown o testo fuori dal JSON.'
    },
    { role: 'user', content: cleanPrompt }
  ];
  const input = {
    messages,
    max_tokens: maxTokens,
    temperature: 0.58,
    top_p: 0.85,
    repetition_penalty: 1.08,
    frequency_penalty: 0.25
  };

  if (image && typeof image === 'string' && image.startsWith('data:image/')) {
    input.image = image;
  } else if (image) {
    throw new Error('Cloudflare AI: screenshot in formato immagine non valido.');
  }

  let timer;
  try {
    const result = await Promise.race([
      aiBinding.run('@cf/meta/llama-3.2-11b-vision-instruct', input),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Cloudflare AI: timeout')), timeoutMs); })
    ]);
    const raw = result?.response || result?.result || result?.output_text || '';
    if (!raw) throw new Error('Cloudflare AI: risposta vuota o formato non riconosciuto.');
    return { result: extractJson(raw), actualModel: '@cf/meta/llama-3.2-11b-vision-instruct' };
  } catch (err) {
    const message = String(err?.message || err || 'errore sconosciuto');
    throw new Error(message.startsWith('Cloudflare AI:') ? message : `Cloudflare AI: ${message}`);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function callGroq(apiKey, prompt, image, timeoutMs = 45000) {
  const content = [{ type: 'text', text: prompt }];
  // detail=low riduce il costo dei token visivi per gli screenshot lunghi.
  if (image) content.push({ type: 'image_url', image_url: { url: image, detail: 'low' } });

  const response = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'qwen/qwen3.8-27b',
      messages: [{ role: 'user', content }],
      temperature: 0.7,
      max_completion_tokens: 512,
      reasoning_effort: 'none',
      response_format: { type: 'json_object' }
    })
  }, timeoutMs);

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiMessage = data?.error?.message || `HTTP ${response.status}`;
    const err = new Error(`Groq: ${apiMessage}`);
    err.status = response.status;
    throw err;
  }
  return {
    result: extractJson(data?.choices?.[0]?.message?.content || ''),
    actualModel: data?.model || 'qwen/qwen3.8-27b'
  };
}

function validateReplyCounts(result, context, mode) {
  const defaults = ['Dolce','Stuzzica','Ironico','Flirt','Seria','Audace','Battuta','Poeta','Erotica','Hot'];
  const normal = Array.isArray(context?.voiceSettings?.normal) && context.voiceSettings.normal.length
    ? context.voiceSettings.normal.map(v => String(v.id || '')).filter(Boolean) : defaults.slice(0, 8);
  const secret = Array.isArray(context?.voiceSettings?.secret) && context.voiceSettings.secret.length
    ? context.voiceSettings.secret.map(v => String(v.id || '')).filter(Boolean) : defaults.slice(8);
  const styles = mode === 'secret' ? secret : normal;
  const replies = Array.isArray(result?.replies) ? result.replies : [];
  const expectedTotal = styles.reduce((sum, style) => sum + (style === 'Hot' ? 10 : 5), 0);
  const problems = [];
  for (const style of styles) {
    const count = replies.filter(item => item && item.style === style && String(item.text || '').trim()).length;
    const expected = style === 'Hot' ? 10 : 5;
    if (count !== expected) problems.push(`${style}: ${count}/${expected}`);
  }
  if (replies.length !== expectedTotal || problems.length) {
    throw new Error(`Risposta incompleta di Llama (${problems.join(', ') || `${replies.length}/${expectedTotal} totali`}). Premi di nuovo Analizza per riprovare con Llama.`);
  }
  return result;
}

export async function onRequestPost(context) {
  const request = context.request;
  const env = context.env;

  try {
    const body = await request.json().catch(() => ({}));
    const { message = '', aiHint = '', image = null, imageGroq = null, imageLlama = null, audio = null, audioTranscript: providedAudioTranscript = '', currentTime = null, mode = 'normal', girlId = '', aiModel = 'auto' } = body;
    if (!image && !imageLlama && !audio) return json(400, { error: 'Aggiungi uno screenshot oppure una registrazione vocale.' });
    if (!env.DB || !context.user?.id || !girlId) return json(401, { error: 'Sessione o ragazza non valide.' });

    // Il contesto usato dall'AI viene letto dal database del proprietario della sessione.
    // Non ci fidiamo del contesto inviato dal browser, così un utente non può
    // chiedere all'AI i dati di un'altra persona modificando la richiesta.
    const girl = await env.DB.prepare(
      'SELECT id,name,note,memory FROM girls WHERE id=? AND user_id=? LIMIT 1'
    ).bind(String(girlId), context.user.id).first();
    if (!girl) return json(404, { error: 'Conversazione non trovata.' });

    const history = await env.DB.prepare(
      'SELECT role,text,created_at AS createdAt FROM messages WHERE user_id=? AND girl_id=? ORDER BY created_at DESC LIMIT 10'
    ).bind(context.user.id, String(girlId)).all();
    const conversation = (history.results || []).reverse();
    const previous = await env.DB.prepare(
      "SELECT text FROM messages WHERE user_id=? AND girl_id=? AND role='me' ORDER BY created_at DESC LIMIT 8"
    ).bind(context.user.id, String(girlId)).all();
    const previousState = await env.DB.prepare(
      'SELECT results_html AS resultsHtml FROM girl_states WHERE user_id=? AND girl_id=? LIMIT 1'
    ).bind(context.user.id, String(girlId)).first();
    const settingsRow = await env.DB.prepare(
      'SELECT value FROM settings WHERE user_id=? AND key=? LIMIT 1'
    ).bind(context.user.id, 'app').first();
    let accountSettings = {};
    try { accountSettings = settingsRow?.value ? JSON.parse(settingsRow.value) : {}; } catch (_) { accountSettings = {}; }
    const previousGeneratedReplies = extractPreviousGeneratedReplies(previousState?.resultsHtml || '').slice(-12);

    const serverContext = {
      aboutMe: String(accountSettings?.aboutMe || ''),
      voiceSettings: accountSettings?.voiceSettings || {},
      girl: { id: girl.id, name: girl.name, note: girl.note || '', memory: girl.memory || '' },
      memory: girl.memory || '',
      conversation,
      previousReplies: (previous.results || []).reverse().map(x => x.text).filter(Boolean),
      previousGeneratedReplies,
      currentTime: (currentTime && typeof currentTime === 'object') ? {
        weekday: String(currentTime.weekday || ''),
        date: String(currentTime.date || ''),
        time: String(currentTime.time || ''),
        timeZone: String(currentTime.timeZone || ''),
        iso: String(currentTime.iso || '')
      } : null
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

    if (providedAudioTranscript) audioTranscript = String(providedAudioTranscript).slice(0, 12000);
    const prompt = promptFor(serverContext, message, aiHint, audioTranscript, previousGeneratedReplies, mode === 'secret' ? 'secret' : 'normal');
    // Modalità Llama esclusiva: nessun fallback automatico verso Gemini, Groq o OpenRouter.
    if (!env.AI || typeof env.AI.run !== 'function') {
      return json(503, { error: 'Cloudflare AI non è configurato: il binding AI non è disponibile. Nessun altro motore verrà usato.' });
    }
    const selectedMode = mode === 'secret' ? 'secret' : 'normal';
    const defaultStyles = ['Dolce','Stuzzica','Ironico','Flirt','Seria','Audace','Battuta','Poeta','Erotica','Hot'];
    const configuredStyles = Array.isArray(serverContext?.voiceSettings?.[selectedMode]) && serverContext.voiceSettings[selectedMode].length
      ? serverContext.voiceSettings[selectedMode].map(v => String(v.id || '')).filter(Boolean)
      : (selectedMode === 'secret' ? defaultStyles.slice(8) : defaultStyles.slice(0, 8));
    // Llama resta l'unico modello. Dividiamo gli stili in due gruppi per evitare
    // che una singola risposta JSON troppo lunga venga troncata a metà.
    const styleBatches = [];
    for (let i = 0; i < configuredStyles.length; i += 4) {
      styleBatches.push(configuredStyles.slice(i, i + 4));
    }
    try {
      const screenshotForLlama = imageLlama || image;
      const batchOutputs = await Promise.all(styleBatches.map(async (styleBatch) => {
        const batchPrompt = compactGroqPrompt(
          serverContext, message, aiHint, audioTranscript,
          previousGeneratedReplies, selectedMode, styleBatch
        );
        return callCloudflareAI(env.AI, batchPrompt, screenshotForLlama, 100000, 2048);
      }));
      const combined = {
        ...(batchOutputs[0]?.result || {}),
        replies: batchOutputs.flatMap(item => Array.isArray(item?.result?.replies) ? item.result.replies : []),
        categoryRecommendations: Object.assign({}, ...batchOutputs.map(item => item?.result?.categoryRecommendations || {}))
      };
      validateReplyCounts(combined, serverContext, selectedMode);
      return new Response(JSON.stringify({
        ...combined,
        audioTranscript,
        provider: 'Cloudflare AI',
        model: '@cf/meta/llama-3.2-11b-vision-instruct',
        fallbackErrors: []
      }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    } catch (err) {
      const detail = String(err?.message || err || 'errore sconosciuto');
      const isTimeout = /timeout|timed out|3007|3008/i.test(detail);
      return new Response(JSON.stringify({
        error: isTimeout
          ? 'Llama 3.2 Vision ha impiegato troppo tempo. Lo screenshot è stato alleggerito: riprova tra poco.'
          : 'Llama 3.2 Vision non ha completato tutti i gruppi di risposte. Nessun altro motore è stato utilizzato.',
        details: [detail],
        provider: 'Cloudflare AI',
        model: '@cf/meta/llama-3.2-11b-vision-instruct'
      }), { status: isTimeout ? 504 : 502, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || 'Errore del server AI.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
