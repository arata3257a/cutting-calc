// PRO版 加工条件データ共通スキーマ
// 実条件はメーカー公式資料との照合後、verified のみ公開する。

window.PRO_DATA_SCHEMA_VERSION = '1.0.0';

window.PRO_CONDITION_TEMPLATE = {
  id: '',
  materialGroup: '',
  material: '',
  materialState: '',
  hardness: '',
  toolType: 'square', // square | radius | ball
  manufacturer: '',
  toolSeries: '',
  flutes: null,
  diameter: null,
  method: '', // side | slot | other
  rpm: null,
  feed: null,
  ap: null,
  ae: null,
  vc: null,
  fz: null,
  coolant: '',
  sourceTitle: '',
  sourceUrl: '',
  verification: 'unverified', // verified | derived | unverified
  notes: ''
};

window.PRO_MATERIAL_GROUPS = [
  { id: 'aluminum', label: 'アルミ' },
  { id: 'carbon-steel', label: '炭素鋼' },
  { id: 'alloy-steel', label: '合金鋼' },
  { id: 'prehardened-steel', label: 'プリハードン鋼' },
  { id: 'hardened-steel', label: '焼入れ鋼' },
  { id: 'stainless', label: 'ステンレス' },
  { id: 'copper', label: '銅' },
  { id: 'titanium', label: 'チタン合金' },
  { id: 'heat-resistant', label: '耐熱・超耐熱合金' },
  { id: 'plastic', label: '樹脂' },
  { id: 'graphite', label: 'グラファイト' }
];

window.PRO_TOOL_TYPES = [
  { id: 'square', label: 'スクエア' },
  { id: 'radius', label: 'ラジアス' },
  { id: 'ball', label: 'ボール' }
];
