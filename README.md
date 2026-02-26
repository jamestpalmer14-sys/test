# Finance Projection & House Affordability Planner

A lightweight browser app for projecting personal finances and estimating house affordability under stress-tested scenarios.

## Features

- Input salary, annual bonus, deferred compensation, and current savings.
- Upload compensation schedules (`.csv` or `.json`) by year.
- Configure investment mix and optional asset-weight upload.
- Stress test assumptions:
  - income growth
  - tax rate
  - equity shock magnitude and timing
  - spending
- Evaluate housing scenarios by varying:
  - mortgage size
  - mortgage rate and term
  - down payment percent
  - DTI cap
- Review yearly projection table + net worth trend chart.

## Run locally

Because this is a static app, any local web server works.

```bash
python3 -m http.server 4173
```

Then visit: http://localhost:4173

## Upload formats

### Compensation CSV

```csv
year,salary,bonus,deferred
1,220000,40000,25000
2,228800,42000,28000
```

### Investment mix CSV

```csv
asset,weight
equity,70
bond,30
```

JSON uploads can use arrays of objects with equivalent keys.
