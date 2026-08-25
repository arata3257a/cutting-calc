# PRO cutting-condition data rules

1. Display tool diameters in 1 mm increments only (φ1, φ2, φ3 ...).
2. A diameter is selectable only when a manufacturer-published cutting condition exists for that exact diameter and selected material/tool/process combination.
3. Do not interpolate, extrapolate, average, or infer missing cutting-condition values.
4. Keep manufacturer tool series, flute count, material state/hardness, machining method, coolant note and source together with each condition set.
5. Derived Vc and fz may be calculated from manufacturer N/F/D/z, and must be marked as calculated values rather than manufacturer table values.
6. If a source offers fractional diameters (e.g. φ1.5 or φ2.5), omit them from the standard PRO selector under the current 1 mm policy.
7. Do not change the free-version main branch while developing PRO.

## Current verified source families
- UNION TOOL CZS: S45C/S50C annealed (~225HB); SK/SCM annealed (225–325HB), with published vertical/slotting/side-milling conditions depending on flute-length table.
- UNION TOOL HGS: hardened-material finishing datasets already staged separately in PRO development.
