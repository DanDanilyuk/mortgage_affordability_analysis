// Defaults for URL params (non-default values are written to the URL)
export const DEFAULTS = { state: 'ALL', range: '2y', view: 'both', yaxis: 'auto' };
export const VALID_RANGES = ['1y', '2y', '5y', 'all'];
export const VALID_VIEWS = ['both', 'single', 'household'];
export const VIEW_TO_BTN = { both: 'btnBoth', single: 'btnSingle', household: 'btnHousehold' };
export const BTN_TO_VIEW = { btnBoth: 'both', btnSingle: 'single', btnHousehold: 'household' };

export const STATE_NAMES = {
  ALL: 'U.S.A', AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas',
  CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii',
  ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas',
  KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma',
  OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia',
  WI: 'Wisconsin', WY: 'Wyoming',
};
