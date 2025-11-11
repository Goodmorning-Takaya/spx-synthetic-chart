import { useEffect, useMemo, useRef, useState } from "react";

/** Simple local UI components so this works in a plain Vite app */
function Card({ className = "", children }) {
  return (
    <div className={"rounded-2xl border bg-white shadow " + className}>
      {children}
    </div>
  );
}

function CardContent({ className = "", children }) {
  return <div className={className}>{children}</div>;
}

function Button({ className = "", children, variant = "primary", ...props }) {
  const base =
    "px-3 py-2 text-sm font-medium rounded-2xl border transition-colors";
  const styles =
    variant === "secondary"
      ? " bg-slate-50 hover:bg-slate-100 border-slate-300"
      : " bg-slate-900 text-white hover:bg-slate-700 border-slate-900";
  return (
    <button {...props} className={base + styles + " " + className}>
      {children}
    </button>
  );
}

/*******************************************
 * LIVE SYNTHETIC S&P 500 (±1×…±10× SPX)
 *******************************************/

// -----------------------------------------
// UI options
// -----------------------------------------
const INTERVAL_OPTIONS = [
  { label: "1m", value: "1" },
  { label: "5m", value: "5" },
  { label: "15m", value: "15" },
  { label: "1h", value: "60" },
  { label: "1D", value: "D" },
  { label: "1W", value: "W" },
  { label: "1M", value: "M" },
];

const Y_SCALE_OPTIONS = [
  { label: "Linear", value: "linear" },
  { label: "Log", value: "log" },
  { label: "% (from left)", value: "percent" },
];

// Synthetic leverage options: label is just "+2x SPX", "-5x SPX" etc.
function buildSyntheticOptions() {
  const opts = [];
  for (let k = 1; k <= 10; k++) {
    opts.push({ label: "+" + k + "x SPX", value: "SYNTHETIC:+" + k });
  }
  for (let k = 1; k <= 10; k++) {
    opts.push({ label: "-" + k + "x SPX", value: "SYNTHETIC:-" + k });
  }
  return opts;
}
const SYNTHETIC_PRESETS = buildSyntheticOptions();

// -----------------------------------------
// Utility helpers
// -----------------------------------------
function isSynthetic(value) {
  return typeof value === "string" && value.indexOf("SYNTHETIC:") === 0;
}

function parseLeverage(value) {
  if (!isSynthetic(value)) return null;
  var sign = value.indexOf(":-") !== -1 ? -1 : 1;
  var raw = value.split(":")[1] || "";
  raw = raw.replace("+", "").replace("-", "");
  var n = Number(raw);
  if (!isFinite(n)) return null;
  return sign * n;
}

function formatDate(ts) {
  var d = new Date(ts);
  return d.toLocaleString();
}

// Safe mappers
function toTheme(v) {
  return v === "dark" ? "dark" : "light";
}

function toYMode(v) {
  if (v === "log" || v === "percent" || v === "linear") return v;
  return "linear";
}

// -----------------------------------------
// Data helpers
// -----------------------------------------
const YAHOO_INTERVAL_MAP = {
  "1": "1m",
  "5": "5m",
  "15": "15m",
  "60": "60m",
  D: "1d",
  W: "1wk",
  M: "1mo",
};

/**
 * Frontend data fetcher: calls our own backend /api/spx
 * which in turn talks to Yahoo (or another data source).
 *
 * The backend should return:
 *   { series: [{ time: number(ms since epoch), value: number }, ...] }
 */
async function fetchYahooSPX(range, interval) {
  const url =
    "/api/spx?range=" +
    encodeURIComponent(range) +
    "&interval=" +
    encodeURIComponent(interval);

  const r = await fetch(url);
  if (!r.ok) {
    throw new Error("Backend /api/spx failed: " + r.status);
  }

  const j = await r.json();
  if (!j.series || !Array.isArray(j.series)) {
    throw new Error("Missing series from /api/spx");
  }

  // Normalize & sanity-filter series
  return j.series
    .map((p) => ({
      time: p.time,
      value: p.value,
    }))
    .filter((p) => Number.isFinite(p.value) && typeof p.time === "number");
}

function buildSyntheticSeries(spx, leverage, baseStart) {
  if (!spx || spx.length === 0) return [];
  if (typeof baseStart !== "number") baseStart = 100;
  var base = baseStart;
  var out = [];
  for (var i = 0; i < spx.length; i++) {
    if (i === 0) {
      out.push({ time: spx[i].time, value: base });
      continue;
    }
    var prev = spx[i - 1].value;
    var curr = spx[i].value;
    var r = prev ? (curr - prev) / prev : 0;
    base = base * (1 + leverage * r);
    out.push({ time: spx[i].time, value: base });
  }
  return out;
}

// Demo fallback if network is blocked / backend fails
function buildDemoSPX(n) {
  if (!n) n = 240;
  var out = [];
  var price = 4500;
  var start = Date.now() - n * 60 * 60 * 1000;
  for (var i = 0; i < n; i++) {
    var drift = 0.0002;
    var shock = (Math.sin(i / 12) + Math.random() - 0.5) * 5;
    price = Math.max(1, price * (1 + drift) + shock);
    out.push({ time: start + i * 60 * 60 * 1000, value: price });
  }
  return out;
}

// -----------------------------------------
// Axis + scale utilities
// -----------------------------------------
function intervalToStepMs(interval) {
  switch (interval) {
    case "1":
      return 60 * 1000;
    case "5":
      return 5 * 60 * 1000;
    case "15":
      return 15 * 60 * 1000;
    case "60":
      return 60 * 60 * 1000;
    case "D":
      return 24 * 60 * 60 * 1000;
    case "W":
      return 7 * 24 * 60 * 60 * 1000;
    case "M":
      return null;
    default:
      return 24 * 60 * 60 * 1000;
  }
}

function alignToInterval(ts, interval) {
  var d = new Date(ts);
  if (interval === "M") {
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (interval === "W") {
    var day = d.getUTCDay();
    var diff = (day + 6) % 7;
    d.setUTCDate(d.getUTCDate() - diff);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (interval === "D") {
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  }
  if (interval === "60") {
    d.setUTCMinutes(0, 0, 0);
    return d.getTime();
  }
  if (interval === "15") {
    d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 15) * 15, 0, 0);
    return d.getTime();
  }
  if (interval === "5") {
    d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 5) * 5, 0, 0);
    return d.getTime();
  }
  if (interval === "1") {
    d.setUTCSeconds(0, 0);
    return d.getTime();
  }
  return d.getTime();
}

function addInterval(ts, interval) {
  if (interval === "M") {
    var d = new Date(ts);
    d.setUTCMonth(d.getUTCMonth() + 1);
    return d.getTime();
  }
  var step = intervalToStepMs(interval);
  if (!step) step = 24 * 60 * 60 * 1000;
  return ts + step;
}

function tickLabel(ts, interval) {
  var d = new Date(ts);
  if (interval === "1" || interval === "5" || interval === "15" || interval === "60") {
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  if (interval === "D" || interval === "W") {
    return d.toLocaleDateString(undefined, { month: "short", day: "2-digit" });
  }
  return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// Core path + ticks generator
function useChartPath(data, width, height, padLeft, interval, domain, yMode, rightMargin) {
  return useMemo(
    function () {
      if (!data || data.length === 0) {
        return {
          path: "",
          xTicks: [],
          xLabels: [],
          yTicks: [],
          xScale: function (t) { return t; },
          yScale: function (v) { return v; },
          last: null,
          anchor: 0,
        };
      }

      var dataXMin = data[0].time;
      var dataXMax = data[data.length - 1].time;
      var xMin = Math.max(domain.x0, dataXMin);
      var xMax = Math.min(domain.x1, dataXMax);

      var slice = data.filter(function (d) { return d.time >= xMin && d.time <= xMax; });
      if (!slice.length) slice = data.slice();
      var anchor = slice[0].value;

      var values = slice.map(function (s) { return s.value; });
      var useLog = yMode === "log" && values.every(function (v) { return v > 0; });
      var tf;
      if (useLog) {
        tf = function (v) { return Math.log(v); };
      } else if (yMode === "percent") {
        tf = function (v) {
          var ref = Math.max(1e-9, anchor);
          return (v / ref - 1) * 100;
        };
      } else {
        tf = function (v) { return v; };
      }

      var invf;
      if (useLog) {
        invf = function (v) { return Math.exp(v); };
      } else if (yMode === "percent") {
        invf = function (p) {
          var ref = Math.max(1e-9, anchor);
          return ref * (1 + p / 100);
        };
      } else {
        invf = function (v) { return v; };
      }

      var tVals = values.map(tf);
      var tMin = Math.min.apply(null, tVals);
      var tMax = Math.max.apply(null, tVals);
      if (!(isFinite(tMin) && isFinite(tMax))) {
        tMin = 0;
        tMax = 1;
      }
      if (tMin === tMax) {
        tMin -= 1;
        tMax += 1;
      }
      var padTopBottom = (tMax - tMin) * 0.1;
      tMin -= padTopBottom;
      tMax += padTopBottom;

      var xScale = function (t) {
        return (
          padLeft + ((t - xMin) / Math.max(1, xMax - xMin)) * (width - padLeft - rightMargin)
        );
      };
      var yScale = function (v) {
        return (
          height -
          padLeft -
          ((tf(v) - tMin) / Math.max(1e-9, tMax - tMin)) * (height - 2 * padLeft)
        );
      };

      var dPath = "";
      for (var i = 0; i < slice.length; i++) {
        var x = xScale(slice[i].time);
        var y = yScale(slice[i].value);
        dPath += i === 0 ? "M " + x + " " + y : " L " + x + " " + y;
      }

      var xTicks = [];
      var t = alignToInterval(xMin, interval);
      var guard = 5000;
      var count = 0;
      while (t <= xMax && count < guard) {
        xTicks.push({ x: xScale(t), ts: t });
        t = addInterval(t, interval);
        count++;
      }
      if (xTicks.length < 2) {
        xTicks.push({ x: xScale(xMin), ts: xMin });
        xTicks.push({ x: xScale(xMax), ts: xMax });
      }

      var MIN_GAP = 80;
      var xLabels = [];
      var lastLabeledX = -Infinity;
      xTicks.forEach(function (tick) {
        if (tick.x - lastLabeledX >= MIN_GAP) {
          xLabels.push({ x: tick.x, label: tickLabel(tick.ts, interval) });
          lastLabeledX = tick.x;
        }
      });
      if (xLabels.length > 0) {
        var first = xLabels[0];
        var lastLabel = xLabels[xLabels.length - 1];
        var wantsFirst = Math.abs(first.x - xTicks[0].x) > MIN_GAP / 2;
        var wantsLast = Math.abs(lastLabel.x - xTicks[xTicks.length - 1].x) > MIN_GAP / 2;
        if (wantsFirst) xLabels.unshift({ x: xTicks[0].x, label: tickLabel(xTicks[0].ts, interval) });
        if (wantsLast) xLabels.push({ x: xTicks[xTicks.length - 1].x, label: tickLabel(xTicks[xTicks.length - 1].ts, interval) });
      }

      var yTicks = [];
      var tickCount = 6;
      for (var j = 0; j < tickCount; j++) {
        var tv = tMin + ((tMax - tMin) / (tickCount - 1)) * j;
        var raw = invf(tv);
        var label;
        if (yMode === "percent") {
          var pct = (raw / Math.max(1e-9, anchor) - 1) * 100;
          label = pct.toFixed(1) + "%";
        } else {
          label = raw.toFixed(2);
        }
        var yTick =
          height - padLeft - ((tv - tMin) / Math.max(1e-9, tMax - tMin)) * (height - 2 * padLeft);
        yTicks.push({ y: yTick, label: label });
      }

      var last = slice.length ? slice[slice.length - 1] : null;

      return {
        path: dPath,
        xTicks: xTicks,
        xLabels: xLabels,
        yTicks: yTicks,
        xScale: xScale,
        yScale: yScale,
        last: last,
        anchor: anchor,
      };
    },
    [data, width, height, padLeft, interval, domain.x0, domain.x1, yMode, rightMargin]
  );
}

// -----------------------------------------
// Main component
// -----------------------------------------
export default function LiveSP500Canvas() {
  const svgRef = useRef(null);
  const [preset, setPreset] = useState("SYNTHETIC:+1");
  const [interval, setInterval] = useState("60");
  const [theme, setTheme] = useState("light");
  const [key, setKey] = useState(0);
  const [error, setError] = useState("");
  const [rawData, setRawData] = useState([]);

  const [startISO, setStartISO] = useState("");
  const [baseValue, setBaseValue] = useState(100);
  const [yMode, setYMode] = useState("linear");

  const leverage = parseLeverage(preset) || 1;

  const [domain, setDomain] = useState(undefined);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef(null);
  const [cross, setCross] = useState(null);

  // parse the user-provided start datetime
  const startTs = useMemo(
    function () {
      if (!startISO) return undefined;
      const ts = Date.parse(startISO);
      if (isNaN(ts)) return undefined;
      return ts;
    },
    [startISO]
  );

  // fetch data (via /api/spx), range depends on interval + startTs
  useEffect(
    function () {
      let cancelled = false;
      (async function () {
        setError("");

        const yInterval = YAHOO_INTERVAL_MAP[interval] || "1d";
        const now = Date.now();

        let range;

        // intraday intervals: keep short range (5 days)
        if (interval === "1" || interval === "5" || interval === "15" || interval === "60") {
          range = "5d";
        } else {
          // daily/weekly/monthly: range depends on how far back startTs is
          if (!startTs) {
            // no start date: default to 10 years
            range = "10y";
          } else {
            const diffYears =
              (now - startTs) / (365 * 24 * 60 * 60 * 1000);

            if (diffYears > 10) {
              range = "max";
            } else if (diffYears > 5) {
              range = "10y";
            } else if (diffYears > 2) {
              range = "5y";
            } else {
              range = "2y";
            }
          }
        }

        try {
          const spx = await fetchYahooSPX(range, yInterval);
          if (!cancelled) {
            setRawData(spx);
            setDomain(undefined);
          }
        } catch (e) {
          if (!cancelled) {
            setError(
              (e && e.message) || "Failed to fetch data. Using demo series."
            );
            const demo = buildDemoSPX();
            setRawData(demo);
            setDomain(undefined);
          }
        }
      })();
      return function () {
        cancelled = true;
      };
    },
    [interval, key, startTs]
  );

  // Whenever startTs *or* the underlying data set changes,
  // reset zoom/pan so the chart refits to the new visible range.
  useEffect(
    function () {
      if (!rawData.length) return;
      setDomain(undefined);
    },
    [startTs, rawData.length]
  );

  // Filter rawData by startTs, clamped to the available data range.
  const filteredData = useMemo(
    function () {
      if (!rawData.length) return rawData;
      if (!startTs) return rawData;

      const minTs = rawData[0].time;
      const maxTs = rawData[rawData.length - 1].time;

      // If start date is after the last data point -> no data
      if (startTs > maxTs) {
        console.log("[start filter] startTs after maxTs → empty set", {
          startTs,
          maxTs,
        });
        return [];
      }

      // Clamp to the earliest available point if user picks a very old date
      const effectiveStart = Math.max(startTs, minTs);

      const result = rawData.filter(function (p) {
        return p.time >= effectiveStart;
      });

      console.log("[start filter]", {
        rawLen: rawData.length,
        filteredLen: result.length,
        startTs,
        minTs,
        maxTs,
        effectiveStart,
        startISO,
      });

      return result;
    },
    [rawData, startTs, startISO]
  );

  const synth = useMemo(
    function () {
      return buildSyntheticSeries(filteredData, leverage, baseValue);
    },
    [filteredData, leverage, baseValue]
  );

  const width = 1200;
  const height = 640;
  const rightMargin = 90;

  const color =
    leverage >= 0
      ? theme === "dark"
        ? "#22c55e"
        : "#16a34a"
      : theme === "dark"
      ? "#f87171"
      : "#ef4444";
  const bg = theme === "dark" ? "#0f172a" : "#ffffff";
  const fg = theme === "dark" ? "#e2e8f0" : "#0f172a";

  const fullDomain = useMemo(
    function () {
      return {
        x0: synth[0] ? synth[0].time : 0,
        x1: synth.length ? synth[synth.length - 1].time : 1,
      };
    },
    [synth]
  );
  const activeDomain = domain || fullDomain;

  const chart = useChartPath(
    synth,
    width,
    height,
    40,
    interval,
    activeDomain,
    yMode,
    rightMargin
  );
  const path = chart.path;
  const xTicks = chart.xTicks;
  const xLabels = chart.xLabels;
  const yTicks = chart.yTicks;
  const xScale = chart.xScale;
  const yScale = chart.yScale;
  const last = chart.last;
  const anchor = chart.anchor;

  // extra runtime tests
  try {
    console.assert(xTicks.length >= 2, "Expected at least 2 x-ticks");
    if (synth.length) {
      console.assert(
        Math.abs(synth[0].value - baseValue) < 1e-6,
        "First synthetic should equal baseValue"
      );
    }
  } catch (e) {}

  function onWheel(e) {
    e.preventDefault();
    if (!synth.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const tAtCursor =
      activeDomain.x0 +
      ((px - 40) / Math.max(1, width - 40 - rightMargin)) *
        (activeDomain.x1 - activeDomain.x0);
    const zoomIntensity = 0.2;
    const direction = e.deltaY > 0 ? 1 : -1;
    const scale = Math.exp(direction * zoomIntensity);
    const newX0 = tAtCursor - (tAtCursor - activeDomain.x0) * scale;
    const newX1 = tAtCursor + (activeDomain.x1 - tAtCursor) * scale;
    const minSpan = (fullDomain.x1 - fullDomain.x0) / 500;
    const x0 = Math.max(fullDomain.x0, Math.min(newX0, newX1 - minSpan));
    const x1 = Math.min(fullDomain.x1, Math.max(newX1, newX0 + minSpan));
    setDomain({ x0: x0, x1: x1 });
  }

  function onPointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsPanning(true);
    panStart.current = {
      x: e.clientX,
      x0: activeDomain.x0,
      x1: activeDomain.x1,
    };
  }

  function onPointerMove(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = clamp(e.clientX - rect.left, 0, width);
    const ts =
      activeDomain.x0 +
      ((px - 40) / Math.max(1, width - 40 - rightMargin)) *
        (activeDomain.x1 - activeDomain.x0);

    // crosshair snap to nearest point
    if (synth.length) {
      var nearest = synth[0];
      var best = Infinity;
      for (var i = 0; i < synth.length; i++) {
        var p = synth[i];
        if (p.time < activeDomain.x0 || p.time > activeDomain.x1) continue;
        var d = Math.abs(p.time - ts);
        if (d < best) {
          best = d;
          nearest = p;
        }
      }
      if (nearest) {
        setCross({
          x: xScale(nearest.time),
          y: yScale(nearest.value),
          ts: nearest.time,
          price: nearest.value,
        });
      }
    }

    if (isPanning && panStart.current) {
      const dxPx = e.clientX - panStart.current.x;
      const span = panStart.current.x1 - panStart.current.x0;
      const dt =
        (-dxPx / Math.max(1, width - 40 - rightMargin)) * span;
      let x0 = panStart.current.x0 + dt;
      let x1 = panStart.current.x1 + dt;
      const spanMin = (fullDomain.x1 - fullDomain.x0) / 1000;
      if (x1 - x0 < spanMin) x1 = x0 + spanMin;
      if (x0 < fullDomain.x0) {
        x1 += fullDomain.x0 - x0;
        x0 = fullDomain.x0;
      }
      if (x1 > fullDomain.x1) {
        x0 -= x1 - fullDomain.x1;
        x1 = fullDomain.x1;
      }
      setDomain({ x0: x0, x1: x1 });
    }
  }

  function onPointerUp(e) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setIsPanning(false);
    panStart.current = null;
  }

  function onLeave() {
    setCross(null);
  }

  function fitToScreen() {
    setDomain(undefined);
  }

  function resetAll() {
    setPreset("SYNTHETIC:+1");
    setInterval("60");
    setTheme("light");
    setDomain(undefined);
    setStartISO("");
    setBaseValue(100);
    setYMode("linear");
    setKey(function (k) {
      return k + 1;
    });
  }

  function toPercent(v, ref) {
    return (v / Math.max(1e-9, ref) - 1) * 100;
  }

  // Precomputed labels to keep JSX simple
  const signStr = leverage >= 0 ? "+" : "";
  const titleLabel =
    "Synthetic " + signStr + String(leverage) + "x SPX (base=" + String(baseValue) + ")";
  const startLabel = startTs
    ? "Start: " + new Date(startTs).toLocaleString()
    : "";
  const effectiveStartLabel =
    filteredData && filteredData.length
      ? "Effective start: " +
        new Date(filteredData[0].time).toLocaleString()
      : "";

  const lastHeaderLabel = synth.length
    ? "Last: " +
      synth[synth.length - 1].value.toFixed(2) +
      " @ " +
      formatDate(synth[synth.length - 1].time)
    : "";

  const lastBadgeText = last
    ? last.value.toFixed(2) +
      (yMode === "percent"
        ? " (" + toPercent(last.value, anchor).toFixed(1) + "%)"
        : "")
    : "";

  const crossLabel = cross
    ? formatDate(cross.ts) +
      " · " +
      cross.price.toFixed(2) +
      (yMode === "percent"
        ? " (" + toPercent(cross.price, anchor).toFixed(1) + "%)"
        : "")
    : "";

  return (
    <div className="w-full min-h-screen p-4 md:p-6 space-y-4 box-border">
      {/* Title + controls in a centered column */}
      <div className="max-w-6xl mx-auto space-y-4">
        <h1 className="text-2xl font-semibold">
          Live Synthetic S&P 500 (±1×…±10× SPX)
        </h1>

        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-4 items-end">
              {/* Synthetic leverage presets only */}
              <div className="flex flex-col" style={{ minWidth: 180 }}>
                <label className="block text-sm text-gray-600 mb-1">
                  Synthetic Leverage
                </label>
                <select
                  className="border rounded-xl p-2 w-40"
                  value={preset}
                  onChange={function (e) {
                    setPreset(e.target.value);
                    setKey(function (k) {
                      return k + 1;
                    });
                  }}
                >
                  <optgroup label="Synthetic Leverage (±1x to ±10x)">
                    {SYNTHETIC_PRESETS.map(function (opt) {
                      return (
                        <option key={"preset-" + opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      );
                    })}
                  </optgroup>
                </select>
              </div>

              {/* Interval */}
              <div className="flex flex-col" style={{ minWidth: 120 }}>
                <label className="block text-sm text-gray-600 mb-1">
                  Interval
                </label>
                <select
                  className="border rounded-xl p-2 w-32"
                  value={interval}
                  onChange={function (e) {
                    setInterval(e.target.value);
                  }}
                >
                  {INTERVAL_OPTIONS.map(function (i) {
                    return (
                      <option key={"int-" + i.value} value={i.value}>
                        {i.label}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Theme */}
              <div className="flex flex-col" style={{ minWidth: 120 }}>
                <label className="block text-sm text-gray-600 mb-1">
                  Theme
                </label>
                <select
                  className="border rounded-xl p-2 w-32"
                  value={theme}
                  onChange={function (e) {
                    setTheme(toTheme(e.target.value));
                  }}
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>

              {/* Start date/time */}
              <div className="flex flex-col" style={{ minWidth: 230 }}>
                <label className="block text-sm text-gray-600 mb-1">
                  Start (datetime-local)
                </label>
                <input
                  type="datetime-local"
                  className="border rounded-xl p-2 w-56"
                  value={startISO}
                  onChange={function (e) {
                    setStartISO(e.target.value);
                  }}
                />
              </div>

              {/* Base value */}
              <div className="flex flex-col" style={{ minWidth: 150 }}>
                <label className="block text-sm text-gray-600 mb-1">
                  Base (starting value)
                </label>
                <input
                  type="number"
                  className="border rounded-xl p-2 w-32"
                  value={baseValue}
                  step={1}
                  min={0}
                  onChange={function (e) {
                    var n = Number(e.target.value);
                    setBaseValue(isNaN(n) ? 0 : n);
                  }}
                />
              </div>

              {/* Y Scale */}
              <div className="flex flex-col" style={{ minWidth: 150 }}>
                <label className="block text-sm text-gray-600 mb-1">
                  Y Scale
                </label>
                <select
                  className="border rounded-xl p-2 w-32"
                  value={yMode}
                  onChange={function (e) {
                    setYMode(toYMode(e.target.value));
                  }}
                >
                  {Y_SCALE_OPTIONS.map(function (o) {
                    return (
                      <option key={"ys-" + o.value} value={o.value}>
                        {o.label}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Actions */}
              <div className="flex gap-2 ml-auto">
                <Button
                  onClick={function () {
                    setKey(function (k) {
                      return k + 1;
                    });
                  }}
                >
                  Reload
                </Button>
                <Button variant="secondary" onClick={fitToScreen}>
                  Fit
                </Button>
                <Button variant="secondary" onClick={resetAll}>
                  Reset
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Full-width chart section */}
      <div
        className="rounded-2xl shadow border p-4 w-full"
        style={{ background: bg, color: fg }}
      >
        {error && (
          <div
            className="mb-2 text-xs"
            style={{ color: theme === "dark" ? "#fca5a5" : "#b91c1c" }}
          >
            {"Data note: " + error}
          </div>
        )}

        {synth.length > 1 ? (
          <svg
            ref={svgRef}
            width="100%"
            viewBox="0 0 1200 640"
            role="img"
            aria-label="Synthetic S&P 500 chart"
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onLeave}
            style={{
              touchAction: "none",
              cursor: isPanning ? "grabbing" : "crosshair",
            }}
          >
            <rect x="0" y="0" width={1200} height={640} fill={bg} />

            {/* Price axis right margin divider */}
            <line
              x1={1200 - rightMargin}
              y1={30}
              x2={1200 - rightMargin}
              y2={640 - 30}
              stroke="#e5e7eb"
              strokeWidth="1"
            />

            {/* Grid + Axes */}
            <g>
              {yTicks.map(function (t, i) {
                return (
                  <g key={"y-" + i}>
                    <line
                      x1={40}
                      y1={t.y}
                      x2={1200 - rightMargin - 10}
                      y2={t.y}
                      stroke="#e5e7eb"
                      strokeWidth="0.5"
                    />
                    <text x={5} y={t.y + 4} fontSize="10" fill={fg}>
                      {t.label}
                    </text>
                  </g>
                );
              })}

              {xTicks.map(function (t, i) {
                return (
                  <line
                    key={"xg-" + i}
                    x1={t.x}
                    y1={640 - 30}
                    x2={t.x}
                    y2={30}
                    stroke="#e5e7eb"
                    strokeWidth="0.5"
                  />
                );
              })}

              {xLabels.map(function (t, i) {
                return (
                  <text
                    key={"xl-" + i}
                    x={t.x}
                    y={640 - 10}
                    fontSize="10"
                    fill={fg}
                    textAnchor="middle"
                  >
                    {t.label}
                  </text>
                );
              })}
            </g>

            {/* Line path */}
            <path d={path} fill="none" stroke={color} strokeWidth={3} />

            {/* Last value badge on right margin */}
            {last && (
              <g>
                <line
                  x1={40}
                  y1={yScale(last.value)}
                  x2={1200 - rightMargin}
                  y2={yScale(last.value)}
                  stroke={color}
                  strokeDasharray="6 4"
                />
                <line
                  x1={1200 - rightMargin}
                  y1={yScale(last.value)}
                  x2={1200 - rightMargin + 6}
                  y2={yScale(last.value)}
                  stroke={color}
                />
                <rect
                  x={1200 - rightMargin + 10}
                  y={yScale(last.value) - 14}
                  width={120}
                  height={28}
                  rx={6}
                  fill={theme === "dark" ? "#111827" : "#f1f5f9"}
                  stroke={color}
                />
                <text
                  x={1200 - rightMargin + 16}
                  y={yScale(last.value) + 4}
                  fontSize="12"
                  fill={fg}
                >
                  {lastBadgeText}
                </text>
              </g>
            )}

            {/* Crosshair */}
            {cross && (
              <g>
                <line
                  x1={cross.x}
                  y1={30}
                  x2={cross.x}
                  y2={640 - 30}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                />
                <line
                  x1={40}
                  y1={cross.y}
                  x2={1200 - rightMargin - 10}
                  y2={cross.y}
                  stroke="#94a3b8"
                  strokeDasharray="4 4"
                />
                <circle cx={cross.x} cy={cross.y} r={3} fill={color} />
                <rect
                  x={cross.x + 8}
                  y={cross.y - 30}
                  width={220}
                  height={28}
                  rx={6}
                  fill={theme === "dark" ? "#111827" : "#f1f5f9"}
                  stroke="#94a3b8"
                />
                <text
                  x={cross.x + 16}
                  y={cross.y - 12}
                  fontSize="11"
                  fill={fg}
                >
                  {crossLabel}
                </text>
              </g>
            )}

            {/* Header labels */}
            <text x={50} y={20} fontSize={14} fill={fg}>
              {titleLabel}
            </text>
            {startTs && (
              <text x={400} y={20} fontSize={12} fill={fg}>
                {startLabel}
              </text>
            )}
            {effectiveStartLabel && (
              <text x={400} y={36} fontSize={11} fill={fg}>
                {effectiveStartLabel}
              </text>
            )}
            <text x={1200 - rightMargin - 280} y={20} fontSize={12} fill={fg}>
              {lastHeaderLabel}
            </text>
          </svg>
        ) : (
          <div className="p-6 text-sm">No data to display.</div>
        )}
      </div>

      <p className="text-xs text-gray-500 mt-1 text-center">
        Y-scale supports Linear, Log (if values &gt; 0), and Percent (relative
        to the left edge of the visible range). Use the mouse wheel to zoom
        and drag to pan.
      </p>
    </div>
  );
}

// placeholder to keep file self-contained if needed
function defineDevHelpers() {
  return;
}
