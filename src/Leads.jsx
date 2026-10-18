import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowUpRight, Search, Users, UserPlus, Sparkles, Clock3, CheckCircle2, Eye, Pencil, Trash2, X } from "lucide-react";
import "./Leads.css";

const statuses = ["New", "Contacted", "Interested", "Follow-up", "Converted", "Lost"];
const priorities = ["High", "Medium", "Low"];
const blankLead = { customerName: "", phoneNumber: "", email: "", status: "New", priority: "Medium", lastContactedAt: "", notes: "" };

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
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

  function openCreate() {
    setForm(blankLead);
    setFormError("");
    setModal({ mode: "create" });
  }

  function openEdit(lead) {
    setForm({ ...blankLead, ...lead, lastContactedAt: lead.lastContactedAt || "" });
    setFormError("");
    setModal({ mode: "edit", lead });
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

    setSaving(true);
    setFormError("");
    const editing = modal.mode === "edit";
    try {
      const response = await fetch(editing ? `http://localhost:3001/api/leads/${encodeURIComponent(modal.lead.id)}` : "http://localhost:3001/api/leads", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, customerName: form.customerName.trim(), phoneNumber: form.phoneNumber.trim(), email: form.email.trim(), notes: form.notes.trim() }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save this lead.");
      setLeads((current) => editing ? current.map((lead) => lead.id === result.lead.id ? result.lead : lead) : [result.lead, ...current]);
      setModal(editing ? { mode: "view", lead: result.lead } : null);
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
              <td><div className="lead-row-actions"><button type="button" aria-label={`View ${lead.customerName}`} title="View details" onClick={() => setModal({ mode: "view", lead })}><Eye size={15} /></button><button type="button" aria-label={`Edit ${lead.customerName}`} title="Edit lead" onClick={() => openEdit(lead)}><Pencil size={15} /></button><button type="button" className="delete" aria-label={`Delete ${lead.customerName}`} title="Delete lead" onClick={() => deleteLead(lead)}><Trash2 size={15} /></button></div></td>
            </tr>)}
          </tbody></table></div>
        )}
      </section>

      {modal?.mode === "view" && <div className="leads-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModal(null); }}>
        <section className="leads-modal glass" role="dialog" aria-modal="true" aria-labelledby="lead-details-title">
          <div className="leads-modal-heading"><div><p className="eyebrow">LEAD PROFILE</p><h2 id="lead-details-title">{modal.lead.customerName}</h2></div><button type="button" className="leads-close" aria-label="Close details" onClick={() => setModal(null)}><X size={18} /></button></div>
          <dl className="lead-details"><div><dt>Phone</dt><dd>{modal.lead.phoneNumber}</dd></div><div><dt>Email</dt><dd>{modal.lead.email || "—"}</dd></div><div><dt>Status</dt><dd>{modal.lead.status}</dd></div><div><dt>Priority</dt><dd>{modal.lead.priority}</dd></div><div><dt>Last contacted</dt><dd>{formatDate(modal.lead.lastContactedAt)}</dd></div><div><dt>Created</dt><dd>{formatDate(modal.lead.createdAt)}</dd></div><div className="lead-detail-notes"><dt>Notes</dt><dd>{modal.lead.notes || "No notes added yet."}</dd></div></dl>
          <div className="leads-modal-actions"><button type="button" className="leads-danger" onClick={() => deleteLead(modal.lead)}><Trash2 size={15} /> Delete</button><button type="button" className="leads-secondary" onClick={() => openEdit(modal.lead)}><Pencil size={15} /> Edit lead</button><button type="button" className="leads-primary compact" onClick={() => setModal(null)}>Close</button></div>
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
