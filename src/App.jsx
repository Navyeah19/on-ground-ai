
import { useState } from "react";
import "./App.css";
import CallsToMake from "./CallsToMake";
import IncomingCalls from "./IncomingCalls";
import CustomerCall from "./CustomerCall";
import RecentCalls from "./RecentCalls";
import VoiceCall from "./VoiceCall";
import GlobalIncomingCall, { AgentCallProvider } from "./GlobalIncomingCall";

const menuItems = [
  { icon: "◫", name: "Dashboard" },
  { icon: "☎", name: "Calls to Make" },
  { icon: "↙", name: "Incoming" },
  { icon: "◷", name: "Recent Calls" },
  { icon: "▦", name: "Calendar" },
  { icon: "✦", name: "Pulse" },
];

function App() {
  const [activePage, setActivePage] = useState("Dashboard");
  const params = new URLSearchParams(window.location.search);

  if (params.get("callTest") === "1") {
    const roomName = params.get("room") || "customer-1";
    const participantName = params.get("name") || "Local Test Participant";
    return (
      <main className="local-call-test">
        <div className="local-call-test-card glass">
          <p className="eyebrow">LOCAL CALL TEST</p>
          <h1>Second participant</h1>
          <p>Join the same room from another browser tab or window.</p>
          <VoiceCall
            roomName={roomName}
            participantName={participantName}
            onLeave={() => window.close()}
          />
        </div>
      </main>
    );
  }

  if (params.get("customerTest") === "1") {
    return <CustomerCall />;
  }

  return (
    <AgentCallProvider>
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">O.</div>
          <div>
            <h2>On-Ground.ai</h2>
            <span>CALL CENTRE</span>
          </div>
        </div>

        <p className="menu-label">WORKSPACE</p>

        <nav className="menu">
          {menuItems.map((item) => (
            <button
              key={item.name}
              className={`menu-item ${
                activePage === item.name ? "active" : ""
              }`}
              onClick={() => setActivePage(item.name)}
            >
              <span className="menu-icon">{item.icon}</span>
              {item.name}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="avatar">A</div>
          <div>
            <strong>Call Centre Agent</strong>
            <small>Online</small>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span> {activePage}
          </div>

          <div className="topbar-right">
            <span className="live-indicator">
              <span className="live-dot"></span>
              System Online
            </span>
            <div className="profile-avatar">A</div>
          </div>
        </header>

        <div className="content">
          <div className="welcome">
            <div>
              <p className="eyebrow">YOUR WORKSPACE</p>
              <p className="subtitle">
  Welcome back! Here's your call centre overview.
</p>
              
            </div>

            <div className="date-pill">
              ✦ &nbsp; On-Ground Workspace
            </div>
          </div>

          {activePage === "Calls to Make" ? (
  <CallsToMake />
) : activePage === "Dashboard" ? (
            <>
              <div className="hero glass">
                <div>
                  <p className="eyebrow">TODAY'S OVERVIEW</p>
                  <h2>Every conversation matters.</h2>
                  <p>
                    Stay connected, track your progress,
                    and turn every lead into an opportunity.
                  </p>
                </div>
                <div className="hero-decoration">✳</div>
              </div>

              <div className="cards">
                <div className="card glass">
                  <div className="card-top">
                    <span className="card-icon">☎</span>
                    <span className="card-tag">All calls</span>
                  </div>
                  <p className="card-title">Total Calls</p>
                  <h2>25</h2>
                  <div className="card-line"></div>
                  <p className="card-footer">
                    Calls scheduled for today
                  </p>
                </div>

                <div className="card glass">
                  <div className="card-top">
                    <span className="card-icon">✓</span>
                    <span className="card-tag success">Completed</span>
                  </div>
                  <p className="card-title">Completed Calls</p>
                  <h2>15</h2>
                  <div className="card-line"></div>
                  <p className="card-footer">
                    Successfully handled calls
                  </p>
                </div>

                <div className="card glass">
                  <div className="card-top">
                    <span className="card-icon">◷</span>
                    <span className="card-tag pending">In progress</span>
                  </div>
                  <p className="card-title">Pending Calls</p>
                  <h2>10</h2>
                  <div className="card-line"></div>
                  <p className="card-footer">
                    Calls waiting for follow-up
                  </p>
                </div>
              </div>

              <div className="bottom-panel glass">
                <div>
                  <p className="eyebrow">QUICK OVERVIEW</p>
                  <h3>You're making progress.</h3>
                  <p>
                    15 out of 25 calls have been completed.
                  </p>
                </div>

                <div className="progress-section">
                  <div className="progress-text">
                    <span>Daily progress</span>
                    <strong>60%</strong>
                  </div>
                  <div className="progress-track">
                    <div className="progress-fill"></div>
                  </div>
                </div>
              </div>
            </>
          ) : activePage === "Incoming" ? (
            <IncomingCalls />
          ) : activePage === "Recent Calls" ? (
            <RecentCalls />
          ) : (
            <div className="placeholder glass">
              <h2>{activePage}</h2>
              <p>
                We'll build this page in the next step.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
    <GlobalIncomingCall activePage={activePage} />
    </AgentCallProvider>
  );
}

export default App;
