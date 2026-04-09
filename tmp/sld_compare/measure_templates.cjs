const fs = require('fs');
const xml = fs.readFileSync('E:/xianyu/海底光缆/tmp/sld_compare/sample/xl/drawings/drawing2.xml','utf8');
const blocks = xml.match(/<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g) || [];
for (const n of ['グループ化 314','正方形/長方形 317','Group 19','Group 1','Group 8']) {
  const idx = blocks.findIndex(b=>b.includes(`name=\"${n}\"`));
  if (idx < 0) continue;
  const b = blocks[idx];
  const from = b.match(/<xdr:from><xdr:col>(\d+)<\/xdr:col><xdr:colOff>(\d+)<\/xdr:colOff><xdr:row>(\d+)<\/xdr:row><xdr:rowOff>(\d+)<\/xdr:rowOff><\/xdr:from>/);
  const to = b.match(/<xdr:to><xdr:col>(\d+)<\/xdr:col><xdr:colOff>(\d+)<\/xdr:colOff><xdr:row>(\d+)<\/xdr:row><xdr:rowOff>(\d+)<\/xdr:rowOff><\/xdr:to>/);
  console.log(JSON.stringify({name:n,idx,from:from?from.slice(1).map(Number):null,to:to?to.slice(1).map(Number):null,len:b.length},null,2));
}
