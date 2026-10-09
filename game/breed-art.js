(function(root){
  'use strict';
  const notes=[
    '直立耳 · 粉白皮肤 · 宽厚背线','前垂大耳 · 修长躯干','铜红毛色 · 厚实肩背',
    '银灰底色 · 不规则黑斑 · 发达后躯','黑色躯干 · 肩部白带','黑身 · 白鼻尖与白蹄',
    '金色卷毛 · 蓬松圆躯','姜红毛色 · 长吻与高腿','黑头黑臀 · 象牙白腰身',
    '垂耳 · 圆腹 · 深色鞍斑','乳白躯干 · 眼耳黑斑','全黑毛色 · 低壮体型',
    '尖长吻 · 高腿 · 背部鬃毛','深棕黑毛 · 厚密冬毛','短腿 · 垂腹 · 面部褶皱',
    '小巧粉白体型 · 短鼻直耳','浅色细躯 · 细碎棕斑','姜白花毛 · 短翘鼻 · 下颌肉垂',
    '黑白花色 · 紧凑迷你体型','沙金底色 · 不规则黑斑','大垂耳 · 深皱脸 · 宽腹',
    '灰黑皮毛 · 大耳 · 下垂腹线','额头白斑 · 白蹄 · 褶皱脸','两头乌花色 · 长身丰腹',
    '乌黑长躯 · 遮眼大垂耳','暖白皮肤 · 短脸垂耳','大体格 · 黑身白面白蹄','深色背毛 · 浅腹 · 纤细短躯'
  ];
  root.PIG_ART=Object.fromEntries(root.PIG_DATA.BREEDS.map((b,i)=>[b.id,{
    index:i,src:`assets/breeds/${b.id}.png`,rollSrc:`assets/roll-poses/${b.id}.png`,note:notes[i],
    // Feet and shoulders use normalized coordinates in the tightly fitted sprite.
    legCut:['potbelly','meishan','taihu','erhualian'].includes(b.id)?.82:.76,
    stride:['tibetan','tamworth','wuzhishan','juliana'].includes(b.id)?1.15:.9
  }]));
})(window);
