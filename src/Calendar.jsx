import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Edit3,
  LoaderCircle,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { API_BASE_URL } from "./config";
import "./Calendar.css";

const API_URL = `${API_BASE_URL}/api/scheduled-calls`;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function displayDate(value, options = { dateStyle: "full" }) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, options).format(new Date(year, month - 1, day));
}

function sortBySchedule(calls) {
  return [...calls].sort((left, right) =>
    `${left.date}T${left.time}`.localeCompare(`${right.date}T${right.time}`)
  );
}

function emptyForm(date) {
  return { customerName: "", phoneNumber: "", date, time: "09:00", notes: "" };
}

function Calendar() {
  const [today, setToday] = useState(() => new Date());
  const todayKey = dateKey(today);
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(() => emptyForm(todayKey));
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setToday(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadScheduledCalls() {
      try {
        const response = await fetch(API_URL);
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || "Could not load scheduled calls.");
        if (!cancelled) {
          setCalls(Array.isArray(result.calls) ? result.calls : []);
          setLoadError("");
        }
      } catch {
        if (!cancelled) setLoadError("Scheduled calls are unavailable. Check that the local backend is running.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadScheduledCalls();
    return () => { cancelled = true; };
  }, []);

  const callsByDate = useMemo(() => {
    const grouped = new Map();
    for (const call of calls) {
      const existing = grouped.get(call.date) || [];
      existing.push(call);
      grouped.set(call.date, existing);
    }
    grouped.forEach((items, key) => grouped.set(key, sortBySchedule(items)));
    return grouped;
  }, [calls]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
    const gridStart = new Date(firstDay.getFullYear(), firstDay.getMonth(), 1 - firstDay.getDay());
    return Array.from({ length: 42 }, (_, index) =>
      new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index)
    );
  }, [visibleMonth]);

  const upcomingCalls = useMemo(() => {
    return sortBySchedule(calls.filter((call) => new Date(`${call.date}T${call.time}`) >= today)).slice(0, 6);
  }, [calls, today]);

  function openCreate(date = selectedDate) {
    setSelectedDate(date);
    setForm(emptyForm(date));
    setFormError("");
    setModal({ type: "form", call: null });
  }

  function openDetails(call) {
    setFormError("");
    setModal({ type: "details", call });
  }

  function openEdit() {
    const call = modal?.call;
    if (!call) return;
    setForm({
      customerName: call.customerName,
      phoneNumber: call.phoneNumber,
      date: call.date,
      time: call.time,
      notes: call.notes || "",
    });
    setSelectedDate(call.date);
    setFormError("");
    setModal({ type: "form", call });
  }

  function moveMonth(offset) {
    setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + offset, 1));
  }

  function goToday() {
    setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(todayKey);
  }

  function selectDate(date) {
    const key = dateKey(date);
    setSelectedDate(key);
    if (date.getMonth() !== visibleMonth.getMonth() || date.getFullYear() !== visibleMonth.getFullYear()) {
      setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    }
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submitSchedule(event) {
    event.preventDefault();
    const customerName = form.customerName.trim();
    const phoneNumber = form.phoneNumber.trim();
    if (!customerName || !phoneNumber || !form.date || !form.time) {
      setFormError("Enter the customer's name, phone number, date, and time.");
      return;
    }
    if (!/^[+\d().\-\s]{5,30}$/.test(phoneNumber)) {
      setFormError("Enter a valid phone number using digits and standard phone symbols.");
      return;
    }

    setSaving(true);
    setFormError("");
    const editingCall = modal?.call;
    try {
      const response = await fetch(editingCall ? `${API_URL}/${encodeURIComponent(editingCall.id)}` : API_URL, {
        method: editingCall ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, customerName, phoneNumber, notes: form.notes.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not save this scheduled call.");
      setCalls((current) => editingCall
        ? current.map((call) => call.id === result.call.id ? result.call : call)
        : [...current, result.call]);
      setSelectedDate(result.call.date);
      setVisibleMonth(new Date(`${result.call.date}T12:00:00`));
      setModal(null);
    } catch (error) {
      setFormError(error.message || "Could not save this scheduled call.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSchedule() {
    if (!modal?.call || deleting) return;
    setDeleting(true);
    setFormError("");
    try {
      const response = await fetch(`${API_URL}/${encodeURIComponent(modal.call.id)}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not delete this scheduled call.");
      setCalls((current) => current.filter((call) => call.id !== modal.call.id));
      setModal(null);
    } catch (error) {
      setFormError(error.message || "Could not delete this scheduled call.");
    } finally {
      setDeleting(false);
    }
  }

  const monthTitle = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(visibleMonth);
  const selectedCalls = callsByDate.get(selectedDate) || [];

  return (
    <section className="calendar-page">
      <div className="calendar-page-header">
        <div>
          <p className="eyebrow">FOLLOW-UP PLANNER</p>
          <h1>Calendar</h1>
          <p>Schedule and manage customer follow-up calls.</p>
        </div>
        <button className="calendar-primary-button" onClick={() => openCreate()}>
          <Plus size={17} /> Schedule a Call
        </button>
      </div>

      {loadError && <p className="calendar-error" role="alert">{loadError}</p>}

      <div className="calendar-layout">
        <section className="calendar-month-card glass" aria-label="Monthly calendar">
          <div className="calendar-month-toolbar">
            <div>
              <h2>{monthTitle}</h2>
              <p>Select a day to schedule a follow-up</p>
            </div>
            <div className="calendar-month-actions">
              <button className="calendar-today-button" onClick={goToday}>Today</button>
              <button aria-label="Previous month" onClick={() => moveMonth(-1)}><ChevronLeft size={18} /></button>
              <button aria-label="Next month" onClick={() => moveMonth(1)}><ChevronRight size={18} /></button>
            </div>
          </div>

          <div className="calendar-grid calendar-weekdays">
            {WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
          </div>
          <div className="calendar-grid calendar-days">
            {calendarDays.map((date) => {
              const key = dateKey(date);
              const dayCalls = callsByDate.get(key) || [];
              const outsideMonth = date.getMonth() !== visibleMonth.getMonth();
              return (
                <div
                  className={`calendar-day ${outsideMonth ? "is-outside" : ""} ${key === todayKey ? "is-today" : ""} ${key === selectedDate ? "is-selected" : ""}`}
                  key={key}
                >
                  <button className="calendar-day-number" onClick={() => { selectDate(date); openCreate(key); }} aria-label={`Schedule a call on ${displayDate(key)}`}>
                    {date.getDate()}
                  </button>
                  <div className="calendar-day-events">
                    {dayCalls.slice(0, 2).map((call) => (
                      <button className="calendar-event-chip" key={call.id} onClick={() => openDetails(call)}>
                        <span>{call.time}</span> {call.customerName}
                      </button>
                    ))}
                    {dayCalls.length > 2 && <span className="calendar-more-events">+{dayCalls.length - 2} more</span>}
                  </div>
                </div>
              );
            })}
          </div>
          {loading && <div className="calendar-loading"><LoaderCircle size={17} /> Loading scheduled calls…</div>}
          {!loading && calls.length === 0 && (
            <div className="calendar-empty-note"><CalendarDays size={16} /> No follow-up calls scheduled yet.</div>
          )}
        </section>

        <aside className="calendar-side-column">
          <section className="calendar-selected-card glass">
            <div className="calendar-selected-heading">
              <div>
                <p className="eyebrow">SELECTED DAY</p>
                <h2>{displayDate(selectedDate)}</h2>
              </div>
              <button aria-label="Schedule call on selected day" onClick={() => openCreate(selectedDate)}><Plus size={18} /></button>
            </div>
            {selectedCalls.length === 0 ? (
              <div className="calendar-empty-day">
                <span>No calls planned for this day.</span>
                <button onClick={() => openCreate(selectedDate)}>Add a follow-up</button>
              </div>
            ) : (
              <div className="calendar-selected-list">
                {selectedCalls.map((call) => (
                  <button className="calendar-selected-call" key={call.id} onClick={() => openDetails(call)}>
                    <span className="calendar-call-time"><Clock3 size={14} /> {call.time}</span>
                    <strong>{call.customerName}</strong>
                    <small>{call.phoneNumber}</small>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="calendar-upcoming-card glass">
            <p className="eyebrow">UP NEXT</p>
            <h2>Upcoming calls</h2>
            {upcomingCalls.length === 0 ? (
              <p className="calendar-upcoming-empty">Your upcoming follow-ups will appear here.</p>
            ) : (
              <div className="calendar-upcoming-list">
                {upcomingCalls.map((call) => (
                  <button className="calendar-upcoming-item" key={call.id} onClick={() => openDetails(call)}>
                    <span className="calendar-upcoming-date">{displayDate(call.date, { month: "short", day: "numeric" })}</span>
                    <span className="calendar-upcoming-info"><strong>{call.customerName}</strong><small>{call.time} · {call.phoneNumber}</small></span>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>

      {modal && (
        <div className="calendar-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving && !deleting) setModal(null); }}>
          {modal.type === "details" ? (
            <section className="calendar-modal glass" role="dialog" aria-modal="true" aria-labelledby="calendar-details-title">
              <div className="calendar-modal-header">
                <div><p className="eyebrow">SCHEDULED FOLLOW-UP</p><h2 id="calendar-details-title">{modal.call.customerName}</h2></div>
                <button className="calendar-modal-close" aria-label="Close details" onClick={() => setModal(null)}><X size={19} /></button>
              </div>
              <dl className="calendar-details-list">
                <div><dt>Phone</dt><dd>{modal.call.phoneNumber}</dd></div>
                <div><dt>Date</dt><dd>{displayDate(modal.call.date)}</dd></div>
                <div><dt>Time</dt><dd>{modal.call.time}</dd></div>
                <div className="calendar-details-notes"><dt>Notes</dt><dd>{modal.call.notes || "No notes added."}</dd></div>
              </dl>
              {formError && <p className="calendar-error" role="alert">{formError}</p>}
              <div className="calendar-modal-actions">
                <button className="calendar-delete-button" onClick={deleteSchedule} disabled={deleting}>
                  <Trash2 size={16} /> {deleting ? "Deleting…" : "Delete"}
                </button>
                <button className="calendar-secondary-button" onClick={() => setModal(null)}>Close</button>
                <button className="calendar-primary-button" onClick={openEdit}>
                  <Edit3 size={16} /> Edit / Reschedule
                </button>
              </div>
            </section>
          ) : (
            <section className="calendar-modal glass" role="dialog" aria-modal="true" aria-labelledby="calendar-form-title">
              <div className="calendar-modal-header">
                <div>
                  <p className="eyebrow">{modal.call ? "UPDATE FOLLOW-UP" : "NEW FOLLOW-UP"}</p>
                  <h2 id="calendar-form-title">{modal.call ? "Edit scheduled call" : "Schedule a call"}</h2>
                </div>
                <button className="calendar-modal-close" aria-label="Close form" onClick={() => !saving && setModal(null)}><X size={19} /></button>
              </div>
              <form className="calendar-form" onSubmit={submitSchedule}>
                <label>Customer name<input name="customerName" value={form.customerName} onChange={updateField} maxLength={100} autoComplete="name" required /></label>
                <label>Phone number<input name="phoneNumber" value={form.phoneNumber} onChange={updateField} type="tel" maxLength={30} autoComplete="tel" required /></label>
                <div className="calendar-form-row">
                  <label>Date<input name="date" type="date" value={form.date} onChange={updateField} required /></label>
                  <label>Time<input name="time" type="time" value={form.time} onChange={updateField} required /></label>
                </div>
                <label>Notes <span className="calendar-optional">(optional)</span><textarea name="notes" value={form.notes} onChange={updateField} maxLength={2000} rows={3} placeholder="Add a reminder or call context" /></label>
                {formError && <p className="calendar-error" role="alert">{formError}</p>}
                <div className="calendar-modal-actions">
                  <button className="calendar-secondary-button" type="button" onClick={() => setModal(null)} disabled={saving}>Cancel</button>
                  <button className="calendar-primary-button" type="submit" disabled={saving}>
                    {saving ? <LoaderCircle size={16} className="calendar-spinner" /> : <CalendarDays size={16} />}
                    {saving ? "Saving…" : modal.call ? "Save Changes" : "Schedule Call"}
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>
      )}
    </section>
  );
}

export default Calendar;
