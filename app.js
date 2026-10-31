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
  st.message=$("msgInput").value;
  st.aiHint=$("aiHint")?.value||"";
  st.imageFile=selectedImageFile;
  st.role=currentRole;
  await persistGirlState(selectedId);
}
function restoreGirlState(id){
  const st=getGirlState(id);
  selectedImageFile=st.imageFile||null;
  currentRole=st.role||"her";
  $("msgInput").value=st.message||"";
  if($("aiHint")) $("aiHint").value=st.aiHint||"";
  if($("screenshotInput")) $("screenshotInput").value="";
  if($("cameraInput")) $("cameraInput").value="";
  $("imageName").textContent=st.imageName||"Nessuno screenshot inserito";
  $("results").innerHTML=st.resultsHtml||"";
  document.querySelectorAll(".role").forEach(x=>x.classList.toggle("active",x.dataset.role===currentRole));
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
}
async function getGirl(id){const all=await getAll("girls");return all.find(x=>x.id===id)}
async function renderMessages(){
  const ms=await messagesFor(selectedId);
  const st=selectedId?getGirlState(selectedId):null;
  const saved=ms.map(m=>{
    const image=m.imageData?`<img class="chat-image" src="${escapeAttr(m.imageData)}" alt="Screenshot della conversazione">`:"";
    const text=m.text?`<div class="bubble-text">${esc(m.text)}</div>`:"";
    return `<div class="bubble ${m.role}${m.imageData?" has-image":""}">${image}${text}<small>${m.role==="her"?"Lei":"Io"} · ${fmt(m.createdAt)}</small></div>`;
  }).join("");
  const pending=st?.imageData?`<div class="bubble her pending-bubble has-image"><img class="chat-image" src="${escapeAttr(st.imageData)}" alt="Screenshot da inviare"><div class="pending-label">Screenshot pronto per l'invio</div></div>`:"";
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
$("cancelGirl").onclick=()=>{$("modal").classList.add("hidden")};
$("createGirl").onclick=createGirl;
$("girlName").addEventListener("keydown",e=>{if(e.key==="Enter")createGirl(e)});
$("girlNote").addEventListener("keydown",e=>{if(e.key==="Enter")createGirl(e)});
$("closeSide").onclick=closeSide;$("menuBtn").onclick=()=>{$("sidebar").classList.add("open");$("overlay").classList.add("show")};$("overlay").onclick=closeSide;function closeSide(){$("sidebar").classList.remove("open");$("overlay").classList.remove("show")}
document.querySelectorAll(".role").forEach(b=>b.onclick=()=>{currentRole=b.dataset.role;if(selectedId){getGirlState(selectedId).role=currentRole; persistGirlState(selectedId).catch(console.error);}document.querySelectorAll(".role").forEach(x=>x.classList.remove("active"));b.classList.add("active")});
$("saveMsg").onclick=async()=>{
  if(!selectedId)return;
  const text=$("msgInput").value.trim();
  const st=getGirlState(selectedId);
  if(!text && !st.imageData){alert("Inserisci una risposta oppure aggiungi uno screenshot.");return;}
  const now=Date.now();
  // Lo screenshot rappresenta il messaggio ricevuto da lei; la risposta scritta viene subito sotto.
  if(st.imageData) await add("messages",{girlId:selectedId,role:"her",text:"",imageData:st.imageData,createdAt:now});
  if(text) await add("messages",{girlId:selectedId,role:"me",text,createdAt:now+1});
  const g=await getGirl(selectedId);g.updatedAt=Date.now();await put("girls",g);
  $("msgInput").value="";
  if($("aiHint")) $("aiHint").value="";
  st.message="";
  st.aiHint="";
  st.imageFile=null;
  st.imageData=null;
  st.imageName="Nessuno screenshot inserito";
  st.resultsHtml="";
  selectedImageFile=null;
  if($("screenshotInput")) $("screenshotInput").value="";
  if($("cameraInput")) $("cameraInput").value="";
  $("imageName").textContent="Nessuno screenshot inserito";
  $("results").innerHTML="";
  await persistGirlState(selectedId);
  await renderMessages();
  await renderGirls();
};

async function deleteGirlCompletely(id){
  // Cancella profilo + messaggi in modo atomico: la ragazza deve sparire davvero dalla barra laterale.
  await new Promise((resolve,reject)=>{
    const t=db.transaction(["girls","messages","girlStates"],"readwrite");
    const girlsStore=t.objectStore("girls");
    const messagesStore=t.objectStore("messages");
    const statesStore=t.objectStore("girlStates");
    statesStore.delete(id);
    girlsStore.delete(id);
    const idx=messagesStore.index("girlId");
    const req=idx.openCursor(IDBKeyRange.only(id));
    req.onsuccess=e=>{
      const cursor=e.target.result;
      if(cursor){ cursor.delete(); cursor.continue(); }
    };
    t.oncomplete=resolve;
    t.onerror=()=>reject(t.error||new Error("Errore durante la cancellazione"));
    t.onabort=()=>reject(t.error||new Error("Cancellazione annullata"));
  });
}
async function openDeleteChatModal(){
  const all=await getAll("girls");
  all.sort((a,b)=>b.updatedAt-a.updatedAt);
  const list=$("deleteChatList");
  if(!all.length){
    list.innerHTML='<div class="delete-empty">Non ci sono ancora chat da cancellare.</div>';
  }else{
    const rows=[];
    for(const g of all){
      const count=(await messagesFor(g.id)).length;
      rows.push(`<label class="delete-chat-option"><input type="checkbox" class="delete-chat-check" value="${escapeAttr(g.id)}"><span class="delete-chat-option-main"><span class="delete-chat-option-name">${escapeHtml(g.name)}</span><span class="delete-chat-option-status">${count ? count+" messaggi salvati" : "Chat vuota"}</span></span></label>`);
    }
    list.innerHTML=rows.join("");
  }
  $("deleteModal").classList.remove("hidden");
}
function closeDeleteChatModal(){$("deleteModal").classList.add("hidden")}
$("deleteChat").onclick=openDeleteChatModal;
$("cancelDelete").onclick=closeDeleteChatModal;
$("selectAllChats").onclick=()=>document.querySelectorAll(".delete-chat-check").forEach(x=>x.checked=true);
$("clearAllChats").onclick=()=>document.querySelectorAll(".delete-chat-check").forEach(x=>x.checked=false);
$("confirmDelete").onclick=async()=>{
  const ids=[...document.querySelectorAll(".delete-chat-check:checked")].map(x=>x.value);
  if(!ids.length){alert("Seleziona almeno una chat da cancellare.");return;}
  const selectedGirls=ids.map(id=>girls.find(g=>g.id===id)).filter(Boolean);
  const names=selectedGirls.map(g=>g.name).join(", ");
  const ok=confirm(`Vuoi eliminare definitivamente queste chat?\n\n${names}\n\nVerranno eliminati completamente profilo, messaggi, screenshot e memoria. Le altre chat non verranno toccate.`);
  if(!ok)return;
  const deletingCurrent=ids.includes(selectedId);
  $("confirmDelete").disabled=true;
  try{
    for(const id of ids){
      await deleteGirlCompletely(id);
    }
    // Ricarica SEMPRE dall'archivio dopo la cancellazione, così i nomi eliminati non possono rimanere nella sidebar.
    girls=await getAll("girls");
    girls.sort((a,b)=>b.updatedAt-a.updatedAt);
    if(deletingCurrent){
      const next=girls[0];
      selectedId=next?.id||null;
      if(selectedId){
        localStorage.setItem("selectedGirl",selectedId);
        await renderGirls();
        await selectGirl(selectedId);
      }else{
        localStorage.removeItem("selectedGirl");
        selectedId=null;
        selectedImageFile=null;
        $("results").innerHTML="";
        $("msgInput").value="";
        if($("screenshotInput")) $("screenshotInput").value="";
        if($("cameraInput")) $("cameraInput").value="";
        $("imageName").textContent="Nessuno screenshot inserito";
        $("chat").classList.add("hidden");
        $("empty").classList.remove("hidden");
        $("girlTitle").textContent="Seleziona una ragazza";
        $("girlSub").textContent="Le conversazioni restano separate";
        $("memoryInput").value="";
        await renderGirls();
      }
    }else{
      await renderGirls();
    }
    closeDeleteChatModal();
    alert(ids.length===1 ? "Chat eliminata definitivamente." : `${ids.length} chat eliminate definitivamente.`);
  }catch(err){
    console.error("Errore eliminazione chat:",err);
    alert("Non sono riuscito a eliminare completamente la chat. Riprova.");
  }finally{
    $("confirmDelete").disabled=false;
  }
};
async function showSelectedImage(e){
 const f=e.target.files?.[0] || null;
 selectedImageFile=f;
 if(selectedId){
   const st=getGirlState(selectedId);
   st.imageFile=f;
   st.imageData=f?await compressImageForAI(f):null;
   st.imageName=f ? "Screenshot: "+f.name : "Nessuno screenshot inserito";
   st.resultsHtml="";
   await persistGirlState(selectedId);
 }
 $("imageName").textContent=f ? "Screenshot: "+f.name : "Nessuno screenshot inserito";
 $("results").innerHTML="";
 await renderMessages();

 // Dopo aver caricato lo screenshot l'utente può aggiungere un'indicazione
 // prima dell'analisi. L'AI parte solo quando viene premuto il pulsante Analizza.
}
$("screenshotInput")?.addEventListener("change",showSelectedImage);
$("cameraInput")?.addEventListener("change",showSelectedImage);
$("chooseScreenshot")?.addEventListener("click",()=> $("screenshotInput").click());
$("takePhoto")?.addEventListener("click",()=> $("screenshotInput").click());

$("aiHint")?.addEventListener("input",()=>{
  if(selectedId){
    const st=getGirlState(selectedId);
    st.aiHint=$("aiHint").value;
    persistGirlState(selectedId).catch(console.error);
  }
});

$("saveMemory").onclick=async()=>{const g=await getGirl(selectedId);g.memory=$("memoryInput").value;g.updatedAt=Date.now();await put("girls",g);await renderGirls();alert("Memoria salvata sul dispositivo.")};
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".tabpage").forEach(x=>x.classList.add("hidden"));b.classList.add("active");$(b.dataset.tab).classList.remove("hidden")});

async function buildContext(){const g=await getGirl(selectedId),ms=await messagesFor(selectedId);return {girl:g,conversation:ms.slice(-16),previousReplies:ms.filter(x=>x.role==="me").map(x=>x.text).slice(-12)}}
function demoReplies(style){const base={flirt:["Hai un modo tutto tuo di farti notare… e direi che funziona.","Con te rischio di prendere gusto a queste conversazioni.","Non so se sei più pericolosa quando sorridi o quando fai finta di niente."],stuzzica:["Tu fai sempre così o oggi ti sei impegnata apposta?","Mi sa che ti piace mettermi alla prova.","Attenta, che prima o poi ti rispondo come meriti."],poeta:["Ci sono persone che arrivano in una conversazione e cambiano subito il ritmo.","Alcune parole restano, anche quando la chat finisce.","Hai quel tipo di presenza che si nota senza chiedere attenzione."],ironico:["Va bene, segno tutto: oggi hai deciso di rendermi il lavoro difficile.","Ottimo, anche oggi la normalità è ufficialmente saltata.","Tranquilla, faccio finta di non aver capito quanto sei furba."],dolce:["Mi piace quando mi racconti queste cose.","Con te parlare viene abbastanza naturale.","Mi fai sorridere più spesso di quanto dovresti."],audace:["Potrei dirti quello che penso, ma rischierei di farti sorridere troppo.","Se continuo così, prima o poi dovrai concedermi un caffè.","Non provocarmi se poi non vuoi vedere dove porta la curiosità."]};return base[style]||base.flirt}

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
    if($("cameraInput")) $("cameraInput").value="";
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
    setTimeout(()=>b.textContent="Copia questa",1200);
  });
  document.querySelectorAll(".save-recommended").forEach(b=>b.onclick=async()=>{
    await saveReplyToChat(b.dataset.text);
  });
  document.querySelectorAll(".copy-reply").forEach(b=>b.onclick=async()=>{
    await navigator.clipboard.writeText(b.dataset.text); b.textContent="Copiato";
    setTimeout(()=>b.textContent="Copia",1200);
  });
  document.querySelectorAll(".save-reply").forEach(b=>b.onclick=async()=>{
    await saveReplyToChat(b.dataset.text);
  });
}

$("generate").onclick=async()=>{
  const text=$("msgInput").value.trim();
  const aiHint=$("aiHint")?.value.trim()||"";
  if(!text && !selectedImageFile){
    alert("Incolla un messaggio oppure aggiungi uno screenshot.");
    return;
  }
  $("generate").disabled=true;
  $("generate").textContent="Analizzo...";
  try{
    const context=await buildContext();
    let image=null;
    const state=getGirlState(selectedId);
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
    const recommendationHtml=`<div class="recommendation"><div class="recommendation-title">⭐ Quella che ti consiglio</div><div class="recommendation-style">${escapeHtml(recommendedStyle)}</div><div class="recommendation-text">${escapeHtml(recommendedText)}</div><div class="recommendation-reason">${escapeHtml(reason)}</div><div class="recommendation-actions"><button class="secondary copy-recommended" data-text="${escapeAttr(recommendedText)}">Copia questa</button><button class="secondary save-recommended" data-text="${escapeAttr(recommendedText)}">Salva come mio messaggio</button></div></div>`;
    const cards=replies.map((r,i)=>{
      const t=typeof r==="string"?r:(r.text||"");
      const style=typeof r==="string"?"Risposta "+(i+1):(r.style||"Risposta "+(i+1));
      const recommended=i===recommendedIndex?" recommended-card":"";
      return `<div class="reply-card${recommended}"><div class="reply-style">${escapeHtml(style)}${i===recommendedIndex?` <span class="best-badge">Consigliata</span>`:""}</div><div class="reply-text">${escapeHtml(t)}</div><div class="reply-actions"><button class="secondary copy-reply" data-text="${escapeAttr(t)}">Copia</button><button class="secondary save-reply" data-text="${escapeAttr(t)}">Salva come mio messaggio</button></div></div>`;
    }).join("");
    $("results").innerHTML=recommendationHtml+cards;
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


function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function escapeAttr(s){return escapeHtml(s);}


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
