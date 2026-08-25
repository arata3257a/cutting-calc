// PRO: current Union Tool CWLB policy
// Source checked 2026-08-25: Union Tool CWLB current leaflet / online catalog.
// Do not infer cutting parameters from product availability.

export const CWLB_POLICY = {
  series: 'CWLB',
  geometry: 'long-neck-ball',
  flutes: 2,
  coating: 'UTWCOAT',
  status: 'current',
  preferredOver: 'CSELB',
  // PRO UI keeps integer tool diameters only.
  diameterRule: 'integer-mm-only',
  verifiedIntegerDiameterExamples: {
    1: { ballR: 0.5 },
    2: { ballR: 1.0 },
    3: { ballR: 1.5 },
    4: { ballR: 2.0 },
    5: { ballR: 2.5 },
    6: { ballR: 3.0 }
  },
  materialApplications: [
    'carbon-steel',
    'alloy-steel',
    'pre-hardened-steel',
    'hardened-steel',
    'aluminum-alloy',
    'copper',
    'titanium-alloy',
    'heat-resistant-alloy'
  ],
  notes: [
    'A product diameter alone is not enough to select cutting parameters.',
    'Parameter key must include ball R, effective length, material/hardness and machining mode.',
    'For slot milling, manufacturer notes require feed reduction to 50% or less of milling parameters.',
    'For stainless and heat-resistant alloys, oil coolant is recommended by manufacturer.',
    'For copper, wet coolant is recommended by manufacturer.',
    'Never interpolate missing manufacturer parameter rows.'
  ]
};
