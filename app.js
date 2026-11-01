let DB_NAME="RispostaFlirtDB", DB_VERSION=2;
let db, girls=[], selectedId=null, currentRole="her", deferredInstall=null, selectedImageFile=null, selectedAudioFile=null;
let currentUser=null, serverSyncEnabled=false, serverSyncTimer=null, serverSyncPaused=false;
// Stato temporaneo separato per ogni ragazza: screenshot, testo e risultati non vengono condivisi tra chat.
const girlStates = new Map();

const $=id=>document.getElementById(id);
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=e=>{const d=e.target.result;if(!d.objectStoreNames.contains("girls"))d.createObjectStore("girls",{keyPath:"id"});if(!d.objectStoreNames.contains("messages")){const s=d.createObjectStore("messages",{keyPath:"id",autoIncrement:true});s.createIndex("girlId","girlId")}if(!d.objectStoreNames.contains("girlStates")){d.createObjectStore("girlStates",{keyPath:"girlId"})}};r.onsuccess=e=>{db=e.target.result;res(db)};r.onerror=()=>rej(r.error)})}
function tx(store,mode="readonly"){return db.transaction(store,mode).objectStore(store)}
function getAll(store){return new Promise((res,rej)=>{const r=tx(store).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function put(store,obj){return new Promise((res,rej)=>{const r=tx(store,"readwrite").put(obj);r.onsuccess=()=>{if(!serverSyncPaused && serverSyncEnabled) scheduleServerSync();res(r.result)};r.onerror=()=>rej(r.error)})}
function add(store,obj){return new Promise((res,rej)=>{const r=tx(store,"readwrite").add(obj);r.onsuccess=()=>{if(!serverSyncPaused && serverSyncEnabled) scheduleServerSync();res(r.result)};r.onerror=()=>rej(r.error)})}
function del(store,key){return new Promise((res,rej)=>{const r=tx(store,"readwrite").delete(key);r.onsuccess=()=>{if(!serverSyncPaused && serverSyncEnabled) scheduleServerSync();res()};r.onerror=()=>rej(r.error)})}
async function messagesFor(gid){const all=await getAll("messages");return all.filter(x=>x.girlId===gid).sort((a,b)=>a.createdAt-b.createdAt)}
function esc(s){return s.replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m]))}
function fmt(t){return new Date(t).toLocaleString("it-IT",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}

async function renderGirls(){girls=await getAll("girls");girls.sort((a,b)=>b.updatedAt-a.updatedAt);$("girlList").innerHTML=girls.map(g=>`<button class="girl ${g.id===selectedId?"active":""}" data-id="${g.id}"><span class="avatar">${esc((g.name||"?")[0].toUpperCase())}</span><span class="girl-meta"><span class="girl-name">${esc(g.name)}</span></span></button>`).join("");document.querySelectorAll(".girl").forEach(b=>b.onclick=()=>selectGirl(b.dataset.id))}
function getGirlState(id){
  if(!girlStates.has(id)) girlStates.set(id,{message:"",imageFile:null,imageData:null,imageName:"",audioFile:null,audioData:null,audioName:"",audioTranscript:"",resultsHtml:"",role:"her",aiHint:""});
  return girlStates.get(id);
}
async function loadGirlState(id){
  const base={message:"",imageFile:null,imageData:null,imageName:"",audioFile:null,audioData:null,audioName:"",audioTranscript:"",resultsHtml:"",role:"her",aiHint:""};
  try{
    const saved=await new Promise((res,rej)=>{const r=tx("girlStates").get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
    const st={...base,...(saved||{})};
    st.imageFile=null;
    st.audioFile=null;
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
  await put("girlStates",{girlId:id,message:st.message||"",imageData:st.imageData||null,imageName:st.imageName||"",audioData:st.audioData||null,audioName:st.audioName||"",audioTranscript:st.audioTranscript||"",resultsHtml:st.resultsHtml||"",role:st.role||"her",aiHint:st.aiHint||"",updatedAt:Date.now()});
}
async function clearGirlState(id){
  girlStates.delete(id);
  try{await del("girlStates",id)}catch(err){console.warn("Errore cancellazione stato chat",err)}
}
async function saveCurrentGirlState(){
  if(!selectedId) return;
  const st=getGirlState(selectedId);
  st.message=$("msgInput")?.value||"";
  st.aiHint=$("aiHint")?.value||"";
  st.imageFile=selectedImageFile;
  st.role=currentRole;
  await persistGirlState(selectedId);
}
function restoreGirlState(id){
  const st=getGirlState(id);
  selectedImageFile=st.imageFile||null;
  selectedAudioFile=st.audioFile||null;
  currentRole=st.role||"her";
  if($("msgInput")) $("msgInput").value=st.message||"";
  if($("aiHint")) $("aiHint").value=st.aiHint||"";
  if($("screenshotInput")) $("screenshotInput").value="";
  if($("cameraInput")) $("cameraInput").value="";
  $("imageName").textContent=st.imageName||"Nessuno screenshot inserito";
  $("results").innerHTML=st.resultsHtml||"";
  applySettings();
  document.querySelectorAll(".role").forEach(x=>x.classList.toggle("active",x.dataset.role===currentRole));
  bindResultButtons();
}
async function selectGirl(id){
  if(selectedId && selectedId!==id) await saveCurrentGirlState();
  selectedId=id;
  localStorage.setItem(`selectedGirl_${currentUser?.id||"local"}`,id);
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
    const image=m.imageData?`<img class="chat-image" src="${escapeAttr(m.imageData)}" alt="Screenshot della conversazione">`:"";
    const audio=m.audioData?`<audio class="chat-audio" controls preload="metadata" src="${escapeAttr(m.audioData)}"></audio>`:"";
    const transcript=m.audioTranscript?`<div class="audio-transcript"><b>📝 Trascrizione</b><div>${esc(m.audioTranscript)}</div></div>`:"";
    const text=m.text?`<div class="bubble-text">${esc(m.text)}</div>`:"";
    const hasMedia=m.imageData||m.audioData;
    return `<div class="bubble ${m.role}${hasMedia?" has-image":""}">${image}${audio}${text}${transcript}<small>${m.role==="her"?"Lei":"Io"} · ${fmt(m.createdAt)}</small></div>`;
  }).join("");
  const pendingImage=st?.imageData?`<div class="bubble her pending-bubble has-image"><img class="chat-image" src="${escapeAttr(st.imageData)}" alt="Screenshot da inviare"><div class="pending-label">Screenshot pronto per l'invio</div></div>`:"";
  const pendingAudio=st?.audioData?`<div class="bubble her pending-bubble has-image"><audio class="chat-audio" controls preload="metadata" src="${escapeAttr(st.audioData)}"></audio><div class="pending-label">🎙️ ${escapeHtml(st.audioName||"Registrazione vocale pronta")}</div>${st.audioTranscript?`<div class="audio-transcript"><b>📝 Trascrizione</b><div>${esc(st.audioTranscript)}</div></div>`:""}</div>`:"";
  const pending=pendingImage+pendingAudio;
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
if($("saveMsg")) $("saveMsg").onclick=async()=>{
  if(!selectedId)return;
  const text=$("msgInput")?.value.trim()||"";
  const st=getGirlState(selectedId);
  if(!text && !st.imageData && !st.audioData){alert("Inserisci una risposta oppure aggiungi uno screenshot. Se il vocale è un file audio, selezionalo insieme allo screenshot.");return;}
  const now=Date.now();
  // Screenshot e registrazione rappresentano il messaggio ricevuto da lei; la risposta scritta viene subito sotto.
  if(st.imageData || st.audioData){
    await add("messages",{girlId:selectedId,role:"her",text:"",imageData:st.imageData||null,audioData:st.audioData||null,audioName:st.audioName||"",audioTranscript:st.audioTranscript||"",createdAt:now});
  }
  if(text) await add("messages",{girlId:selectedId,role:"me",text,createdAt:now+1});
  const g=await getGirl(selectedId);g.updatedAt=Date.now();await put("girls",g);
  if($("msgInput")) if($("msgInput")) $("msgInput").value="";
  if($("aiHint")) $("aiHint").value="";
  st.message="";
  st.aiHint="";
  st.imageFile=null;
  st.imageData=null;
  st.imageName="Nessuno screenshot inserito";
  st.audioFile=null;
  st.audioData=null;
  st.audioName="";
  st.audioTranscript="";
  st.resultsHtml="";
  selectedImageFile=null;
  selectedAudioFile=null;
  if($("screenshotInput")) $("screenshotInput").value="";
  if($("cameraInput")) $("cameraInput").value="";
  if($("screenshotInput")) $("screenshotInput").value="";
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
  if(serverSyncEnabled) scheduleServerSync();
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
        localStorage.setItem(`selectedGirl_${currentUser?.id||"local"}`,selectedId);
        await renderGirls();
        await selectGirl(selectedId);
      }else{
        localStorage.removeItem(`selectedGirl_${currentUser?.id||"local"}`);
        selectedId=null;
        selectedImageFile=null;
        $("results").innerHTML="";
        if($("msgInput")) if($("msgInput")) $("msgInput").value="";
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
async function showSelectedMedia(e){
 const files=[...(e.target.files||[])];
 const imageFile=files.find(f=>f.type?.startsWith("image/"))||null;
 const audioFile=files.find(f=>f.type?.startsWith("audio/"))||null;
 if(!imageFile && !audioFile){
   e.target.value="";
   alert("Seleziona uno screenshot oppure il file audio del vocale.");
   return;
 }
 if(audioFile && audioFile.size>12*1024*1024){
   alert("La registrazione è troppo grande. Per questa versione usa un audio fino a 12 MB.");
   e.target.value="";
   return;
 }
 selectedImageFile=imageFile;
 selectedAudioFile=audioFile;
 if(selectedId){
   const st=getGirlState(selectedId);
   st.imageFile=imageFile;
   st.imageData=imageFile?await compressImageForAI(imageFile):null;
   st.imageName=imageFile ? "Screenshot: "+imageFile.name : "Nessuno screenshot inserito";
   st.audioFile=audioFile;
   st.audioData=audioFile?await fileToDataUrl(audioFile):null;
   st.audioName=audioFile ? audioFile.name : "";
   st.audioTranscript="";
   st.resultsHtml="";
   // Ogni nuovo screenshot apre una nuova analisi: l'indicazione precedente non va riutilizzata.
   st.aiHint="";
   if($("aiHint")) $("aiHint").value="";
   await persistGirlState(selectedId);
 }
 if(imageFile && audioFile){
   $("imageName").textContent=`Screenshot + 🎙️ vocale rilevato: ${imageFile.name}`;
 }else if(imageFile){
   $("imageName").textContent=`Screenshot: ${imageFile.name}`;
 }else{
   $("imageName").textContent=`🎙️ Vocale rilevato: ${audioFile.name}`;
 }
 $("results").innerHTML="";
 await renderMessages();
}
async function fileToDataUrl(file){
  return await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result||""));
    reader.onerror=()=>reject(reader.error||new Error("Impossibile leggere la registrazione."));
    reader.readAsDataURL(file);
  });
}
$("screenshotInput")?.addEventListener("change",showSelectedMedia);
$("chooseScreenshot")?.addEventListener("click",()=> $("screenshotInput").click());

$("aiHint")?.addEventListener("input",()=>{
  if(selectedId){
    const st=getGirlState(selectedId);
    st.aiHint=$("aiHint").value;
    persistGirlState(selectedId).catch(console.error);
  }
});

let memorySelectedGirlId=null;

async function renderMemoryGirlList(){
  const all=await getAll("girls");
  all.sort((a,b)=>b.updatedAt-a.updatedAt);
  const list=$("memoryGirlList");

  if(!all.length){
    list.innerHTML='<div class="memory-empty">Non hai ancora aggiunto nessuna ragazza.</div>';
    $("memoryEditor").classList.add("hidden");
    $("saveMemory").disabled=true;
    return;
  }

  list.innerHTML=all.map(g=>`
    <button type="button" class="memory-girl-option ${g.id===memorySelectedGirlId?"active":""}" data-memory-girl="${escapeAttr(g.id)}">
      <span class="memory-girl-avatar">${esc((g.name||"?")[0].toUpperCase())}</span>
      <span class="memory-girl-name">${esc(g.name)}</span>
      <span class="memory-girl-check">${g.id===memorySelectedGirlId?"✓":"›"}</span>
    </button>
  `).join("");

  list.querySelectorAll(".memory-girl-option").forEach(btn=>{
    btn.onclick=()=>selectMemoryGirl(btn.dataset.memoryGirl);
  });
}

async function selectMemoryGirl(id){
  memorySelectedGirlId=id;
  const g=await getGirl(id);
  $("memoryInput").value=g?.memory||"";
  $("memorySelectedGirl").innerHTML=`🧠 Memoria di <strong>${esc(g?.name||"Ragazza")}</strong>`;
  // Dopo la scelta, nascondi completamente l'elenco: la seconda schermata
  // deve riguardare solo la ragazza appena selezionata.
  $("memoryGirlList").classList.add("hidden");
  $("memoryGirlSelectLabel").classList.add("hidden");
  $("memoryModalHint").classList.add("hidden");
  $("memoryEditor").classList.remove("hidden");
  $("saveMemory").disabled=false;
  document.querySelectorAll(".memory-girl-option").forEach(x=>x.classList.toggle("active",x.dataset.memoryGirl===id));
  setTimeout(()=>$("memoryInput").focus(),0);
}

async function openMemoryModal(){
  memorySelectedGirlId=null;
  $("memoryInput").value="";
  $("memoryEditor").classList.add("hidden");
  $("memoryGirlList").classList.remove("hidden");
  $("memoryGirlSelectLabel").classList.remove("hidden");
  $("memoryModalHint").classList.remove("hidden");
  $("saveMemory").disabled=true;
  $("memoryModal").classList.remove("hidden");
  await renderMemoryGirlList();
}

$("saveMemory").onclick=async()=>{
  if(!memorySelectedGirlId)return;
  const g=await getGirl(memorySelectedGirlId);
  if(!g)return;
  g.memory=$("memoryInput").value.trim();
  g.updatedAt=Date.now();
  await put("girls",g);
  await renderGirls();
  closeMemoryModal();
  alert("Memoria salvata per "+g.name+".\n\nDa ora verrà considerata nelle risposte per questa ragazza.");
};

function closeMemoryModal(){
  $("memoryModal").classList.add("hidden");
  memorySelectedGirlId=null;
}

// Memoria: binding robusto e indipendente dalla ragazza attualmente aperta.
function bindMemoryButton(){
  const btn=$("openMemory");
  if(!btn || btn.dataset.memoryBound==="1") return;
  btn.dataset.memoryBound="1";
  btn.addEventListener("click",()=>{ openMemoryModal().catch(err=>{console.error(err);alert("Non riesco ad aprire Cose da ricordare. Ricarica la pagina e riprova."); }); });
}
bindMemoryButton();

$("closeMemory").onclick=closeMemoryModal;
$("cancelMemory").onclick=closeMemoryModal;
$("memoryModal").addEventListener("click",e=>{if(e.target===$("memoryModal"))closeMemoryModal()});

async function buildContext(){const g=await getGirl(selectedId),ms=await messagesFor(selectedId),settings=loadSettings();return {aboutMe:settings.aboutMe||"",girl:{id:g?.id,name:g?.name,note:g?.note||"",memory:g?.memory||""},memory:g?.memory||"",conversation:ms.slice(-16),previousReplies:ms.filter(x=>x.role==="me").map(x=>x.text).slice(-12)}}
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
    const maxW=700, maxH=1000;
    const scale=Math.min(1,maxW/img.naturalWidth,maxH/img.naturalHeight);
    const w=Math.max(1,Math.round(img.naturalWidth*scale));
    const h=Math.max(1,Math.round(img.naturalHeight*scale));
    const canvas=document.createElement('canvas');
    canvas.width=w; canvas.height=h;
    canvas.getContext('2d').drawImage(img,0,0,w,h);
    return canvas.toDataURL('image/jpeg',0.48);
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
    window.scrollTo({top:0,behavior:"smooth"});
    document.documentElement.scrollTop=0; document.body.scrollTop=0;
    setTimeout(()=>b.textContent="Copia questa",1200);
  });
  document.querySelectorAll(".copy-reply").forEach(b=>b.onclick=async()=>{
    await navigator.clipboard.writeText(b.dataset.text); b.textContent="Copiato";
    window.scrollTo({top:0,behavior:"smooth"});
    document.documentElement.scrollTop=0; document.body.scrollTop=0;
    setTimeout(()=>b.textContent="Copia",1200);
  });
  document.querySelectorAll(".category-more-toggle").forEach(b=>b.onclick=()=>{
    const target=$(b.dataset.target);
    if(!target) return;
    const opening=target.classList.contains("hidden");
    target.classList.toggle("hidden",!opening);
    const count=Number(b.dataset.count||0);
    b.textContent=opening ? `⌃ Nascondi le ${count} risposte` : `⌄ Mostra le altre ${count} risposte`;
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
  const hasAudio=Boolean(selectedAudioFile || state.audioData);
  if(!hasImage && !hasAudio){
    alert("Aggiungi uno screenshot prima di analizzare. Se nello scambio c’è un vocale, seleziona anche il file audio insieme allo screenshot.");
    return;
  }
  $("generate").disabled=true;
  $("generate").textContent="Analizzo...";
  try{
    const context=await buildContext();
    let image=null;
    let audio=null;
    state.message="";
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
    if(selectedAudioFile){
      audio=await fileToDataUrl(selectedAudioFile);
      state.audioData=audio;
      state.audioFile=selectedAudioFile;
      state.audioName=selectedAudioFile.name;
      await persistGirlState(selectedId);
    }else if(state.audioData){
      audio=state.audioData;
    }
    // Se il dispositivo è offline, mostra un messaggio chiaro invece del generico "Load failed".
    if (navigator.onLine === false) {
      throw new Error("Nessuna connessione internet.");
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
          image,
          audio
        })
      });
    }finally{clearTimeout(clientTimer)}
    if(!response.ok){
      const detail=await response.text().catch(()=> "");
      throw new Error(detail || "Server AI non disponibile.");
    }
    const data=await response.json();
    const audioTranscript=String(data.audioTranscript||"").trim();
    if(audioTranscript){
      state.audioTranscript=audioTranscript;
    }
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
      if(secretStyles.has(style) || i>=30) secretIndexes.push(i); else normalIndexes.push(i);
    });
    const validIndex=(value,list,fallback)=>{
      const n=Number(value);
      return Number.isInteger(n)&&list.includes(n)?n:fallback;
    };
    const normalRecommendedIndex=validIndex(data.recommendedNormalIndex,normalIndexes,normalIndexes[0] ?? recommendedIndex);
    const secretRecommendedIndex=validIndex(data.recommendedSecretIndex,secretIndexes,secretIndexes[0] ?? recommendedIndex);
    const recommendationReason=String(data.recommendationReason||"Questa è quella che si adatta meglio al momento della conversazione.");
    const aiAdvice=String(data.advice||"").trim();
    const sendWhen=String(data.sendWhen||"").trim();
    const categoryRecommendations=data.categoryRecommendations && typeof data.categoryRecommendations==="object" ? data.categoryRecommendations : {};
    const styleOrder=["Dolce","Stuzzica","Ironico","Flirt","Audace","Poeta","Erotica","Hot"];
    const adviceHtml=`<div class="ai-advice-card"><div class="ai-advice-title">💡 Consiglio dell'AI</div><div class="ai-advice-text">${escapeHtml(aiAdvice || "Valuto il momento migliore per scriverle in base alla conversazione.")}</div>${sendWhen ? `<div class="ai-send-when">🕒 Da inviare: ${escapeHtml(sendWhen)}</div>` : ""}</div>`;
    const renderCard=(r,i,categoryRecommendedIndex,categoryReason="")=>{
      const t=typeof r==="string"?r:(r.text||"");
      const style=typeof r==="string"?"Risposta "+(i+1):(r.style||"Risposta "+(i+1));
      const recommended=i===categoryRecommendedIndex?" recommended-card":"";
      return `<div class="reply-card${recommended}"><div class="reply-style">${escapeHtml(style)}${i===categoryRecommendedIndex?` <span class="best-badge">Consigliata</span>`:""}</div><div class="reply-text">${escapeHtml(t)}</div><div class="reply-actions"><button class="secondary copy-reply" data-text="${escapeAttr(t)}">Copia</button></div>${i===categoryRecommendedIndex&&categoryReason?`<div class="category-reason">💡 ${escapeHtml(categoryReason)}</div>`:""}</div>`;
    };
    const renderCategory=(style, indexes, isSecret=false)=>{
      const cat=indexes.filter(i=>{
        const r=replies[i]; return typeof r!=="string" && r.style===style;
      });
      if(!cat.length) return "";
      const rec=categoryRecommendations[style] && Number.isInteger(Number(categoryRecommendations[style].index)) ? Number(categoryRecommendations[style].index) : 0;
      const recIndex=cat[Math.max(0,Math.min(rec,cat.length-1))];
      const reason=String(categoryRecommendations[style]?.reason||"").trim();
      const ordered=[recIndex,...cat.filter(i=>i!==recIndex)];
      const recommendedCard=ordered.length ? renderCard(replies[ordered[0]],ordered[0],recIndex,reason) : "";
      const otherCards=ordered.slice(1).map(i=>renderCard(replies[i],i,recIndex,"")).join("");
      const groupId=`replyGroup_${(isSecret?"secret_":"normal_")}${style.replace(/[^a-zA-Z0-9]/g,"_")}`;
      const moreCount=Math.max(0,ordered.length-1);
      const moreBlock=moreCount?`<div id="${groupId}_more" class="reply-category-more hidden">${otherCards}</div><button type="button" class="category-more-toggle" data-target="${groupId}_more" data-count="${moreCount}">⌄ Mostra le altre ${moreCount} risposte</button>`:"";
      return `<div id="${groupId}" class="reply-category-group${isSecret?" secret-category-group":""}"><div class="reply-category-title">${style}${recIndex!==undefined?` <span class="reply-category-count">${cat.length} risposte</span>`:""}</div>${recommendedCard}${moreBlock}</div>`;
    };
    const normalCards=styleOrder.slice(0,6).map(style=>renderCategory(style,normalIndexes,false)).join("");
    const secretCards=styleOrder.slice(6).map(style=>renderCategory(style,secretIndexes,true)).join("");
    const transcriptHtml=audioTranscript?`<div class="audio-transcript-card"><div class="audio-transcript-title">🎙️ Trascrizione della registrazione</div><div class="audio-transcript-text">${escapeHtml(audioTranscript)}</div></div>`:"";
    const columns=`${transcriptHtml}${adviceHtml}<div class="reply-choice-grid">
      <button type="button" class="reply-choice normal-choice" data-target="normalRepliesPanel"><span class="reply-choice-icon">💬</span><span><b>Risposte normali</b><small>5 per stile: Dolce, Stuzzica, Ironico, Flirt, Audace, Poeta</small></span><span class="reply-choice-arrow">›</span></button>
      <button type="button" class="reply-choice secret-choice" data-target="secretRepliesPanel"><span class="reply-choice-icon">🔒</span><span><b>Risposte segrete</b><small>5 Erotiche + 5 Hot</small></span><span class="reply-choice-arrow">›</span></button>
    </div>
    <section id="normalRepliesPanel" class="reply-panel hidden"><div class="reply-panel-head"><div><b>💬 Risposte normali</b><small>Quella consigliata è evidenziata.</small></div><button type="button" class="reply-panel-close" data-close-panel="normalRepliesPanel">×</button></div><div class="reply-panel-list">${normalCards}</div></section>
    <section id="secretRepliesPanel" class="reply-panel secret-panel hidden"><div class="reply-panel-head"><div><b>🔒 Risposte segrete</b><small>Quella consigliata è evidenziata.</small></div><button type="button" class="reply-panel-close" data-close-panel="secretRepliesPanel">×</button></div><div class="reply-panel-list">${secretCards}</div></section>`;
    $("results").innerHTML=columns;
    applySettings();
    state.resultsHtml=$("results").innerHTML;
    await persistGirlState(selectedId);
    bindResultButtons();
    // Dopo l'analisi apri automaticamente solo la prima casella: Risposte normali.
    const normalChoice=document.querySelector('.reply-choice[data-target="normalRepliesPanel"]');
    const normalPanel=document.getElementById('normalRepliesPanel');
    const secretPanel=document.getElementById('secretRepliesPanel');
    document.querySelectorAll('.reply-panel').forEach(panel=>panel.classList.add('hidden'));
    document.querySelectorAll('.reply-choice').forEach(choice=>choice.classList.remove('selected'));
    if(normalPanel) normalPanel.classList.remove('hidden');
    if(normalChoice) normalChoice.classList.add('selected');
    if(secretPanel) secretPanel.classList.add('hidden');
    // Porta automaticamente l'utente direttamente al Consiglio dell'AI.
    // Non fermarti sull'area "Indicazione per l'AI": dopo l'analisi
    // il primo elemento utile da leggere deve essere il Consiglio dell'AI.
    const adviceBox=document.querySelector("#results .ai-advice-card");
    if(adviceBox){
      setTimeout(()=>{
        const topbar=document.querySelector(".topbar");
        const offset=(topbar?.getBoundingClientRect().height || 70) + 12;
        const y=adviceBox.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({top:Math.max(0,y),left:0,behavior:"smooth"});
      },120);
    }
  }catch(err){
    const networkError = navigator.onLine === false || err?.name === "TypeError" || /Load failed|Failed to fetch|NetworkError|network request failed/i.test(String(err?.message || ""));
    const msg = networkError
      ? "Nessuna connessione internet."
      : (err?.name === "AbortError" ? "Il servizio AI ha impiegato troppo tempo. Riprova: la richiesta ora è ottimizzata per rispondere più velocemente." : err.message);
    alert("Analisi non riuscita: "+msg);
  }finally{
    $("generate").disabled=false;
    $("generate").textContent="Analizza e dammi risposte";
  }
};


function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function escapeAttr(s){return escapeHtml(s);}


// Impostazioni locali: tema e zoom dell’interfaccia/risposte.
const FONT_OPTIONS=[
  {id:"system",name:"Sistema",stack:'-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",sans-serif'},
  {id:"sfround",name:"SF Rounded",stack:'"SF Pro Rounded",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'},
  {id:"newyork",name:"New York",stack:'"New York",Georgia,serif'},
  {id:"avenir",name:"Avenir",stack:'Avenir, "Avenir Next", sans-serif'},
  {id:"avenirnext",name:"Avenir Next",stack:'"Avenir Next",Avenir,sans-serif'},
  {id:"futura",name:"Futura",stack:'Futura, "Avenir Next", sans-serif'},
  {id:"gillsans",name:"Gill Sans",stack:'"Gill Sans",GillSans,sans-serif'},
  {id:"optima",name:"Optima",stack:'Optima, "Segoe UI", sans-serif'},
  {id:"helvetica",name:"Helvetica",stack:'Helvetica, Arial, sans-serif'},
  {id:"helveticaneue",name:"Helvetica Neue",stack:'"Helvetica Neue",Helvetica,Arial,sans-serif'},
  {id:"verdana",name:"Verdana",stack:'Verdana, Geneva, sans-serif'},
  {id:"trebuchet",name:"Trebuchet",stack:'"Trebuchet MS", sans-serif'},
  {id:"georgia",name:"Georgia",stack:'Georgia, serif'},
  {id:"cochin",name:"Cochin",stack:'Cochin,Georgia,serif'},
  {id:"didot",name:"Didot",stack:'Didot,"Bodoni 72",serif'},
  {id:"bodoni",name:"Bodoni 72",stack:'"Bodoni 72",Didot,serif'},
  {id:"baskerville",name:"Baskerville",stack:'Baskerville, "Times New Roman", serif'},
  {id:"times",name:"Times",stack:'"Times New Roman", Times, serif'},
  {id:"palatino",name:"Palatino",stack:'Palatino, "Palatino Linotype", serif'},
  {id:"american_typewriter",name:"American Typewriter",stack:'"American Typewriter","Courier New",serif'},
  {id:"courier",name:"Courier",stack:'"Courier New", Courier, monospace'},
  {id:"menlo",name:"Menlo",stack:'Menlo, Monaco, monospace'},
  {id:"sfmono",name:"SF Mono",stack:'"SF Mono",Menlo,Monaco,monospace'},
  {id:"chalkboard",name:"Chalkboard",stack:'Chalkboard, "Comic Sans MS", cursive'},
  {id:"marker",name:"Marker Felt",stack:'"Marker Felt", Chalkboard, cursive'},
  {id:"snell",name:"Snell Roundhand",stack:'"Snell Roundhand",cursive'},
  {id:"zapfino",name:"Zapfino",stack:'Zapfino,cursive'},
  {id:"noteworthy",name:"Noteworthy",stack:'Noteworthy,"Comic Sans MS",cursive'},
  {id:"papyrus",name:"Papyrus",stack:'Papyrus,fantasy'},
  {id:"copperplate",name:"Copperplate",stack:'Copperplate,"Copperplate Gothic Light",fantasy'}
];
let pendingFontId="system";
function getFontOption(id){return FONT_OPTIONS.find(f=>f.id===id)||FONT_OPTIONS[0];}
function settingsKey(){return `RispostaFlirtSettings_${currentUser?.id||"local"}`;}
function loadSettings(){try{return {...{theme:"dark",replyZoom:100,font:"system",aboutMe:""},...(JSON.parse(localStorage.getItem(settingsKey())||"{}"))}}catch(e){return {theme:"dark",replyZoom:100,font:"system",aboutMe:""}}}
function applySettings(){const s=loadSettings();document.body.classList.toggle("light-theme",s.theme==="light");const zoom=String((Number(s.replyZoom)||100)/100);document.documentElement.style.setProperty("--ui-zoom",zoom);const r=$("results");if(r)r.style.setProperty("--reply-zoom",zoom);const font=getFontOption(s.font);document.documentElement.style.setProperty("--app-font",font.stack);document.querySelectorAll(".theme-option").forEach(b=>b.classList.toggle("active",b.dataset.theme===s.theme));if($("replyZoom"))$("replyZoom").value=String(s.replyZoom||100);if($("replyZoomValue"))$("replyZoomValue").textContent=(s.replyZoom||100)+"%";if($("fontSettingValue"))$("fontSettingValue").textContent=font.name;}
function saveSettings(patch){const next={...loadSettings(),...patch};localStorage.setItem(settingsKey(),JSON.stringify(next));if(serverSyncEnabled) scheduleServerSync();applySettings()}
function renderFontList(){const current=getFontOption(pendingFontId);$("fontList").innerHTML=FONT_OPTIONS.map(f=>`<button type="button" class="font-option ${f.id===current.id?"selected":""}" data-font-id="${f.id}"><span class="font-option-name">${esc(f.name)}</span><span class="font-option-preview" style="font-family:${f.stack}">Aa — RispostaFlirt</span><span class="font-option-check">✓</span></button>`).join("");document.querySelectorAll(".font-option").forEach(b=>b.onclick=()=>{pendingFontId=b.dataset.fontId;renderFontList()});}
function openFontModal(){pendingFontId=loadSettings().font||"system";renderFontList();$("fontModal").classList.remove("hidden")}
function closeFontModal(){$("fontModal").classList.add("hidden")}
function openSettings(){applySettings();$("settingsModal").classList.remove("hidden")}
function closeSettings(){$("settingsModal").classList.add("hidden")}
$("openSettings").onclick=openSettings;$("closeSettings").onclick=closeSettings;$("closeSettingsBottom").onclick=closeSettings;$("settingsModal").addEventListener("click",e=>{if(e.target.id==="settingsModal")closeSettings()});document.querySelectorAll(".theme-option").forEach(b=>b.onclick=()=>saveSettings({theme:b.dataset.theme}));$("replyZoom").addEventListener("input",e=>saveSettings({replyZoom:Number(e.target.value)}));$("openFontSettings").onclick=openFontModal;$("closeFontModal").onclick=closeFontModal;$("cancelFont").onclick=closeFontModal;$("fontModal").addEventListener("click",e=>{if(e.target.id==="fontModal")closeFontModal()});$("saveFont").onclick=()=>{saveSettings({font:pendingFontId});closeFontModal()};applySettings();

// -------------------------
// Autenticazione e sincronizzazione multiutente
// -------------------------
function authMessage(text, type=""){ const el=$("authMessage"); if(!el)return; el.textContent=text||""; el.className="auth-message"+(type?" "+type:"")+(text?"":" hidden"); }
function forgotMessage(text, type=""){ const el=$("forgotMessage"); if(!el)return; el.textContent=text||""; el.className="auth-message"+(type?" "+type:"")+(text?"":" hidden"); }
function resetMessage(text, type=""){ const el=$("resetMessage"); if(!el)return; el.textContent=text||""; el.className="auth-message"+(type?" "+type:"")+(text?"":" hidden"); }
function setAuthBusy(btn,busy,label){ if(btn){btn.disabled=busy;btn.textContent=busy?"Attendi…":label;} }
async function api(path,options={}){ const res=await fetch(path,{credentials:"same-origin",...options}); const data=await res.json().catch(()=>({})); if(!res.ok) throw new Error(data.error||"Operazione non riuscita."); return data; }

async function clearCurrentLocalDB(){
  serverSyncEnabled=false;
  if(db){try{db.close()}catch{}}
  await new Promise(resolve=>{const r=indexedDB.deleteDatabase(DB_NAME);r.onsuccess=r.onerror=r.onblocked=()=>resolve()});
  girls=[]; selectedId=null; girlStates.clear();
}

async function localSnapshot(){
  return { girls:await getAll("girls"), messages:await getAll("messages"), girlStates:await getAll("girlStates"), settings:loadSettings() };
}
function hasLocalData(s){return Boolean(s.girls?.length || s.messages?.length || s.girlStates?.length);}
function hasRemoteData(d){return Boolean(d.girls?.length || d.messages?.length || d.girlStates?.length || d.settings);}

async function importRemoteData(data){
  serverSyncPaused=true;
  try{
    const local=await localSnapshot();
    await new Promise(resolve=>{if(db){try{db.close()}catch{}} const r=indexedDB.deleteDatabase(DB_NAME);r.onsuccess=r.onerror=r.onblocked=()=>resolve()});
    await openDB();
    for(const g of (data.girls||[])) await put("girls",{id:g.id,name:g.name,note:g.note||"",memory:g.memory||"",createdAt:g.createdAt||Date.now(),updatedAt:g.updatedAt||Date.now()});
    for(const m of (data.messages||[])) await add("messages",{clientId:m.clientId||`remote:${m.girlId}:${m.createdAt}:${crypto.randomUUID()}`,girlId:m.girlId,role:m.role,text:m.text||"",imageData:m.imageData||null,createdAt:m.createdAt||Date.now()});
    for(const st of (data.girlStates||[])) await put("girlStates",{girlId:st.girlId,message:st.message||"",imageData:st.imageData||null,imageName:st.imageName||"",resultsHtml:st.resultsHtml||"",role:st.role||"her",aiHint:st.aiHint||"",updatedAt:st.updatedAt||Date.now()});
    if(data.settings) localStorage.setItem(settingsKey(),JSON.stringify(data.settings));
  }finally{serverSyncPaused=false;}
}

async function syncLocalToServer(){
  if(!serverSyncEnabled || !currentUser || serverSyncPaused) return;
  try{
    const s=await localSnapshot();
    const messages=s.messages.map(m=>({...m,clientId:m.clientId||`${m.girlId}:${m.id}`}));
    await api("/api/data/sync",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({girls:s.girls,messages,girlStates:s.girlStates,settings:s.settings})});
  }catch(err){ console.warn("Sincronizzazione non riuscita",err); }
}
function scheduleServerSync(){
  if(!serverSyncEnabled)return;
  clearTimeout(serverSyncTimer);
  serverSyncTimer=setTimeout(()=>syncLocalToServer(),700);
}

async function prepareUserData(){
  DB_NAME=`RispostaFlirtDB_${currentUser.id}`;
  await openDB();
  const local=await localSnapshot();
  const remote=await api("/api/data");
  if(!hasRemoteData(remote) && hasLocalData(local)){
    serverSyncEnabled=true;
    await syncLocalToServer();
  }else if(hasRemoteData(remote)){
    await importRemoteData(remote);
  }
  serverSyncEnabled=true;
}

async function showAccount(){
  if(!currentUser)return;
  const nickname=currentUser.nickname||"Il tuo nickname"; const email=currentUser.email||"";
  $("accountNickname").textContent=nickname; $("accountEmail").textContent=email; $("accountAvatar").textContent=(nickname.trim().charAt(0)||"?").toUpperCase();
  $("accountModal").classList.remove("hidden");
}
function openAboutMe(){
  if($("aboutMeInput")) $("aboutMeInput").value=loadSettings().aboutMe||"";
  $("aboutMeModal").classList.remove("hidden");
  setTimeout(()=>$("aboutMeInput")?.focus(),0);
}
function closeAboutMe(){$("aboutMeModal").classList.add("hidden");}
function saveAboutMe(){
  saveSettings({aboutMe:($("aboutMeInput")?.value||"").trim()});
  closeAboutMe();
}
async function startUserApp(user){
  currentUser=user;
  $("authScreen").classList.add("hidden"); $("app").classList.remove("hidden");
  try{
    await prepareUserData();
    await renderGirls();
    const saved=localStorage.getItem(`selectedGirl_${currentUser.id}`);
    if(saved && girls.some(g=>g.id===saved)) await selectGirl(saved);
    else if(girls.length) await selectGirl(girls[0].id);
    else {$("empty").classList.remove("hidden");$("chat").classList.add("hidden");}
  }catch(err){console.error("Errore avvio account:",err);authMessage(err.message||"Impossibile caricare i dati.","error");}
}

async function finishLogin(data){
  if(!data?.user) throw new Error("Account non valido.");
  await startUserApp(data.user);
}

function initPasswordToggles(){
  document.querySelectorAll(".password-toggle[data-password-target]").forEach(btn=>{
    btn.addEventListener("click",()=>{
      const input=document.getElementById(btn.dataset.passwordTarget);
      if(!input)return;
      const showing=input.type==="text";
      input.type=showing?"password":"text";
      btn.classList.toggle("showing",!showing);
      btn.textContent=showing?"👁":"🙈";
      btn.setAttribute("aria-label",showing?"Mostra password":"Nascondi password");
      btn.title=showing?"Mostra password":"Nascondi password";
    });
  });
}

async function initAuth(){
  try{
    const me=await api("/api/auth/me");
    const resetToken=new URLSearchParams(location.search).get("reset");
    if(resetToken){$("resetModal").classList.remove("hidden");window.__resetToken=resetToken;}
    if(me.authenticated){await startUserApp(me.user);}
    else {$("authScreen").classList.remove("hidden");$("app").classList.add("hidden");}
  }catch(err){$("authScreen").classList.remove("hidden");$("app").classList.add("hidden");authMessage("Server di autenticazione non disponibile. Riprova tra poco.","error");}
}

$("loginForm")?.addEventListener("submit",async e=>{
  e.preventDefault(); authMessage(""); const btn=e.currentTarget.querySelector("button[type=submit]"); setAuthBusy(btn,true,"ACCEDI");
  try{const data=await api("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:$("loginEmail").value,password:$("loginPassword").value})}); await finishLogin(data);}
  catch(err){authMessage(err.message,"error");}finally{setAuthBusy(btn,false,"ACCEDI");}
});
$("showRegister")?.addEventListener("click",()=>{$("registerModal").classList.remove("hidden");$("registerNickname").focus()});
$("closeRegister")?.addEventListener("click",()=>$("registerModal").classList.add("hidden"));
$("registerModal")?.addEventListener("click",e=>{if(e.target===e.currentTarget)e.currentTarget.classList.add("hidden")});
$("registerForm")?.addEventListener("submit",async e=>{
  e.preventDefault(); authMessage(""); const p=$("registerPassword").value,p2=$("registerPassword2").value; if(p!==p2){authMessage("Le due password non coincidono.","error");return;}
  const btn=e.currentTarget.querySelector("button[type=submit]");setAuthBusy(btn,true,"CREA ACCOUNT");
  try{const data=await api("/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({nickname:$("registerNickname").value,email:$("registerEmail").value,password:p})});$("registerModal").classList.add("hidden");await finishLogin(data);}
  catch(err){authMessage(err.message,"error");}finally{setAuthBusy(btn,false,"CREA ACCOUNT");}
});
$("forgotPassword")?.addEventListener("click",()=>{$("forgotModal").classList.remove("hidden");$("forgotEmail").focus();forgotMessage("")});
$("closeForgot")?.addEventListener("click",()=>$("forgotModal").classList.add("hidden"));
$("forgotModal")?.addEventListener("click",e=>{if(e.target===e.currentTarget)e.currentTarget.classList.add("hidden")});
$("forgotForm")?.addEventListener("submit",async e=>{e.preventDefault();const btn=e.currentTarget.querySelector("button[type=submit]");setAuthBusy(btn,true,"INVIA LINK");try{const d=await api("/api/auth/forgot",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:$("forgotEmail").value})});forgotMessage(d.message,"success");}catch(err){forgotMessage(err.message,"error");}finally{setAuthBusy(btn,false,"INVIA LINK");}});
$("resetForm")?.addEventListener("submit",async e=>{e.preventDefault();const p=$("resetPassword").value,p2=$("resetPassword2").value;if(p!==p2){resetMessage("Le due password non coincidono.","error");return;}const btn=e.currentTarget.querySelector("button[type=submit]");setAuthBusy(btn,true,"SALVA PASSWORD");try{const d=await api("/api/auth/reset",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({token:window.__resetToken,password:p})});history.replaceState({},"",location.pathname);$("resetModal").classList.add("hidden");await finishLogin(d);}catch(err){resetMessage(err.message,"error");}finally{setAuthBusy(btn,false,"SALVA PASSWORD");}});

initPasswordToggles();

$("accountBtn")?.addEventListener("click",()=>showAccount());
$("closeAccount")?.addEventListener("click",()=>$("accountModal").classList.add("hidden"));
$("accountModal")?.addEventListener("click",e=>{if(e.target===e.currentTarget)e.currentTarget.classList.add("hidden")});
$("openAboutMe")?.addEventListener("click",openAboutMe);$("closeAboutMe")?.addEventListener("click",closeAboutMe);$("cancelAboutMe")?.addEventListener("click",closeAboutMe);$("saveAboutMe")?.addEventListener("click",saveAboutMe);$("aboutMeModal")?.addEventListener("click",e=>{if(e.target.id==="aboutMeModal")closeAboutMe();});
$("logoutBtn")?.addEventListener("click",async()=>{
  try{await syncLocalToServer(); await api("/api/auth/logout",{method:"POST"});}catch{}
  $("accountModal").classList.add("hidden");
  await clearCurrentLocalDB();
  currentUser=null; location.reload();
});

(async function boot(){
  await initAuth();
})();

