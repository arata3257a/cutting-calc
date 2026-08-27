// UNION TOOL current ball end mill catalog data (verified product facts only)
// Source: official UNION TOOL HWB/HWB-S/CWB catalog and official online product pages.
// IMPORTANT: N/F/ap/ae are intentionally NOT included until the official milling-condition rows are directly verified.
window.EXTRA_BALL_CONDITIONS={
  version:'0.1',
  policy:'verified-only',
  maker:'UNION TOOL',
  category:'2 Flute Ball End Mills',
  currentSeries:['HWB','HWB-S','CWB'],
  defaultSeries:'CWB',
  series:{
    CWB:{
      coating:'UTWCOAT',
      flutes:2,
      description:'銅、生材から50HRCの焼入れ鋼まで対応する2枚刃ボールエンドミル',
      verifiedTools:[
        {model:'CWB2010-0150',d:1,r:0.5,loc:1.5,shank:4,length:50},
        {model:'CWB2010-0250',d:1,r:0.5,loc:2.5,shank:4,length:50},
        {model:'CWB2020-0200',d:2,r:1,loc:2,shank:4,length:50},
        {model:'CWB2020-0300',d:2,r:1,loc:3,shank:4,length:60},
        {model:'CWB2035-0520',d:3.5,r:1.75,loc:5.2,shank:6,length:70}
      ]
    }
  },
  notes:[
    '現行シリーズはHWB/HWB-S/CWB。',
    'CWBはUTWCOAT・2枚刃。',
    '工具寸法は公式製品ページで直接確認できた型番のみ登録。',
    '切削条件N/F/ap/aeは公式条件表の行を直接確認するまで登録しない。',
    '未確認値・補間値・推測値は使用しない。'
  ]
};
