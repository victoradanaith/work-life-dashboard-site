import {AREAS,parseSnapshot,selectTasks,totals,projectProgress,upcomingDeadlines} from './secure-model.js';
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
function clear(message='Signed out. Sign in to continue.'){
 generation++;clearTimeout(expiry);pendingRequest?.abort();pendingRequest=null;snapshot={tasks:[],logs:[]};category='';
 for(const id of ['cards','areas','metrics','deadlines','projects','activity-list'])$('#'+id).replaceChildren();
 for(const id of ['freshness','count','log-count'])$('#'+id).textContent='';
 $('#project').innerHTML='<option value="">All projects</option>';$('#status').innerHTML='<option value="">All statuses</option>';$('#status').value='';$('#workspace').hidden=true;$('#logout').hidden=true;$('#gate').hidden=false;$('#message').textContent=message;
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
    $('#gate').hidden=true;$('#workspace').hidden=false;$('#logout').hidden=false;render();
   }catch(error){if(requestGeneration===generation)clear(error.message===DENIED_MESSAGE?error.message:'Private data could not be loaded. Sign in again to retry.');}
   finally{tokenResponse.access_token='';if(requestGeneration===generation)pendingRequest=null;}
  },error_callback:()=>clear('Google sign-in was cancelled or blocked. Try again.')});
  $('#signin').disabled=false;$('#message').textContent=SIGNIN_MESSAGE;$('#signin').onclick=()=>client.requestAccessToken({prompt:'select_account'});
 }catch{clear('Sign-in service is unavailable. No private data has been loaded.');}
}
$('#logout').onclick=()=>clear();$('#overview').onclick=()=>{category='';render();};$('#project').onchange=render;$('#status').onchange=render;$('#areas').onclick=event=>{const button=event.target.closest('[data-area]');if(button){category=button.dataset.area;render();}};
window.addEventListener('pagehide',()=>clear());clear('Checking sign-in setup…');connect();
