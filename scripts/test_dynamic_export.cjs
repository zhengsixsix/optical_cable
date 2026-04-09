/**
 * 端对端测试：用 mock SLD 数据生成动态 Excel（含 drawing 图形）
 */
const ExcelJS = require('../node_modules/exceljs');
const JSZip   = require('../node_modules/jszip');
const fs      = require('fs');

// ── 复用服务中的逻辑（CJS 版本用于 Node.js 测试）─────────────────

const THIN   = { style: 'thin' };
const MEDIUM = { style: 'medium' };
const DOUBLE = { style: 'double' };
const R_FP=0, R_LAND=1, R_TYPE=2, R_DIST=3, R_ID=4, R_EQUIP=5, R_SEC=6;
const SECTION_ROWS=10, COL_WIDTH=9.36328125, ROW_HEIGHT=13.5;

function getBorder(bdr) {
  if (!bdr) return undefined;
  switch (bdr) {
    case 'thin':  return { top:THIN, bottom:THIN, left:THIN, right:THIN };
    case 'mLR':   return { left:MEDIUM, right:MEDIUM };
    case 'mTLR':  return { top:MEDIUM, left:MEDIUM, right:MEDIUM };
    case 'mBLR':  return { bottom:MEDIUM, left:MEDIUM, right:MEDIUM };
    default: return undefined;
  }
}
function setCell(ws, row, col, value, opts={}) {
  const cell = ws.getCell(row, col);
  cell.value = value;
  cell.font  = { name:'Calibri', size:9, ...(opts.font||{}) };
  cell.alignment = { horizontal:'center', vertical:'middle' };
  if (opts.border) cell.border = opts.border;
}

function buildLayout(table) {
  const equips = [...table.equipments].sort((a,b)=>a.sequence-b.sequence);
  const segs   = [...table.fiberSegments].sort((a,b)=>a.sequence-b.sequence);
  const segTo  = eq => segs.find(s=>s.toEquipmentId===eq.id||s.toName===eq.name);
  const segBetween = (f,t) => segs.find(s=>(s.fromName===f.name)&&(s.toName===t.name));
  const cols=[]; let ci=1;
  const push = d => cols.push({...d, col:++ci});
  const LETTERS='ABCDEFGHIJKLMNOPQRSTUVWXYZ'; let tc=0, fdsDone=false;
  for (let i=0;i<equips.length;i++) {
    const eq=equips[i], prev=equips[i-1];
    if (i===0&&eq.type==='TE') {
      push({kind:'term',equipment:eq,letter:LETTERS[tc++],polarity:'+'});
      if (equips[i+1]?.type==='PFE') {
        const pfe=equips[i+1], s=segBetween(eq,pfe);
        if(s) push({kind:'approach',segment:s});
        push({kind:'bjb',equipment:pfe}); i++; fdsDone=false;
      }
      continue;
    }
    if (eq.type==='TE'&&i===equips.length-1) {
      const s=segTo(eq); if(s) push({kind:'approach',segment:s});
      push({kind:'term',equipment:eq,letter:LETTERS[tc++],polarity:'-'}); continue;
    }
    if (eq.type==='PFE'&&i===equips.length-2) {
      const inSeg=segTo(eq);
      if(inSeg){push({kind:'span',segment:inSeg,mergeNext:true});push({kind:'equip',equipment:eq});}
      else push({kind:'bjb',equipment:eq}); continue;
    }
    if (eq.type==='BU') {
      const s=segTo(eq); if(s) push({kind:'span',segment:s,mergeNext:false});
      push({kind:'bu',equipment:eq}); fdsDone=true; continue;
    }
    const s=segTo(eq);
    if(s){
      if(!fdsDone&&prev&&(prev.type==='TE'||prev.type==='PFE')){push({kind:'first-span',segment:s});fdsDone=true;}
      else push({kind:'span',segment:s,mergeNext:true});
    }
    push({kind:'equip',equipment:eq});
  }
  return cols;
}

function writeSheet(ws, cols, table, startRow=1) {
  const totalCols = cols.length > 0 ? Math.max(...cols.map(c=>c.col))+2 : 20;
  for(let c=1;c<=totalCols;c++) ws.getColumn(c).width=COL_WIDTH;
  for(let r=startRow;r<=startRow+SECTION_ROWS-1;r++) ws.getRow(r).height=ROW_HEIGHT;
  const FBOLD={bold:true}, FFP={size:11};
  for(let rOff=0;rOff<=6;rOff++){
    const rn=startRow+rOff, sz=(rOff===R_FP||rOff===R_SEC)?11:9;
    for(let c=2;c<=totalCols;c++){
      const cell=ws.getCell(rn,c);
      if(!cell.value){cell.font={name:'Calibri',size:sz};cell.alignment={horizontal:'center',vertical:'middle'};}
    }
  }
  const fpLabel = seg => seg?.fiberPairs ? `${seg.fiberPairs}FP` : '';
  const cType   = seg => (seg?.cableType||'').toUpperCase()||'SA';
  for(const c of cols){
    const r=off=>startRow+off, col=c.col;
    switch(c.kind){
      case 'term':
        setCell(ws,r(R_FP),col,null,{font:FFP});
        setCell(ws,r(R_LAND),col,null,{border:getBorder('mTLR')});
        setCell(ws,r(R_TYPE),col,c.letter??'',{border:getBorder('mLR')});
        setCell(ws,r(R_DIST),col,null,{border:getBorder('mLR')});
        setCell(ws,r(R_ID),col,c.polarity?`(${c.polarity})`:'',{border:getBorder('mLR')});
        setCell(ws,r(R_EQUIP),col,null,{border:getBorder('mBLR')});
        setCell(ws,r(R_SEC),col,null,{font:FFP}); break;
      case 'approach': setCell(ws,r(R_LAND),col,'LAND'); setCell(ws,r(R_DIST),col,c.segment.length,{font:FBOLD,border:getBorder('thin')}); break;
      case 'bjb': setCell(ws,r(R_EQUIP),col,c.equipment?.name??'',{font:FBOLD}); break;
      case 'first-span': {const seg=c.segment;
        setCell(ws,r(R_FP),col,fpLabel(seg),{font:FFP});
        setCell(ws,r(R_TYPE),col,`${cType(seg)}(S/E)`,{font:FBOLD});
        setCell(ws,r(R_DIST),col,seg.length,{font:FBOLD,border:getBorder('thin')});
        setCell(ws,r(R_ID),col,seg.id||`${seg.fromName}-${seg.toName}`,{font:FBOLD}); break;}
      case 'span': {const seg=c.segment;
        setCell(ws,r(R_FP),col,fpLabel(seg),{font:FFP});
        setCell(ws,r(R_TYPE),col,cType(seg),{font:FBOLD});
        setCell(ws,r(R_DIST),col,seg.length,{font:FBOLD,border:getBorder('thin')});
        setCell(ws,r(R_ID),col,seg.id||`${seg.fromName}-${seg.toName}`,{font:FBOLD});
        if(c.mergeNext) ws.mergeCells(r(R_DIST),col,r(R_DIST),col+1); break;}
      case 'equip':
        setCell(ws,r(R_TYPE),col,null,{border:{left:DOUBLE,right:THIN}});
        setCell(ws,r(R_ID),col,null,{border:{left:DOUBLE,right:THIN}});
        setCell(ws,r(R_EQUIP),col,c.equipment?.name??'',{font:FBOLD}); break;
      case 'bu':
        setCell(ws,r(R_DIST),col,c.equipment?.name??'BU',{font:FBOLD,border:getBorder('mLR')});
        setCell(ws,r(R_EQUIP),col,c.equipment?.name??'',{font:FBOLD}); break;
    }
  }
}

// ── 提取图形模板 ──────────────────────────────────────────────

const drawingXmlSrc = fs.readFileSync('E:/Desktop/sld_unzip/xl/drawings/drawing1.xml', 'utf8');
function extractAnchor(xml, id) {
  const re = /<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g;
  let m; while ((m=re.exec(xml))!==null) if(m[0].includes(id)) return m[0];
}
function parameterize(xml) {
  // 必须包含 rowOff + 闭合标签，否则会留下残余标签导致 XML 无效
  const fromM = xml.match(/<xdr:from><xdr:col>(\d+)<\/xdr:col><xdr:colOff>\d+<\/xdr:colOff><xdr:row>(\d+)<\/xdr:row><xdr:rowOff>\d+<\/xdr:rowOff><\/xdr:from>/);
  const toM   = xml.match(/<xdr:to><xdr:col>(\d+)<\/xdr:col><xdr:colOff>\d+<\/xdr:colOff><xdr:row>(\d+)<\/xdr:row><xdr:rowOff>\d+<\/xdr:rowOff><\/xdr:to>/);
  let tmpl = xml;
  if(fromM) tmpl=tmpl.replace(fromM[0],'<xdr:from><xdr:col>{{FC}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{FR}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>');
  if(toM)   tmpl=tmpl.replace(toM[0],  '<xdr:to><xdr:col>{{TC}}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>{{TR}}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>');
  let n=0; tmpl=tmpl.replace(/\bid="[^"]+"/g,()=>`id="{{I${n++}}}"`);
  tmpl=tmpl.replace(/\bname="[^"]+"/g,'name="{{N}}"');
  return tmpl;
}

const TPL_REP  = parameterize(extractAnchor(drawingXmlSrc,'Group 8'));
const TPL_TERM = parameterize(extractAnchor(drawingXmlSrc,'Group 1'));
const TPL_MARK = parameterize(extractAnchor(drawingXmlSrc,'Rectangle 23'));
const TPL_ICON = parameterize(extractAnchor(drawingXmlSrc,'\u30b0\u30eb\u30fc\u30d7\u5316 73'));

function fillTpl(tmpl, fc, fr, tc, tr, idBase, name) {
  let s = tmpl;
  s = s.replace(/\{\{FC\}\}/g, fc).replace(/\{\{FR\}\}/g, fr)
        .replace(/\{\{TC\}\}/g, tc).replace(/\{\{TR\}\}/g, tr)
        .replace(/\{\{N\}\}/g, name);
  let id = idBase;
  s = s.replace(/\{\{I\d+\}\}/g, () => String(id++));
  return s;
}

function generateDrawingXml(layout) {
  const shapes=[]; let idBase=200;
  for(const c of layout){
    const col0=c.col-1;
    const fc=col0-1, tc=col0, fr=R_TYPE, tr=R_EQUIP;
    if(c.kind==='bjb'||c.kind==='equip'){
      const isShore = c.kind==='bjb'||c.equipment?.type==='PFE';
      shapes.push(fillTpl(isShore?TPL_TERM:TPL_REP, fc, fr, tc, tr, idBase, c.equipment?.name||'eq'));
      idBase+=10;
    } else if(c.kind==='bu'){
      shapes.push(fillTpl(TPL_MARK, fc, R_LAND, tc, R_EQUIP, idBase, c.equipment?.name||'BU'));
      idBase+=5;
      shapes.push(fillTpl(TPL_ICON, fc, R_FP, tc+1, R_TYPE+1, idBase, c.equipment?.name||'BU_icon'));
      idBase+=50;
    }
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
${shapes.join('\n')}
</xdr:wsDr>`;
}

async function injectDrawing(xlsxBuf, drawingXml) {
  const zip = await JSZip.loadAsync(xlsxBuf);
  zip.file('xl/drawings/drawing1.xml', drawingXml);
  zip.file('xl/drawings/_rels/drawing1.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
  const relsPath='xl/worksheets/_rels/sheet1.xml.rels';
  let relsXml='';
  try{relsXml=await zip.file(relsPath).async('string');}catch{}
  if(!relsXml) relsXml='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  if(!relsXml.includes('rId_drawing1')){
    relsXml=relsXml.replace('</Relationships>',
      '<Relationship Id="rId_drawing1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>');
    zip.file(relsPath, relsXml);
  }
  let sheetXml=await zip.file('xl/worksheets/sheet1.xml').async('string');
  if(!sheetXml.includes('<drawing')){
    sheetXml=sheetXml.replace('</worksheet>','<drawing r:id="rId_drawing1"/></worksheet>');
    zip.file('xl/worksheets/sheet1.xml', sheetXml);
  }
  let ctXml=await zip.file('[Content_Types].xml').async('string');
  const drawCT='application/vnd.openxmlformats-officedocument.drawing+xml';
  if(!ctXml.includes(drawCT)){
    ctXml=ctXml.replace('</Types>',`<Override PartName="/xl/drawings/drawing1.xml" ContentType="${drawCT}"/></Types>`);
    zip.file('[Content_Types].xml', ctXml);
  }
  return zip.generateAsync({type:'nodebuffer', compression:'DEFLATE'});
}

// ── Mock 数据（上海-冲绳） ──────────────────────────────────────

const table = {
  name:'上海-冲绳海缆',
  equipments:[
    {id:'e1',sequence:1,name:'上海终端站',type:'TE',kp:0,longitude:0,latitude:0,depth:0,specifications:'',remarks:''},
    {id:'e2',sequence:2,name:'PFE-SH',type:'PFE',kp:0.5,longitude:0,latitude:0,depth:15,specifications:'',remarks:''},
    {id:'e3',sequence:3,name:'REP-01',type:'REP',kp:160,longitude:0,latitude:0,depth:850,specifications:'',remarks:''},
    {id:'e4',sequence:4,name:'REP-02',type:'REP',kp:320,longitude:0,latitude:0,depth:2500,specifications:'',remarks:''},
    {id:'e5',sequence:5,name:'REP-03',type:'REP',kp:480,longitude:0,latitude:0,depth:2800,specifications:'',remarks:''},
    {id:'e6',sequence:6,name:'BU-01',type:'BU',kp:520,longitude:0,latitude:0,depth:1500,specifications:'',remarks:''},
    {id:'e7',sequence:7,name:'PFE-OK',type:'PFE',kp:649,longitude:0,latitude:0,depth:20,specifications:'',remarks:''},
    {id:'e8',sequence:8,name:'冲绳终端站',type:'TE',kp:650,longitude:0,latitude:0,depth:0,specifications:'',remarks:''},
  ],
  fiberSegments:[
    {id:'seg1',sequence:1,fromEquipmentId:'e1',toEquipmentId:'e2',fromName:'上海终端站',toName:'PFE-SH',length:0.5,fiberPairs:8,fiberPairType:'working',cableType:'DA',attenuation:0.2,totalLoss:0.1,remarks:''},
    {id:'seg2',sequence:2,fromEquipmentId:'e2',toEquipmentId:'e3',fromName:'PFE-SH',toName:'REP-01',length:159.5,fiberPairs:8,fiberPairType:'working',cableType:'SA',attenuation:0.2,totalLoss:31.9,remarks:''},
    {id:'seg3',sequence:3,fromEquipmentId:'e3',toEquipmentId:'e4',fromName:'REP-01',toName:'REP-02',length:160,fiberPairs:8,fiberPairType:'working',cableType:'LW',attenuation:0.2,totalLoss:32.0,remarks:''},
    {id:'seg4',sequence:4,fromEquipmentId:'e4',toEquipmentId:'e5',fromName:'REP-02',toName:'REP-03',length:160,fiberPairs:8,fiberPairType:'working',cableType:'LW',attenuation:0.2,totalLoss:32.0,remarks:''},
    {id:'seg5',sequence:5,fromEquipmentId:'e5',toEquipmentId:'e6',fromName:'REP-03',toName:'BU-01',length:40,fiberPairs:8,fiberPairType:'working',cableType:'LW',attenuation:0.2,totalLoss:8.0,remarks:''},
    {id:'seg6',sequence:6,fromEquipmentId:'e6',toEquipmentId:'e7',fromName:'BU-01',toName:'PFE-OK',length:129,fiberPairs:8,fiberPairType:'working',cableType:'SA',attenuation:0.2,totalLoss:25.8,remarks:''},
    {id:'seg7',sequence:7,fromEquipmentId:'e7',toEquipmentId:'e8',fromName:'PFE-OK',toName:'冲绳终端站',length:1,fiberPairs:8,fiberPairType:'working',cableType:'DA',attenuation:0.2,totalLoss:0.2,remarks:''},
  ],
  transmissionParams:{designCapacity:100,wavelengths:96,channelSpacing:50,modulationFormat:'16QAM',launchPower:1,osnrRequired:20,spanLossBudget:20,systemMargin:3},
  metadata:{totalLength:650,totalEquipments:8,terminalCount:2,repeaterCount:3,branchingUnitCount:1,jointCount:0,totalFiberPairs:8,estimatedCapacity:100},
};

async function main() {
  console.log('1. Building layout...');
  const layout = buildLayout(table);
  console.log('   Columns:', layout.map(c=>`C${c.col}[${c.kind}]`).join(' '));

  console.log('2. Generating cells...');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Trunk', {pageSetup:{orientation:'landscape'}});
  writeSheet(ws, layout, table, 1);

  console.log('3. Generating drawing XML...');
  const drawingXml = generateDrawingXml(layout);
  console.log('   Drawing XML size:', drawingXml.length, 'bytes');
  console.log('   Shapes:', (drawingXml.match(/<xdr:twoCellAnchor/g)||[]).length);

  console.log('4. Writing xlsx...');
  const xlsxBuf = await wb.xlsx.writeBuffer();

  console.log('5. Injecting drawing...');
  const finalBuf = await injectDrawing(xlsxBuf, drawingXml);
  fs.writeFileSync('E:/Desktop/SLD_dynamic_test.xlsx', finalBuf);
  console.log('6. Done! → E:/Desktop/SLD_dynamic_test.xlsx (' + finalBuf.length + ' bytes)');
}
main().catch(e=>console.error(e.stack));
