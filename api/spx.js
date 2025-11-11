// api/spx.js
// Vercel serverless function that proxies ^GSPC data from Yahoo
// and returns { series: [{ time, value }, ...] } for the frontend.

export default async function handler(req, res) {
  try {
    const { range = "2y", interval = "1d" } = req.query;

    const symbol = "^GSPC";
    const url =
      "https://query1.finance.yahoo.com/v8/finance/chart/" +
      encodeURIComponent(symbol) +
      "?range=" +
      encodeURIComponent(range) +
      "&interval=" +
      encodeURIComponent(interval);

    const upstream = await fetch(url);
    if (!upstream.ok) {
      return res
        .status(502)
        .json({ error: "Upstream failed", status: upstream.status });
    }

    const j = await upstream.json();
    const result = j && j.chart && j.chart.result && j.chart.result[0];
    const ts = result && result.timestamp;
    const close =
      result &&
      result.indicators &&
      result.indicators.quote &&
      result.indicators.quote[0] &&
      result.indicators.quote[0].close;

    if (!ts || !close) {
      return res.status(500).json({ error: "Bad upstream data" });
    }

    const series = ts
      .map((t, i) => ({
        time: t * 1000, // ms since epoch
        value: close[i],
      }))
      .filter((p) => Number.isFinite(p.value));

    res.status(200).json({ series });
  } catch (err) {
    console.error("Error in /api/spx:", err);
    res.status(500).json({ error: "Internal error" });
  }
}