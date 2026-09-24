import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createServer} from 'vite';
import * as XLSX from 'xlsx';

const server=await createServer({logLevel:'silent',server:{middlewareMode:true},appType:'custom'});
try {
 const m=await server.ssrLoadModule('/src/minimumCatalog.js');
 const file='../outputs/kd100/대학별_전형별_수능최저_2027_2028_패치100.xlsx';
 const bytes=fs.readFileSync(file);
 // Match the browser path: file.arrayBuffer() + XLSX.read(type:'array').
 const book=XLSX.read(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),{type:'array',cellDates:false});
 const parsed=m.parseMinimumWorkbook(book,XLSX);
 assert.deepEqual(parsed.errors,[]);
 assert.deepEqual(parsed.stats,{total:804,ready:740,review:50,disabled:14});
 assert(parsed.rows.every(r=>r.season==='수시'));
 const by=id=>parsed.rows.find(r=>r.id===id);
 assert.equal(by('MIN-b16e38deb53f6d96').reviewStatus,'사용안함');
 assert.equal(by('MIN-5105ee62984f1264').ruleType,'각');
 assert.equal(by('MIN-827f7d8c7e1651e5').reviewStatus,'계산가능');
 const student=grades=>({admissionYear:2028,latestMockGrades:{국어:5,수학:4,영어:3,통합사회:3,통합과학:4,한국사:2,...grades}});
 assert.equal(m.evaluateCatalogMinimum(by('MIN-827f7d8c7e1651e5'),student({수학:4,통합사회:4})).status,'satisfied');
 assert.equal(m.evaluateCatalogMinimum(by('MIN-0db9fcfb28f9d6f7'),student({국어:2,수학:5,통합사회:2})).status,'satisfied');
 assert.equal(m.evaluateCatalogMinimum(by('MIN-0db9fcfb28f9d6f7'),student({국어:5,수학:2,통합사회:3})).status,'satisfied');
 assert.equal(m.evaluateCatalogMinimum(by('MIN-0db9fcfb28f9d6f7'),student({국어:5,수학:5,통합사회:5,통합과학:5})).status,'unsatisfied');
 assert.equal(m.evaluateCatalogMinimum(by('MIN-3b07bc3d9c83f81a'),student({국어:2,수학:5,영어:5,통합사회:5,통합과학:5})).status,'satisfied');
 assert.equal(m.evaluateCatalogMinimum(by('MIN-8316d1a66ef67949'),student({국어:2,수학:2,영어:3,통합사회:9,통합과학:9,한국사:4})).status,'satisfied');
 const oldRows=m.normalizeMinimumCatalog(JSON.parse(fs.readFileSync('src/minimumCatalogSeed.json','utf8')));
 const diff=m.mergeMinimumCatalog(oldRows,parsed.rows);
 assert.equal(diff.rows.length,804);
 console.log('Patch100 upload/browser-array roundtrip, 804 rows, alternatives and representative rules passed');
} finally {await server.close();}
