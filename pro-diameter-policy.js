// PRO diameter display policy
// User-facing diameter choices are integer millimeters only.
// Never interpolate missing manufacturer cutting-condition data.
window.PRO_DIAMETER_POLICY = Object.freeze({
  incrementMm: 1,
  integerOnly: true,
  minDefaultMm: 1,
  includeDiameter(diameter, availableConditionDiameters = []) {
    const d = Number(diameter);
    if (!Number.isInteger(d) || d < 1) return false;
    return availableConditionDiameters.map(Number).includes(d);
  },
  filterAvailable(availableConditionDiameters = []) {
    return [...new Set(availableConditionDiameters.map(Number))]
      .filter(d => Number.isInteger(d) && d >= 1)
      .sort((a, b) => a - b);
  }
});
