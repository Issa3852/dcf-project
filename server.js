const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Rogersfam!', // update if your password is different
  database: 'Income_Statement'
});

db.connect(err => {
  if (err) {
    console.error('MySQL connection error:', err);
    return;
  }
  console.log('Connected to MySQL!');
});

// ✅ Get list of company tables
app.get('/companies', (req, res) => {
  db.query('SHOW TABLES FROM Income_Statement', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    const companies = results.map(row => Object.values(row)[0]);
    res.json(companies);
  });
});

// ✅ Get distinct calendar years
app.get('/years', (req, res) => {
  db.query('SELECT DISTINCT calendarYear FROM aapl ORDER BY calendarYear DESC', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results.map(r => r.calendarYear));
  });
});

// ✅ Get distinct reporting periods
app.get('/periods', (req, res) => {
  db.query('SELECT DISTINCT period FROM aapl', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results.map(r => r.period));
  });
});

// ✅ Get single-quarter financials
app.get('/filtered-financials', (req, res) => {
  const { company, year, period } = req.query;
  if (!company || !year || !period) return res.status(400).json({ error: 'Missing query params' });

  const sql = 'SELECT revenue, netIncome, ebitda FROM ?? WHERE calendarYear = ? AND period = ?';
  db.query(sql, [company, year, period], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

// ✅ Get 4 most recent quarters for a metric
app.get('/trend-data', (req, res) => {
  const { company, metric } = req.query;
  if (!company || !metric) return res.status(400).json({ error: 'Missing company or metric' });

  const sql = 'SELECT calendarYear, period, ?? AS value FROM ?? ORDER BY date DESC LIMIT 4';
  db.query(sql, [metric, company], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    const sorted = results.reverse().map(row => ({
      label: `${row.calendarYear} ${row.period}`,
      value: row.value
    }));
    res.json(sorted);
  });
});

// ✅ NEW — DCF input data route (sum full fiscal years from quarters)
app.get('/dcf-data', (req, res) => {
  const sql = `
    SELECT 
      calendarYear,
      SUM(netIncome) AS netIncome,
      SUM(depreciationAndAmortization) AS depreciationAndAmortization,
      SUM(netIncome) + SUM(depreciationAndAmortization) AS estimatedFCF
    FROM aapl
    GROUP BY calendarYear
    ORDER BY calendarYear DESC
    LIMIT 5;
  `;
  
  db.query(sql, (err, results) => {
    if (err) {
      console.error('MySQL error:', err);
      return res.status(500).json({ error: err.message });
    }
    res.json(results.reverse());
  });
});


// ✅ Company info for sidebar (mocked)
app.get('/company-info', (req, res) => {
  const { symbol } = req.query;
  if (!symbol) return res.status(400).json({ error: 'Missing symbol' });

  const mockData = {
    aapl: {
      name: 'Apple Inc.',
      industry: 'Technology Hardware',
      sector: 'Information Technology',
      logo: 'https://logo.clearbit.com/apple.com'
    },
    msft: {
      name: 'Microsoft Corp.',
      industry: 'Software',
      sector: 'Information Technology',
      logo: 'https://logo.clearbit.com/microsoft.com'
    },
    nvda: {
      name: 'NVIDIA Corporation',
      industry: 'Semiconductors',
      sector: 'Information Technology',
      logo: 'https://logo.clearbit.com/nvidia.com'
    }
  };

  const info = mockData[symbol.toLowerCase()] || {
    name: symbol.toUpperCase(),
    industry: 'Unknown',
    sector: 'Unknown',
    logo: 'https://via.placeholder.com/100'
  };

  res.json(info);
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
