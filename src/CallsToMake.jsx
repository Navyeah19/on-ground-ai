import { Phone } from "lucide-react";
import { useRef, useState } from "react";
import VoiceCall from "./VoiceCall";
import { API_BASE_URL } from "./config";
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
  const [leads, setLeads] = useState(customers);
  const outgoingHistoryQueueRef = useRef(Promise.resolve());

  const filteredLeads = leads.filter((lead) =>
    lead.name.toLowerCase().includes(search.toLowerCase())
  );

  function startOutgoingCall(lead) {
    const callId = crypto.randomUUID();
    const roomName = `customer-${lead.id}`;
    const call = { ...lead, callId, roomName, preparing: true, historyError: "" };
    setSelectedCustomer(call);

    fetch(`${API_BASE_URL}/api/calls`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId, customerName: lead.name, roomName }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not save this call to history.");
        setSelectedCustomer((current) =>
          current?.callId === callId ? { ...current, preparing: false } : current
        );
      })
      .catch(() => {
        setSelectedCustomer((current) =>
          current?.callId === callId
            ? { ...current, preparing: false, historyError: "Call history is unavailable. The call can continue, but may not be saved." }
            : current
        );
      });
  }

  function reportOutgoingEvent(callId, event) {
    const request = outgoingHistoryQueueRef.current.catch(() => {}).then(async () => {
      const response = await fetch(`${API_BASE_URL}/api/calls/${encodeURIComponent(callId)}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event }),
      });
      if (!response.ok) throw new Error("Could not update call history.");
    });
    outgoingHistoryQueueRef.current = request;
    request.catch(() => {
        setSelectedCustomer((current) =>
          current?.callId === callId
            ? { ...current, historyError: "Call history could not be updated." }
            : current
        );
      });
  }

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
  onClick={() => startOutgoingCall(lead)}
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

      {selectedCustomer.preparing ? (
        <span className="call-status">Preparing call…</span>
      ) : (
        <VoiceCall
          roomName={selectedCustomer.roomName}
          participantName="Call Centre Agent"
          onConnected={() => reportOutgoingEvent(selectedCustomer.callId, "audio-connected")}
          onCallEnded={() => reportOutgoingEvent(selectedCustomer.callId, "ended")}
          onCallFailed={() => reportOutgoingEvent(selectedCustomer.callId, "failed")}
          onLeave={() => setSelectedCustomer(null)}
        />
      )}

      {selectedCustomer.historyError && (
        <p className="voice-call-error" role="alert">{selectedCustomer.historyError}</p>
      )}

      <a
        className="call-test-link"
        href={`/?callTest=1&room=${encodeURIComponent(`customer-${selectedCustomer.id}`)}&name=${encodeURIComponent("Local Test Participant")}`}
        target="_blank"
        rel="noreferrer"
      >
        Open a second browser participant for testing
      </a>
    </div>
  </div>
)}

    </div>
  );
}

export default CallsToMake;
