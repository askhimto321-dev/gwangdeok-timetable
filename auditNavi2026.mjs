import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'vite';
const [input,output]=process.argv.slice(2);
if(!input||!output)throw new Error('NAVI.xlsx and output.json required');
const server=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});
try{
 const {parseSusiNaviWorkbook}=await server.ssrLoadModule('/src/SusiNaviBeta.jsx');
 const {comparisonTracks,resolveMinimumLink}=await server.ssrLoadModule('/src/admissionComparison.js');
 const {evaluateNaviMinimumSafe}=await server.ssrLoadModule('/src/naviMinimum.js');
 const {universityIdentityKey:identity}=await server.ssrLoadModule('/src/universityIdentity.js');
 const bytes=fs.readFileSync(input);
 const data=await parseSusiNaviWorkbook({name:path.basename(input),size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)});
 const student={admissionYear:2028,minimumCatalogRows:[],latestMockGrades:{}};
 const historicalByCampus=new Map();
 for(const row of data.historicalMinimums2026){
  const key=identity(row[1],row[0]);
  if(!historicalByCampus.has(key))historicalByCampus.set(key,[]);
  historicalByCampus.get(key).push(row);
 }
 const detail=[];
 for(const row of data.records)for(const {admissionType,item} of comparisonTracks(row)){
  const target={university:row[3],region:row[1],department:row[5],historicalDepartment:row[4],field:row[6],admissionType,track:item[0],trackYear:2026};
  const scopedData={historicalMinimums2026:historicalByCampus.get(identity(row[3],row[1]))||[],historicalMinimumsLoaded:true};
  const match=resolveMinimumLink({target,data:scopedData,student,identity,evaluateMinimum:value=>evaluateNaviMinimumSafe(value,student)});
  detail.push({university:row[3],region:row[1],unit2026:row[4],unit2027:row[5],field:row[6],type:admissionType,track:item[0],status:match.evaluation.status,minimumYear:match.evaluation.year||'',rule:match.minimum?.[8]||'',minimumTrack:match.minimum?.[3]||'',reason:match.evaluation.reason||''});
 }
 const counts={};for(const row of detail)counts[row.status]=(counts[row.status]||0)+1;
 const result={source:path.basename(input),records:data.records.length,minimum2026:data.historicalMinimums2026.length,minimum2027:data.minimums.length,detail,counts};
 fs.writeFileSync(output,JSON.stringify(result));
 console.log(JSON.stringify({records:result.records,minimum2026:result.minimum2026,minimum2027:result.minimum2027,tracks:detail.length,counts}));
}finally{await server.close();}
