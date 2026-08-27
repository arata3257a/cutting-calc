// UNION TOOL HGS official milling conditions (verified rows only)
// Source: https://www.uniontool.co.jp/assets/pdf/catalog/endmill_hgs.pdf
window.EXTRA_HGS_CONDITIONS={
  version:'1.0',
  maker:'UNION TOOL',
  series:'HGS',
  coating:'HMGCOAT',
  flutes:6,
  process:'finish',
  materials:{
    skd11:{label:'SKD11 (55～62HRC)',rows:[
      {model:'6010-0200',d:1,loc:2,n:3600,f:350,ap:2,ae:0.01},
      {model:'6010-0300',d:1,loc:3,n:3300,f:200,ap:3,ae:0.01}
    ]},
    hap10:{label:'HAP10 (62～66HRC)',rows:[
      {model:'6010-0200',d:1,loc:2,n:3500,f:230,ap:2,ae:0.01},
      {model:'6010-0300',d:1,loc:3,n:3200,f:130,ap:3,ae:0.01}
    ]},
    hap72:{label:'HAP72 (66～70HRC)',rows:[
      {model:'6010-0200',d:1,loc:2,n:3100,f:200,ap:2,ae:0.005},
      {model:'6010-0300',d:1,loc:3,n:2800,f:110,ap:3,ae:0.005}
    ]}
  },
  notes:['公式条件表から直接確認できた行のみ登録','未確認の工具径・刃長は追加しない','HGS条件表は仕上げ加工条件']
};
