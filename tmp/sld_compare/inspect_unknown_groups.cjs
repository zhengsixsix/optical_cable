const fs = require('fs');
const xml = fs.readFileSync('E:/xianyu/海底光缆/tmp/sld_compare/sample/xl/drawings/drawing2.xml','utf8');
const blocks = xml.match(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g) || [];
for (let i=0;i<blocks.length;i++){
  const b = blocks[i];
  const name = (b.match(/<xdr:cNvPr[^>]*name=\"([^\"]+)\"/)||[])[1]||'';
  const from = (b.match(/<xdr:from><xdr:col>(\d+)<\/xdr:col>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/)||[]);
  const prsts = [...b.matchAll(/<a:prstGeom prst=\"([^\"]+)\"/g)].map(m=>m[1]);
  const colors = [...new Set([...b.matchAll(/<a:srgbClr val=\"([^\"]+)\"/g)].map(m=>m[1]))];
  const hasNoFill = b.includes('<a:noFill/>');
  const hasCust = b.includes('<a:custGeom>');
  const hasMathDivide = b.includes('mathDivide');
  const hasDiagCross = b.includes('diagCross');
  const hasLine = prsts.includes('line') || b.includes('<a:lnTo>');
  if (name.includes('314') || name.includes('317') || name.includes('318') || name.includes('321') || name.includes('322') || name.includes('325') || name.includes('326') || name.includes('329') || name==='Group 19') {
    console.log(JSON.stringify({i,name,fromCol:from[1]?Number(from[1]):-1,fromRow:from[2]?Number(from[2]):-1,prsts,colors,hasNoFill,hasCust,hasMathDivide,hasDiagCross,hasLine},null,2));
  }
}
