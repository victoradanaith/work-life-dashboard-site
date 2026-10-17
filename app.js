import {AREAS,parseSnapshot,selectTasks,totals,projectProgress,upcomingDeadlines,FEED_PAGE_SIZE,buildFeed,filterFeed,feedPage,projectTone,addIdea,createIdeaStore,serializeIdeas} from './secure-model.js';
const $=selector=>document.querySelector(selector),esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const descriptions=['Property management','Social media work','One to Two Coffee','Life beyond work'];
const drawings=['<path d="M20 70V27L45 12l25 15v43M10 70h70M32 70V52h26v18M30 30h8v10h-8zm22 0h8v10h-8z"/>','<rect x="24" y="8" width="43" height="65" rx="8"/><path d="M38 18h15M40 63h11M14 27l-6 6 6 6m63 0 7 6-7 6m-43-8 8 8 16-19"/>','<path d="M18 33h46v23c0 20-46 20-46 0zm46 3h8c15 0 15 20-8 20M10 76h64M29 23c-10-9 8-10 0-19m15 19c-10-9 8-10 0-19m15 19c-10-9 8-10 0-19"/>','<path d="M45 74V42m0 13C15 56 12 26 18 19c22 0 30 17 27 36zm0-8c-2-22 12-34 31-34 5 20-7 36-31 34zM26 75h39"/>'];
// Build-time replacement for secure-app.js's DELIVERY_ADAPTER region.
// The shared UI and session lifecycle stay identical to the local gateway build.
import {PUBLIC_CONFIG} from './pages-config.js';
import {readPrivateSheet,SHEET_DENIED_MESSAGE} from './browser-sheets.js';
const DENIED_MESSAGE=SHEET_DENIED_MESSAGE;
const SIGNIN_MESSAGE='Continue with a Google account that can access your private Sheet.';
async function loadDashboardConfig(){return {configured:Boolean(PUBLIC_CONFIG.clientId&&PUBLIC_CONFIG.spreadsheetId),clientId:PUBLIC_CONFIG.clientId};}
async function readDashboardData(token,signal){return readPrivateSheet({spreadsheetId:PUBLIC_CONFIG.spreadsheetId,accessToken:token,signal});}

let snapshot={tasks:[],logs:[]},category='',generation=0,expiry,pendingRequest;
let activeView='main',feedRecords=[],feedOffset=0,feedCycle=1,attentionOnly=false,ideas=[],ideasStore=null,ideasNotice='';
const previewIDs=new Set();
function clear(message='Signed out. Sign in to continue.'){
 generation++;clearTimeout(expiry);pendingRequest?.abort();pendingRequest=null;snapshot={tasks:[],logs:[]};category='';
 for(const id of ['cards','areas','metrics','deadlines','projects','activity-list','feed-cards','feed-attention-list','ideas-grid','idea-project-options'])$('#'+id).replaceChildren();
 for(const id of ['freshness','count','log-count','feed-freshness','feed-position','feed-cycle-note','ideas-message','ideas-count'])$('#'+id).textContent='';
 feedRecords=[];feedOffset=0;feedCycle=1;attentionOnly=false;ideas=[];ideasStore=null;previewIDs.clear();activeView='main';
 for(const name of ['main','feed','ideas']){$('#'+name+'-view').hidden=name!=='main';$('#nav-'+name).setAttribute?.('aria-current',name==='main'?'page':'false');}
 for(const id of ['idea-title','idea-url','idea-project','idea-image-url','idea-notes','feed-area','feed-project','feed-status','ideas-project-filter','ideas-source-filter'])$('#'+id).value='';
 for(const [id,label] of [['feed-area','All areas'],['feed-project','All projects'],['feed-status','All statuses'],['ideas-project-filter','All projects'],['ideas-source-filter','All sources']])$('#'+id).innerHTML=`<option value="">${label}</option>`;
 document.title='Work & Life · Sign in';ideasNotice='';
 $('#project').innerHTML='<option value="">All projects</option>';$('#status').innerHTML='<option value="">All statuses</option>';$('#status').value='';$('#workspace').hidden=true;$('#logout').hidden=true;$('#gate').hidden=false;$('#message').textContent=message;
}
function setOptions(id,values,label){
 const selected=$('#'+id).value;$('#'+id).innerHTML=`<option value="">${label}</option>`+values.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');$('#'+id).value=values.includes(selected)?selected:'';
}
function showView(name,focus=false){
 activeView=['main','feed','ideas'].includes(name)?name:'main';
 for(const view of ['main','feed','ideas']){$('#'+view+'-view').hidden=view!==activeView;$('#nav-'+view).setAttribute?.('aria-current',view===activeView?'page':'false');}
 if(activeView==='feed')renderFeed();if(activeView==='ideas')renderIdeas();
 document.title='Work & Life · '+({main:'Main',feed:'Feed',ideas:'Ideas'})[activeView];
 if(focus){window.history?.replaceState?.(null,'','#'+activeView);const heading=$(activeView==='main'?'#heading':'#'+activeView+'-title');heading.setAttribute?.('tabindex','-1');heading.focus?.();window.scrollTo?.({top:0,behavior:'auto'});}
}
function prepareViews(){
 feedRecords=buildFeed(snapshot.tasks,snapshot.logs);feedOffset=0;feedCycle=1;attentionOnly=false;
 setOptions('feed-area',[...new Set([...AREAS,...feedRecords.map(item=>item.area)])],'All areas');
 setOptions('feed-project',[...new Set(feedRecords.map(item=>item.project).filter(Boolean))].sort(),'All projects');
 setOptions('feed-status',[...new Set(feedRecords.map(item=>item.status))].sort(),'All statuses');
 ideas=[];ideasNotice='';try{ideasStore=createIdeaStore(window.localStorage);ideas=ideasStore.load();}catch{ideasStore=null;ideasNotice='Device storage is unavailable or could not be read. Additions will last only for this visit; existing saved data has not been replaced.';}
 $('#idea-save').textContent=ideasStore?'Save on this device':'Add for this visit';$('#ideas-message').textContent=ideasNotice;
 showView(window.location?.hash?.slice(1)||'main');
}
function feedFilters(){return {area:$('#feed-area').value,project:$('#feed-project').value,status:$('#feed-status').value,attention:attentionOnly};}
function renderFeed(){
 const base=filterFeed(feedRecords,{...feedFilters(),attention:false}),attention=base.filter(item=>item.attention),records=filterFeed(feedRecords,feedFilters()),page=feedPage(records,feedOffset,feedCycle);feedOffset=page.start;
 $('#feed-freshness').textContent=$('#freshness').textContent;
 $('#feed-attention-toggle').setAttribute?.('aria-pressed',String(attentionOnly));
 $('#feed-attention-list').innerHTML=attention.length?`<p class="note">${attention.length} source-flagged item${attention.length===1?'':'s'}${attention.length>5?' · First 5 shown; use attention only for the full list.':''}</p><div class="attention-items">`+attention.slice(0,5).map(item=>`<button data-review-key="${esc(item.key)}"><strong>${esc(item.attention)}</strong><span>${esc(item.title)}</span><small>${esc(item.project||item.area)}</small></button>`).join('')+'</div>':'<p class="empty">No overdue, due-today, waiting, blocked or decision-needed items in these filters.</p>';
 $('#feed-position').textContent=page.total?`Cards ${page.start+1}–${page.end} of ${page.total} · Review cycle ${page.cycle}`:'No cards match these filters.';
 $('#feed-cards').innerHTML=page.items.length?page.items.map((item,index)=>`<article class="feed-card tone-${item.tone}" id="feed-record-${page.start+index}" tabindex="-1"><div class="feed-card-top"><span class="project-badge">${esc(item.project||'No project')}</span><span class="tag">${esc(item.area)}</span><span class="tag">${esc(item.status)}</span></div>${item.attention?`<p class="attention-label">${esc(item.attention)}</p>`:''}<h2>${esc(item.title)}</h2><p class="note">${item.update?`Latest source update · ${esc(item.update)} Bangkok`:'Update time not set in the source'}</p>${item.result?`<p class="feed-result">${esc(item.result)}</p>`:''}<div class="next-action"><strong>Next action</strong><p>${esc(item.nextAction||'Not set in the source Sheet.')}</p></div><div class="links">${[['workingFile','Working file'],['presentingFile','Presentation']].map(([key,label])=>item[key]?`<a href="${esc(item[key])}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`:'').join('')}</div>${item.activity.length?`<details class="feed-activity"><summary>Activity · ${item.activity.length} entr${item.activity.length===1?'y':'ies'}</summary>${item.activity.slice(0,3).map(log=>`<div><small>${esc(log.date)}${log.status?' · '+esc(log.status):''}</small><p>${esc(log.description)}</p>${log.link?`<a href="${esc(log.link)}" target="_blank" rel="noopener noreferrer">Result link ↗</a>`:''}</div>`).join('')}${item.activity.length>3?'<p class="note">Latest 3 entries shown. Full activity is available on Main.</p>':''}</details>`:'<p class="note">No activity entries recorded.</p>'}<small>${esc(item.id)}</small></article>`).join(''):'<p class="empty">Try another project, status or area.</p>';
 $('#feed-previous').disabled=!page.previous;$('#feed-next').hidden=!page.next;$('#feed-repeat').hidden=!page.total||page.next;
 $('#feed-repeat').textContent='Start review cycle '+(page.cycle+1);
 $('#feed-cycle-note').textContent='Review cycles show the same loaded records again, not new updates. Up to '+FEED_PAGE_SIZE+' cards are kept on screen at a time.';
}
function feedStart(){$('#feed-title').focus?.();$('#feed-title').scrollIntoView?.({block:'start',behavior:'auto'});}
function persistIdeas(next,message){
 try{if(ideasStore)ideasStore.save(next);ideas=next;$('#ideas-message').textContent=message+(ideasStore?' Saved only in this browser profile.':' For this visit only; device storage is unavailable.');renderIdeas();return true;}
 catch{$('#ideas-message').textContent='Could not save on this device. Browser storage may be full or blocked. Your existing library has not been replaced.';return false;}
}
function renderIdeas(){
 setOptions('ideas-project-filter',[...new Set(ideas.map(item=>item.project||'Unassigned'))].sort(),'All projects');
 setOptions('ideas-source-filter',[...new Set(ideas.map(item=>item.source))].sort(),'All sources');
 $('#idea-project-options').innerHTML=[...new Set([...snapshot.tasks.map(task=>task.project),...ideas.map(item=>item.project)].filter(Boolean))].sort().map(project=>`<option value="${esc(project)}"></option>`).join('');
 const project=$('#ideas-project-filter').value,source=$('#ideas-source-filter').value,selected=ideas.filter(item=>(!project||(item.project||'Unassigned')===project)&&(!source||item.source===source)),groups=new Map();
 for(const item of selected){const key=item.project||'Unassigned';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
 $('#ideas-count').textContent=`${selected.length} of ${ideas.length} local references · Up to 100 per browser profile`;$('#ideas-export').disabled=!ideas.length;
 $('#ideas-grid').innerHTML=selected.length?[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([project,items])=>`<section class="idea-group"><h2>${esc(project)}</h2><div class="idea-grid">`+items.map(item=>`<article class="idea-card tone-${projectTone(project)}"><div class="idea-visual">${item.imageUrl&&previewIDs.has(item.id)?`<img src="${esc(item.imageUrl)}" alt="${esc(item.title)}" crossorigin="anonymous" referrerpolicy="no-referrer" loading="lazy" decoding="async"><span class="image-fallback" hidden>Image unavailable · use the source link below.</span>`:`<span class="idea-mark" aria-hidden="true">${({Pinterest:'P',Instagram:'◎',TikTok:'♪',Other:'↗'})[item.source]}</span>${item.imageUrl?`<button data-load-image="${esc(item.id)}">Load image</button>`:'<small>Source link · no image saved</small>'}`}</div><div class="idea-body"><span class="tag">${esc(item.source)}</span><h3>${esc(item.title)}</h3>${item.notes?`<p>${esc(item.notes)}</p>`:''}<small>${esc(new URL(item.url).hostname)}</small><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Open source ↗</a><button class="quiet" data-remove-idea="${esc(item.id)}">Remove<span class="sr-only"> ${esc(item.title)}</span></button></div></article>`).join('')+'</div></section>').join(''):ideas.length?'<p class="empty">No local references match these filters.</p>':'<div class="ideas-empty"><strong>Your idea library is empty.</strong><p>No connected idea dataset was found. Add a Pinterest, Instagram, TikTok or other HTTPS URL above to start your device-local collection.</p></div>';
}
function render(){
 const scoped=selectTasks(snapshot.tasks,{area:category}),summary=totals(scoped);
 $('#heading').textContent=category||'Your overview';$('#subtitle').textContent=category?descriptions[AREAS.indexOf(category)]||'Private workspace':'Four areas. One clear next step.';
 $('#areas').innerHTML=AREAS.map((area,index)=>{const stats=totals(selectTasks(snapshot.tasks,{area}));return `<button class="area-card" data-area="${area}" aria-pressed="${category===area}"><span class="art"><svg viewBox="0 0 90 85" aria-hidden="true">${drawings[index]}</svg></span><span class="area-body"><strong>${area}</strong><span>${descriptions[index]}</span><small>${stats.open} open · ${stats.done} completed</small></span></button>`;}).join('');
 $('#overview').hidden=!category;$('#metrics').innerHTML=[[summary.open,'Open tasks'],[summary.doing,'In progress'],[summary.done,'Completed']].map(([number,label])=>`<div class="metric"><strong>${number}</strong><span>${label}</span></div>`).join('');
 const filtered=selectTasks(scoped,{project:$('#project').value,status:$('#status').value});$('#count').textContent=`${filtered.length} of ${scoped.length} tasks`;
 $('#cards').innerHTML=filtered.length?filtered.map(task=>`<article class="card"><div class="task-top"><span class="tag">${esc(task.area)}</span><span class="tag">${esc(task.status)}</span></div><p class="eyebrow">${esc(task.project||'No project')}</p><h3>${esc(task.title)}</h3><p class="date">${task.start?`Started ${esc(task.start)}`:''}${task.completed?` · Completed ${esc(task.completed)}`:''}${task.due?` · Due ${esc(task.due)}`:''}</p>${task.result?`<p>${esc(task.result)}</p>`:''}${task.nextAction?`<p><strong>Next</strong> · ${esc(task.nextAction)}</p>`:''}<div class="links">${[['workingFile','Working file'],['presentingFile','Presenting file']].map(([key,label])=>task[key]?`<a href="${esc(task[key])}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`:'').join('')}</div><small>${esc(task.id)}${task.updated?` · Updated ${esc(task.updated)} Bangkok`:''}</small></article>`).join(''):'<p class="empty">No tasks match these filters.</p>';
 const due=upcomingDeadlines(scoped);$('#deadlines').innerHTML=due.length?due.map(task=>`<p><strong>${esc(task.due)}</strong><br>${esc(task.title)}</p>`).join(''):'<p class="empty">No open deadlines in the source Sheet.</p>';
 $('#projects').innerHTML=projectProgress(scoped).map(project=>`<div class="project"><strong>${esc(project.name)}</strong><small>${project.done} of ${project.total} tasks completed</small><progress value="${project.done}" max="${project.total}" aria-label="${esc(project.name)} progress"></progress></div>`).join('')||'<p class="empty">No projects yet.</p>';
 const taskIDs=new Set(scoped.map(task=>task.id)),logs=snapshot.logs.filter(log=>!category||taskIDs.has(log.taskID));$('#log-count').textContent=`${logs.length} entries · Bangkok source dates`;
 $('#activity-list').innerHTML=logs.slice().reverse().map(log=>`<article class="activity-entry"><small>${esc(log.date)} · ${esc(log.taskID)}${log.status?` · ${esc(log.status)}`:''}</small><p>${esc(log.description)}</p>${log.hours?`<p>Hours · ${esc(log.hours)}</p>`:''}${log.link?`<a href="${esc(log.link)}" target="_blank" rel="noopener noreferrer">Result link ↗</a>`:''}</article>`).join('')||'<p class="empty">No activity entries in this area.</p>';
}
async function connect(){
 try{
  const config=await loadDashboardConfig();if(!config.configured){clear('Google sign-in is awaiting setup. No private data has been loaded.');return;}
  await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.onload=resolve;script.onerror=reject;document.head.append(script);});
  const client=google.accounts.oauth2.initTokenClient({client_id:config.clientId,scope:'openid email https://www.googleapis.com/auth/spreadsheets.readonly',include_granted_scopes:false,callback:async tokenResponse=>{
   if(tokenResponse.error||!tokenResponse.access_token){tokenResponse.access_token='';clear('Google sign-in was not completed.');return;}
   clear('Verifying access…');const requestGeneration=generation,lifetime=Number(tokenResponse.expires_in);
   if(!(lifetime>0)){tokenResponse.access_token='';clear('Session expired. Sign in again.');return;}
   expiry=setTimeout(()=>clear('Session expired. Sign in again.'),Math.min(lifetime*1000,3600000));pendingRequest=new AbortController();$('#logout').hidden=false;
   try{
    const data=await readDashboardData(tokenResponse.access_token,pendingRequest.signal);if(requestGeneration!==generation)return;snapshot=parseSnapshot(data);
    $('#project').innerHTML='<option value="">All projects</option>'+[...new Set(snapshot.tasks.map(task=>task.project).filter(Boolean))].sort().map(project=>`<option>${esc(project)}</option>`).join('');
    $('#status').innerHTML='<option value="">All statuses</option>'+[...new Set(snapshot.tasks.map(task=>task.status))].sort().map(status=>`<option>${esc(status)}</option>`).join('');
    $('#freshness').textContent='Read from your private Sheet · '+new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'short'}).format(new Date(data.readAt))+' Bangkok';
    $('#gate').hidden=true;$('#workspace').hidden=false;$('#logout').hidden=false;render();prepareViews();
   }catch(error){if(requestGeneration===generation)clear(error.message===DENIED_MESSAGE?error.message:'Private data could not be loaded. Sign in again to retry.');}
   finally{tokenResponse.access_token='';if(requestGeneration===generation)pendingRequest=null;}
  },error_callback:()=>clear('Google sign-in was cancelled or blocked. Try again.')});
  $('#signin').disabled=false;$('#message').textContent=SIGNIN_MESSAGE;$('#signin').onclick=()=>client.requestAccessToken({prompt:'select_account'});
 }catch{clear('Sign-in service is unavailable. No private data has been loaded.');}
}
$('#logout').onclick=()=>clear();$('#overview').onclick=()=>{category='';render();};$('#project').onchange=render;$('#status').onchange=render;$('#areas').onclick=event=>{const button=event.target.closest('[data-area]');if(button){category=button.dataset.area;render();}};
for(const name of ['main','feed','ideas'])$('#nav-'+name).onclick=()=>showView(name,true);
for(const id of ['feed-area','feed-project','feed-status'])$('#'+id).onchange=()=>{feedOffset=0;feedCycle=1;renderFeed();};
$('#feed-attention-toggle').onclick=()=>{attentionOnly=!attentionOnly;feedOffset=0;feedCycle=1;renderFeed();};
$('#feed-previous').onclick=()=>{feedOffset=Math.max(0,feedOffset-FEED_PAGE_SIZE);renderFeed();feedStart();};
$('#feed-next').onclick=()=>{feedOffset+=FEED_PAGE_SIZE;renderFeed();feedStart();};
$('#feed-repeat').onclick=()=>{feedOffset=0;feedCycle++;renderFeed();feedStart();};
$('#feed-attention-list').onclick=event=>{const button=event.target.closest('[data-review-key]');if(!button)return;attentionOnly=false;const records=filterFeed(feedRecords,feedFilters()),index=records.findIndex(item=>item.key===button.dataset.reviewKey);if(index<0)return;feedOffset=Math.floor(index/FEED_PAGE_SIZE)*FEED_PAGE_SIZE;renderFeed();$('#feed-record-'+index).focus?.();};
for(const id of ['ideas-project-filter','ideas-source-filter'])$('#'+id).onchange=renderIdeas;
$('#idea-form').onsubmit=event=>{event.preventDefault();try{const next=addIdea(ideas,{id:'idea-'+(window.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)),title:$('#idea-title').value,url:$('#idea-url').value,project:$('#idea-project').value,notes:$('#idea-notes').value,imageUrl:$('#idea-image-url').value,createdAt:new Date().toISOString()});if(persistIdeas(next,'Reference added.'))$('#idea-form').reset?.();}catch(error){$('#ideas-message').textContent=error.message;}};
$('#ideas-grid').onclick=event=>{const load=event.target.closest('[data-load-image]'),remove=event.target.closest('[data-remove-idea]');if(load){previewIDs.add(load.dataset.loadImage);renderIdeas();}if(remove&&window.confirm?.('Remove this reference from this device? Export a backup first if you want to keep it.')){previewIDs.delete(remove.dataset.removeIdea);persistIdeas(ideas.filter(item=>item.id!==remove.dataset.removeIdea),'Reference removed.');}};
$('#ideas-grid').addEventListener?.('error',event=>{if(event.target.tagName!=='IMG')return;event.target.hidden=true;const fallback=event.target.closest('.idea-visual')?.querySelector('.image-fallback');if(fallback)fallback.hidden=false;},true);
$('#ideas-export').onclick=()=>{if(!ideas.length)return;const url=URL.createObjectURL(new Blob([serializeIdeas(ideas)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='work-life-ideas-'+new Date().toISOString().slice(0,10)+'.json';link.click();URL.revokeObjectURL(url);$('#ideas-message').textContent='Ideas exported. This unencrypted file contains your saved reference URLs and notes; keep it private.';};
window.addEventListener('pagehide',()=>clear());clear('Checking sign-in setup…');connect();
window.addEventListener('hashchange',()=>{if(!$('#workspace').hidden)showView(window.location?.hash?.slice(1)||'main');});
