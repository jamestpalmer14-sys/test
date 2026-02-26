const $ = (id) => document.getElementById(id);

const state = {
  compensationSchedule: null,
  mixSchedule: null,
};

function parseUpload(file, onParsed) {
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || "").trim();
    if (!text) return;
    let rows = [];

    if (file.name.endsWith(".json")) {
      rows = JSON.parse(text);
    } else {
      const [headerLine, ...lines] = text.split(/\r?\n/).filter(Boolean);
      const headers = headerLine.split(",").map((h) => h.trim());
      rows = lines.map((line) => {
        const cols = line.split(",").map((c) => c.trim());
        const record = {};
        headers.forEach((h, idx) => {
          const value = cols[idx];
          const num = Number(value);
          record[h] = Number.isFinite(num) ? num : value;
        });
        return record;
      });
    }

    onParsed(rows);
  };
  reader.readAsText(file);
}

function fmtMoney(v) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);
}

function monthlyPayment(principal, annualRatePct, years) {
  const r = annualRatePct / 100 / 12;
  const n = years * 12;
  if (r === 0) return principal / n;
  return principal * (r * (1 + r) ** n) / ((1 + r) ** n - 1);
}

function annualCompForYear(base, growth, yearIdx) {
  return base * (1 + growth / 100) ** yearIdx;
}

function project(inputs) {
  const rows = [];
  let netWorth = inputs.savings;

  for (let i = 0; i < inputs.years; i += 1) {
    const defaultGross = annualCompForYear(inputs.salary + inputs.bonus + inputs.deferred, inputs.incomeGrowth, i);
    const fileComp = state.compensationSchedule?.[i];
    const gross = fileComp
      ? (fileComp.salary || 0) + (fileComp.bonus || 0) + (fileComp.deferred || 0)
      : defaultGross;

    const afterTax = gross * (1 - inputs.taxRate / 100);

    const equityWeight = (state.mixSchedule?.find((a) => String(a.asset).toLowerCase() === "equity")?.weight ?? inputs.equityMix) / 100;
    const baseReturn = inputs.portfolioReturn / 100;
    const shock = i + 1 === inputs.shockYear ? inputs.equityShock / 100 : 0;
    const effectiveReturn = baseReturn + equityWeight * shock;

    const cashSurplus = afterTax - inputs.annualSpend;
    const investmentReturn = Math.max(0, netWorth) * effectiveReturn;
    netWorth += cashSurplus + investmentReturn;

    rows.push({
      year: i + 1,
      gross,
      afterTax,
      spend: inputs.annualSpend,
      investmentReturn,
      endingNetWorth: netWorth,
    });
  }

  return rows;
}

function drawChart(rows) {
  const canvas = $("trendChart");
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (!rows.length) return;
  const vals = rows.map((r) => r.endingNetWorth);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(1, max - min);

  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2;
  ctx.beginPath();

  rows.forEach((r, i) => {
    const x = 20 + (i / (rows.length - 1 || 1)) * (w - 40);
    const y = h - 20 - ((r.endingNetWorth - min) / span) * (h - 40);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  ctx.stroke();
  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px sans-serif";
  ctx.fillText(`Min ${fmtMoney(min)}`, 16, h - 6);
  ctx.fillText(`Max ${fmtMoney(max)}`, w - 160, h - 6);
}

function render(rows, inputs) {
  const tbody = $("projectionTable").querySelector("tbody");
  tbody.innerHTML = "";
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.year}</td>
      <td>${fmtMoney(r.gross)}</td>
      <td>${fmtMoney(r.afterTax)}</td>
      <td>${fmtMoney(r.spend)}</td>
      <td>${fmtMoney(r.investmentReturn)}</td>
      <td>${fmtMoney(r.endingNetWorth)}</td>
    `;
    tbody.appendChild(tr);
  });

  const firstYearGrossMonthly = rows[0].gross / 12;
  const dtiPaymentCap = firstYearGrossMonthly * (inputs.dtiCap / 100);
  const maxAffordableMortgage = (() => {
    const monthlyRate = inputs.mortgageRate / 100 / 12;
    const n = inputs.mortgageTerm * 12;
    const maxPI = dtiPaymentCap;
    const mortgage = monthlyRate === 0
      ? maxPI * n
      : maxPI * (((1 + monthlyRate) ** n - 1) / (monthlyRate * (1 + monthlyRate) ** n));
    return Math.max(0, mortgage);
  })();

  const finalNetWorth = rows.at(-1)?.endingNetWorth || 0;
  const availableDown = Math.max(0, finalNetWorth) * (inputs.downPaymentPct / 100);
  const dtiConstrainedHome = maxAffordableMortgage / (1 - inputs.downPaymentPct / 100);
  const assetConstrainedHome = availableDown / (inputs.downPaymentPct / 100 || 1);
  const affordableHome = Math.max(0, Math.min(dtiConstrainedHome, assetConstrainedHome));

  const candidatePmt = monthlyPayment(inputs.candidateMortgage, inputs.mortgageRate, inputs.mortgageTerm);
  const candidateHousing = candidatePmt + (inputs.candidateMortgage / (1 - inputs.downPaymentPct / 100 || 1)) * (inputs.ptiPct / 100) / 12;
  const candidateDTI = (candidateHousing / firstYearGrossMonthly) * 100;

  $("summary").innerHTML = `
    <div class="metric">Estimated max affordable home price<strong>${fmtMoney(affordableHome)}</strong></div>
    <div class="metric">Max mortgage from DTI cap<strong>${fmtMoney(maxAffordableMortgage)}</strong></div>
    <div class="metric">Projected down payment capital<strong>${fmtMoney(availableDown)}</strong></div>
    <div class="metric">Candidate mortgage monthly payment<strong>${fmtMoney(candidatePmt)}</strong></div>
    <div class="metric">Candidate implied DTI<strong>${candidateDTI.toFixed(1)}%</strong></div>
    <div class="metric">10-yr projected net worth<strong>${fmtMoney(finalNetWorth)}</strong></div>
  `;

  drawChart(rows);
}

function readInputs() {
  const toNum = (id) => Number($(id).value || 0);
  const bondMix = toNum("bondMix");
  const equityMix = toNum("equityMix");

  if (equityMix + bondMix !== 100) {
    console.warn("Investment mix does not sum to 100%; continuing anyway.");
  }

  return {
    salary: toNum("salary"),
    bonus: toNum("bonus"),
    deferred: toNum("deferred"),
    savings: toNum("savings"),
    equityMix,
    portfolioReturn: toNum("portfolioReturn"),
    years: toNum("years"),
    incomeGrowth: toNum("incomeGrowth"),
    taxRate: toNum("taxRate"),
    annualSpend: toNum("annualSpend"),
    equityShock: toNum("equityShock"),
    shockYear: toNum("shockYear"),
    mortgageRate: toNum("mortgageRate"),
    mortgageTerm: toNum("mortgageTerm"),
    dtiCap: toNum("dtiCap"),
    downPaymentPct: toNum("downPaymentPct"),
    ptiPct: toNum("ptiPct"),
    candidateMortgage: toNum("candidateMortgage"),
  };
}

$("runBtn").addEventListener("click", () => {
  const inputs = readInputs();
  const rows = project(inputs);
  render(rows, inputs);
});

$("compUpload").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  parseUpload(file, (rows) => {
    state.compensationSchedule = rows;
  });
});

$("mixUpload").addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  parseUpload(file, (rows) => {
    state.mixSchedule = rows;
  });
});

// Run once on load with defaults.
$("runBtn").click();
