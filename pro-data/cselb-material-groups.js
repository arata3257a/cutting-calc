// PRO verified source mapping: UNION TOOL CSELB cutting condition table
// This file defines only source-supported material/hardness groups.
// Numeric cutting rows will be added separately after row-by-row verification.
window.PRO_CSELB_MATERIAL_GROUPS = [
  {
    id: 'carbon-alloy-325hb',
    label: '炭素鋼・合金鋼',
    materials: ['S45C', 'S50C', 'SK', 'SCM'],
    condition: '～325HB',
    toolSeries: 'CSELB',
    toolType: '2枚刃 ロングネックボール',
    coating: 'UTCOAT'
  },
  {
    id: 'prehardened-30-45hrc',
    label: 'プリハードン鋼',
    materials: ['NAK80', 'STAVAX', 'HPM38'],
    condition: '30～45HRC',
    toolSeries: 'CSELB',
    toolType: '2枚刃 ロングネックボール',
    coating: 'UTCOAT'
  },
  {
    id: 'hardened-45-55hrc',
    label: '焼入れ鋼',
    materials: ['STAVAX', 'HPM38', 'SKD61'],
    condition: '45～55HRC',
    toolSeries: 'CSELB',
    toolType: '2枚刃 ロングネックボール',
    coating: 'UTCOAT'
  }
];

window.PRO_CSELB_SOURCE = {
  manufacturer: 'UNION TOOL',
  document: 'CSELB 切削条件表',
  url: 'https://www.uniontool.co.jp/catalogue/em/cselb.pdf',
  verified: true,
  interpolation: false,
  diameterPolicy: 'PRO UIは原則1mm単位。公式表に存在しない径は補間しない。'
};
