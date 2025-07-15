const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const db = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: 'Abdi@911',
  database: 'financial_statements',
  port: 5432,
});

db.connect()
  .then(() => console.log('Connected to PostgreSQL!'))
  .catch(err => console.error('PostgreSQL connection error:', err));

// Annual financials for historical DCF table (in millions)
app.get('/annual-financials', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        i.calendar_year,
        SUM(i.revenue) AS revenue,
        SUM(i.cost_of_revenue) AS cogs,
        SUM(i.gross_profit) AS grossprofit,
        SUM(i.selling_general_and_administrative_expenses) AS sga,
        SUM(i.research_and_development_expenses) AS rnd,
        SUM(i.operating_income) AS ebit,
        SUM(i.depreciation_and_amortization) AS da,
        SUM(i.income_tax_expense) AS tax,
        SUM(c.capital_expenditure) AS capex,
        SUM(c.change_in_working_capital) AS wc
      FROM income_statements i
      JOIN cashflow_statements c
        ON i.ticker = c.ticker AND i.calendar_year = c.calendar_year
      WHERE i.ticker = 'AAPL'
      GROUP BY i.calendar_year
      ORDER BY i.calendar_year DESC
      LIMIT 5;
    `);

    const rows = result.rows.reverse().map(r => ({
      calendar_year: r.calendar_year,
      revenue: Number(r.revenue) / 1e6,
      cogs: Number(r.cogs) / 1e6,
      grossprofit: Number(r.grossprofit) / 1e6,
      sga: Number(r.sga) / 1e6,
      rnd: Number(r.rnd) / 1e6,
      ebit: Number(r.ebit) / 1e6,
      da: Number(r.da) / 1e6,
      tax: Number(r.tax) / 1e6,
      capex: Number(r.capex) / 1e6,
      wc: Number(r.wc) / 1e6
    }));

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// List of companies
app.get('/companies', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public';`
    );
    res.json(result.rows.map(r => r.tablename));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Available calendar years for AAPL
app.get('/years', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT calendar_year FROM income_statements WHERE ticker = 'AAPL' ORDER BY calendar_year DESC;`
    );
    res.json(result.rows.map(r => r.calendar_year));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Available reporting periods for AAPL
app.get('/periods', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT DISTINCT period FROM income_statements WHERE ticker = 'AAPL';`
    );
    res.json(result.rows.map(r => r.period));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Single-quarter financials using DISTINCT ON for all quarters
app.get('/filtered-financials', async (req, res) => {
  const { company } = req.query;
  if (!company) {
    return res.status(400).json({ error: 'Missing company param' });
  }
  try {
    const result = await db.query(
      `WITH cf AS (
         SELECT ticker, calendar_year, period, capital_expenditure, change_in_working_capital
         FROM cashflow_statements
         WHERE ticker = $1
       )
       SELECT DISTINCT ON (i.calendar_year, i.period)
         i.calendar_year,
         i.period,
         i.revenue,
         i.cost_of_revenue AS cogs,
         i.gross_profit AS grossprofit,
         i.selling_general_and_administrative_expenses AS sga,
         i.research_and_development_expenses AS rnd,
         i.depreciation_and_amortization AS da,
         i.income_tax_expense AS tax,
         cf.capital_expenditure AS capex,
         cf.change_in_working_capital AS wc
       FROM income_statements i
       LEFT JOIN cf
         ON i.ticker = cf.ticker
        AND i.calendar_year = cf.calendar_year
        AND i.period = cf.period
       WHERE i.ticker = $1
       ORDER BY i.calendar_year DESC, i.period DESC;`,
      [company]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Four-quarter trend for a metric
app.get('/trend-data', async (req, res) => {
  const { company, metric } = req.query;
  if (!company || !metric) {
    return res.status(400).json({ error: 'Missing params' });
  }
  try {
    const result = await db.query(
      `SELECT calendar_year, period, ${metric}
       FROM income_statements
       WHERE ticker = $1
       ORDER BY date DESC
       LIMIT 4;`,
      [company]
    );
    const sorted = result.rows.reverse().map(r => ({ label: `${r.calendar_year} ${r.period}`, value: r[metric] }));
    res.json(sorted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DCF input data route
app.get('/dcf-data', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT calendar_year, SUM(income_before_tax) + SUM(depreciation_and_amortization) AS estimatedfcf
       FROM income_statements
       WHERE ticker = 'AAPL'
       GROUP BY calendar_year
       ORDER BY calendar_year DESC
       LIMIT 5;`
    );
    res.json(result.rows.reverse());
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// DCF runner endpoint
app.post('/api/run_dcf', async (req, res) => {
  const { revenue, cogs, sga, rnd, da, capex, wc } = req.body;
  const gp = revenue.map((r, i) => r - cogs[i]);
  const fcff = gp.map((g, i) => g - sga[i] - rnd[i] + da[i] - capex[i] - wc[i]);
  res.json({ gp, fcff });
});

// Start server
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
