# Mortgage Affordability Analysis Website

## Overview

This project is a web-based tool designed to help users analyze mortgage affordability based on their financial inputs such as income, expenses, interest rates, and loan terms. It provides estimates for maximum affordable home prices, monthly payments, and amortization schedules to aid in home-buying decisions.

The application is built as a user-friendly website, allowing interactive calculations and visualizations.

## Features

- **Affordability Calculator**: Input your income, down payment, loan term, and interest rate to get instant affordability estimates.
- **Payment Breakdown**: Detailed breakdown of principal, interest, taxes, and insurance (PITI).
- **Amortization Schedule**: Generate and view a full loan amortization table.
- **Sensitivity Analysis**: Explore how changes in interest rates or terms affect affordability.
- **Responsive Design**: Works on desktop and mobile devices.

## Technologies Used

- **Frontend**: HTML5, CSS3, JavaScript (with potential use of frameworks like React or vanilla JS for interactivity).
- **Backend**: Ruby for data processing and calculations.
- **Libraries**: Chart.js for visualizations, or similar for graphs of payment trends.
- **Data Sources**: Case-Shiller Home Price Index (via FRED API), Bureau of Labor Statistics (BLS) data.
- **Deployment**: Static hosting (e.g., GitHub Pages).

## Installation

1. **Clone the Repository**:

   ```
   git clone https://github.com/DanDanilyuk/mortgage_affordability_analysis.git
   cd mortgage_affordability_analysis
   ```

2. **Install Dependencies**:
   Ensure Ruby is installed (version 3.0 or higher recommended). Install required gems:

   ```
   bundle install
   ```

3. **Set Up API Keys**:
   Obtain API keys from:

   - [FRED API](https://fred.stlouisfed.org/docs/api/fred/) for Case-Shiller data.
   - [BLS API](https://www.bls.gov/developers/) for economic indicators.
     Set environment variables or pass them directly in commands (see Data Generation).

4. **Run Locally**:
   - Generate the necessary data (see Data Generation).
   - Open `index.html` in a web browser to use the application.

## Data Generation

To generate or update the dataset used for affordability calculations (e.g., Case-Shiller indices and BLS economic data):

1. Ensure you have the required API keys.
2. Run the Ruby script with the following command:
   ```
   ruby weekly_case_shiller.rb --bls-api-key YOUR_BLS_API_KEY --fred-api-key YOUR_FRED_API_KEY
   ```
   - Replace `YOUR_BLS_API_KEY` and `YOUR_FRED_API_KEY` with your actual API keys.
   - This script fetches and processes data, saving it to the appropriate data files used by the application.
3. The generated data will be stored in the project directory (e.g., `/data` folder) for use by the frontend.
4. After running the script, open `index.html` in a web browser to view the application.

## Usage

1. Open `index.html` in your browser.
2. Enter your financial details in the input form:
   - Annual income
   - Monthly debts
   - Desired down payment percentage
   - Loan term (years)
   - Estimated interest rate
3. Click "Calculate" to view results, including:
   - Maximum affordable home price
   - Estimated monthly mortgage payment
   - Affordability ratio
4. Use sliders or inputs to adjust variables and see real-time updates.
5. Export or print the results for reference.

Example inputs:

- Income: $80,000/year
- Down Payment: 20%
- Term: 30 years
- Rate: 4.5%

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2025 Dan Danilyuk

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Contact

Project maintained by [Dan Danilyuk](https://github.com/DanDanilyuk) – feel free to open an issue for feedback or questions.

---
