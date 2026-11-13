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
  const screenshotSourceRule = String(message || '').trim()
    ? 'Usa il testo OCR qui sotto come trascrizione primaria dello screenshot; se l’immagine è allegata, usala solo per chiarire dubbi.'
    : 'Non è disponibile testo OCR: analizza direttamente lo screenshot allegato e identifica l’ultima bolla di LEI.';
  const replySlotsExample = styleOrder.flatMap(style =>
    Array.from({ length: countForStyle(style) }, (_, index) => ({
      style,
      text: `risposta distinta ${index + 1} dello stile ${style}`
    }))
  );
  return `Sei RispostaFlirt. Analizza con precisione il testo estratto dallo screenshot (se presente), l’immagine allegata quando disponibile, la cronologia e soprattutto l'INDICAZIONE DELL'UTENTE. Devi distinguere SEMPRE e senza eccezioni IO (l'utente che sta usando l'app) da LEI (la persona con cui sta parlando). Rispondi ESCLUSIVAMENTE all'ultimo messaggio realmente ricevuto da LEI.

DATA E ORA ATTUALI DEL DISPOSITIVO: ${context?.currentTime?.weekday || ''}, ${context?.currentTime?.date || ''}, ore ${context?.currentTime?.time || ''} (${context?.currentTime?.timeZone || 'fuso locale'}). USA QUESTO COME RIFERIMENTO TEMPORALE PER INTERPRETARE E GENERARE LE RISPOSTE. Se una risposta contiene riferimenti a oggi, domani, ieri, stamattina, stasera o giorni della settimana, devono essere coerenti con questa data e ora. NON scrivere per esempio "iniziare il lunedì" se oggi non è lunedì, salvo che tu stia parlando esplicitamente di un altro giorno. Se il contesto non richiede un riferimento temporale, non inserirlo artificialmente.

PRIORITÀ DELLO SCREENSHOT E DEL TURNO CORRENTE: ${screenshotSourceRule} Ricostruisci l'ordine dei messaggi e identifica l'ULTIMA BOLLA SCRITTA DA LEI. Quella è la frase a cui devi rispondere. Le bolle precedenti servono solo come contesto. Non rispondere a un messaggio vecchio, a una frase precedente o a un dettaglio secondario dello screenshot. Prima di generare, ricostruisci mentalmente: 1) ultimo messaggio di LEI da rispondere; 2) ultimo messaggio di IO che lo precede; 3) eventuali fatti personali rilevanti. Se lo screenshot e una vecchia cronologia salvata sembrano riferirsi a turni diversi, per il turno corrente prevale lo screenshot.

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

RECOMMENDATIONS: categoryRecommendations deve contenere esattamente le chiavi degli stili richiesti in questo blocco, nell'ordine ${styleOrder.join(", ")}. Ogni chiave ha index:0 e un reason specifico. recommendedIndex deve indicare la migliore risposta tra quelle generate in questo blocco. recommendedNormalIndex e recommendedSecretIndex devono essere coerenti con la modalità richiesta.

SEGRETE: Erotica e Hot devono essere le voci più sensuali, intense, audaci e provocanti dell'app QUANDO IL CONTESTO LE RENDE APPROPRIATE. HOT deve spingersi al massimo livello consentito: forte tensione, desiderio, doppi sensi, allusioni e linguaggio seducente, senza diventare freddo o timido. Mantieni comunque il contenuto non grafico: non descrivere esplicitamente atti sessuali, genitali o dettagli pornografici. Se il contesto permette un tono molto caldo, non annacquarlo con frasi innocue o generiche. Se invece LEI è arrabbiata, infastidita, sta mettendo un limite o il contesto non sostiene la sessualità, non forzare Hot/Erotica: anche queste risposte devono restare pertinenti al momento e non peggiorare la situazione.

Rispondi SOLO con JSON valido, senza markdown, esattamente nel formato:
${JSON.stringify({advice:"...",sendWhen:"oggi",recommendedIndex:0,recommendedNormalIndex:0,recommendedSecretIndex:(mode === "secret" ? 0 : 40),recommendationReason:"...",categoryRecommendations:categoryExample,replies:replySlotsExample})}

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

// Prompt compatto dedicato a Gemma locale: mantiene le regole essenziali e
// limita i dati di contesto inviati al telefono. Il prompt completo resta
// invariato per Gemini/OpenRouter come fallback.
function promptForOlliteRT(context, message, aiHint = '', audioTranscript = '', previousGeneratedReplies = [], mode = 'normal') {
  const defaults = mode === 'secret' ? ['Erotica', 'Hot'] : ['Dolce', 'Stuzzica', 'Ironico', 'Flirt', 'Seria', 'Audace', 'Battuta', 'Poeta'];
  const settings = context?.voiceSettings || {};
  const configured = Array.isArray(settings[mode]) ? settings[mode] : [];
  const styles = configured.length ? configured.map(v => String(v?.id || '')).filter(Boolean) : defaults;
  const count = style => style === 'Hot' ? 10 : 5;
  const total = styles.reduce((n, style) => n + count(style), 0);
  const categoryExample = Object.fromEntries(styles.map(style => [style, { index: 0, reason: '...' }]));
  const custom = configured.map(v => ({
    style: String(v?.id || ''),
    instruction: String(v?.instruction || '').slice(0, 160)
  })).filter(v => v.style && v.instruction);
  const clip = (value, max) => String(value || '').slice(0, max);
  const conversation = (Array.isArray(context?.conversation) ? context.conversation : []).slice(-2).map(m => ({
    role: m?.role === 'me' ? 'IO' : 'LEI',
    text: clip(m?.text, 150)
  }));
  const previousReplies = (Array.isArray(context?.previousReplies) ? context.previousReplies : []).slice(-2).map(x => clip(x, 75));
  const previousGenerated = [...new Set((Array.isArray(previousGeneratedReplies) ? previousGeneratedReplies : []).map(x => clip(x, 130)).filter(Boolean))].slice(-2);
  const compactContext = {
    ragazza: clip(context?.girl?.name, 80),
    noteRagazza: clip(context?.girl?.note, 180),
    memoriaRagazza: clip(context?.memory || context?.girl?.memory, 300),
    profiloUtente: clip(context?.aboutMe, 120),
    dataOra: context?.currentTime ? {
      giorno: clip(context.currentTime.weekday, 20),
      data: clip(context.currentTime.date, 20),
      ora: clip(context.currentTime.time, 12),
      fuso: clip(context.currentTime.timeZone, 40)
    } : null,
    conversazioneRecente: conversation,
    messaggiUtentePrecedenti: previousReplies,
    risposteGiaGenerateDaEvitare: previousGenerated
  };
  const modeLabel = mode === 'secret' ? 'SEGRETE' : 'NORMALI';
  const screenshotSourceRule = clip(message, 900)
    ? 'Usa il testo OCR seguente come trascrizione primaria dello screenshot; se l’immagine è allegata, usala solo per chiarire dubbi.'
    : 'Non è disponibile testo OCR: analizza direttamente lo screenshot allegato e identifica l’ultima bolla di LEI.';
  const styleInstructions = custom.length ? JSON.stringify(custom) : 'Nessuna.';
  return `Sei RispostaFlirt. Scrivi in italiano naturale. Devi rispondere SOLO all'ULTIMO messaggio di LEI. ${screenshotSourceRule} Il contenuto dello screenshot prevale sulla cronologia salvata. Il campo INDICAZIONE è una nota dell'utente, non è un messaggio di LEI.

RUOLI: IO = utente; LEI = ragazza. Nei messaggi di LEI, “tu/te/ti/tuo” indicano IO e “io/me/mi/mio” indicano LEI. Nei messaggi di IO vale l'opposto. Non scambiare mai fatti o possessivi. Se non è chiaro chi possiede un fatto, non inventarlo.

CONTESTO: ${JSON.stringify(compactContext)}

TESTO ESTRATTO DALLO SCREENSHOT (OCR; ordine delle righe approssimato): ${clip(message, 900) || 'Nessun testo OCR disponibile.'}
INDICAZIONE UTENTE: ${clip(aiHint, 350) || 'Nessuna.'}
TRASCRIZIONE VOCALE: ${clip(audioTranscript, 500) || 'Nessuna.'}

MEMORIA E ISTRUZIONI PERSONALIZZATE: rispetta note e memoria della ragazza, profilo utente e istruzioni delle voci. Istruzioni voci: ${styleInstructions}

COMPITO: genera ESATTAMENTE ${total} risposte, nell'ordine degli stili: ${styles.join(', ')}. Genera 5 risposte per ogni stile; per Hot esattamente 10. Usa nei campi style i nomi tecnici degli stili. La prima risposta di ogni stile deve essere la migliore. Le risposte dello stesso stile devono essere idee diverse, non parafrasi. Non riutilizzare la stessa apertura, la stessa struttura o gruppi di cinque parole consecutive; varia prospettiva, ritmo e intenzione in ogni risposta.

TONO: Dolce = affettuoso; Stuzzica = provocatorio leggero; Ironico = ironia; Flirt = seducente ma naturale; Seria = matura e sincera; Audace = sicuro; Battuta = spiritoso; Poeta = evocativo; Erotica/Hot = sensuali e allusive, mai grafiche. Adatta SEMPRE il tono al messaggio reale: se LEI è arrabbiata, infastidita o pone un limite, niente flirt o sesso forzato; rispetta il limite e non peggiorare la situazione. Niente frasi generiche fuori contesto. Ogni risposta deve sembrare una continuazione naturale della chat.

LUNGHEZZA: per velocizzare la generazione, ogni risposta deve essere concisa ma concreta, circa 10-18 parole. Non usare spiegazioni o premesse. Se le istruzioni personalizzate della singola voce chiedono esplicitamente una lunghezza diversa, rispettale. Mantieni 1 emoji pertinente nella maggior parte delle risposte normali, senza forzarla nei messaggi seri. Evita ripetizioni con i messaggi e le risposte precedenti.

CONSIGLIO: valorizza advice e sendWhen con indicazioni brevi e pratiche. categoryRecommendations deve avere esattamente queste chiavi: ${styles.join(', ')}. Per ogni chiave usa index:0 e un reason specifico e breve. recommendedIndex indica la migliore risposta del blocco. recommendedNormalIndex e recommendedSecretIndex devono essere coerenti con la modalità ${modeLabel}.

Rispondi SOLO con JSON valido, senza markdown, nel formato: ${JSON.stringify({ advice: '...', sendWhen: 'oggi', recommendedIndex: 0, recommendedNormalIndex: 0, recommendedSecretIndex: mode === 'secret' ? 0 : 40, recommendationReason: '...', categoryRecommendations: categoryExample, replies: [{ style: styles[0], text: '...' }] })}`;
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

async function fetchWithTimeout(url, options, ms = 18000, parentSignal = null) {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('Timeout richiesta AI')), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', abortFromParent);
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

async function callOpenRouter(apiKey, prompt, image, timeoutMs = 11000) {
  const content = [{ type: 'text', text: prompt }];
  if (image) content.push({ type: 'image_url', image_url: { url: image } });

  // Il router gratuito può assegnare modelli diversi: facciamo al massimo
  // due tentativi brevi e riportiamo il motivo reale se non arriva testo.
  for (let attempt = 1; attempt <= 2; attempt++) {
    let response;
    let data = {};
    try {
      response = await fetchWithTimeout('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://risposte-filtr.984hg549k6.workers.dev',
          'X-Title': 'RispostaFlirt'
        },
        body: JSON.stringify({
          model: 'openrouter/free',
          messages: [{ role: 'user', content }],
          temperature: 0.85,
          max_tokens: 4500,
          response_format: { type: 'json_object' }
        })
      }, timeoutMs);
      data = await response.json().catch(() => ({}));
    } catch (err) {
      if (attempt === 1 && (err?.name === 'AbortError' || /network|fetch/i.test(String(err?.message || err)))) {
        continue;
      }
      throw err;
    }

    if (!response.ok) {
      const status = response.status;
      const detail = data?.error?.message || data?.error?.metadata?.raw || `HTTP ${status}`;
      if (attempt === 1 && (status === 429 || status >= 500)) continue;
      throw new Error(`OpenRouter (${status}): ${String(detail).slice(0, 240)}`);
    }

    const choice = data?.choices?.[0] || {};
    const message = choice?.message || {};
    const messageContent = message?.content;
    const raw = Array.isArray(messageContent)
      ? messageContent.map(part => typeof part === 'string' ? part : (part?.text || '')).join('').trim()
      : (typeof messageContent === 'string' ? messageContent.trim() : '');

    if (raw) {
      try {
        return extractJson(raw);
      } catch (err) {
        if (attempt === 1) continue;
        throw new Error(`OpenRouter: risposta ricevuta ma JSON non valido (${String(err?.message || err).slice(0, 180)}).`);
      }
    }

    const finishReason = choice?.finish_reason || 'non indicato';
    const returnedModel = data?.model || 'modello non indicato';
    const refusal = message?.refusal ? `; refusal: ${String(message.refusal).slice(0, 120)}` : '';
    const emptyError = `OpenRouter: risposta senza testo (modello ${returnedModel}, finish_reason ${finishReason}${refusal}).`;
    if (attempt === 2) throw new Error(emptyError);
  }

  throw new Error('OpenRouter: nessuna risposta testuale dopo due tentativi.');
}


async function callOlliteRT(baseUrl, apiToken, model, prompt, image, timeoutMs = 300000, parentSignal = null) {
  const content = [{ type: 'text', text: prompt }];
  if (image) content.push({ type: 'image_url', image_url: { url: image } });

  const endpoint = `${String(baseUrl || '').replace(/\/+$/, '')}/chat/completions`;
  const authorization = /^Bearer\s+/i.test(String(apiToken || ''))
    ? String(apiToken).trim()
    : `Bearer ${String(apiToken || '').trim()}`;
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('Timeout richiesta AI')), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': authorization,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content }],
        temperature: 0.85,
        max_tokens: 1400,
        stream: true
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const detail = data?.error?.message || data?.error?.detail || `HTTP ${response.status}`;
      throw new Error(`OlliteRT (${response.status}): ${String(detail).slice(0, 240)}`);
    }

    if (!response.body) throw new Error('OlliteRT: risposta streaming senza corpo.');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let raw = '';
    let finishReason = 'non indicato';
    let sawSseData = false;

    const consumeSseLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data:')) return;
      const payload = trimmed.slice(5).trim();
      if (!payload) return;
      sawSseData = true;
      if (payload === '[DONE]') return;
      let chunk;
      try { chunk = JSON.parse(payload); }
      catch (_) { return; }
      const choice = chunk?.choices?.[0];
      const delta = choice?.delta || {};
      const piece = delta.content ?? choice?.message?.content ?? choice?.text ?? '';
      if (typeof piece === 'string') raw += piece;
      else if (Array.isArray(piece)) {
        raw += piece.map(part => typeof part === 'string' ? part : (part?.text || '')).join('');
      }
      if (choice?.finish_reason) finishReason = choice.finish_reason;
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || '';
        for (const line of lines) consumeSseLine(line);
      }
      buffer += decoder.decode();
      if (buffer) consumeSseLine(buffer);
    } finally {
      try { reader.releaseLock(); } catch (_) {}
    }

    // Alcuni server compatibili possono ignorare stream=true e restituire JSON normale.
    if (!sawSseData) {
      const responseText = raw || buffer;
      if (responseText.trim()) {
        try {
          const data = JSON.parse(responseText);
          const messageContent = data?.choices?.[0]?.message?.content;
          raw = Array.isArray(messageContent)
            ? messageContent.map(part => typeof part === 'string' ? part : (part?.text || '')).join('')
            : (typeof messageContent === 'string' ? messageContent : '');
          finishReason = data?.choices?.[0]?.finish_reason || finishReason;
        } catch (_) {
          raw = responseText;
        }
      }
    }

    raw = raw.trim();
    if (!raw) throw new Error(`OlliteRT: risposta senza testo (finish_reason ${finishReason}).`);
    return extractJson(raw);
  } catch (error) {
    if (parentSignal?.aborted) throw new Error('Richiesta interrotta dal client.');
    if (controller.signal.aborted && error?.name === 'AbortError') {
      throw new Error('Timeout richiesta AI');
    }
    throw error;
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', abortFromParent);
  }
}

function isGeminiQuotaError(error) {
  const message = String(error?.message || error || '');
  return /RESOURCE_EXHAUSTED|quota exceeded|exceeded your current quota|generate_content_free_tier_requests|retry in \d+/i.test(message);
}

export async function onRequestPost(context) {
  const request = context.request;
  const env = context.env;

  // L'URL registrato da Termux ha precedenza sulla variabile statica.
  // Il fallback mantiene compatibilità con la configurazione precedente.
  let olliteBaseUrl = String(env.OLLITERT_BASE_URL || '');
  try {
    if (env.DB) {
      const tunnelRow = await env.DB.prepare(
        "SELECT base_url AS baseUrl FROM tunnel_config WHERE id='ollitert' LIMIT 1"
      ).first();
      if (tunnelRow?.baseUrl) olliteBaseUrl = String(tunnelRow.baseUrl);
    }
  } catch (error) {
    console.warn('[AI-DIAG] Lettura URL tunnel da D1 non riuscita; uso variabile statica.', error?.message || String(error));
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { message = '', aiHint = '', image = null, audio = null, audioTranscript: providedAudioTranscript = '', currentTime = null, mode = 'normal', girlId = '' } = body;
    if (!image && !audio && !String(message || '').trim()) return json(400, { error: 'Aggiungi uno screenshot, il testo estratto oppure una registrazione vocale.' });
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
    const secretMode = mode === 'secret';
    const voiceKey = secretMode ? 'secret' : 'normal';
    const defaultStyles = secretMode ? ['Erotica', 'Hot'] : ['Dolce', 'Stuzzica', 'Ironico', 'Flirt', 'Seria', 'Audace', 'Battuta', 'Poeta'];
    const configuredStyles = Array.isArray(serverContext?.voiceSettings?.[voiceKey])
      ? serverContext.voiceSettings[voiceKey].map(v => String(v?.id || '')).filter(Boolean)
      : [];
    const allStyles = configuredStyles.length ? configuredStyles : defaultStyles;

    // I blocchi vengono elaborati in sequenza, con al massimo due stili ciascuno per rispettare il contesto breve di Gemma 1B.
    // La sequenza evita di sovraccaricare il realme durante la generazione locale.
    const styleBatches = [];
    for (let i = 0; i < allStyles.length; i += 2) {
      styleBatches.push(allStyles.slice(i, i + 2));
    }

    const geminiQuotaExhaustedModels = new Set();
    // Dopo un timeout 524/abort del tunnel non inviamo altre richieste locali: OlliteRT
    // potrebbe continuare a elaborare la richiesta precedente anche dopo la chiusura HTTP.
    let olliteCircuitOpen = false;

    async function generateBatch(batchStyles, batchIndex) {
      const originalSettings = serverContext?.voiceSettings || {};
      const batchVoiceSettings = {
        ...originalSettings,
        [voiceKey]: batchStyles.map(style =>
          (Array.isArray(originalSettings[voiceKey])
            ? originalSettings[voiceKey].find(v => String(v?.id || '') === style)
            : null) || { id: style }
        )
      };
      const batchContext = { ...serverContext, voiceSettings: batchVoiceSettings };
      const modeForPrompt = secretMode ? 'secret' : 'normal';
      const prompt = promptFor(
        batchContext, message, aiHint, audioTranscript,
        previousGeneratedReplies, modeForPrompt
      );
      const ollitePrompt = promptForOlliteRT(
        batchContext, message, aiHint, audioTranscript,
        previousGeneratedReplies, modeForPrompt
      );

      const attempts = [];
      // Diagnostica sicura: non registrare token, prompt, screenshot o dati personali.
      const olliteConfig = {
        baseUrlPresent: Boolean(olliteBaseUrl),
        modelPresent: Boolean(env.OLLITERT_MODEL),
        tokenPresent: Boolean(env.OLLITERT_TOKEN),
        baseUrlLooksValid: /^https:\/\//i.test(olliteBaseUrl),
        model: env.OLLITERT_MODEL ? String(env.OLLITERT_MODEL).slice(0, 80) : null
      };
      console.info('[AI-DIAG] Configurazione OlliteRT', JSON.stringify(olliteConfig));

      // Gemma locale su OlliteRT è il provider principale; Gemini e OpenRouter
      // restano disponibili come fallback se il telefono/tunnel non risponde.
      if (!olliteCircuitOpen && olliteBaseUrl && env.OLLITERT_MODEL && env.OLLITERT_TOKEN) {
        attempts.push({
          provider: 'OlliteRT',
          model: env.OLLITERT_MODEL,
          run: () => callOlliteRT(
            olliteBaseUrl,
            env.OLLITERT_TOKEN,
            env.OLLITERT_MODEL,
            ollitePrompt,
            null, // Gemma3-1B-IT è testuale: evitare il payload immagine che gonfia il contesto. I fallback cloud ricevono ancora lo screenshot.
            300000,
            request.signal
          )
        });
      }

      if (env.GEMINI_API_KEY && !geminiQuotaExhaustedModels.has('gemini-3.5-flash-lite')) {
        attempts.push({
          provider: 'Gemini',
          model: 'gemini-3.5-flash-lite',
          run: () => callGemini(env.GEMINI_API_KEY, 'gemini-3.5-flash-lite', prompt, image, 15000)
        });
      }

      if (env.OPENROUTER_API_KEY) {
        attempts.push({
          provider: 'OpenRouter',
          model: 'openrouter/free',
          run: () => callOpenRouter(env.OPENROUTER_API_KEY, prompt, image, 18000)
        });
      }

      if (env.GEMINI_API_KEY) {
        for (const model of ['gemini-3.6-flash', 'gemini-3.8-flash']) {
          attempts.push({
            provider: 'Gemini',
            model,
            fallback: true,
            run: () => callGemini(env.GEMINI_API_KEY, model, prompt, image, 15000)
          });
        }
      }

      const errors = [];
      for (const attempt of attempts) {
        if (attempt.provider === 'Gemini' && geminiQuotaExhaustedModels.has(attempt.model)) continue;
        try {
          if (attempt.provider === 'OlliteRT') {
            console.info('[AI-DIAG] Avvio richiesta OlliteRT', JSON.stringify({ model: attempt.model, batch: batchIndex + 1 }));
          }
          const result = await attempt.run();
          // Non accettare output parziali: ogni stile deve avere tutte le risposte previste
          // e non devono esserci duplicati letterali all'interno dello stesso stile.
          const expectedPerStyle = new Map(batchStyles.map(style => [style, style === 'Hot' ? 10 : 5]));
          const actualByStyle = new Map();
          for (const item of (Array.isArray(result?.replies) ? result.replies : [])) {
            const style = String(item?.style || '');
            if (!expectedPerStyle.has(style)) continue;
            if (!actualByStyle.has(style)) actualByStyle.set(style, []);
            actualByStyle.get(style).push(String(item?.text || '').trim());
          }
          const incomplete = [...expectedPerStyle.entries()].find(([style, expected]) => {
            const items = actualByStyle.get(style) || [];
            const unique = new Set(items.map(text => text.toLocaleLowerCase('it').replace(/[^\\p{L}\\p{N}]+/gu, ' ').trim()));
            return items.length !== expected || unique.size !== expected || items.some(text => !text);
          });
          if (incomplete) {
            const [style, expected] = incomplete;
            const actual = (actualByStyle.get(style) || []).length;
            throw new Error(`${attempt.provider}: output incompleto per ${style} (${actual}/${expected}) o risposte duplicate.`);
          }
          if (attempt.provider === 'OlliteRT') {
            console.info('[AI-DIAG] OlliteRT OK', JSON.stringify({ model: attempt.model, batch: batchIndex + 1 }));
          }
          return {
            batchIndex,
            result,
            provider: `${attempt.provider}/${attempt.model}`,
            errors
          };
        } catch (err) {
          if (request.signal?.aborted) {
            return { batchIndex, result: null, provider: '', errors: ['Richiesta interrotta dal client.'] };
          }
          const detail = err?.name === 'AbortError'
            ? `${attempt.provider} ${attempt.model}: timeout`
            : (err?.message || String(err));
          errors.push(`Blocco ${batchIndex + 1}: ${detail}`);
          if (attempt.provider === 'OlliteRT') {
            const olliteTimedOut = /HTTP 524|HTTP 522|HTTP 504|timeout|aborted|aborterror/i.test(String(detail));
            if (olliteTimedOut) olliteCircuitOpen = true;
            console.error('[AI-DIAG] OlliteRT FALLITO', JSON.stringify({
              model: attempt.model,
              batch: batchIndex + 1,
              error: String(detail).slice(0, 300),
              circuitOpen: olliteCircuitOpen,
              fallbackNext: attempts.some((candidate, index) => index > attempts.indexOf(attempt))
            }));
          }
          if (attempt.provider === 'Gemini' && isGeminiQuotaError(err)) {
            geminiQuotaExhaustedModels.add(attempt.model);
          }
        }
      }
      return { batchIndex, result: null, provider: '', errors };
    }

    // Esegui un blocco alla volta: il telefono ha risorse limitate e le generazioni
    // Gemma simultanee possono saturare CPU/RAM e causare timeout.
    // Se il tunnel va in timeout, il circuito OlliteRT resta aperto per i blocchi
    // successivi: usiamo i fallback senza accodare altro lavoro sul telefono.
    const batchResults = [];
    for (let index = 0; index < styleBatches.length; index++) {
      if (request.signal?.aborted) {
        return json(499, { error: 'Richiesta interrotta dal client.' });
      }
      batchResults.push(await generateBatch(styleBatches[index], index));
    }
    const errors = batchResults.flatMap(item => item.errors);
    const failedBatch = batchResults.find(item => !item.result);
    if (failedBatch) {
      return new Response(JSON.stringify({
        error: 'Non è stato possibile completare tutte le categorie. I servizi AI gratuiti sono saturi o hanno restituito una risposta incompleta.',
        details: errors
      }), { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
    }

    const combined = {
      replies: [],
      recommendedIndex: 0,
      recommendedNormalIndex: 0,
      recommendedSecretIndex: 40,
      recommendationReason: '',
      advice: '',
      sendWhen: '',
      categoryRecommendations: {}
    };
    const winningProviders = [];

    for (let batchIndex = 0; batchIndex < batchResults.length; batchIndex++) {
      const batchResult = batchResults[batchIndex].result;
      winningProviders.push(batchResults[batchIndex].provider);
      const offset = combined.replies.length;
      combined.replies.push(...(Array.isArray(batchResult.replies) ? batchResult.replies : []));
      Object.assign(combined.categoryRecommendations, batchResult.categoryRecommendations || {});

      // Consiglio generale e indici: conserviamo quello calcolato dal primo blocco.
      if (batchIndex === 0) {
        combined.recommendedIndex = offset + (Number.isInteger(batchResult.recommendedIndex) ? batchResult.recommendedIndex : 0);
        combined.recommendationReason = batchResult.recommendationReason || '';
        combined.advice = batchResult.advice || '';
        combined.sendWhen = batchResult.sendWhen || '';
      }
    }

    if (secretMode) {
      combined.recommendedSecretIndex = 40 + combined.recommendedIndex;
      combined.recommendedNormalIndex = 0;
    } else {
      combined.recommendedNormalIndex = combined.recommendedIndex;
      combined.recommendedSecretIndex = 40;
    }

    return new Response(JSON.stringify({
      ...combined,
      audioTranscript,
      provider: [...new Set(winningProviders)].join(' + '),
      model: 'batch-generation'
    }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || 'Errore del server AI.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
