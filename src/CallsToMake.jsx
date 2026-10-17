import { Phone } from "lucide-react";
import { useState } from "react";
import "./CallsToMake.css";

const customers = [
  {
    id: 1,
    name: "Rahul Sharma",
    phone: "9876543210",
    company: "Tech Solutions",
    status: "Pending",
  },
  {
    id: 2,
    name: "Priya Nair",
    phone: "9876543211",
    company: "Innovate India",
    status: "Pending",
  },
  {
    id: 3,
    name: "Arjun Rao",
    phone: "9876543212",
    company: "Global Systems",
    status: "Completed",
  },
  {
    id: 4,
    name: "Sneha Patel",
    phone: "9876543213",
    company: "Digital Works",
    status: "Pending",
  },
];

function CallsToMake() {
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [leads, setLeads] = useState(customers);

  const filteredLeads = leads.filter((lead) =>
    lead.name.toLowerCase().includes(search.toLowerCase())
  );

  function markCompleted(id) {
    setLeads((previous) =>
      previous.map((lead) =>
        lead.id === id
          ? { ...lead, status: "Completed" }
          : lead
      )
    );
  }

  return (
    <div className="calls-page">
      <div className="calls-heading">
        <div>
          <p className="eyebrow">CALL MANAGEMENT</p>
          <h2>Calls to Make</h2>
          <p>Manage your upcoming customer calls.</p>
        </div>
      </div>

      <div className="calls-container glass">
        <div className="calls-toolbar">
          <h3>Customer Leads</h3>

          <input
            type="text"
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="table-scroll">
          <table className="calls-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Company</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {filteredLeads.map((lead) => (
                <tr key={lead.id}>
                  <td>{lead.name}</td>
                  <td>{lead.phone}</td>
                  <td>{lead.company}</td>
                  <td>
                    <span
                      className={
                        lead.status === "Completed"
                          ? "status-completed"
                          : "status-pending"
                      }
                    >
                      {lead.status}
                    </span>
                  </td>
                  <td>
                    <button
  className="start-call-button"
  onClick={() => {
    setSelectedCustomer(lead);
    setIsMuted(false);
  }}
>
  <Phone size={17} strokeWidth={2} />
Call
</button>
                    <button
                      className="call-button"
                      disabled={lead.status === "Completed"}
                      onClick={() => markCompleted(lead.id)}
                    >
                      {lead.status === "Completed"
                        ? "Done"
                        : "Mark Done"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredLeads.length === 0 && (
            <p className="empty-leads">No customers found.</p>
          )}
        </div>
      </div>
      
{selectedCustomer && (
  <div className="call-overlay">
    <div className="call-modal glass">
      <div className="call-avatar">
        {selectedCustomer.name.charAt(0)}
      </div>

      <p className="eyebrow">CALL CENTRE</p>

      <h2>{selectedCustomer.name}</h2>
      <p>{selectedCustomer.phone}</p>

      <span className="call-status">
        Ready to connect
      </span>

      <div className="call-controls">
        <button
          className="mute-button"
          onClick={() => setIsMuted(!isMuted)}
        >
          {isMuted ? "Unmute" : "Mute"}
        </button>

        <button
          className="end-call-button"
          onClick={() => setSelectedCustomer(null)}
        >
          ✕ Close
        </button>
      </div>

      <p className="call-note">
        Voice connection is not enabled yet.
      </p>
    </div>
  </div>
)}

    </div>
  );
}

export default CallsToMake;
