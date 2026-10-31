const DB_NAME="RispostaFlirtDB", DB_VERSION=2;
let db, girls=[], selectedId=null, currentRole="her", deferredInstall=null, selectedImageFile=null;
// Stato temporaneo separato per ogni ragazza: screenshot, testo e risultati non vengono condivisi tra chat.
const girlStates = new Map();

const $=id=>document.getElementById(id);
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=e=>{const d=e.target.result;if(!d.objectStoreNames.contains("girls"))d.createObjectStore("girls",{keyPath:"id"});if(!d.objectStoreNames.contains("messages")){const s=d.createObjectStore("messages",{keyPath:"id",autoIncrement:true});s.createIndex("girlId","girlId")}if(!d.objectStoreNames.contains("girlStates")){d.createObjectStore("girlStates",{keyPath:"girlId"})}};r.onsuccess=e=>{db=e.target.result;res(db)};r.onerror=()=>rej(r.error)})}
function tx(store,mode="readonly"){return db.transaction(store,mode).objectStore(store)}
function getAll(store){return new Promise((res,rej)=>{const r=tx(store).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function put(store,obj){return new Promise((res,rej)=>{const r=tx(store,"readwrite").put(obj);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function add(store,obj){return new Promise((res,rej)=>{const r=tx(store,"readwrite").add(obj);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function del(store,key){return new Promise((res,rej)=>{const r=tx(store,"readwrite").delete(key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}
async function messagesFor(gid){const all=await getAll("messages");return all.filter(x=>x.girlId===gid).sort((a,b)=>a.createdAt-b.createdAt)}
function esc(s){return s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function fmt(t){return new Date(t).toLocaleString("it-IT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}

async function renderGirls(){girls=await getAll("girls");girls.sort((a,b)=>b.updatedAt-a.updatedAt);$("girlList").innerHTML=girls.map(g=>`<button class="girl ${g.id===selectedId?"active":""}" data-id="${g.id}"><span class="avatar">${esc((g.name||"?")[0].toUpperCase())}</span><span class="girl-meta"><span class="girl-name">${esc(g.name)}</span><span class="girl-last">${esc(g.note||"Nessun dettaglio")}</span></span></button>`).join("");document.querySelectorAll(".girl").forEach(b=>b.onclick=()=>selectGirl(b.dataset.id))}
function getGirlState(id){
  if(!girlStates.has(id)) girlStates.set(id,{message:"",imageFile:null,imageData:null,imageName:"",resultsHtml:"",role:"her",aiHint:""});
  return girlStates.get(id);
}
async function loadGirlState(id){
  const base={message:"",imageFile:null,imageData:null,imageName:"",resultsHtml:"",role:"her",aiHint:""};
  try{
    const saved=await new Promise((res,rej)=>{const r=tx("girlStates").get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
    const st={...base,...(saved||{})};
    st.imageFile=null;
    girlStates.set(id,st);
    return st;
  }catch(err){
    console.warn("Impossibile recuperare lo stato della chat",err);
    return getGirlState(id);
  }
}
async function persistGirlState(id){
  if(!id)return;
  const st=getGirlState(id);
  await put("girlStates",{girlId:id,message:st.message||"",imageData:st.imageData||null,imageName:st.imageName||"",resultsHtml:st.resultsHtml||"",role:st.role||"her",aiHint:st.aiHint||"",updatedAt:Date.now()});
}
async function clearGirlState(id){
  girlStates.delete(id);
  try{await del("girlStates",id)}catch(err){console.warn("Errore cancellazione stato chat",err)}
}
async function saveCurrentGirlState(){
  if(!selectedId) return;
  const st=getGirlState(selectedId);
  st.aiHint=$("aiHint")?.value||"";
  st.imageFile=selectedImageFile;
  await persistGirlState(selectedId);
}
function restoreGirlState(id){
  const st=getGirlState(id);
  selectedImageFile=st.imageFile||null;
  if($("aiHint")) $("aiHint").value=st.aiHint||"";
  if($("screenshotInput")) $("screenshotInput").value="";
  $("imageName").textContent=st.imageName||"Nessuno screenshot inserito";
  $("results").innerHTML=st.resultsHtml||"";
  applySettings();
  bindResultButtons();
}
async function selectGirl(id){
  if(selectedId && selectedId!==id) await saveCurrentGirlState();
  selectedId=id;
  localStorage.setItem("selectedGirl",id);
  const g=girls.find(x=>x.id===id)||await getGirl(id);
  $("empty").classList.add("hidden");
  $("chat").classList.remove("hidden");
  $("girlTitle").textContent=g.name;
  $("girlSub").textContent=g.note||"Conversazione separata";
  $("memoryInput").value=g.memory||"";
  await loadGirlState(id);
  restoreGirlState(id);
  await renderMessages();
  await renderGirls();
  closeSide();
  // Quando si entra/apre una chat, torna sempre all'inizio della pagina invece di mantenere la posizione precedente.
  requestAnimationFrame(()=>window.scrollTo({top:0,left:0,behavior:"instant"}));
}
async function getGirl(id){const all=await getAll("girls");return all.find(x=>x.id===id)}
async function renderMessages(){
  const ms=await messagesFor(selectedId);
  const st=selectedId?getGirlState(selectedId):null;
  const saved=ms.map(m=>{
    const image=m.imageData?`<img class="chat-image zoomable-screenshot" src="${escapeAttr(m.imageData)}" alt="Screenshot della conversazione" title="Tocca per ingrandire">`:"";
    const text=m.text?`<div class="bubble-text">${esc(m.text)}</div>`:"";
    return `<div class="bubble ${m.role}${m.imageData?" has-image":""}">${image}${text}<small>${m.role==="her"?"Lei":"Io"} · ${fmt(m.createdAt)}</small></div>`;
  }).join("");
  const pending=st?.imageData?`<div class="bubble her pending-bubble has-image"><img class="chat-image zoomable-screenshot" src="${escapeAttr(st.imageData)}" alt="Screenshot da inviare" title="Tocca per ingrandire"><div class="pending-label">Screenshot pronto per l'invio</div></div>`:"";
  $("messages").innerHTML=(saved||pending)?saved+pending:`<div class="hint">Nessun messaggio salvato ancora.</div>`;
  $("messages").scrollTop=$("messages").scrollHeight;
}
async function createGirl(e){
  if(e?.preventDefault)e.preventDefault();
  const name=$("girlName").value.trim();
  if(!name){ $("girlName").focus(); return; }
  const now=Date.now();
  const id=(globalThis.crypto?.randomUUID ? crypto.randomUUID() : "girl-"+now+"-"+Math.random().toString(36).slice(2));
  const g={id,name,note:$("girlNote").value.trim(),memory:"",createdAt:now,updatedAt:now};
  try{
    await put("girls",g);
    $("modal").classList.add("hidden");
    $("girlName").value="";
    $("girlNote").value="";
    await renderGirls();
    await selectGirl(g.id);
  }catch(err){
    console.error(err);
    alert("Non riesco ad aggiungere la ragazza. Riprova.");
  }
}
$("newGirl").onclick=$("emptyNew").onclick=()=>{$("modal").classList.remove("hidden");$("girlName").focus()};
$("chooseScreenshot").onclick=()=>{
  const input=$("screenshotInput");
  if(input){ input.value=""; input.click(); }
};
$("screenshotInput").addEventListener("change",async e=>{
  const file=e.target.files?.[0];
  if(!file)return;
  if(!file.type.startsWith("image/")){
    alert("Seleziona un'immagine.");
    e.target.value="";
    return;
  }
  if(!selectedId)return;
  try{
    selectedImageFile=file;
    const state=getGirlState(selectedId);
    state.imageFile=file;
    state.imageName="Screenshot: "+file.name;
    state.imageData=await compressImageForAI(file);
    $("imageName").textContent=state.imageName;
    await persistGirlState(selectedId);
    await renderMessages();
  }catch(err){
    console.error("Errore caricamento screenshot",err);
    selectedImageFile=null;
    const state=getGirlState(selectedId);
    state.imageFile=null;
    state.imageData=null;
    state.imageName="Nessuno screenshot inserito";
    $("imageName").textContent=state.imageName;
    e.target.value="";
    alert("Non riesco a caricare questo screenshot. Prova con un'altra immagine.");
  }
});
$("cancelGirl").onclick=()=>{$("modal").classList.add("hidden")};
$("createGirl").onclick=createGirl;
$("girlName").addEventListener("keydown",e=>{if(e.key==="Enter")createGirl(e)});
$("girlNote").addEventListener("keydown",e=>{if(e.key==="Enter")createGirl(e)});
$("closeSide").onclick=closeSide;$("menuBtn").onclick=()=>{$("sidebar").classList.add("open");$("overlay").classList.add("show")};$("overlay").onclick=closeSide;function closeSide(){$("sidebar").classList.remove("open");$("overlay").classList.remove("show")}

$("saveMemory").onclick=async()=>{
  if(!selectedId)return;
  const g=await getGirl(selectedId);
  g.memory=$("memoryInput").value.trim();
  g.updatedAt=Date.now();
  await put("girls",g);
  await renderGirls();
  closeMemoryModal();
  alert("Memoria salvata sul dispositivo.\n\nDa ora verrà considerata nelle risposte per "+g.name+".");
};
function openMemoryModal(){
  if(!selectedId)return;
  getGirl(selectedId).then(g=>{
    $("memoryInput").value=g?.memory||"";
    $("memoryModal").classList.remove("hidden");
    setTimeout(()=>$("memoryInput").focus(),0);
  });
}
function closeMemoryModal(){$("memoryModal").classList.add("hidden")}
$("openMemory").onclick=openMemoryModal;
$("closeMemory").onclick=closeMemoryModal;
$("cancelMemory").onclick=closeMemoryModal;
$("memoryModal").addEventListener("click",e=>{if(e.target===$("memoryModal"))closeMemoryModal()});

async function buildContext(){const g=await getGirl(selectedId),ms=await messagesFor(selectedId);return {girl:{id:g?.id,name:g?.name,note:g?.note||"",memory:g?.memory||""},memory:g?.memory||"",conversation:ms.slice(-16),previousReplies:ms.filter(x=>x.role==="me").map(x=>x.text).slice(-12)}}
function demoReplies(style){const base={flirt:["Hai un modo tutto tuo di farti notare… e direi che funziona.","Con te rischio di prendere gusto a queste conversazioni.","Non so se sei più pericolosa quando sorridi o quando fai finta di niente."],stuzzica:["Tu fai sempre così o oggi ti sei impegnata apposta?","Mi sa che ti piace mettermi alla prova.","Attenta, che prima o poi ti rispondo come meriti."],poeta:["Ci sono persone che arrivano in una conversazione e cambiano subito il ritmo.","Alcune parole restano, anche quando la chat finisce.","Hai quel tipo di presenza che si nota senza chiedere attenzione."],ironico:["Va bene, segno tutto: oggi hai deciso di rendermi il lavoro difficile.","Ottimo, anche oggi la normalità è ufficialmente saltata.","Tranquilla, faccio finta di non aver capito quanto sei furba."],dolce:["Mi piace quando mi racconti queste cose.","Con te parlare viene abbastanza naturale.","Mi fai sorridere più spesso di quanto dovresti."],audace:["Potrei dirti quello che penso, ma rischierei di farti sorridere troppo.","Se continuo così, prima o poi dovrai concedermi un caffè.","Non provocarmi se poi non vuoi vedere dove porta la curiosità."],erotica:["Con te la fantasia prende una piega decisamente interessante…","Hai quel modo di provocare che rende difficile restare innocenti.","Se continui a guardarmi così, la conversazione potrebbe diventare molto più intrigante."]};return base[style]||base.flirt}

async function compressImageForAI(file){
  const src=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{
      const el=new Image();
      el.onload=()=>resolve(el);
      el.onerror=reject;
      el.src=src;
    });
    const maxW=900, maxH=1200;
    const scale=Math.min(1,maxW/img.naturalWidth,maxH/img.naturalHeight);
    const w=Math.max(1,Math.round(img.naturalWidth*scale));
    const h=Math.max(1,Math.round(img.naturalHeight*scale));
    const canvas=document.createElement('canvas');
    canvas.width=w; canvas.height=h;
    canvas.getContext('2d').drawImage(img,0,0,w,h);
    return canvas.toDataURL('image/jpeg',0.55);
  }finally{
    URL.revokeObjectURL(src);
  }
}

async function saveReplyToChat(text){
  if(!selectedId || !text) return;
  const st=getGirlState(selectedId);
  const now=Date.now();
  // Se c'è uno screenshot ancora in attesa, trattalo come il messaggio di Lei
  // e inserisci subito sotto la risposta scelta come messaggio di Io.
  if(st?.imageData){
    await add("messages",{girlId:selectedId,role:"her",text:"",imageData:st.imageData,createdAt:now});
    st.imageFile=null;
    st.imageData=null;
    st.imageName="Nessuno screenshot inserito";
    selectedImageFile=null;
    if($("screenshotInput")) $("screenshotInput").value="";
      $("imageName").textContent="Nessuno screenshot inserito";
    await persistGirlState(selectedId);
    await renderMessages();
  }
  await add("messages",{girlId:selectedId,role:"me",text,createdAt:now+1});
  const g=await getGirl(selectedId); g.updatedAt=Date.now(); await put("girls",g);
  await renderMessages();
  await renderGirls();
}

function bindResultButtons(){
  document.querySelectorAll(".copy-recommended").forEach(b=>b.onclick=async()=>{
    await navigator.clipboard.writeText(b.dataset.text); b.textContent="Copiato";
    window.scrollTo({top:0,behavior:"smooth"});
    document.documentElement.scrollTop=0; document.body.scrollTop=0;
    setTimeout(()=>b.textContent="Copia questa",1200);
  });
  document.querySelectorAll(".save-recommended").forEach(b=>b.onclick=async()=>{
    await saveReplyToChat(b.dataset.text);
  });
  document.querySelectorAll(".copy-reply").forEach(b=>b.onclick=async()=>{
    await navigator.clipboard.writeText(b.dataset.text); b.textContent="Copiato";
    window.scrollTo({top:0,behavior:"smooth"});
    document.documentElement.scrollTop=0; document.body.scrollTop=0;
    setTimeout(()=>b.textContent="Copia",1200);
  });
  document.querySelectorAll(".save-reply").forEach(b=>b.onclick=async()=>{
    await saveReplyToChat(b.dataset.text);
  });
  document.querySelectorAll(".reply-choice").forEach(b=>b.onclick=()=>{
    const target=$(b.dataset.target);
    if(!target) return;
    const isOpening=target.classList.contains("hidden");
    // Apri una sola categoria alla volta: quando scegli Normali, Segrete si chiude e viceversa.
    document.querySelectorAll(".reply-panel").forEach(panel=>panel.classList.add("hidden"));
    document.querySelectorAll(".reply-choice").forEach(choice=>choice.classList.remove("selected"));
    if(isOpening){
      target.classList.remove("hidden");
      b.classList.add("selected");
      setTimeout(()=>target.scrollIntoView({behavior:"smooth",block:"start"}),50);
    }
  });
  document.querySelectorAll(".reply-panel-close").forEach(b=>b.onclick=()=>{
    const target=$(b.dataset.closePanel);
    if(target) target.classList.add("hidden");
    document.querySelectorAll(`.reply-choice[data-target="${b.dataset.closePanel}"]`).forEach(c=>c.classList.remove("selected"));
  });
}

$("generate").onclick=async()=>{
  const text="";
  const aiHint=$("aiHint")?.value.trim()||"";
  const state=getGirlState(selectedId);
  const hasImage=Boolean(selectedImageFile || state.imageData);
  if(!hasImage){
    alert("Aggiungi uno screenshot prima di analizzare.");
    return;
  }
  $("generate").disabled=true;
  $("generate").textContent="Analizzo...";
  try{
    const context=await buildContext();
    let image=null;
    state.message=text;
    state.aiHint=aiHint;
    if(selectedImageFile){
      image=await compressImageForAI(selectedImageFile);
      state.imageData=image;
      state.imageFile=selectedImageFile;
      state.imageName="Screenshot: "+selectedImageFile.name;
      await persistGirlState(selectedId);
    }else if(state.imageData){
      image=state.imageData;
    }
    const controller=new AbortController();
    const clientTimer=setTimeout(()=>controller.abort(),26000);
    let response;
    try{
      response=await fetch("/api/reply",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        signal:controller.signal,
        body:JSON.stringify({
          girlId:selectedId,
          message:text,
          aiHint,
          context,
          image
        })
      });
    }finally{clearTimeout(clientTimer)}
    if(!response.ok){
      const detail=await response.text().catch(()=> "");
      throw new Error(detail || "Server AI non disponibile.");
    }
    const data=await response.json();
    const replies=Array.isArray(data.replies)?data.replies:[];
    if(!replies.length) throw new Error("Nessuna risposta restituita dall'AI.");
    const recommendedIndex=Number.isInteger(data.recommendedIndex)&&data.recommendedIndex>=0&&data.recommendedIndex<replies.length?data.recommendedIndex:0;
    const reason=String(data.recommendationReason||"Questa è quella che si adatta meglio al tono e al momento della conversazione.");
    const recommendedText=typeof replies[recommendedIndex]==="string"?replies[recommendedIndex]:(replies[recommendedIndex]?.text||"");
    const recommendedStyle=typeof replies[recommendedIndex]==="string"?"Risposta consigliata":(replies[recommendedIndex]?.style||"Risposta consigliata");
    const normalStyles=new Set(["Flirt","Audace","Poeta","Ironico","Stuzzica","Dolce"]);
    const secretStyles=new Set(["Erotica","Hot"]);
    const normalIndexes=[];
    const secretIndexes=[];
    replies.forEach((r,i)=>{
      const style=typeof r==="string"?"":(r.style||"");
      if(secretStyles.has(style) || i>=18) secretIndexes.push(i); else normalIndexes.push(i);
    });
    const validIndex=(value,list,fallback)=>{
      const n=Number(value);
      return Number.isInteger(n)&&list.includes(n)?n:fallback;
    };
    const normalRecommendedIndex=validIndex(data.recommendedNormalIndex,normalIndexes,normalIndexes[0] ?? recommendedIndex);
    const secretRecommendedIndex=validIndex(data.recommendedSecretIndex,secretIndexes,secretIndexes[0] ?? recommendedIndex);
    const recommendationReason=String(data.recommendationReason||"Questa è quella che si adatta meglio al momento della conversazione.");
    const renderCard=(r,i,categoryRecommendedIndex)=>{
      const t=typeof r==="string"?r:(r.text||"");
      const style=typeof r==="string"?"Risposta "+(i+1):(r.style||"Risposta "+(i+1));
      const recommended=i===categoryRecommendedIndex?" recommended-card":"";
      return `<div class="reply-card${recommended}"><div class="reply-style">${escapeHtml(style)}${i===categoryRecommendedIndex?` <span class="best-badge">Consigliata</span>`:""}</div><div class="reply-text">${escapeHtml(t)}</div><div class="reply-actions"><button class="secondary copy-reply" data-text="${escapeAttr(t)}">Copia</button><button class="secondary save-reply" data-text="${escapeAttr(t)}">Salva come mio messaggio</button></div>${i===categoryRecommendedIndex?`<div class="category-reason">⭐ ${escapeHtml(recommendationReason)}</div>`:""}</div>`;
    };
    // La risposta consigliata deve essere sempre la prima card della categoria quando la si apre.
    const orderedNormalIndexes=[normalRecommendedIndex,...normalIndexes.filter(i=>i!==normalRecommendedIndex)];
    const orderedSecretIndexes=[secretRecommendedIndex,...secretIndexes.filter(i=>i!==secretRecommendedIndex)];
    const normalCards=orderedNormalIndexes.map(i=>renderCard(replies[i],i,normalRecommendedIndex)).join("");
    const secretCards=orderedSecretIndexes.map(i=>renderCard(replies[i],i,secretRecommendedIndex)).join("");
    const columns=`<div class="reply-choice-grid">
      <button type="button" class="reply-choice normal-choice" data-target="normalRepliesPanel"><span class="reply-choice-icon">💬</span><span><b>Risposte normali</b><small>Flirt, audaci, poetiche, ironiche…</small></span><span class="reply-choice-arrow">›</span></button>
      <button type="button" class="reply-choice secret-choice" data-target="secretRepliesPanel"><span class="reply-choice-icon">🔒</span><span><b>Risposte segrete</b><small>Erotiche e Hot</small></span><span class="reply-choice-arrow">›</span></button>
    </div>
    <section id="normalRepliesPanel" class="reply-panel hidden"><div class="reply-panel-head"><div><b>💬 Risposte normali</b><small>Quella consigliata è evidenziata.</small></div><button type="button" class="reply-panel-close" data-close-panel="normalRepliesPanel">×</button></div><div class="reply-panel-list">${normalCards}</div></section>
    <section id="secretRepliesPanel" class="reply-panel secret-panel hidden"><div class="reply-panel-head"><div><b>🔒 Risposte segrete</b><small>Quella consigliata è evidenziata.</small></div><button type="button" class="reply-panel-close" data-close-panel="secretRepliesPanel">×</button></div><div class="reply-panel-list">${secretCards}</div></section>`;
    $("results").innerHTML=columns;
    applySettings();
    state.resultsHtml=$("results").innerHTML;
    await persistGirlState(selectedId);
    bindResultButtons();
  }catch(err){
    const msg=err?.name==="AbortError" ? "Il servizio AI ha impiegato troppo tempo. Riprova: la richiesta ora è ottimizzata per rispondere più velocemente." : err.message;
    alert("Analisi non riuscita: "+msg);
  }finally{
    $("generate").disabled=false;
    $("generate").textContent="Analizza e dammi risposte";
  }
};


// Tocca lo screenshot piccolo per aprirlo a schermo intero.
document.addEventListener("click",e=>{
  const img=e.target.closest(".zoomable-screenshot");
  if(!img)return;
  const modal=$("imageZoomModal");
  const big=$("imageZoomPreview");
  if(!modal||!big)return;
  big.src=img.src;
  modal.classList.remove("hidden");
});
$("closeImageZoom")?.addEventListener("click",()=>$("imageZoomModal")?.classList.add("hidden"));
$("imageZoomModal")?.addEventListener("click",e=>{if(e.target.id==="imageZoomModal")e.currentTarget.classList.add("hidden")});

function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function escapeAttr(s){return escapeHtml(s);}


// Impostazioni locali: tema e zoom applicato esclusivamente alle risposte.
const SETTINGS_KEY="RispostaFlirtSettings";
function loadSettings(){try{return {...{theme:"dark",replyZoom:100},...(JSON.parse(localStorage.getItem(SETTINGS_KEY)||"{}"))}}catch(e){return {theme:"dark",replyZoom:100}}}
function applySettings(){const s=loadSettings();document.body.classList.toggle("light-theme",s.theme==="light");const r=$("results");if(r)r.style.setProperty("--reply-zoom",String((Number(s.replyZoom)||100)/100));document.querySelectorAll(".theme-option").forEach(b=>b.classList.toggle("active",b.dataset.theme===s.theme));if($("replyZoom"))$("replyZoom").value=String(s.replyZoom||100);if($("replyZoomValue"))$("replyZoomValue").textContent=(s.replyZoom||100)+"%";}
function saveSettings(patch){const next={...loadSettings(),...patch};localStorage.setItem(SETTINGS_KEY,JSON.stringify(next));applySettings()}
function openSettings(){applySettings();$("settingsModal").classList.remove("hidden")}
function closeSettings(){$("settingsModal").classList.add("hidden")}
$("openSettings").onclick=openSettings;$("closeSettings").onclick=closeSettings;$("closeSettingsBottom").onclick=closeSettings;$("settingsModal").addEventListener("click",e=>{if(e.target.id==="settingsModal")closeSettings()});document.querySelectorAll(".theme-option").forEach(b=>b.onclick=()=>saveSettings({theme:b.dataset.theme}));$("replyZoom").addEventListener("input",e=>saveSettings({replyZoom:Number(e.target.value)}));applySettings();

// Avvio dell'app: apre il database prima di usare le funzioni che salvano le ragazze.
// Senza questa inizializzazione Safari mostrava "Non riesco ad aggiungere la ragazza".
(async function initApp(){
  try{
    await openDB();
    await renderGirls();
    const saved=localStorage.getItem("selectedGirl");
    if(saved && girls.some(g=>g.id===saved)){
      await selectGirl(saved);
    }else if(girls.length){
      await selectGirl(girls[0].id);
    }
  }catch(err){
    console.error("Errore avvio RispostaFlirt:",err);
    alert("Non riesco ad avviare l'archivio delle conversazioni. Ricarica la pagina e riprova.");
  }
})();
