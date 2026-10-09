(function (root) {
  'use strict';

  const BREEDS = [
    { id:'largewhite', name:'大白猪（约克夏）', origin:'英国', role:'肉猪', adult:16, feed:18, growth:1.18, max:320, hardy:1.00, mood:1.00, fertility:0.82, litter:[10,14], price:920, color:'#f3c6b3', trait:'生长快、瘦肉率稳定，适合标准育肥。' },
    { id:'landrace', name:'长白猪', origin:'丹麦', role:'肉猪', adult:16, feed:19, growth:1.20, max:330, hardy:0.92, mood:0.94, fertility:0.88, litter:[11,15], price:980, color:'#f2bfae', trait:'体长、产仔多，但对环境舒适度较敏感。' },
    { id:'duroc', name:'杜洛克', origin:'美国', role:'肉猪', adult:15, feed:19, growth:1.26, max:350, hardy:1.10, mood:1.02, fertility:0.72, litter:[8,12], price:1080, color:'#b96248', trait:'增重快、耐粗饲，红棕色皮毛。' },
    { id:'pietrain', name:'皮特兰', origin:'比利时', role:'肉猪', adult:17, feed:18, growth:1.12, max:290, hardy:0.78, mood:0.82, fertility:0.62, litter:[7,10], price:1160, color:'#d7c6bf', spots:'#55504c', trait:'肌肉率高，但怕热、怕应激，需要好猪圈。' },
    { id:'hampshire', name:'汉普夏', origin:'英国/美国', role:'肉猪', adult:16, feed:18, growth:1.16, max:310, hardy:1.08, mood:0.96, fertility:0.70, litter:[8,11], price:1040, color:'#393632', band:'#f1d2c1', trait:'黑身白带，觅食能力好，适合放养。' },
    { id:'berkshire', name:'巴克夏', origin:'英国', role:'肉猪', adult:18, feed:17, growth:1.04, max:280, hardy:1.12, mood:1.05, fertility:0.70, litter:[7,11], price:1280, color:'#302c2b', feet:'#f3c5b2', trait:'肉质出色、性情温和，精品市场溢价。' },
    { id:'mangalica', name:'曼加利察卷毛猪', origin:'匈牙利', role:'肉猪', adult:22, feed:17, growth:0.86, max:300, hardy:1.28, mood:1.04, fertility:0.55, litter:[5,8], price:1680, color:'#c9a16f', trait:'卷毛耐寒、成熟慢，精品脂肪价值高。' },
    { id:'tamworth', name:'坦沃斯猪', origin:'英国', role:'肉猪', adult:19, feed:16, growth:1.00, max:300, hardy:1.22, mood:1.00, fertility:0.68, litter:[7,10], price:1120, color:'#b85832', trait:'善于户外觅食，围栏差时容易溜走。' },
    { id:'jinhuapig', name:'金华两头乌', origin:'中国浙江', role:'肉猪', adult:20, feed:14, growth:0.90, max:180, hardy:1.12, mood:1.05, fertility:0.76, litter:[8,12], price:1420, color:'#eee0ce', spots:'#282525', trait:'两头乌、肉质佳，耗料较少。' },
    { id:'ningxiang', name:'宁乡花猪', origin:'中国湖南', role:'肉猪', adult:19, feed:15, growth:0.96, max:210, hardy:1.18, mood:1.08, fertility:0.78, litter:[8,12], price:1320, color:'#d9b69b', spots:'#59433b', trait:'耐粗饲、适应湿热，地方精品猪。' },
    { id:'rongchang', name:'荣昌猪', origin:'中国重庆', role:'肉猪', adult:18, feed:16, growth:1.02, max:240, hardy:1.16, mood:1.02, fertility:0.86, litter:[9,13], price:1180, color:'#ead1c3', spots:'#342c2b', trait:'适应性强、皮薄，繁育和肉用兼顾。' },
    { id:'neijiang', name:'内江猪', origin:'中国四川', role:'肉猪', adult:18, feed:16, growth:1.00, max:260, hardy:1.20, mood:0.98, fertility:0.82, litter:[8,12], price:1140, color:'#2f2b2a', trait:'耐热耐粗饲，体格结实。' },
    { id:'tibetan', name:'藏猪', origin:'中国高原', role:'肉猪', adult:23, feed:11, growth:0.72, max:110, hardy:1.42, mood:1.12, fertility:0.64, litter:[5,8], price:1580, color:'#27221f', trait:'小型、极耐寒耐粗饲，成长缓慢但价值高。' },
    { id:'minzhu', name:'民猪', origin:'中国东北', role:'肉猪', adult:20, feed:15, growth:0.92, max:220, hardy:1.38, mood:1.00, fertility:0.88, litter:[10,14], price:1260, color:'#252321', trait:'耐寒、母性好，冬季健康衰减低。' },
    { id:'potbelly', name:'越南大肚猪', origin:'越南', role:'宠物猪', adult:18, feed:8, growth:0.58, max:75, hardy:1.12, mood:1.32, fertility:0.58, litter:[4,7], price:1550, color:'#3c3835', trait:'聪明亲人，抚摸收益高，过量喂食易肥胖。' },
    { id:'gottingen', name:'哥廷根迷你猪', origin:'德国', role:'宠物猪', adult:20, feed:7, growth:0.48, max:48, hardy:0.98, mood:1.38, fertility:0.50, litter:[4,6], price:2200, color:'#f0c1a9', trait:'体型小、易训练，喜欢益智互动。' },
    { id:'juliana', name:'朱莉安娜斑点猪', origin:'欧美', role:'宠物猪', adult:19, feed:7, growth:0.50, max:55, hardy:1.00, mood:1.42, fertility:0.52, litter:[4,7], price:2380, color:'#d7baa1', spots:'#6d5144', trait:'活泼亲人，斑点外观提升宠物市场价。' },
    { id:'kunekune', name:'库内库内猪', origin:'新西兰', role:'宠物猪', adult:21, feed:9, growth:0.64, max:100, hardy:1.18, mood:1.48, fertility:0.64, litter:[5,8], price:2050, color:'#a96f45', trait:'温顺爱吃草，放牧和陪伴互动加成高。' },
    { id:'americanmini', name:'美系迷你猪', origin:'美国', role:'宠物猪', adult:19, feed:8, growth:0.52, max:62, hardy:1.04, mood:1.35, fertility:0.56, litter:[4,7], price:1920, color:'#68544b', trait:'训练性好，对心情和陪伴要求较高。' },
    { id:'oxford', name:'牛津沙黑猪', origin:'英国', role:'宠物猪', adult:20, feed:10, growth:0.70, max:140, hardy:1.20, mood:1.22, fertility:0.66, litter:[6,9], price:1780, color:'#c49a70', spots:'#302b29', trait:'安静温和，适合观赏与小规模放养。' },
    { id:'meishan', name:'梅山猪', origin:'中国太湖流域', role:'繁育猪', adult:15, feed:14, growth:0.82, max:190, hardy:1.18, mood:1.08, fertility:1.38, litter:[12,18], price:1500, color:'#35302e', trait:'早熟高产，游戏中最强产仔能力。' },
    { id:'taihu', name:'太湖猪', origin:'中国江南', role:'繁育猪', adult:15, feed:14, growth:0.80, max:200, hardy:1.15, mood:1.04, fertility:1.32, litter:[11,17], price:1460, color:'#3b3532', trait:'产仔多、母性好，适合繁育路线。' },
    { id:'erhualian', name:'二花脸猪', origin:'中国江苏', role:'繁育猪', adult:16, feed:13, growth:0.78, max:180, hardy:1.20, mood:1.12, fertility:1.42, litter:[13,19], price:1580, color:'#413a36', trait:'极高窝产仔数，但单只增重偏慢。' },
    { id:'jinhua_sow', name:'金华繁育系', origin:'中国浙江', role:'繁育猪', adult:17, feed:14, growth:0.84, max:185, hardy:1.16, mood:1.08, fertility:1.05, litter:[9,13], price:1500, color:'#eadac9', spots:'#272322', trait:'母性与精品血统一并兼顾。' },
    { id:'largeblack', name:'英国大黑猪', origin:'英国', role:'繁育猪', adult:19, feed:16, growth:0.94, max:300, hardy:1.25, mood:1.14, fertility:0.96, litter:[9,13], price:1440, color:'#211f1d', trait:'温顺、户外繁育稳定，护仔能力强。' },
    { id:'chesterwhite', name:'切斯特白猪', origin:'美国', role:'繁育猪', adult:17, feed:17, growth:1.04, max:310, hardy:1.10, mood:1.02, fertility:1.02, litter:[9,13], price:1320, color:'#efd1c0', trait:'母性好、体格稳，繁育与育肥均衡。' },
    { id:'polandchina', name:'波中猪', origin:'美国', role:'繁育猪', adult:18, feed:18, growth:1.08, max:340, hardy:1.06, mood:0.98, fertility:0.78, litter:[7,11], price:1380, color:'#2b2927', feet:'#ecd0be', trait:'体格大、增重快，适合作父本。' },
    { id:'wuzhishan', name:'五指山猪', origin:'中国海南', role:'繁育猪', adult:18, feed:9, growth:0.55, max:65, hardy:1.35, mood:1.18, fertility:0.82, litter:[6,10], price:1720, color:'#2e2926', trait:'小型、耐热耐湿，低耗料保种价值高。' }
  ];

  const CROPS = {
    corn:{name:'玉米',seed:18,sell:34,grow:5,yield:[3,5],icon:'🌽',seasons:[1,2,3]},
    wheat:{name:'小麦',seed:14,sell:26,grow:4,yield:[3,6],icon:'🌾',seasons:[1,2,3]},
    soy:{name:'大豆',seed:22,sell:42,grow:6,yield:[3,5],icon:'🫘',seasons:[1,2]},
    sweetpotato:{name:'红薯',seed:20,sell:38,grow:6,yield:[3,5],icon:'🍠',seasons:[1,2,3]},
    pumpkin:{name:'南瓜',seed:28,sell:58,grow:8,yield:[3,5],icon:'🎃',seasons:[2,3]},
    carrot:{name:'胡萝卜',seed:16,sell:32,grow:5,yield:[3,5],icon:'🥕',seasons:[1,3]},
    alfalfa:{name:'苜蓿',seed:15,sell:24,grow:4,yield:[3,6],icon:'☘️',seasons:[1,2,3]},
    barley:{name:'大麦',seed:15,sell:29,grow:5,yield:[3,6],icon:'🌿',seasons:[1,3]}
  };

  const FEEDS = {
    basic:{name:'农家粗饲料',price:48,nutrition:30,satiety:1,mood:2,growth:1.00,icon:'🧺',desc:'便宜耐用，恢复30点饱食，耐饱1天。'},
    balanced:{name:'均衡育肥料',price:88,nutrition:40,satiety:2,mood:4,growth:1.24,icon:'🟡',desc:'肉猪增重效率高，恢复40点，耐饱2天。'},
    protein:{name:'高蛋白料',price:112,nutrition:36,satiety:2,mood:3,growth:1.36,icon:'🟤',desc:'幼猪与瘦肉型猪效果好，耐饱2天。'},
    fiber:{name:'高纤维草料',price:72,nutrition:32,satiety:3,mood:6,growth:0.94,icon:'🟢',desc:'消化缓慢，恢复32点，耐饱3天。'},
    petmix:{name:'果蔬宠物餐',price:126,nutrition:32,satiety:2,mood:13,growth:0.86,icon:'🟠',desc:'宠物猪心情大幅提升，恢复32点。'},
    lactation:{name:'母猪哺育料',price:138,nutrition:42,satiety:2,mood:7,growth:1.12,icon:'🟣',desc:'妊娠母猪专用，恢复42点并提高产仔成活率。'}
  };

  const RECIPES = {
    basic:{makes:5,ingredients:{corn:2,wheat:2,alfalfa:1}},
    balanced:{makes:5,ingredients:{corn:3,wheat:2,soy:2}},
    protein:{makes:4,ingredients:{soy:3,wheat:2,barley:1}},
    fiber:{makes:5,ingredients:{sweetpotato:3,alfalfa:3,barley:1}},
    petmix:{makes:4,ingredients:{carrot:3,pumpkin:2,sweetpotato:1}},
    lactation:{makes:4,ingredients:{corn:2,soy:3,alfalfa:2}}
  };

  const FACILITIES = {
    pen:{name:'舒适猪圈',icon:'🏠',base:1200,max:5,days:2,desc:'容量 +3；环境、成长和心情衰减改善。'},
    field:{name:'农田扩建',icon:'🌱',base:900,max:4,days:1,desc:'每级新增 2 块田，并使每块田有 18% 概率额外收获 1 份。'},
    mill:{name:'饲料工坊',icon:'⚙️',base:1100,max:4,days:1,desc:'制作额外产出，升级后缩短制作时间。'},
    clinic:{name:'兽医室',icon:'➕',base:1500,max:4,days:1,desc:'降低患病与疫病传播率，治疗更有效。'},
    fence:{name:'结实围栏',icon:'🪵',base:850,max:5,days:1,desc:'减少狼袭、走失与天气损失。'},
    silo:{name:'干燥粮仓',icon:'🛖',base:700,max:4,days:1,desc:'基础售价加成 2.5%，每次升级再提高 5%，事件中不易损失库存。'}
  };

  const DISEASES = [
    {id:'cold',name:'受凉感冒',severity:8,cost:1,desc:'健康每日下降，耐寒猪较轻。'},
    {id:'indigestion',name:'消化不良',severity:7,cost:1,desc:'食欲下降，成长变慢。'},
    {id:'skin',name:'皮肤感染',severity:9,cost:1,desc:'心情与健康持续下降。'},
    {id:'fever',name:'高热症',severity:14,cost:2,desc:'必须尽快治疗。'},
    {id:'plague',name:'疑似猪瘟',severity:22,cost:3,desc:'高传染、高致死风险。'}
  ];

  const INTERACTIONS = {
    piglet:[{id:'cuddle',name:'抱在怀里',mood:14,health:2,time:1},{id:'tickle',name:'挠挠肚皮',mood:11,health:1,time:1},{id:'namecall',name:'叫名字训练',mood:8,health:0,time:1}],
    juvenile:[{id:'brush',name:'软刷梳毛',mood:12,health:3,time:1},{id:'walk',name:'围栏散步',mood:16,health:4,time:2},{id:'train',name:'响片训练',mood:13,health:1,time:1}],
    adult:[{id:'pet',name:'轻轻抚摸',mood:10,health:1,time:1},{id:'scratch',name:'挠耳后',mood:14,health:1,time:1},{id:'mud',name:'准备泥浴',mood:18,health:5,time:2}],
    senior:[{id:'gentle',name:'慢慢顺毛',mood:12,health:2,time:1},{id:'sun',name:'陪着晒太阳',mood:16,health:4,time:2},{id:'talk',name:'坐下说说话',mood:10,health:0,time:1}]
  };

  const STAFF = {
    caretaker:{name:'饲养员阿满',icon:'🧑‍🌾',hire:620,wage:45,unlock:21,desc:'每天清晨自动给最多3只饱食低于55的猪喂一份现有饲料。'},
    fieldhand:{name:'田工青芽',icon:'🌾',hire:520,wage:35,unlock:31,desc:'每天清晨自动给所有未成熟作物浇水，雨天也会检查田地。'},
    vet:{name:'兽医小岚',icon:'🩺',hire:900,wage:55,unlock:61,desc:'每日巡圈，降低患病概率，并为健康最低的猪恢复少量健康。'},
    courier:{name:'赶车人石头',icon:'🛒',hire:760,wage:40,unlock:61,desc:'往返外部场景更快：集市返程减少1/4日，其他地点返程减少1/4日。'}
  };

  const FESTIVALS = {
    1:{name:'春日猪仔会',icon:'🌸',mode:'flowers',desc:'幼猪的健康、心情与亲密度最受重视。',instructions:'听口令依次点击正确花朵；答得越快、连续正确越多，默契分越高。',rounds:10,seconds:24,youngBonus:12},
    2:{name:'夏日泥浴节',icon:'💧',mode:'mud',desc:'重视心情、健康与环境适应，成年猪也可以参加。',instructions:'在游标进入绿色舒适区时按空格或点击泥坑，完成八次恰到好处的打滚。',rounds:8,seconds:28,youngBonus:0},
    3:{name:'秋收伙伴祭',icon:'🍂',mode:'directions',desc:'综合考察猪只状态、亲密度与本季农场收获。',instructions:'记住方向口令，再用方向键、WASD 或画面按钮完整复现，连续完成四轮。',rounds:4,seconds:36,youngBonus:0}
  };

  const STORY_CHAPTERS = {
    '1-1':{title:'旧钥匙与第一顿饲料',subtitle:'先让这座农场重新运转',required:2,reward:260,intro:[['farmer','{player}','这里就是{farm}。三年后的比猪大赛还很远，先让猪群吃饱、让田地重新长起来。'],['vet','林医生','别急着追求体重。稳定的饲养记录，才是三年后真正站得住的底气。']],complete:[['farmer','{player}','猪圈里有了咀嚼声，田里也冒出了新芽。第一步算是走稳了。']]},
    '1-2':{title:'猪圈里的咳嗽',subtitle:'学会看懂健康与环境',required:2,reward:340,intro:[['vet','林医生','换季时最容易出问题。观察健康、改善设施，必要时及时治疗。'],['farmer','{player}','我会照顾好每一只猪，也会把猪圈一点点修好。']],complete:[['vet','林医生','你已经不只是会喂猪了，也开始懂得怎样预防问题。']]},
    '1-3':{title:'第一次年市',subtitle:'为农场选择经营方向',required:2,reward:420,intro:[['merchant','何伯','年底前多去集市看看。农作物、饲料、猪只，各有各的生意门道。'],['farmer','{player}','经营方向可以慢慢调整，不必一次把路走死。']],complete:[['merchant','何伯','第一年的账能周转起来就不容易。明年，你会面对更大的选择。']]},
    '2-1':{title:'新生命',subtitle:'扩充或繁育自己的猪群',required:2,reward:480,intro:[['vet','林医生','第二年要考虑猪群结构了。购买、繁育或精养现有猪只都能形成自己的路线。']],complete:[['farmer','{player}','猪群有了新的可能，但数量从来不比照料质量更重要。']]},
    '2-2':{title:'山路断粮',subtitle:'建立不依赖单一来源的供应',required:2,reward:520,intro:[['merchant','何伯','山路一坏，集市的货就慢了。后山、工坊和村里的互助都能补上缺口。']],complete:[['merchant','何伯','你把农场的供应链撑住了。遇到变化，也不至于手忙脚乱。']]},
    '2-3':{title:'第一次交锋',subtitle:'了解石桥牧场的实力',required:2,reward:600,intro:[['rival','陆野','听说你也准备参加最终大赛。来石桥牧场看看吧，真正的差距要在训练场上才看得见。']],complete:[['rival','陆野','这次只是摸底。你有自己的养法，我也会继续调整石桥的训练。']]},
    '3-1':{title:'冠军的名字',subtitle:'选定重点培养的参赛猪',required:2,reward:680,intro:[['farmer','{player}','最后一年了。我要选出重点培养的伙伴，但其他猪也不会因此被忽视。']],complete:[['vet','林医生','候选猪的状态不错。记住，临近比赛更要保持规律。']]},
    '3-2':{title:'农场的答案',subtitle:'在成绩与长期照料之间做选择',required:2,reward:760,intro:[['rival','陆野','短期冲重很诱人，但身体记录不会说谎。你想让评委看到怎样的农场？']],complete:[['farmer','{player}','这就是我的答案。输赢重要，但不能抹掉三年的饲养方式。']]},
    '3-3':{title:'最后的二十天',subtitle:'稳定状态，完成最终备赛',required:2,reward:900,intro:[['vet','林医生','最后二十天不需要奇迹。把健康、心情和训练维持好，带着完整记录上场。']],complete:[['farmer','{player}','三年的每一天都在这份记录里。现在，该去青石赛场了。']]}
  };

  const NAMES = ['豆包','花卷','黑糖','小满','麦芽','团团','桃子','铁蛋','栗子','元宝','年糕','芝麻','露珠','旺财','麻薯','秋葵','咕噜','小禾'];
  const PHASES = ['清晨','上午','下午','夜晚'];
  const SEASONS = ['春','夏','秋'];
  const YEAR_DAYS = 60;

  const DATA = {BREEDS,CROPS,FEEDS,RECIPES,FACILITIES,DISEASES,INTERACTIONS,STAFF,FESTIVALS,STORY_CHAPTERS,NAMES,PHASES,SEASONS,YEAR_DAYS};
  root.PIG_DATA = DATA;
  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
})(typeof window !== 'undefined' ? window : globalThis);
