import fs from 'node:fs';
import {createServer} from 'vite';
import * as XLSX from 'xlsx';
const server=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});
try{
 const catalog=await server.ssrLoadModule('/src/minimumCatalog.js');
 const workbook=XLSX.read(fs.readFileSync('../upload/대학별_전형별_수능최저_2027_2028(1).xlsx'),{type:'buffer'});
 const parsed=catalog.parseMinimumWorkbook(workbook,XLSX);
 const again=catalog.normalizeMinimumCatalog(parsed.rows);
 if(again.some((r,i)=>r.reviewStatus!==parsed.rows[i].reviewStatus||r.mandatory!==parsed.rows[i].mandatory))throw new Error('Normalization is not idempotent');
 if(parsed.errors.length||parsed.rows.length!==799)throw new Error(`Catalog errors=${parsed.errors.length}, rows=${parsed.rows.length}`);
 fs.writeFileSync('../outputs/kd99/rows.json',JSON.stringify(parsed.rows));
 console.log(catalog.minimumCatalogStats(parsed.rows));
}finally{await server.close();}
