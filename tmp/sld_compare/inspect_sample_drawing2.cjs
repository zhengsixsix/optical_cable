const fs = require('fs');
const file = 'E:/xianyu/海底光缆/tmp/sld_compare/sample/xl/drawings/drawing2.xml';
const xml = fs.readFileSync(file,'utf8');
const blocks = xml.match(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g) || [];
const pats = [
  'prst=\"diamond\"',
  'prst=\"mathDivide\"',
  'prst=\"line\"',
  'prst=\"rect\"',
  'snip2SameRect',
  'diagCross',
  'FFD200',
  'a:noFill',
  'a:custGeom',
];
console.log('count', blocks.length);
for (let i=0;i<blocks.length;i++){
  const b = blocks[i];
  const name = (b.match(/<xdr:cNvPr[^>]*name=\"([^\"]+)\"/)||[])[1]||'';
  const from = (b.match(/<xdr:from><xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/)||[]);
  const hit = pats.filter(p=>b.includes(p));
  console.log(JSON.stringify({i,name,fromCol:from[1]?Number(from[1]):-1,fromRow:from[2]?Number(from[2]):-1,hit},null,0));
}
