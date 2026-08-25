// PRO: CWLB current-series policy
// Source: Union Tool CWLB official milling conditions.
// Do not interpolate manufacturer cutting conditions.

export const CWLB_POLICY = {
  series: 'CWLB',
  toolType: 'long-neck-ball',
  flutes: 2,
  coating: 'UTWCOAT',
  status: 'current',
  predecessor: 'CSELB',
  diameterDisplayRule: 'integer-mm-only',
  conditionKey: ['model','ballRadius','effectiveLength','workMaterial','hardness'],
  workMaterialGroups: [
    { id: 'cu_al', label: '銅 / アルミ合金' },
    { id: 'carbon_alloy', label: 'S45C / S50C / SK / SCM', hardness: '～325HB' },
    { id: 'prehard', label: 'NAK80 / STAVAX / HPM38', hardness: '30～45HRC' },
    { id: 'hardened', label: 'STAVAX / HPM38 / SKD61', hardness: '45～55HRC' }
  ],
  rules: [
    'Use only rows explicitly present in the official CWLB milling-condition table.',
    'Do not infer missing integer diameters.',
    'Keep ball radius and effective length as required selectors because conditions vary by them.',
    'Prefer CWLB over discontinued CSELB for new PRO registrations.'
  ]
};
