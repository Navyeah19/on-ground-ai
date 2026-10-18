import { useEffect, useMemo, useState } from "react";
import { Clock3, Search, X } from "lucide-react";
import "./RecentCalls.css";

const filters = ["All Calls", "Incoming", "Outgoing", "Missed"];

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatDuration(value) {
  if (!Number.isFinite(value) || value < 0) return "—";
  const total = Math.floor(value);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function RecentCalls() {
  const [calls, setCalls] = useState([]);
  const [filter, setFilter] = useState("All Calls");
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState("newest");
  const [selectedCall, setSelectedCall] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCalls() {
      try {
        const response = await fetch("http://localhost:3001/api/calls");
        if (!response.ok) throw new Error("Could not load call history.");
        const result = await response.json();
        if (!cancelled) {
          setCalls(Array.isArray(result.calls) ? result.calls : []);
          setError("");
        }
      } catch {
        if (!cancelled) setError("Call history is unavailable. Make sure the local backend is running.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCalls();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredCalls = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return calls
      .filter((call) => {
        if (filter === "Incoming" && call.callType !== "Incoming") return false;
        if (filter === "Outgoing" && call.callType !== "Outgoing") return false;
        if (filter === "Missed" && call.status !== "Missed") return false;
        return !normalizedSearch || call.customerName?.toLowerCase().includes(normalizedSearch);
      })
      .sort((first, second) => {
        const firstTime = Date.parse(first.startedAt) || 0;
        const secondTime = Date.parse(second.startedAt) || 0;
        return sortOrder === "newest" ? secondTime - firstTime : firstTime - secondTime;
      });
  }, [calls, filter, search, sortOrder]);

  return (
    <div className="recent-calls-page">
      <div className="recent-calls-heading">
        <div>
          <p className="eyebrow">CALL MANAGEMENT</p>
          <h1>Recent Calls</h1>
          <p>Review real incoming and outgoing call activity.</p>
        </div>
        <div className="recent-calls-count">
          <Clock3 size={16} /> {calls.length} {calls.length === 1 ? "call" : "calls"}
        </div>
      </div>

      <section className="recent-calls-panel glass">
        <div className="recent-calls-toolbar">
          <div className="recent-call-filters" role="tablist" aria-label="Filter call history">
            {filters.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={filter === item}
                className={filter === item ? "active" : ""}
                onClick={() => setFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="recent-call-tools">
            <label className="recent-call-search">
              <Search size={16} />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search customer name"
                aria-label="Search by customer name"
              />
            </label>
            <select
              value={sortOrder}
              onChange={(event) => setSortOrder(event.target.value)}
              aria-label="Sort call history"
              className="recent-call-sort"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
            </select>
          </div>
        </div>

        {error && <p className="recent-calls-error" role="alert">{error}</p>}

        {loading ? (
          <div className="recent-calls-empty">Loading call history…</div>
        ) : filteredCalls.length === 0 ? (
          <div className="recent-calls-empty">
            <div className="recent-empty-icon"><Clock3 size={22} /></div>
            <h2>{calls.length === 0 ? "No call history yet" : "No matching calls"}</h2>
            <p>
              {calls.length === 0
                ? "Real calls will appear here after they are initiated."
                : "Try another filter or search term."}
            </p>
          </div>
        ) : (
          <div className="recent-calls-table-scroll">
            <table className="recent-calls-table">
              <thead>
                <tr>
                  <th>Customer Name</th>
                  <th>Call Type</th>
                  <th>Date and Time</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredCalls.map((call) => (
                  <tr key={call.callId}>
                    <td className="recent-customer-name">{call.customerName}</td>
                    <td>{call.callType}</td>
                    <td>{formatDateTime(call.startedAt)}</td>
                    <td>{formatDuration(call.durationSeconds)}</td>
                    <td>
                      <span className={`recent-call-status status-${call.status?.toLowerCase() || "unknown"}`}>
                        {call.status || "Unknown"}
                      </span>
                    </td>
                    <td>
                      <button className="recent-details-button" type="button" onClick={() => setSelectedCall(call)}>
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedCall && (
        <div className="recent-details-overlay" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedCall(null);
        }}>
          <section className="recent-details-modal glass" role="dialog" aria-modal="true" aria-labelledby="recent-details-title">
            <div className="recent-details-header">
              <div>
                <p className="eyebrow">CALL RECORD</p>
                <h2 id="recent-details-title">Call Details</h2>
              </div>
              <button className="recent-details-close-icon" type="button" aria-label="Close details" onClick={() => setSelectedCall(null)}>
                <X size={19} />
              </button>
            </div>

            <dl className="recent-details-list">
              <div><dt>Customer name</dt><dd>{selectedCall.customerName}</dd></div>
              <div><dt>Call type</dt><dd>{selectedCall.callType}</dd></div>
              <div><dt>Call status</dt><dd>{selectedCall.status}</dd></div>
              <div><dt>Start time</dt><dd>{formatDateTime(selectedCall.startedAt)}</dd></div>
              <div><dt>End time</dt><dd>{formatDateTime(selectedCall.endedAt)}</dd></div>
              <div><dt>Duration</dt><dd>{formatDuration(selectedCall.durationSeconds)}</dd></div>
              <div className="details-call-id"><dt>Call ID</dt><dd>{selectedCall.callId || "—"}</dd></div>
            </dl>
            <button className="recent-details-done" type="button" onClick={() => setSelectedCall(null)}>Close</button>
          </section>
        </div>
      )}
    </div>
  );
}

export default RecentCalls;
