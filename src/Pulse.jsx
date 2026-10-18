import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, ArrowDownLeft, ArrowUpRight, Check, Clock3, Phone, RefreshCw } from "lucide-react";
import "./Pulse.css";

const ranges = [
  { label: "Today", days: 1 },
  { label: "Last 7 Days", days: 7 },
  { label: "Last 30 Days", days: 30 },
];

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatRangeDate(date) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.floor(seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

function statusKey(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "answered") return "Answered";
  if (normalized === "missed" || normalized === "expired") return "Missed";
  if (normalized === "rejected") return "Rejected";
  if (normalized === "cancelled" || normalized === "canceled") return "Cancelled";
  return "Other";
}

function Pulse() {
  const [calls, setCalls] = useState([]);
  const [range, setRange] = useState(7);
  const [now, setNow] = useState(() => new Date());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadCalls = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await fetch("http://localhost:3001/api/calls", { cache: "no-store" });
      if (!response.ok) throw new Error("Call history is unavailable.");
      const result = await response.json();
      if (!Array.isArray(result.calls)) throw new Error("Call history response was invalid.");
      setCalls(result.calls);
      setError("");
    } catch {
      setError("Could not load call analytics. Make sure the local backend is running, then retry.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => loadCalls(), 0);
    const timer = window.setInterval(() => {
      loadCalls(true);
      setNow(new Date());
    }, 30_000);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
    };
  }, [loadCalls]);

  const analytics = useMemo(() => {
    const today = startOfDay(now);
    const firstDay = new Date(today);
    firstDay.setDate(today.getDate() - range + 1);
    const endExclusive = new Date(today);
    endExclusive.setDate(today.getDate() + 1);
    const filtered = calls.filter((call) => {
      const timestamp = Date.parse(call.startedAt);
      return Number.isFinite(timestamp) && timestamp >= firstDay.getTime() && timestamp < endExclusive.getTime();
    });
    const outcomes = { Answered: 0, Missed: 0, Rejected: 0, Cancelled: 0, Other: 0 };
    filtered.forEach((call) => { outcomes[statusKey(call.status)] += 1; });
    const answerDenominator = outcomes.Answered + outcomes.Missed + outcomes.Rejected;
    const durations = filtered.filter((call) => statusKey(call.status) === "Answered" && Number.isFinite(call.durationSeconds) && call.durationSeconds >= 0).map((call) => call.durationSeconds);
    const averageDuration = durations.length ? durations.reduce((sum, duration) => sum + duration, 0) / durations.length : null;
    const days = Array.from({ length: range }, (_, index) => {
      const date = new Date(firstDay);
      date.setDate(firstDay.getDate() + index);
      return { date, key: localDateKey(date), count: 0 };
    });
    const dayIndexes = new Map(days.map((day, index) => [day.key, index]));
    filtered.forEach((call) => {
      const date = new Date(call.startedAt);
      const index = dayIndexes.get(localDateKey(date));
      if (index !== undefined) days[index].count += 1;
    });
    const recent = [...filtered].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).slice(0, 8);
    return { filtered, outcomes, answerDenominator, answerRate: answerDenominator ? outcomes.Answered / answerDenominator * 100 : null, averageDuration, days, recent, firstDay, today };
  }, [calls, range, now]);

  const maxDaily = Math.max(1, ...analytics.days.map((day) => day.count));
  const outcomeColors = { Answered: "#286b49", Missed: "#b55248", Rejected: "#d29554", Cancelled: "#9b927f", Other: "#c7b894" };
  const outcomeEntries = Object.entries(analytics.outcomes).filter(([, count]) => count > 0);
  let gradientPosition = 0;
  const outcomeGradient = outcomeEntries.length
    ? `conic-gradient(${outcomeEntries.map(([name, count]) => {
      const start = gradientPosition;
      gradientPosition += count / analytics.filtered.length * 100;
      return `${outcomeColors[name]} ${start}% ${gradientPosition}%`;
    }).join(", ")})`
    : "conic-gradient(#e8dfcf 0% 100%)";

  const metricCards = [
    { label: "Total Calls", value: analytics.filtered.length, icon: Phone, note: "Recorded in selected period", tone: "green" },
    { label: "Answered Calls", value: analytics.outcomes.Answered, icon: Check, note: "Audio-connected calls", tone: "green" },
    { label: "Missed Calls", value: analytics.outcomes.Missed, icon: Phone, note: "Expired or unanswered", tone: "red" },
    { label: "Rejected Calls", value: analytics.outcomes.Rejected, icon: ArrowDownLeft, note: "Declined by an agent", tone: "gold" },
    { label: "Average Call Duration", value: formatDuration(analytics.averageDuration), icon: Clock3, note: "Answered calls with known duration", tone: "green" },
    { label: "Answer Rate", value: analytics.answerRate === null ? "—" : `${Math.round(analytics.answerRate)}%`, icon: Activity, note: "Answered ÷ (answered + missed + rejected)", tone: "gold" },
  ];

  return (
    <section className="pulse-page">
      <div className="pulse-heading">
        <div>
          <p className="eyebrow">PERFORMANCE OVERVIEW</p>
          <h1>Pulse</h1>
          <p>Understand call outcomes and activity from your saved call history.</p>
        </div>
        <div className="pulse-heading-actions">
          <span className="pulse-refresh-note"><span /> Refreshes every 30 seconds</span>
          <button type="button" className="pulse-refresh" onClick={() => loadCalls(true)} disabled={refreshing} aria-label="Refresh analytics"><RefreshCw size={15} className={refreshing ? "is-spinning" : ""} /> Refresh</button>
        </div>
      </div>

      <div className="pulse-toolbar">
        <div className="pulse-range-label"><span>Analyzing</span><strong>{formatRangeDate(analytics.firstDay)} – {formatRangeDate(analytics.today)}</strong></div>
        <div className="pulse-range" role="tablist" aria-label="Analytics date range">
          {ranges.map((item) => <button key={item.days} type="button" role="tab" aria-selected={range === item.days} className={range === item.days ? "active" : ""} onClick={() => setRange(item.days)}>{item.label}</button>)}
        </div>
      </div>

      {error && <div className="pulse-error" role="alert"><AlertCircle size={17} /><span>{error}</span><button type="button" onClick={() => loadCalls()}>Retry</button></div>}

      {loading ? <div className="pulse-state glass">Loading call analytics…</div> : calls.length === 0 ? (
        <div className="pulse-state glass"><div className="pulse-empty-icon"><Activity size={22} /></div><h2>No call activity yet</h2><p>Real calls will appear here once they are saved in call history.</p></div>
      ) : (
        <>
          <div className="pulse-metrics">
            {metricCards.map(({ label, value, icon: Icon, note, tone }) => <article className="pulse-metric glass" key={label}>
              <div className="pulse-metric-top"><span>{label}</span><span className={`pulse-metric-icon ${tone}`}><Icon size={17} /></span></div>
              <strong>{value}</strong><small>{note}</small>
            </article>)}
          </div>

          <div className="pulse-charts">
            <section className="pulse-chart-card glass">
              <div className="pulse-chart-heading"><div><p className="eyebrow">TREND</p><h2>Daily call activity</h2></div><span>{analytics.filtered.length} calls</span></div>
              {analytics.filtered.length === 0 ? <div className="pulse-chart-empty">No calls in this date range.</div> : <div className={`pulse-bars days-${range}`} role="img" aria-label="Daily calls chart">
                {analytics.days.map(({ date, key, count }) => <div className="pulse-bar-column" key={key} title={`${date.toLocaleDateString()}: ${count} calls`}>
                  <span className="pulse-bar-value">{count || ""}</span><div className="pulse-bar-track"><div className="pulse-bar" style={{ height: `${Math.max(count ? 8 : 0, count / maxDaily * 100)}%` }} /></div>
                  <span className="pulse-bar-label">{range === 1 ? "Today" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                </div>)}
              </div>}
            </section>

            <section className="pulse-chart-card glass">
              <div className="pulse-chart-heading"><div><p className="eyebrow">DISTRIBUTION</p><h2>Call outcomes</h2></div></div>
              {analytics.filtered.length === 0 ? <div className="pulse-chart-empty">No outcomes in this date range.</div> : <div className="pulse-outcomes">
                <div className="pulse-donut" style={{ background: outcomeGradient }} role="img" aria-label="Call outcome breakdown"><div><strong>{analytics.filtered.length}</strong><span>calls</span></div></div>
                <div className="pulse-legend">{Object.entries(analytics.outcomes).map(([name, count]) => <div key={name}><i style={{ background: outcomeColors[name] }} /><span>{name}</span><strong>{count}</strong></div>)}</div>
              </div>}
              <p className="pulse-outcome-footnote">Expired calls count as Missed. Cancelled calls are excluded from answer rate.</p>
            </section>
          </div>

          <section className="pulse-recent glass">
            <div className="pulse-recent-heading"><div><p className="eyebrow">LATEST ACTIVITY</p><h2>Recent calls</h2></div><span>{analytics.recent.length} shown</span></div>
            {analytics.recent.length === 0 ? <p className="pulse-no-recent">No calls in this date range.</p> : <div className="pulse-recent-list">
              {analytics.recent.map((call) => <article className="pulse-recent-row" key={call.callId || `${call.startedAt}-${call.customerName}`}>
                <span className={`pulse-type-icon ${call.callType === "Incoming" ? "incoming" : "outgoing"}`}>{call.callType === "Incoming" ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span>
                <div className="pulse-recent-person"><strong>{call.customerName || "Unknown customer"}</strong><small>{call.callType || "Call"} · {formatDate(call.startedAt)}</small></div>
                <span className={`pulse-status status-${statusKey(call.status).toLowerCase()}`}>{statusKey(call.status)}</span>
                <span className="pulse-recent-duration">{formatDuration(call.durationSeconds)}</span>
              </article>)}
            </div>}
          </section>
        </>
      )}
    </section>
  );
}

export default Pulse;
