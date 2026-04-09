const fs = require('fs');

function analyzeDrawing(file, label) {
  const xml = fs.readFileSync(file, 'utf8');
  const anchors = [];
  const re = /<xdr:twoCellAnchor[\s\S]*?<\/xdr:twoCellAnchor>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const block = m[0];
    const from = block.match(/<xdr:from><xdr:col>(\d+)<\/xdr:col><xdr:colOff>(\d+)<\/xdr:colOff><xdr:row>(\d+)/);
    const to   = block.match(/<xdr:to><xdr:col>(\d+)<\/xdr:col><xdr:colOff>(\d+)<\/xdr:colOff><xdr:row>(\d+)/);
    const names = [];
    const nameRe = /name="([^"]+)"/g; let nm;
    while ((nm = nameRe.exec(block)) !== null) names.push(nm[1]);
    const hasHex      = block.includes('Freeform');
    const hasRect23   = block.includes('Rectangle 23');
    const grpCount    = (block.match(/<xdr:grpSp>/g) || []).length;
    const hasEllipse  = block.includes('prst="ellipse"');
    const hasTrapez   = block.includes('prst="trapezoid"');
    const hasGradient = block.includes('<a:gradFill');
    const hasBowTie   = block.includes('prst="mathDivide"') || block.includes('custGeom') && block.includes('bowTie');
    let type = 'OTHER';
    if (grpCount > 2) type = 'BU_ICON_or_OADM';
    else if (hasRect23 || (block.includes('333333') && block.includes('alpha'))) type = 'BU_MARKER';
    else if (hasHex && grpCount >= 1) type = 'REP_HEX_GROUP';
    else if (block.includes('txBox')) type = 'TEXT_BOX';
    anchors.push({
      fromCol: from ? +from[1] : -1,
      fromColOff: from ? +from[2] : 0,
      fromRow: from ? +from[3] : -1,
      toCol: to ? +to[1] : -1,
      toRow: to ? +to[3] : -1,
      name: names[0] || '',
      type,
      grpCount,
      hasHex, hasEllipse, hasTrapez, hasGradient,
      xmlLen: block.length,
    });
  }
  console.log('\n=== ' + label + ' (' + anchors.length + ' anchors) ===');
  anchors.forEach((a, i) => {
    console.log(i + ': [' + a.type + '] col' + a.fromCol + '->col' + a.toCol +
      ' row' + a.fromRow + '->row' + a.toRow +
      ' grp=' + a.grpCount +
      (a.hasHex ? ' HEX' : '') + (a.hasEllipse ? ' ELLP' : '') +
      (a.hasTrapez ? ' TRAP' : '') + (a.hasGradient ? ' GRAD' : '') +
      ' "' + a.name + '"' +
      ' xml=' + a.xmlLen + 'b');
  });
  return anchors;
}

const t = analyzeDrawing('E:/Desktop/sld_unzip/xl/drawings/drawing1.xml', 'Trunk drawing1');
const b = analyzeDrawing('E:/Desktop/sld_unzip/xl/drawings/drawing2.xml', 'Branch drawing2');

// 保存用于后续处理
fs.writeFileSync('E:/xianyu/\u6d77\u5e95\u5149\u7f06/scripts/drawing_analysis.json',
  JSON.stringify({ trunk: t, branch: b }, null, 2));
console.log('\nSaved to drawing_analysis.json');
