/** Normalizes private Sheet rows in memory; contains no records. */
export const AREAS=['MSPS Works','OM','OTT','Personal'];
const text=value=>String(value??'').trim();
export function dateOnly(value){
 const raw=text(value),iso=/^(\d{4})-(\d{2})-(\d{2})(?:[ T].*)?$/.exec(raw),local=/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T].*)?$/.exec(raw);
 if(!iso&&!local)return '';
 const [,year,month,day]=iso||[local[0],local[3],local[2],local[1]],date=`${year}-${month}-${day}`;
 const parsed=new Date(`${date}T00:00:00Z`);return !Number.isNaN(parsed.valueOf())&&parsed.toISOString().slice(0,10)===date?date:'';
}
export function safeLink(value){try{const url=new URL(text(value));return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}}
export function parseSnapshot(data){
 if(!Array.isArray(data?.values)||data.values.length>1000||!data.values.every(Array.isArray))throw Error('Unexpected task Sheet response.');
 const taskIDs=new Set(),tasks=[];
 for(const row of data.values.slice(1)){
  const id=text(row[10]),title=text(row[2]);if(!id||!title)continue;if(taskIDs.has(id))throw Error('Duplicate task IDs in the source Sheet.');taskIDs.add(id);
  const sourceStatus=text(row[11]),status=({'Doing':'In progress','In progress':'In progress','Done':'Done','Waiting':'Waiting','To do':'To do','Todo':'To do'})[sourceStatus]||sourceStatus||'Not set';
  tasks.push({id,title,area:text(row[0])==='MSPS'?'MSPS Works':text(row[0])||'Uncategorized',project:text(row[1]),status,sourceStatus,priority:'Not set',start:text(row[5]),due:dateOnly(row[7]),completed:dateOnly(row[12]),nextAction:text(row[13]),result:text(row[14]),updated:text(row[15]),workingFile:safeLink(row[3]),presentingFile:safeLink(row[4])});
 }
 const values=data.activityValues??[];if(!Array.isArray(values)||values.length>1000||!values.every(Array.isArray))throw Error('Unexpected activity Sheet response.');
 const logIDs=new Set(),logs=[];
 for(const row of values.slice(1)){const id=text(row[0]);if(!id)continue;if(logIDs.has(id))throw Error('Duplicate activity IDs in the source Sheet.');logIDs.add(id);logs.push({id,taskID:text(row[1]),date:text(row[2]),description:text(row[3]),from:text(row[4]),status:text(row[5]),hours:text(row[6]),link:safeLink(row[7])});}
 return {tasks,logs,readAt:data.readAt};
}
export function selectTasks(tasks,{area='',project='',status=''}={}){return tasks.filter(task=>(!area||task.area===area)&&(!project||task.project===project)&&(!status||task.status===status));}
export function totals(tasks){const done=tasks.filter(task=>task.status==='Done').length;return {total:tasks.length,done,open:tasks.length-done,doing:tasks.filter(task=>task.status==='In progress').length};}
export function projectProgress(tasks){const grouped=new Map();for(const task of tasks){const key=task.project||'No project';if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(task);}return [...grouped].map(([name,records])=>({name,...totals(records)}));}
export function upcomingDeadlines(tasks){return tasks.filter(task=>task.due&&task.status!=='Done').sort((a,b)=>a.due.localeCompare(b.due));}

export const FEED_PAGE_SIZE=8,IDEAS_LIMIT=100,IDEAS_KEY='worklife.ideas.v1';
export function projectTone(name=''){
 let hash=0;for(const character of name)hash=(hash*31+character.charCodeAt(0))>>>0;return hash%6;
}
function sourceStamp(value){
 const date=dateOnly(value);if(!date)return 0;
 const time=/(?:T|\s)(\d{2}):(\d{2})/.exec(text(value));
 return Date.parse(date+'T00:00:00Z')+(time?Number(time[1])*3600000+Number(time[2])*60000:0);
}
export function attentionFor(task,now=new Date()){
 if(task.status==='Done')return '';
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const part=type=>parts.find(p=>p.type===type).value,today=`${part('year')}-${part('month')}-${part('day')}`;
 if(task.due&&task.due<today)return 'Overdue · '+task.due;
 if(task.due===today)return 'Due today · '+task.due;
 if(/^(?:decision needed|needs decision|pending decision|awaiting decision)$/i.test(task.status))return 'Decision needed';
 if(task.status==='Waiting')return 'Waiting';
 if(task.status==='Blocked')return 'Blocked';
 if(task.priority==='Urgent')return 'Urgent priority';
 return '';
}
export function buildFeed(tasks,logs,now=new Date()){
 const byTask=new Map(),known=new Set(tasks.map(task=>task.id));
 for(const log of logs){if(!byTask.has(log.taskID))byTask.set(log.taskID,[]);byTask.get(log.taskID).push(log);}
 const records=tasks.map(task=>{
  const activity=(byTask.get(task.id)||[]).slice().sort((a,b)=>sourceStamp(b.date)-sourceStamp(a.date)||b.id.localeCompare(a.id));
  const update=[task.updated,activity[0]?.date].filter(Boolean).sort((a,b)=>sourceStamp(b)-sourceStamp(a))[0]||'';
  return {...task,key:'task-'+task.id,activity,update,stamp:sourceStamp(update),attention:attentionFor(task,now),tone:projectTone(task.project)};
 });
 for(const log of logs)if(!known.has(log.taskID))records.push({key:'log-'+log.id,id:log.taskID||log.id,title:'Activity record · '+(log.taskID||log.id),area:'Uncategorized',project:'',status:log.status||'Not set',nextAction:'',workingFile:'',presentingFile:'',activity:[log],update:log.date,stamp:sourceStamp(log.date),attention:'',tone:projectTone('')});
 return records.sort((a,b)=>b.stamp-a.stamp||a.key.localeCompare(b.key));
}
export function filterFeed(records,{area='',project='',status='',attention=false}={}){
 return records.filter(record=>(!area||record.area===area)&&(!project||record.project===project)&&(!status||record.status===status)&&(!attention||record.attention));
}
export function feedPage(records,start=0,cycle=1){
 const offset=Math.max(0,Math.min(Math.floor(Number(start)||0),Math.max(0,records.length-1)));
 return {items:records.slice(offset,offset+FEED_PAGE_SIZE),start:offset,end:Math.min(offset+FEED_PAGE_SIZE,records.length),total:records.length,cycle:Math.max(1,Number(cycle)||1),previous:offset>0,next:offset+FEED_PAGE_SIZE<records.length};
}
export function ideaSource(value){
 const hostname=new URL(value).hostname.toLowerCase();
 if(hostname==='pin.it'||hostname==='pinterest.com'||hostname.endsWith('.pinterest.com'))return 'Pinterest';
 if(hostname==='instagram.com'||hostname.endsWith('.instagram.com'))return 'Instagram';
 if(hostname==='tiktok.com'||hostname.endsWith('.tiktok.com'))return 'TikTok';
 return 'Other';
}
export function normalizeIdea(input){
 if(!input||typeof input!=='object')throw Error('Enter a reference title and HTTPS source URL.');
 const url=safeLink(input.url),imageUrl=input.imageUrl?safeLink(input.imageUrl):'',title=text(input.title),id=text(input.id),createdAt=text(input.createdAt);
 if(!url||!title||title.length>120||text(input.notes).length>1000||text(input.project).length>120||url.length>2048||imageUrl.length>2048)throw Error('Use a title up to 120 characters and a valid HTTPS source URL.');
 if(input.imageUrl&&!imageUrl)throw Error('The optional image URL must use HTTPS without embedded credentials.');
 if(!/^idea-[a-zA-Z0-9-]{1,80}$/.test(id)||!Number.isFinite(Date.parse(createdAt)))throw Error('Invalid local reference record.');
 return {id,title,url,source:ideaSource(url),project:text(input.project),notes:text(input.notes),imageUrl,createdAt};
}
export function parseIdeas(raw){
 if(!raw)return [];
 const data=JSON.parse(raw);if(data.version!==1||!Array.isArray(data.items)||data.items.length>IDEAS_LIMIT)throw Error('Saved Ideas format is not supported.');
 const items=data.items.map(normalizeIdea);if(new Set(items.map(item=>item.id)).size!==items.length||new Set(items.map(item=>item.url)).size!==items.length)throw Error('Saved Ideas contains duplicate records.');return items;
}
export function serializeIdeas(items){
 if(!Array.isArray(items)||items.length>IDEAS_LIMIT)throw Error('This device library holds up to 100 references.');
 return JSON.stringify({version:1,items:items.map(normalizeIdea)});
}
export function addIdea(items,input){
 const item=normalizeIdea(input);if(items.length>=IDEAS_LIMIT)throw Error('This device library holds up to 100 references. Export a backup or remove a reference first.');
 if(items.some(existing=>existing.url===item.url))throw Error('This source URL is already saved on this device.');return [item,...items];
}
export function createIdeaStore(storage){
 return {load(){return parseIdeas(storage.getItem(IDEAS_KEY));},save(items){storage.setItem(IDEAS_KEY,serializeIdeas(items));}};
}
