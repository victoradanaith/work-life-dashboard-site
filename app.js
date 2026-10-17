import {AREAS,parseSnapshot,selectTasks,totals,projectProgress,upcomingDeadlines,createFeedWindow,parseSharedIdeas,buildFeed,filterFeed,projectTone,addIdea,createIdeaStore,serializeIdeas} from './secure-model.js';
import {readOMResearch} from './browser-sheets.js';
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
let activeView='main',feedRecords=[],feedWindow=null,feedSelection=[],feedSavedScroll=0,feedInitialized=false,attentionOnly=false,sharedIdeas=[],sharedIdeasNotice='',ideas=[],ideasStore=null,ideasNotice='',removedIdeas=[];
const previewIDs=new Set(),failedPreviewIDs=new Set(),feedNodes=new Map(),expandedActivity=new Set();let feedFrame=0,feedObserver=null;
const feedLayout=Boolean(window.requestAnimationFrame&&document.createElement('article').getBoundingClientRect);
function clear(message='Signed out. Sign in to continue.'){
 stopFeed();feedWindow=null;feedNodes.clear();expandedActivity.clear();feedInitialized=false;feedSavedScroll=0;generation++;clearTimeout(expiry);pendingRequest?.abort();pendingRequest=null;snapshot={tasks:[],logs:[]};category='';
 for(const id of ['cards','areas','metrics','deadlines','projects','activity-list','feed-cards','feed-attention-list','ideas-grid','idea-project-options'])$('#'+id).replaceChildren();
 for(const id of ['freshness','count','log-count','feed-freshness','feed-position','feed-cycle-note','ideas-message','ideas-count','ideas-shared-status'])$('#'+id).textContent='';
 feedRecords=[];feedSelection=[];attentionOnly=false;sharedIdeas=[];sharedIdeasNotice='';ideas=[];ideasStore=null;removedIdeas=[];$('#ideas-undo').hidden=true;previewIDs.clear();failedPreviewIDs.clear();activeView='main';
 for(const name of ['main','feed','ideas']){$('#'+name+'-view').hidden=name!=='main';$('#nav-'+name).setAttribute?.('aria-current',name==='main'?'page':'false');}
 for(const id of ['idea-title','idea-url','idea-project','idea-image-url','idea-notes','feed-area','feed-project','feed-status','ideas-project-filter','ideas-source-filter','ideas-area-filter','ideas-library-filter'])$('#'+id).value='';
 for(const [id,label] of [['feed-area','All areas'],['feed-project','All projects'],['feed-status','All statuses'],['ideas-project-filter','All projects'],['ideas-source-filter','All sources']])$('#'+id).innerHTML=`<option value="">${label}</option>`;
 document.title='Work & Life · Sign in';ideasNotice='';
 $('#project').innerHTML='<option value="">All projects</option>';$('#status').innerHTML='<option value="">All statuses</option>';$('#status').value='';$('#workspace').hidden=true;$('#logout').hidden=true;$('#gate').hidden=false;$('#message').textContent=message;
}
function setOptions(id,values,label){
 const selected=$('#'+id).value;$('#'+id).innerHTML=`<option value="">${label}</option>`+values.map(value=>`<option value="${esc(value)}">${esc(value)}</option>`).join('');$('#'+id).value=values.includes(selected)?selected:'';
}
function showView(name,focus=false){
 if(activeView==='feed'){feedSavedScroll=window.scrollY||0;stopFeed();}
 activeView=['main','feed','ideas'].includes(name)?name:'main';
 for(const view of ['main','feed','ideas']){$('#'+view+'-view').hidden=view!==activeView;$('#nav-'+view).setAttribute?.('aria-current',view===activeView?'page':'false');}
 if(activeView==='feed'){if(!feedInitialized)renderFeed();else scheduleFeed();}if(activeView==='ideas')renderIdeas();
 document.title='Work & Life · '+({main:'Main',feed:'Feed',ideas:'Ideas'})[activeView];
 if(focus){window.history?.replaceState?.(null,'','#'+activeView);const heading=$(activeView==='main'?'#heading':'#'+activeView+'-title');heading.setAttribute?.('tabindex','-1');heading.focus?.({preventScroll:true});window.scrollTo?.({top:activeView==='feed'?feedSavedScroll:0,behavior:'auto'});if(activeView==='feed')scheduleFeed();}
}
function prepareViews(){
 feedRecords=buildFeed(snapshot.tasks,snapshot.logs);attentionOnly=false;feedInitialized=false;
 setOptions('feed-area',[...new Set([...AREAS,...feedRecords.map(item=>item.area)])],'All areas');
 setOptions('feed-project',[...new Set(feedRecords.map(item=>item.project).filter(Boolean))].sort(),'All projects');
 setOptions('feed-status',[...new Set(feedRecords.map(item=>item.status))].sort(),'All statuses');
 ideas=[];ideasNotice='';try{ideasStore=createIdeaStore(window.localStorage);ideas=ideasStore.load();}catch{ideasStore=null;ideasNotice='Device storage is unavailable or could not be read. Additions will last only for this visit; existing saved data has not been replaced.';}
 $('#idea-save').textContent=ideasStore?'Save on this device':'Add for this visit';$('#ideas-message').textContent=ideasNotice;
 showView(window.location?.hash?.slice(1)||'main');
}
function feedFilters(){return {area:$('#feed-area').value,project:$('#feed-project').value,status:$('#feed-status').value,attention:attentionOnly};}
function feedCard(item,index,cycle){return `<article class="feed-card tone-${item.tone}" id="feed-record-${index}" tabindex="-1" aria-posinset="${index+1}" aria-setsize="-1"><small class="review-cycle">Review cycle ${cycle}${cycle>1?' · Same loaded records':''}</small><div class="feed-card-top"><span class="project-badge">${esc(item.project||'No project')}</span><span class="tag">${esc(item.area)}</span><span class="tag">${esc(item.status)}</span></div>${item.attention?`<p class="attention-label">${esc(item.attention)}</p>`:''}<h2>${esc(item.title)}</h2><p class="note">${item.update?`Latest source update · ${esc(item.update)} Bangkok`:'Update time not set in the source'}</p>${item.result?`<p class="feed-result">${esc(item.result)}</p>`:''}<div class="next-action"><strong>Next action</strong><p>${esc(item.nextAction||'Not set in the source Sheet.')}</p></div><div class="links">${[['workingFile','Working file'],['presentingFile','Presentation']].map(([key,label])=>item[key]?`<a href="${esc(item[key])}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`:'').join('')}</div>${item.activity.length?`<details class="feed-activity"><summary>Activity · ${item.activity.length} entr${item.activity.length===1?'y':'ies'}</summary>${item.activity.slice(0,3).map(log=>`<div><small>${esc(log.date)}${log.status?' · '+esc(log.status):''}</small><p>${esc(log.description)}</p>${log.link?`<a href="${esc(log.link)}" target="_blank" rel="noopener noreferrer">Result link ↗</a>`:''}</div>`).join('')}${item.activity.length>3?'<p class="note">Latest 3 entries shown. Full activity is available on Main.</p>':''}</details>`:'<p class="note">No activity entries recorded.</p>'}<small>${esc(item.id)}</small></article>`;}
function stopFeed(){if(feedFrame)window.cancelAnimationFrame?.(feedFrame);feedFrame=0;feedObserver?.disconnect();feedObserver=null;}
function scheduleFeed(){if(!feedLayout||activeView!=='feed'||!feedWindow||feedFrame)return;feedFrame=window.requestAnimationFrame(()=>{feedFrame=0;updateFeedWindow();});}
function updateFeedWindow(){
 if(!feedLayout||activeView!=='feed'||!feedSelection.length)return;
 const host=$('#feed-cards'),root=$('#feed-window');if(!root)return;
 const scroll=window.scrollY||0,hostTop=scroll+host.getBoundingClientRect().top,plan=feedWindow.plan(Math.max(0,scroll-hostTop),window.innerHeight||844);
 const anchor=feedNodes.get(plan.first),before=anchor?.getBoundingClientRect().top;
 host.setAttribute('aria-busy','true');const keep=new Set(plan.slots.map(slot=>slot.index));
 for(const [index,node] of feedNodes)if(!keep.has(index)){if(node.contains(document.activeElement))host.focus({preventScroll:true});feedObserver?.unobserve(node);node.remove();feedNodes.delete(index);}
 for(const slot of plan.slots){if(!feedNodes.has(slot.index)){const wrapper=document.createElement('div');wrapper.innerHTML=feedCard(feedSelection[slot.source],slot.index,slot.cycle);const node=wrapper.firstElementChild;node.dataset.feedIndex=slot.index;const details=node.querySelector('details');if(details)details.open=expandedActivity.has(feedSelection[slot.source].key);feedNodes.set(slot.index,node);feedObserver?.observe(node);}}
 // Reconcile only missing/out-of-order nodes. Existing focused links and details survive scroll.
 let cursor=root.firstElementChild;for(const slot of plan.slots){const node=feedNodes.get(slot.index);if(node===cursor)cursor=cursor.nextElementSibling;else root.insertBefore(node,cursor);}
 const measured=feedWindow.measure(plan.slots.map(slot=>[slot.index,feedNodes.get(slot.index).getBoundingClientRect().height+24]),plan.first);
 $('#feed-top').style.height=(feedWindow.offset(plan.start)-feedWindow.offset(feedWindow.origin))+'px';
 $('#feed-bottom').style.height=(feedWindow.offset(plan.end+8)-feedWindow.offset(plan.end))+'px';
 const correction=before!==undefined&&anchor?.isConnected?anchor.getBoundingClientRect().top-before:plan.delta+measured.correction;
 if(Math.abs(correction)>.5)window.scrollBy({top:correction,behavior:'instant'});
 $('#feed-position').textContent=`${feedSelection.length} loaded records · Review cycle ${plan.cycle}`;
 host.setAttribute('aria-busy','false');
}
function renderFeed(){
 stopFeed();feedNodes.clear();feedInitialized=true;
 const base=filterFeed(feedRecords,{...feedFilters(),attention:false}),attention=base.filter(item=>item.attention);feedSelection=filterFeed(feedRecords,feedFilters());feedWindow=createFeedWindow(feedSelection.length);
 $('#feed-freshness').textContent=$('#freshness').textContent;$('#feed-attention-toggle').setAttribute?.('aria-pressed',String(attentionOnly));
 $('#feed-attention-list').innerHTML=attention.length?`<p class="note">${attention.length} source-flagged item${attention.length===1?'':'s'}${attention.length>5?' · First 5 shown; use attention only for the full list.':''}</p><div class="attention-items">`+attention.slice(0,5).map(item=>`<button data-review-key="${esc(item.key)}"><strong>${esc(item.attention)}</strong><span>${esc(item.title)}</span><small>${esc(item.project||item.area)}</small></button>`).join('')+'</div>':'<p class="empty">No overdue, due-today, waiting, blocked or decision-needed items in these filters.</p>';
 $('#feed-position').textContent=feedSelection.length?`${feedSelection.length} loaded records · Review cycle 1`:'No cards match these filters.';
 $('#feed-cycle-note').textContent='Keep scrolling. Review cycles repeat the loaded records; they are not new updates. At most 24 cards are retained.';
 if(!feedLayout){$('#feed-cards').innerHTML=feedWindow.plan().slots.map(slot=>feedCard(feedSelection[slot.source],slot.index,slot.cycle)).join('')||'<p class="empty">Try another project, status or area.</p>';return;}
 $('#feed-cards').innerHTML=feedSelection.length?'<div id="feed-top" aria-hidden="true"></div><div id="feed-window"></div><div id="feed-bottom" aria-hidden="true"></div>':'<p class="empty">Try another project, status or area.</p>';
 if(window.ResizeObserver){feedObserver=new window.ResizeObserver(scheduleFeed);}
 scheduleFeed();
}
function persistIdeas(next,message){
 try{if(ideasStore)ideasStore.save(next);ideas=next;$('#ideas-message').textContent=message+(ideasStore?' Saved only in this browser profile.':' For this visit only; device storage is unavailable.');renderIdeas();return true;}
 catch{$('#ideas-message').textContent='Could not save on this device. Browser storage may be full or blocked. Your existing library has not been replaced.';return false;}
}
function renderIdeas(){
 const all=[...sharedIdeas,...ideas];$('#ideas-shared-status').textContent=sharedIdeasNotice;
 setOptions('ideas-project-filter',[...new Set(all.map(item=>item.project||'Unassigned'))].sort(),'All projects');
 setOptions('ideas-source-filter',[...new Set(all.map(item=>item.source))].sort(),'All sources');
 $('#idea-project-options').innerHTML=[...new Set([...snapshot.tasks.map(task=>task.project),...ideas.map(item=>item.project)].filter(Boolean))].sort().map(project=>`<option value="${esc(project)}"></option>`).join('');
 const project=$('#ideas-project-filter').value,source=$('#ideas-source-filter').value,area=$('#ideas-area-filter').value,library=$('#ideas-library-filter').value,selected=all.filter(item=>(!project||(item.project||'Unassigned')===project)&&(!source||item.source===source)&&(!area||(area==='device'?!item.shared:item.area===area))&&(!library||(library==='shared'?item.shared:!item.shared))),groups=new Map();
 for(const item of selected){const key=item.project||'Unassigned';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(item);}
 $('#ideas-count').textContent=`${selected.length} of ${all.length} references · ${sharedIdeas.length} shared · ${ideas.length} on this device`;$('#ideas-export').disabled=!ideas.length;
 $('#ideas-grid').innerHTML=selected.length?[...groups].sort(([a],[b])=>a.localeCompare(b)).map(([project,items])=>`<section class="idea-group"><h2>${esc(project)}</h2><div class="idea-grid">`+items.map(item=>`<article class="idea-card tone-${projectTone(project)}"><div class="idea-visual">${item.imageUrl&&failedPreviewIDs.has(item.id)?`<span class="image-fallback">Image unavailable · use the source link below.</span><button data-load-image="${esc(item.id)}">Retry image</button>`:item.imageUrl&&(item.shared||previewIDs.has(item.id))?`<img data-idea-image="${esc(item.id)}" src="${esc(item.imageUrl)}" alt="${esc(item.title)}" ${item.shared&&new URL(item.imageUrl).hostname==='i.pinimg.com'?'':'crossorigin="anonymous"'} referrerpolicy="no-referrer" loading="lazy" decoding="async"><span class="image-fallback" hidden>Image unavailable · use the source link below.</span>`:`<span class="idea-mark" aria-hidden="true">${({Pinterest:'P',Instagram:'◎',TikTok:'♪',Other:'↗'})[item.source]}</span>${item.imageUrl?`<button data-load-image="${esc(item.id)}">Load image</button>`:'<small>Source link · no image saved</small>'}`}</div><div class="idea-body"><small class="idea-library">${item.shared?'Shared Sheet · OM · Read only':'This device only'}</small><span class="tag">${esc(item.source)}</span><h3>${esc(item.title)}</h3>${item.notes?`<p>${esc(item.notes)}</p>`:''}${item.shared&&/video/i.test(item.mediaType)?'<p class="note">Static poster · Open the source to view the video.</p>':''}<small>${esc(new URL(item.url).hostname)}</small><a href="${esc(item.url)}" target="_blank" rel="noopener noreferrer">Open source ↗</a>${item.originalUrl?`<a href="${esc(item.originalUrl)}" target="_blank" rel="noopener noreferrer">Original source ↗</a>`:''}${!item.shared?`<button class="quiet" data-remove-idea="${esc(item.id)}">Remove<span class="sr-only"> ${esc(item.title)}</span></button>`:''}</div></article>`).join('')+'</div></section>').join(''):all.length?'<p class="empty">No references match these filters.</p>':'<div class="ideas-empty"><strong>Your idea library is empty.</strong><p>Shared OM references appear here when your Google account can read the research Sheet. You can also add your own device-local references above.</p></div>';
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
    const [data,research]=await Promise.all([readDashboardData(tokenResponse.access_token,pendingRequest.signal),readOMResearch({accessToken:tokenResponse.access_token,signal:pendingRequest.signal}).then(parseSharedIdeas).then(items=>({items}),error=>({error:error.message}))]);if(requestGeneration!==generation)return;snapshot=parseSnapshot(data);sharedIdeas=research.items||[];sharedIdeasNotice=research.error||`${sharedIdeas.length} references read from private OM research · Read only · Refresh by signing in again.`;
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
function resetFeed(){feedSavedScroll=0;renderFeed();}
for(const id of ['feed-area','feed-project','feed-status'])$('#'+id).onchange=resetFeed;
$('#feed-attention-toggle').onclick=()=>{attentionOnly=!attentionOnly;resetFeed();};
$('#feed-attention-list').onclick=event=>{const button=event.target.closest('[data-review-key]');if(!button)return;attentionOnly=false;resetFeed();const index=feedSelection.findIndex(item=>item.key===button.dataset.reviewKey);if(index<0||!feedLayout)return;const host=$('#feed-cards');window.scrollTo({top:window.scrollY+host.getBoundingClientRect().top+feedWindow.offset(index),behavior:'instant'});scheduleFeed();};
$('#feed-cards').addEventListener?.('toggle',event=>{const details=event.target;if(details.tagName!=='DETAILS')return;const article=details.closest('[data-feed-index]');if(!article||!feedSelection.length)return;const item=feedSelection[Number(article.dataset.feedIndex)%feedSelection.length];if(details.open)expandedActivity.add(item.key);else expandedActivity.delete(item.key);for(const [index,node] of feedNodes)if(feedSelection[index%feedSelection.length].key===item.key){const other=node.querySelector('details');if(other&&other!==details&&other.open!==details.open)other.open=details.open;}scheduleFeed();},true);
window.addEventListener('scroll',scheduleFeed,{passive:true});window.addEventListener('resize',scheduleFeed,{passive:true});
for(const id of ['ideas-project-filter','ideas-source-filter','ideas-area-filter','ideas-library-filter'])$('#'+id).onchange=renderIdeas;
$('#idea-form').onsubmit=event=>{event.preventDefault();try{const next=addIdea(ideas,{id:'idea-'+(window.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)),title:$('#idea-title').value,url:$('#idea-url').value,project:$('#idea-project').value,notes:$('#idea-notes').value,imageUrl:$('#idea-image-url').value,createdAt:new Date().toISOString()});if(persistIdeas(next,'Reference added.'))$('#idea-form').reset?.();}catch(error){$('#ideas-message').textContent=error.message;}};
$('#ideas-grid').onclick=event=>{const load=event.target.closest('[data-load-image]'),remove=event.target.closest('[data-remove-idea]');if(load){failedPreviewIDs.delete(load.dataset.loadImage);previewIDs.add(load.dataset.loadImage);renderIdeas();}if(remove){const item=ideas.find(item=>item.id===remove.dataset.removeIdea);if(!item)return;if(persistIdeas(ideas.filter(other=>other.id!==item.id),'Reference removed. Undo is available until sign-out or reload.')){previewIDs.delete(item.id);removedIdeas.push(item);if(removedIdeas.length>100)removedIdeas.shift();$('#ideas-undo').hidden=false;}}};
$('#ideas-undo').onclick=()=>{if(!removedIdeas.length)return;try{if(persistIdeas(addIdea(ideas,removedIdeas[removedIdeas.length-1]),'Reference restored.')){removedIdeas.pop();$('#ideas-undo').hidden=!removedIdeas.length;}}catch(error){$('#ideas-message').textContent=error.message;}};
$('#ideas-grid').addEventListener?.('error',event=>{if(event.target.tagName!=='IMG')return;event.target.hidden=true;if(event.target.dataset?.ideaImage)failedPreviewIDs.add(event.target.dataset.ideaImage);const fallback=event.target.closest('.idea-visual')?.querySelector('.image-fallback');if(fallback)fallback.hidden=false;},true);
$('#ideas-export').onclick=()=>{if(!ideas.length)return;const url=URL.createObjectURL(new Blob([serializeIdeas(ideas)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='work-life-ideas-'+new Date().toISOString().slice(0,10)+'.json';link.click();URL.revokeObjectURL(url);$('#ideas-message').textContent='Ideas exported. This unencrypted file contains your saved reference URLs and notes; keep it private.';};
window.addEventListener('pagehide',()=>clear());clear('Checking sign-in setup…');connect();
window.addEventListener('hashchange',()=>{if(!$('#workspace').hidden)showView(window.location?.hash?.slice(1)||'main');});
