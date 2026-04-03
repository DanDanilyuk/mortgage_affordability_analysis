# Home Affordability Tracker

A single-page dashboard tracking U.S. home affordability trends by comparing mortgage costs to income over time. Updated weekly with data from federal sources, covering all 50 states and Washington, D.C.

Live at [homeaffordabilitytracker.com](https://homeaffordabilitytracker.com/)

## What It Shows

The dashboard charts the **price-to-income ratio** - the total cost of a 30-year mortgage (principal + interest) divided by annual earnings. A higher ratio means housing is less affordable relative to income.

- **Single earner** and **dual income (1.4x)** household views
- State-level breakdowns using state-specific income multipliers and home prices
- Interactive chart with zoom, pan, date range selection, and data point inspection
- Dark mode with system preference detection

## Data Sources

- **Earnings**: BLS Average Weekly Earnings, Total Private (CES0500000011)
- **Home Prices**: Zillow Home Value Index (ZHVI) via FRED, national and per-state
- **Mortgage Rates**: Freddie Mac 30-Year Fixed Rate via FRED (MORTGAGE30US)
- **State Income Multipliers**: BLS Quarterly Census of Employment and Wages (QCEW), comparing each state's private sector average weekly wage to the national figure

## Tech Stack

- **Frontend**: Vanilla JavaScript (ES6+), HTML, CSS with custom properties for theming
- **Charts**: Chart.js 4.4.0 with chartjs-plugin-zoom
- **Data Pipeline**: Ruby script (`weekly_case_shiller.rb`) fetching from BLS and FRED APIs
- **Automation**: GitHub Actions workflow runs every Thursday, regenerating all data files
- **Hosting**: GitHub Pages - no build step, static files served directly

## Running Locally

### Prerequisites

- Ruby (3.0+)
- A [BLS API key](https://www.bls.gov/developers/)
- A [FRED API key](https://fred.stlouisfed.org/docs/api/fred/)

### Generate Data

```sh
ruby weekly_case_shiller.rb --bls-api-key YOUR_BLS_KEY --fred-api-key YOUR_FRED_KEY
```

To generate data for a single state:

```sh
ruby weekly_case_shiller.rb --bls-api-key YOUR_BLS_KEY --fred-api-key YOUR_FRED_KEY --state CA
```

Then open `index.html` in a browser.

## License

MIT License. See [LICENSE](LICENSE) for details.
