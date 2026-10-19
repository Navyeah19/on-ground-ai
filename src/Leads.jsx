import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowUpRight, Search, Users, UserPlus, Sparkles, Clock3, CheckCircle2, Eye, Pencil, Trash2, X, ChevronLeft, ChevronRight } from "lucide-react";
import "./Leads.css";

const statuses = ["New", "Contacted", "Interested", "Follow-up", "Converted", "Lost"];
const priorities = ["High", "Medium", "Low"];
const blankLead = { customerName: "", phoneNumber: "", email: "", status: "New", priority: "Medium", lastContactedAt: "", icpScore: "", intentScore: "", buyingSignalsText: "", notes: "" };

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function LeadScore({ label, score }) {
  const available = Number.isInteger(score) && score >= 0 && score <= 100;
  return (
    <article className="lead-score-card">
      <div className="lead-score-top"><span>{label}</span><strong>{available ? `${score}/100` : "Not scored"}</strong></div>
      <div className="lead-score-track" role="progressbar" aria-label={label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={available ? score : undefined} aria-valuetext={available ? `${score} out of 100` : "Not scored"}>
        {available && <span style={{ width: `${score}%` }} />}
      </div>
      <small>Manually entered · no automated scoring</small>
    </article>
  );
}

function Leads() {
  const [leads, setLeads] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [priorityFilter, setPriorityFilter] = useState("All priorities");
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(blankLead);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadLeads = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("http://localhost:3001/api/leads", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load leads.");
      setLeads(Array.isArray(result.leads) ? result.leads : []);
      setPageError("");
    } catch (error) {
      setPageError(error.message || "Leads are unavailable. Make sure the local backend is running.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadLeads, 0);
    return () => window.clearTimeout(timer);
  }, [loadLeads]);

  const filteredLeads = useMemo(() => {
    const query = search.trim().toLowerCase();
    return leads.filter((lead) => {
      const matchesSearch = !query || [lead.customerName, lead.phoneNumber, lead.email].some((value) => String(value || "").toLowerCase().includes(query));
      return matchesSearch && (statusFilter === "All statuses" || lead.status === statusFilter) && (priorityFilter === "All priorities" || lead.priority === priorityFilter);
    });
  }, [leads, search, statusFilter, priorityFilter]);

  const counts = useMemo(() => ({
    total: leads.length,
    new: leads.filter((lead) => lead.status === "New").length,
    followUps: leads.filter((lead) => lead.status === "Follow-up").length,
    converted: leads.filter((lead) => lead.status === "Converted").length,
  }), [leads]);

  const detailIndex = modal?.mode === "view" ? filteredLeads.findIndex((lead) => lead.id === modal.leadId) : -1;
  const selectedLead = modal?.mode === "view" ? leads.find((lead) => lead.id === modal.leadId) : null;

  const navigateDetails = useCallback((offset) => {
    if (detailIndex < 0) return;
    const nextLead = filteredLeads[detailIndex + offset];
    if (nextLead) setModal({ mode: "view", leadId: nextLead.id });
  }, [detailIndex, filteredLeads]);

  useEffect(() => {
    if (!modal) return undefined;
    function handleModalKeys(event) {
      if (event.key === "Escape" && !saving) setModal(null);
      if (modal.mode === "view" && event.key === "ArrowLeft") navigateDetails(-1);
      if (modal.mode === "view" && event.key === "ArrowRight") navigateDetails(1);
    }
    window.addEventListener("keydown", handleModalKeys);
    return () => window.removeEventListener("keydown", handleModalKeys);
  }, [modal, navigateDetails, saving]);

  function openCreate() {
    setForm(blankLead);
    setFormError("");
    setModal({ mode: "create" });
  }

  function openEdit(lead) {
    setForm({
      ...blankLead,
      ...lead,
      lastContactedAt: lead.lastContactedAt || "",
      icpScore: Number.isInteger(lead.icpScore) ? String(lead.icpScore) : "",
      intentScore: Number.isInteger(lead.intentScore) ? String(lead.intentScore) : "",
      buyingSignalsText: Array.isArray(lead.buyingSignals) ? lead.buyingSignals.join("\n") : "",
    });
    setFormError("");
    setModal({ mode: "edit", leadId: lead.id });
  }

  function openDetails(lead) {
    setModal({ mode: "view", leadId: lead.id });
  }

  function setField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function saveLead(event) {
    event.preventDefault();
    if (!form.customerName.trim()) return setFormError("Enter the customer's name.");
    if (!/^[+\d().\-\s]{5,30}$/.test(form.phoneNumber.trim())) return setFormError("Enter a valid phone number.");
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setFormError("Enter a valid email address or leave it blank.");
    const icpScore = form.icpScore === "" ? null : Number(form.icpScore);
    const intentScore = form.intentScore === "" ? null : Number(form.intentScore);
    if (icpScore !== null && (!Number.isInteger(icpScore) || icpScore < 0 || icpScore > 100)) return setFormError("ICP Score must be a whole number from 0 to 100.");
    if (intentScore !== null && (!Number.isInteger(intentScore) || intentScore < 0 || intentScore > 100)) return setFormError("Intent Score must be a whole number from 0 to 100.");
    const buyingSignals = form.buyingSignalsText.split(/\r?\n/).map((signal) => signal.trim()).filter(Boolean);
    if (buyingSignals.length > 20 || buyingSignals.some((signal) => signal.length > 240)) return setFormError("Add up to 20 buying signals, with no more than 240 characters each.");

    setSaving(true);
    setFormError("");
    const editing = modal.mode === "edit";
    try {
      const response = await fetch(editing ? `http://localhost:3001/api/leads/${encodeURIComponent(modal.leadId)}` : "http://localhost:3001/api/leads", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: form.customerName.trim(),
          phoneNumber: form.phoneNumber.trim(),
          email: form.email.trim(),
          status: form.status,
          priority: form.priority,
          lastContactedAt: form.lastContactedAt,
          notes: form.notes.trim(),
          icpScore,
          intentScore,
          buyingSignals,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save this lead.");
      setLeads((current) => editing ? current.map((lead) => lead.id === result.lead.id ? result.lead : lead) : [result.lead, ...current]);
      setModal(editing ? { mode: "view", leadId: result.lead.id } : null);
    } catch (error) {
      setFormError(error.message || "Could not save this lead. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteLead(lead) {
    if (!window.confirm(`Delete the lead for ${lead.customerName}? This cannot be undone.`)) return;
    setPageError("");
    try {
      const response = await fetch(`http://localhost:3001/api/leads/${encodeURIComponent(lead.id)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not delete the lead.");
      setLeads((current) => current.filter((item) => item.id !== lead.id));
      setModal(null);
    } catch (error) {
      setPageError(error.message || "Could not delete the lead.");
    }
  }

  return (
    <div className="leads-page">
      <div className="leads-heading">
        <div><p className="eyebrow">CUSTOMER RELATIONSHIPS</p><h1>Leads</h1><p>Keep customer details, follow-ups and notes organized in one place.</p></div>
        <button type="button" className="leads-primary" onClick={openCreate}><UserPlus size={16} /> New Lead</button>
      </div>

      <div className="leads-summary">
        <article className="leads-summary-card glass"><span className="leads-summary-icon green"><Users size={17} /></span><div><small>Total Leads</small><strong>{counts.total}</strong></div></article>
        <article className="leads-summary-card glass"><span className="leads-summary-icon gold"><Sparkles size={17} /></span><div><small>New Leads</small><strong>{counts.new}</strong></div></article>
        <article className="leads-summary-card glass"><span className="leads-summary-icon amber"><Clock3 size={17} /></span><div><small>Follow-ups</small><strong>{counts.followUps}</strong></div></article>
        <article className="leads-summary-card glass"><span className="leads-summary-icon green"><CheckCircle2 size={17} /></span><div><small>Converted Leads</small><strong>{counts.converted}</strong></div></article>
      </div>

      <section className="leads-panel glass">
        <div className="leads-panel-heading"><div><h2>Lead directory</h2><p>Search and filter your saved customer leads.</p></div><span className="leads-count-pill">{filteredLeads.length} {filteredLeads.length === 1 ? "lead" : "leads"}</span></div>
        <div className="leads-toolbar">
          <label className="leads-search"><Search size={16} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone or email" aria-label="Search leads" /></label>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by lead status"><option>All statuses</option>{statuses.map((status) => <option key={status}>{status}</option>)}</select>
          <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} aria-label="Filter by priority"><option>All priorities</option>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select>
        </div>

        {pageError && <div className="leads-error" role="alert"><AlertCircle size={16} /><span>{pageError}</span><button type="button" onClick={loadLeads}>Retry</button></div>}
        {loading ? <div className="leads-empty">Loading leads…</div> : filteredLeads.length === 0 ? (
          <div className="leads-empty"><div className="leads-empty-icon"><Users size={21} /></div><h3>{leads.length === 0 ? "No leads yet" : "No matching leads"}</h3><p>{leads.length === 0 ? "Add your first lead to start organizing customer follow-ups." : "Adjust your search or filters to see more leads."}</p>{leads.length === 0 && <button type="button" className="leads-secondary" onClick={openCreate}>Create your first lead</button>}</div>
        ) : (
          <div className="leads-table-wrap"><table className="leads-table"><thead><tr><th>Customer Name</th><th>Phone Number</th><th>Email</th><th>Lead Status</th><th>Priority</th><th>Last Contacted</th><th>Actions</th></tr></thead><tbody>
            {filteredLeads.map((lead) => <tr key={lead.id}>
              <td><strong className="leads-customer">{lead.customerName}</strong></td><td>{lead.phoneNumber}</td><td>{lead.email || "—"}</td>
              <td><span className={`lead-status status-${lead.status.toLowerCase().replace(/[^a-z]+/g, "-")}`}>{lead.status}</span></td>
              <td><span className={`lead-priority priority-${lead.priority.toLowerCase()}`}><i />{lead.priority}</span></td><td>{formatDate(lead.lastContactedAt)}</td>
              <td><div className="lead-row-actions"><button type="button" aria-label={`View ${lead.customerName}`} title="View details" onClick={() => openDetails(lead)}><Eye size={15} /></button><button type="button" aria-label={`Edit ${lead.customerName}`} title="Edit lead" onClick={() => openEdit(lead)}><Pencil size={15} /></button><button type="button" className="delete" aria-label={`Delete ${lead.customerName}`} title="Delete lead" onClick={() => deleteLead(lead)}><Trash2 size={15} /></button></div></td>
            </tr>)}
          </tbody></table></div>
        )}
      </section>

      {modal?.mode === "view" && selectedLead && <div className="leads-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
        <section className="leads-modal glass" role="dialog" aria-modal="true" aria-labelledby="lead-details-title">
          <div className="leads-modal-heading"><div><p className="eyebrow">LEAD PROFILE</p><h2 id="lead-details-title">{selectedLead.customerName}</h2></div><button type="button" autoFocus className="leads-close" aria-label="Close details" onClick={() => setModal(null)}><X size={18} /></button></div>
          <nav className="lead-modal-navigation" aria-label="Filtered lead navigation">
            <button type="button" onClick={() => navigateDetails(-1)} disabled={detailIndex <= 0}><ChevronLeft size={15} /> Previous</button>
            <span>{detailIndex >= 0 ? `Lead ${detailIndex + 1} of ${filteredLeads.length}` : "Outside current filters"}</span>
            <button type="button" onClick={() => navigateDetails(1)} disabled={detailIndex < 0 || detailIndex >= filteredLeads.length - 1}>Next <ChevronRight size={15} /></button>
          </nav>
          <div className="lead-score-grid"><LeadScore label="ICP Score" score={selectedLead.icpScore} /><LeadScore label="Intent Score" score={selectedLead.intentScore} /></div>
          <dl className="lead-details"><div><dt>Phone</dt><dd>{selectedLead.phoneNumber}</dd></div><div><dt>Email</dt><dd>{selectedLead.email || "—"}</dd></div><div><dt>Lead status</dt><dd>{selectedLead.status}</dd></div><div><dt>Priority</dt><dd>{selectedLead.priority}</dd></div><div><dt>Last contacted</dt><dd>{formatDate(selectedLead.lastContactedAt)}</dd></div><div><dt>Created</dt><dd>{formatDate(selectedLead.createdAt)}</dd></div><div className="lead-detail-notes"><dt>Notes</dt><dd>{selectedLead.notes || "No notes added yet."}</dd></div></dl>
          <details className="lead-buying-signals" open>
            <summary><span>Buying Signals</span><span className="lead-signal-count">{Array.isArray(selectedLead.buyingSignals) ? selectedLead.buyingSignals.length : 0}</span></summary>
            {Array.isArray(selectedLead.buyingSignals) && selectedLead.buyingSignals.length > 0 ? <ul>{selectedLead.buyingSignals.map((signal, index) => <li key={`${index}-${signal}`}>{signal}</li>)}</ul> : <p className="lead-signals-empty">No buying signals recorded. Edit the lead to add signals.</p>}
          </details>
          <div className="leads-modal-actions"><button type="button" className="leads-danger" onClick={() => deleteLead(selectedLead)}><Trash2 size={15} /> Delete</button><button type="button" className="leads-secondary" onClick={() => openEdit(selectedLead)}><Pencil size={15} /> Edit lead</button><button type="button" className="leads-primary compact" onClick={() => setModal(null)}>Close</button></div>
        </section>
      </div>}

      {(modal?.mode === "create" || modal?.mode === "edit") && <div className="leads-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setModal(null); }}>
        <section className="leads-modal glass" role="dialog" aria-modal="true" aria-labelledby="lead-form-title">
          <div className="leads-modal-heading"><div><p className="eyebrow">LEAD MANAGEMENT</p><h2 id="lead-form-title">{modal.mode === "create" ? "Create a lead" : "Edit lead"}</h2></div><button type="button" className="leads-close" aria-label="Close form" disabled={saving} onClick={() => setModal(null)}><X size={18} /></button></div>
          <form className="lead-form" onSubmit={saveLead}>
            <label>Customer name <span>*</span><input autoFocus name="customerName" value={form.customerName} onChange={setField} maxLength={120} required /></label>
            <div className="lead-form-row"><label>Phone number <span>*</span><input name="phoneNumber" type="tel" value={form.phoneNumber} onChange={setField} maxLength={30} required /></label><label>Email<input name="email" type="email" value={form.email} onChange={setField} maxLength={254} /></label></div>
            <div className="lead-form-row"><label>Lead status<select name="status" value={form.status} onChange={setField}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label><label>Priority<select name="priority" value={form.priority} onChange={setField}>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select></label></div>
            <label>Last contacted<input name="lastContactedAt" type="date" value={form.lastContactedAt} onChange={setField} /></label>
            <fieldset className="lead-scores-fieldset"><legend>Lead scores <small>Optional manual values, 0–100</small></legend><div className="lead-form-row"><label htmlFor="lead-icp-score">ICP Score<input id="lead-icp-score" name="icpScore" type="number" min="0" max="100" step="1" value={form.icpScore} onChange={setField} placeholder="Not scored" /></label><label htmlFor="lead-intent-score">Intent Score<input id="lead-intent-score" name="intentScore" type="number" min="0" max="100" step="1" value={form.intentScore} onChange={setField} placeholder="Not scored" /></label></div></fieldset>
            <label>Buying signals<textarea name="buyingSignalsText" rows="3" maxLength={5000} value={form.buyingSignalsText} onChange={setField} placeholder="One signal per line (optional)" /><small>Up to 20 signals, 240 characters each.</small></label>
            <label>Notes<textarea name="notes" rows="4" maxLength={5000} value={form.notes} onChange={setField} placeholder="Add context or follow-up notes for this lead…" /></label>
            {formError && <p className="lead-form-error" role="alert">{formError}</p>}
            <div className="leads-modal-actions"><button type="button" className="leads-secondary" disabled={saving} onClick={() => setModal(null)}>Cancel</button><button type="submit" className="leads-primary compact" disabled={saving}>{saving ? "Saving…" : modal.mode === "create" ? "Create Lead" : "Save Changes"}<ArrowUpRight size={14} /></button></div>
          </form>
        </section>
      </div>}
    </div>
  );
}

export default Leads;
