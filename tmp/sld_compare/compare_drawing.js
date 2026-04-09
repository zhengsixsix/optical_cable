const fs = require('fs');
const path = require('path');

function parse(file){
  const xml = fs.readFileSync(file,'utf8');
  const blocks = xml.match(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g) || [];
  const rows = [];
  for (const b of blocks){
    const from = b.match(/<xdr:from><xdr:col>(\d+)<\/xdr:col><xdr:colOff>\d+<\/xdr:colOff><xdr:row>(\d+)<\/xdr:row>/);
    const to = b.match(/<xdr:to><xdr:col>(\d+)<\/xdr:col><xdr:colOff>\d+<\/xdr:colOff><xdr:row>(\d+)<\/xdr:row>/);
    const nameMatch = b.match(/<xdr:cNvPr[^>]*name=\"([^\"]+)\"/);
    const name = nameMatch ? nameMatch[1] : '';

    let kind = 'OTHER';
    if (b.includes('prst=\"diamond\"') && b.includes('<a:noFill/>')) kind = 'JB_HOLLOW';
    else if (b.includes('pattFill prst=\"diagCross\"') && b.includes('1D4ED8')) kind = 'EQ_BLUE';
    else if (b.includes('pattFill prst=\"diagCross\"') && b.includes('B91C1C')) kind = 'EQ_RED';
    else if (b.includes('333333') && b.includes('alpha')) kind = 'BU_MARKER';
    else if (b.includes('snip2SameRect') && b.includes('FFD200')) kind = 'BU_ICON';
    else if (b.includes('<a:custGeom>') && b.includes('<a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val=\"FFFFFF\"/></a:solidFill>')) kind = 'TERM_HEX';
    else if (b.includes('<a:custGeom>') && b.includes('<a:prstGeom prst=\"rect\"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val=\"000000\"/></a:solidFill>')) kind = 'REP_HEX';

    rows.push({
      fromCol: from ? Number(from[1]) : -1,
      fromRow: from ? Number(from[2]) : -1,
      toCol: to ? Number(to[1]) : -1,
      toRow: to ? Number(to[2]) : -1,
      name,
      kind,
      len: b.length,
    });
  }
  return rows;
}

const base = 'E:/xianyu/海底光缆/tmp/sld_compare';
const sample = parse(path.join(base,'sample/xl/drawings/drawing1.xml'));
const current = parse(path.join(base,'current/xl/drawings/drawing1.xml'));

function summarize(rows){
  const byKind = {};
  for (const r of rows){
    byKind[r.kind] = (byKind[r.kind]||0)+1;
  }
  const names = rows.map(r=>({kind:r.kind,name:r.name,fromCol:r.fromCol,fromRow:r.fromRow,toCol:r.toCol,toRow:r.toRow}));
  return {count: rows.length, byKind, names};
}

const out = { sample: summarize(sample), current: summarize(current) };
fs.writeFileSync(path.join(base,'drawing1_summary.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(JSON.stringify({
  sampleCount: out.sample.count,
  currentCount: out.current.count,
  sampleByKind: out.sample.byKind,
  currentByKind: out.current.byKind,
}, null, 2));
