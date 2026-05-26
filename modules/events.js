// Significant U.S. housing market events surfaced as vertical chart guides.
// `date` is the closest Thursday to the actual event; the chart will align
// the marker to that label. `short` shows on the chart, `label` in tooltip.

export const HOUSING_EVENTS = [
  { date: '2020-03-19', short: 'COVID',     label: 'Fed cuts rates to near zero (COVID emergency)' },
  { date: '2021-01-07', short: 'Boom',      label: 'Pandemic housing boom kicks off' },
  { date: '2022-03-17', short: 'Fed hikes', label: 'Fed begins rate-hike cycle' },
  { date: '2023-03-09', short: 'SVB',       label: 'SVB collapse / banking stress' },
  { date: '2023-10-19', short: '~8% peak',  label: '30-year mortgage rate peaks near 8%' },
  { date: '2024-09-19', short: 'Fed cuts',  label: 'Fed begins rate-cut cycle (-50bps)' },
];
