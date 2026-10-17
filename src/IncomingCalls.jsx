
import { useState } from "react";
import "./IncomingCalls.css";

const initialCalls = [
  {
    id: 1,
    name: "Priya Sharma",
    phone: "9876543210",
    time: "10:30 AM",
    status: "Missed",
  },
  {
    id: 2,
    name: "Amit Kumar",
    phone: "9876543211",
    time: "11:15 AM",
    status: "Answered",
  },
  {
    id: 3,
    name: "Sneha Rao",
    phone: "9876543212",
    time: "12:00 PM",
    status: "Missed",
  },
];

function IncomingCalls() {
  const [calls] = useState(initialCalls);

  return (
    <div className="incoming-page">
      <div className="incoming-header">
        <h1>Incoming Calls</h1>
        <p>View and manage your incoming call history.</p>
      </div>

      <div className="incoming-table-wrapper">
        <table className="incoming-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Phone Number</th>
              <th>Time</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((call) => (
              <tr key={call.id}>
                <td>{call.name}</td>
                <td>{call.phone}</td>
                <td>{call.time}</td>
                <td>
                  <span
                    className={`incoming-status ${call.status.toLowerCase()}`}
                  >
                    {call.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default IncomingCalls;
