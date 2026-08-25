// PRO verified dataset: UNION TOOL CZS 3D flute length type
// Source: https://uniontool.co.jp/assets/pdf/catalog/em-czs_vol2.pdf
// Integer diameters only. No interpolation.
// 4 flutes / UTCOAT. N is common to vertical, slotting and side milling per material row.
window.PRO_DATA_CZS_3D = {
  s45c_s50c_annealed_225hb: {
    label: 'S45C / S50C 焼鈍材（～225HB）', tool: 'UNION TOOL CZS', flutes: 4, fluteLengthType: '3D',
    diameters: {
      6:{N:5000, vertical:{F:200,ap:6}, slot:{F:500,ap:6}, side:{F:1600,ap:18,ae:0.6}},
      7:{N:4100, vertical:{F:200,ap:7}, slot:{F:450,ap:7}, side:{F:1450,ap:21,ae:0.7}},
      8:{N:3200, vertical:{F:150,ap:8}, slot:{F:400,ap:8}, side:{F:1300,ap:24,ae:0.8}},
      9:{N:2400, vertical:{F:140,ap:9}, slot:{F:350,ap:9}, side:{F:1150,ap:27,ae:0.9}},
      10:{N:1850,vertical:{F:120,ap:10},slot:{F:320,ap:10},side:{F:1000,ap:30,ae:1.0}},
      11:{N:1650,vertical:{F:100,ap:11},slot:{F:300,ap:11},side:{F:900,ap:33,ae:1.1}},
      12:{N:1500,vertical:{F:90,ap:12}, slot:{F:300,ap:12},side:{F:800,ap:36,ae:1.2}}
    }
  },
  sk_scm_annealed_225_325hb: {
    label: 'SK / SCM 焼鈍材（225～325HB）', tool: 'UNION TOOL CZS', flutes: 4, fluteLengthType: '3D',
    diameters: {
      6:{N:4000, vertical:{F:60,ap:6}, slot:{F:350,ap:6}, side:{F:1200,ap:18,ae:0.6}},
      7:{N:3400, vertical:{F:60,ap:6}, slot:{F:330,ap:7}, side:{F:1150,ap:21,ae:0.7}},
      8:{N:2700, vertical:{F:50,ap:6}, slot:{F:300,ap:8}, side:{F:1050,ap:24,ae:0.8}},
      9:{N:2050, vertical:{F:50,ap:6}, slot:{F:270,ap:9}, side:{F:1000,ap:27,ae:0.9}},
      10:{N:1500,vertical:{F:40,ap:6}, slot:{F:240,ap:10},side:{F:900,ap:30,ae:1.0}},
      11:{N:1350,vertical:{F:40,ap:6}, slot:{F:220,ap:11},side:{F:850,ap:33,ae:1.1}},
      12:{N:1200,vertical:{F:30,ap:6}, slot:{F:200,ap:12},side:{F:750,ap:36,ae:1.2}}
    }
  }
};
