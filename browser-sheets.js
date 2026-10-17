/** Browser-only, read-only access. Google enforces the signed-in user's Sheet ACL. */
export const SHEET_DENIED_MESSAGE='Google denied access to this private Sheet. Choose an account with permission.';
export async function readPrivateSheet({spreadsheetId,accessToken,signal},fetcher=fetch){
 if(!/^[A-Za-z0-9_-]{20,}$/.test(spreadsheetId||''))throw Error('Sheet configuration is unavailable.');
 if(!/^[A-Za-z0-9._~+\/-]+={0,2}$/.test(accessToken||''))throw Error('Sign in with Google to continue.');
 const query=new URLSearchParams();
 for(const range of ['Tasks!A1:P1000',"'Activity Log'!A1:I1000"])query.append('ranges',range);
 query.set('valueRenderOption','FORMATTED_VALUE');
 const response=await fetcher('https://sheets.googleapis.com/v4/spreadsheets/'+encodeURIComponent(spreadsheetId)+'/values:batchGet?'+query,{
  method:'GET',headers:{Authorization:'Bearer '+accessToken},cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal
 });
 if(!response.ok)throw Error([403,404].includes(response.status)?SHEET_DENIED_MESSAGE:'Private data could not be loaded. Sign in again to retry.');
 const data=await response.json();
 if(!Array.isArray(data.valueRanges)||data.valueRanges.length!==2)throw Error('Unexpected Sheet response.');
 const [tasks,activity]=data.valueRanges;
 if(![tasks,activity].every(range=>range&&typeof range==='object'&&(!('values' in range)||Array.isArray(range.values))))throw Error('Unexpected Sheet response.');
 return {values:tasks.values||[],activityValues:activity.values||[],timezone:'Asia/Bangkok',readAt:new Date().toISOString()};
}

/** Existing read-only scope; private OM Sheet sharing remains the access boundary. */
export async function readOMResearch({accessToken,signal},fetcher=fetch){
 if(!/^[A-Za-z0-9._~+\/-]+={0,2}$/.test(accessToken||''))throw Error('Sign in with Google to continue.');
 const query=new URLSearchParams();for(const range of ["'Pinterest Halloween'!A1:H1000","'Sheet1'!A1:C1000"])query.append('ranges',range);
 // Formula strings are data only. The parser accepts only literal HTTPS IMAGE URLs.
 query.set('valueRenderOption','FORMULA');
 const response=await fetcher('https://sheets.googleapis.com/v4/spreadsheets/1yg_i8l-I_z0tREvORStfYEoJSc7tspU-kaJ8MFRhpGY/values:batchGet?'+query,{method:'GET',headers:{Authorization:'Bearer '+accessToken},cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal});
 if(!response.ok)throw Error([403,404].includes(response.status)?'OM research is unavailable to this Google account. Ask the Sheet owner for access, then sign in again.':'OM research could not be loaded. Sign in again to retry.');
 return response.json();
}
