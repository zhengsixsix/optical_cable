const fs = require('fs');
const xml = fs.readFileSync('E:/xianyu/海底光缆/tmp/sld_compare/sample/xl/drawings/drawing1.xml','utf8');
const blocks = xml.match(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g) || [];

function summarizeBlock(name, idx){
  const b = blocks[idx];
  const shapeParts = b.match(/<xdr:sp[\s\S]*?<\/xdr:sp>/g) || [];
  const fills = [];
  for (const sp of shapeParts){
    const prst = (sp.match(/<a:prstGeom prst=\"([^\"]+)\"/)||[])[1] || (sp.includes('<a:custGeom>')?'custGeom':'');
    const noFill = sp.includes('<a:noFill/>');
    const solid = [...sp.matchAll(/<a:srgbClr val=\"([^\"]+)\"/g)].map(m=>m[1]);
    const patt = (sp.match(/<a:pattFill prst=\"([^\"]+)\"/)||[])[1] || '';
    fills.push({prst,noFill,patt,solid});
  }
  console.log('---',name,'idx',idx,'spCount',shapeParts.length);
  console.log(JSON.stringify(fills,null,2));
}

// pick first occurrence indexes
const names = ['Group 1','Group 5','Group 8','Rectangle 23','Group 19','グループ化 73'];
for(const n of names){
  const idx = blocks.findIndex(b=>b.includes(`name=\"${n}\"`));
  if(idx>=0) summarizeBlock(n, idx);
}
