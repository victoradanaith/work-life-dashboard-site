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
