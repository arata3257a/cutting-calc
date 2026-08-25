// PRO版 高硬度材データ
// 出典: UNION TOOL HGS Milling Conditions
// 推測・補間なし。メーカー公開値のみ。

window.PRO_HARDENED_DATA = {
  tool: {
    maker: 'UNION TOOL',
    series: 'HGS',
    flutes: 6,
    operation: 'finishing',
    source: 'UNION TOOL HGS Milling Conditions'
  },
  materials: {
    skd11_55_62hrc: {
      label: 'SKD11（55〜62HRC）',
      conditions: {
        1:  { n: 3600, f: 350, ap: 2,  ae: 0.01 },
        1.5:{ n: 3500, f: 360, ap: 3,  ae: 0.01 },
        2:  { n: 3400, f: 370, ap: 4,  ae: 0.01 },
        3:  { n: 3100, f: 370, ap: 6,  ae: 0.015 },
        4:  { n: 2850, f: 380, ap: 8,  ae: 0.015 },
        5:  { n: 2600, f: 390, ap: 10, ae: 0.015 },
        6:  { n: 2350, f: 410, ap: 12, ae: 0.02 },
        8:  { n: 2050, f: 350, ap: 16, ae: 0.02 },
        10: { n: 1800, f: 410, ap: 20, ae: 0.02 },
        12: { n: 1700, f: 470, ap: 24, ae: 0.02 }
      }
    },
    hap10_62_66hrc: {
      label: 'HAP10（62〜66HRC）',
      conditions: {
        1:  { n: 3500, f: 230, ap: 2,  ae: 0.01 },
        1.5:{ n: 3400, f: 240, ap: 3,  ae: 0.01 },
        2:  { n: 3300, f: 240, ap: 4,  ae: 0.01 },
        3:  { n: 3050, f: 250, ap: 6,  ae: 0.015 },
        4:  { n: 2800, f: 260, ap: 8,  ae: 0.015 },
        5:  { n: 2550, f: 260, ap: 10, ae: 0.015 },
        6:  { n: 2300, f: 270, ap: 12, ae: 0.02 },
        8:  { n: 2000, f: 330, ap: 16, ae: 0.02 },
        10: { n: 1750, f: 390, ap: 20, ae: 0.02 },
        12: { n: 1650, f: 450, ap: 24, ae: 0.02 }
      }
    },
    hap72_66_70hrc: {
      label: 'HAP72（66〜70HRC）',
      conditions: {
        1:  { n: 3100, f: 200, ap: 2,  ae: 0.005 },
        1.5:{ n: 3000, f: 200, ap: 3,  ae: 0.005 },
        2:  { n: 2900, f: 210, ap: 4,  ae: 0.01 },
        3:  { n: 2700, f: 210, ap: 6,  ae: 0.015 },
        4:  { n: 2450, f: 220, ap: 8,  ae: 0.015 },
        5:  { n: 2250, f: 230, ap: 10, ae: 0.015 },
        6:  { n: 2050, f: 230, ap: 12, ae: 0.02 },
        8:  { n: 1750, f: 280, ap: 16, ae: 0.02 },
        10: { n: 1550, f: 330, ap: 20, ae: 0.02 },
        12: { n: 1450, f: 380, ap: 24, ae: 0.02 }
      }
    }
  }
};
