// Decision logic for the per-card "vs 1Y" delta line. Pure: returns the text +
// className for an info-delta element; the app.js wrapper applies them to the DOM.

// `diff` is the signed numeric change vs a year ago (null when there is no
// year-ago row). `formatted` is the pre-formatted magnitude string (e.g. "+$1,200"
// or "+0.12x"). `betterDirection` is 'down' or 'up' - the direction that counts as
// an improvement for this metric (ratio/price/rate: down; income: up).
export const computeDelta = (diff, formatted, betterDirection) => {
  if (diff === null) {
    return { text: '', className: 'info-delta' };
  }
  if (Math.abs(diff) < 0.001) {
    return { text: 'flat vs 1Y', className: 'info-delta' };
  }
  const isBetter =
    (diff < 0 && betterDirection === 'down') ||
    (diff > 0 && betterDirection === 'up');
  const arrow = diff > 0 ? '▲' : '▼';
  return {
    text: `${arrow} ${formatted} vs 1Y`,
    className: `info-delta ${isBetter ? 'better' : 'worse'}`,
  };
};
