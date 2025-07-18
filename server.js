// server.js
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const db = new Pool({
  host:     'localhost',
  user:     'postgres',
  password: 'Abdi@911',
  database: 'financial_statements',
  port:     5432,
});

db.connect()
  .then(() => console.log('Connected to PostgreSQL!'))
  .catch(err => console.error('PostgreSQL connection error:', err.message));

function getCompany(req) {
  const c = req.query.company?.toUpperCase();
  if (!c) throw new Error('Missing required “company” query parameter');
  return c;
}

// 1) list all available symbols
app.get('/companies', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT DISTINCT symbol
      FROM income_statements
      ORDER BY symbol;
    `);
    res.json(rows.map(r => r.symbol));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 2) annual financials (millions)
app.get('/annual-financials', async (req, res) => {
  let symbol;
  try { symbol = getCompany(req); }
  catch (err) { return res.status(400).json({ error: err.message }); }

  try {
    const { rows } = await db.query(`
      SELECT
        i.calendar_year,
        SUM(i.revenue)                                   AS revenue,
        SUM(i.cost_of_revenue)                           AS cogs,
        SUM(i.gross_profit)                              AS grossprofit,
        SUM(i.selling_general_and_administrative_expenses) AS sga,
        SUM(i.research_and_development_expenses)         AS rnd,
        SUM(i.operating_income)                          AS ebit,
        SUM(i.depreciation_and_amortization)             AS da,
        SUM(i.income_tax_expense)                        AS tax,
        SUM(c.capital_expenditure)                       AS capex,
        SUM(c.change_in_working_capital)                 AS wc
      FROM income_statements i
      JOIN cashflow_statements c
        ON i.symbol        = c.symbol
       AND i.calendar_year = c.calendar_year
       AND i.period        = c.period
      WHERE i.symbol = $1
      GROUP BY i.calendar_year
      ORDER BY i.calendar_year DESC
      LIMIT 5;
    `, [symbol]);

    const payload = rows.reverse().map(r => ({
      calendar_year: r.calendar_year,
      revenue:       Number(r.revenue)   / 1e6,
      cogs:          Number(r.cogs)      / 1e6,
      grossprofit:   Number(r.grossprofit)/ 1e6,
      sga:           Number(r.sga)       / 1e6,
      rnd:           Number(r.rnd)       / 1e6,
      ebit:          Number(r.ebit)      / 1e6,
      da:            Number(r.da)        / 1e6,
      tax:           Number(r.tax)       / 1e6,
      capex:         Number(r.capex)     / 1e6,
      wc:            Number(r.wc)        / 1e6,
    }));

    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 3) distinct years for chosen symbol
app.get('/years', async (req, res) => {
  let symbol;
  try { symbol = getCompany(req); }
  catch (err) { return res.status(400).json({ error: err.message }); }

  try {
    const { rows } = await db.query(`
      SELECT DISTINCT calendar_year
      FROM income_statements
      WHERE symbol = $1
      ORDER BY calendar_year DESC;
    `, [symbol]);
    res.json(rows.map(r => r.calendar_year));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 4) distinct periods for chosen symbol
app.get('/periods', async (req, res) => {
  let symbol;
  try { symbol = getCompany(req); }
  catch (err) { return res.status(400).json({ error: err.message }); }

  try {
    const { rows } = await db.query(`
      SELECT DISTINCT period
      FROM income_statements
      WHERE symbol = $1
      ORDER BY period;
    `, [symbol]);
    res.json(rows.map(r => r.period));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 5) single‑quarter financials for chosen symbol
app.get('/filtered-financials', async (req, res) => {
  let symbol;
  try { symbol = getCompany(req); }
  catch (err) { return res.status(400).json({ error: err.message }); }

  try {
    const { rows } = await db.query(`
      WITH cf AS (
        SELECT symbol, calendar_year, period, capital_expenditure, change_in_working_capital
        FROM cashflow_statements
        WHERE symbol = $1
      )
      SELECT DISTINCT ON (i.calendar_year, i.period)
        i.calendar_year,
        i.period,
        i.revenue,
        i.cost_of_revenue   AS cogs,
        i.gross_profit      AS grossprofit,
        i.selling_general_and_administrative_expenses AS sga,
        i.research_and_development_expenses           AS rnd,
        i.depreciation_and_amortization                AS da,
        i.income_tax_expense                           AS tax,
        cf.capital_expenditure                         AS capex,
        cf.change_in_working_capital                   AS wc
      FROM income_statements i
      LEFT JOIN cf
        ON i.symbol        = cf.symbol
       AND i.calendar_year = cf.calendar_year
       AND i.period        = cf.period
      WHERE i.symbol = $1
      ORDER BY i.calendar_year DESC, i.period DESC;
    `, [symbol]);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 6) four‑quarter trend for any metric
app.get('/trend-data', async (req, res) => {
  let symbol;
  try { symbol = getCompany(req); }
  catch (err) { return res.status(400).json({ error: err.message }); }

  const metric = req.query.metric;
  if (!metric) return res.status(400).json({ error: 'Missing required “metric” query parameter' });

  try {
    const { rows } = await db.query(`
      SELECT calendar_year, period, ${metric}
      FROM income_statements
      WHERE symbol = $1
      ORDER BY date DESC
      LIMIT 4;
    `, [symbol]);

    const trend = rows.reverse().map(r => ({
      label: `${r.calendar_year} ${r.period}`,
      value: r[metric]
    }));
    res.json(trend);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 7) DCF input data (estimated FCF in millions)
app.get('/dcf-data', async (req, res) => {
  let symbol;
  try { symbol = getCompany(req); }
  catch (err) { return res.status(400).json({ error: err.message }); }

  try {
    const { rows } = await db.query(`
      SELECT
        calendar_year,
        (SUM(income_before_tax) + SUM(depreciation_and_amortization)) AS estimatedfcf
      FROM income_statements
      WHERE symbol = $1
      GROUP BY calendar_year
      ORDER BY calendar_year DESC
      LIMIT 5;
    `, [symbol]);

    const payload = rows.reverse().map(r => ({
      calendar_year: r.calendar_year,
      estimatedfcf:  Number(r.estimatedfcf) / 1e6
    }));
    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// 8) DCF runner
app.post('/api/run_dcf', (req, res) => {
  const { revenue, cogs, sga, rnd, da, capex, wc } = req.body;
  const gp   = revenue.map((r, i) => r - cogs[i]);
  const fcff = gp.map((g, i) => g - sga[i] - rnd[i] + da[i] - capex[i] - wc[i]);
  res.json({ gp, fcff });
});

app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
