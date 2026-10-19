import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpRight, Bot, Check, ChevronRight, Circle, Hash, MessageCircle, Pin, Send, Sparkles, Star, Users } from "lucide-react";
import "./PulseHome.css";

const STORAGE_KEY = "on-ground-pulse-workspace-v1";
const CURRENT_AGENT = "You";

const channels = [
  { id: "agent-hub", name: "agent-hub", description: "Team coordination", icon: "#" },
  { id: "sales-pipeline", name: "sales-pipeline", description: "Lead updates and handoffs", icon: "#" },
  { id: "customer-success", name: "customer-success", description: "Customer follow-ups", icon: "#" },
  { id: "product-ops", name: "product-ops", description: "Operations and improvements", icon: "#" },
];

const roleAgents = [
  { initials: "MB", name: "Meera Bot", role: "Customer success partner", presence: "Available", color: "sage" },
  { initials: "RS", name: "Rohan Shah", role: "Sales operations", presence: "Available", color: "gold" },
  { initials: "NK", name: "Nisha Kapoor", role: "Quality coach", presence: "In focus", color: "rose" },
];

const taskAgents = [
  { name: "Lead Brief", task: "Prepare a concise lead handoff", icon: "lead" },
  { name: "Call Recap", task: "Organize notes after a conversation", icon: "recap" },
  { name: "Follow-up Planner", task: "Outline the next customer touchpoint", icon: "follow" },
];

const kudos = [
  { initials: "RS", name: "Rohan Shah", text: "Thanks for the clear customer handoff. It made the next step easy.", time: "Today · 10:24 AM" },
  { initials: "NK", name: "Nisha Kapoor", text: "Great attention to detail in yesterday's call notes.", time: "Yesterday" },
];

const initialMessages = {
  "agent-hub": [
    { id: "hub-1", sender: "Meera Bot", text: "Good morning team. The follow-up queue is ready for a quick review.", sentAt: "2026-10-18T08:42:00.000Z" },
    { id: "hub-2", sender: "Rohan Shah", text: "I have grouped the priority leads so today's handoffs are easier to scan.", sentAt: "2026-10-18T08:48:00.000Z" },
    { id: "hub-3", sender: "Meera Bot", text: "Thank you. Please add any context that will help the next agent continue the conversation.", sentAt: "2026-10-18T08:51:00.000Z" },
  ],
  "sales-pipeline": [
    { id: "sales-1", sender: "Rohan Shah", text: "The interested leads from this morning are ready for agent follow-up.", sentAt: "2026-10-18T07:58:00.000Z" },
    { id: "sales-2", sender: "Nisha Kapoor", text: "I added a note to the handoff checklist: include the customer's preferred contact time.", sentAt: "2026-10-18T08:12:00.000Z" },
  ],
  "customer-success": [
    { id: "success-1", sender: "Meera Bot", text: "A short recap after each call helps the next person pick up without asking the customer to repeat themselves.", sentAt: "2026-10-18T06:35:00.000Z" },
    { id: "success-2", sender: "Nisha Kapoor", text: "Agreed. Keep the next action and timing visible in the notes.", sentAt: "2026-10-18T06:49:00.000Z" },
  ],
  "product-ops": [
    { id: "ops-1", sender: "Nisha Kapoor", text: "Please share small workflow improvements here so the team can review them together.", sentAt: "2026-10-17T11:20:00.000Z" },
    { id: "ops-2", sender: "Rohan Shah", text: "A clear status label on the lead handoff would make the queue easier to scan.", sentAt: "2026-10-17T11:34:00.000Z" },
  ],
};

function createInitialWorkspace() {
  return {
    messages: initialMessages,
    responses: {},
    pinnedReplies: {},
  };
}

function readWorkspace() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return createInitialWorkspace();
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object") return createInitialWorkspace();
    return {
      messages: { ...initialMessages, ...(parsed.messages || {}) },
      responses: parsed.responses && typeof parsed.responses === "object" ? parsed.responses : {},
      pinnedReplies: parsed.pinnedReplies && typeof parsed.pinnedReplies === "object" ? parsed.pinnedReplies : {},
    };
  } catch {
    return createInitialWorkspace();
  }
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `message-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function getLastMessage(workspace, channel) {
  const messages = workspace.messages[channel.id] || [];
  return messages[messages.length - 1] || null;
}

function PulseHome({ channelId, onOpenChannel, onBack }) {
  const [workspace, setWorkspace] = useState(readWorkspace);
  const [storageError, setStorageError] = useState("");
  const [draft, setDraft] = useState("");
  const [pinnedDraft, setPinnedDraft] = useState("");

  useEffect(() => {
    let errorTimer;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
      if (storageError) errorTimer = window.setTimeout(() => setStorageError(""), 0);
    } catch {
      errorTimer = window.setTimeout(() => setStorageError("Browser storage is unavailable. Messages may not persist after this tab closes."), 0);
    }
    return () => window.clearTimeout(errorTimer);
  }, [workspace, storageError]);

  const channel = channels.find((item) => item.id === channelId);
  const messages = useMemo(() => channel ? (workspace.messages[channel.id] || []) : [], [channel, workspace.messages]);

  function sendMessage(event) {
    event.preventDefault();
    const text = draft.trim();
    if (!channel || !text) return;
    const message = { id: makeId(), sender: CURRENT_AGENT, text, sentAt: new Date().toISOString() };
    setWorkspace((current) => ({
      ...current,
      messages: { ...current.messages, [channel.id]: [...(current.messages[channel.id] || []), message] },
    }));
    setDraft("");
  }

  function choosePinnedResponse(response) {
    if (!channel) return;
    setWorkspace((current) => ({ ...current, responses: { ...current.responses, [channel.id]: response } }));
  }

  function sendPinnedReply(event) {
    event.preventDefault();
    const text = pinnedDraft.trim();
    if (!channel || !text) return;
    const message = { id: makeId(), sender: CURRENT_AGENT, text, sentAt: new Date().toISOString() };
    setWorkspace((current) => ({
      ...current,
      messages: { ...current.messages, [channel.id]: [...(current.messages[channel.id] || []), message] },
      pinnedReplies: { ...current.pinnedReplies, [channel.id]: text },
    }));
    setPinnedDraft("");
  }

  if (channel) {
    const selectedResponse = workspace.responses[channel.id];
    return (
      <section className="pulse-chat-page">
        <div className="pulse-chat-topbar">
          <button className="pulse-back-button" type="button" onClick={onBack}><ArrowLeft size={16} /> Back to Pulse Home</button>
          <span className="pulse-local-label"><Circle size={8} fill="currentColor" /> Local demo conversation</span>
        </div>
        <header className="pulse-channel-header glass">
          <span className="pulse-channel-hash"><Hash size={21} /></span>
          <div><h2>{channel.name}</h2><p>{channel.description} <span>·</span> {messages.length} messages</p></div>
          <button type="button" className="pulse-channel-members" title="Sample channel participants"><Users size={16} /><span>4</span></button>
        </header>

        <article className="pulse-input-card glass">
          <div className="pulse-pin-label"><Pin size={13} fill="currentColor" /> PINNED · NEEDS YOUR INPUT</div>
          <h3>Review the customer follow-up plan</h3>
          <p>The team has drafted a three-step check-in for customers waiting on an update. Choose a response and add any context for the team.</p>
          <div className="pulse-input-actions" role="group" aria-label="Choose a response">
            <button type="button" className={selectedResponse === "Approved" ? "selected approve" : "approve"} aria-pressed={selectedResponse === "Approved"} onClick={() => choosePinnedResponse("Approved")}><Check size={15} /> {selectedResponse === "Approved" ? "Approved" : "Approve plan"}</button>
            <button type="button" className={selectedResponse === "Changes requested" ? "selected changes" : "changes"} aria-pressed={selectedResponse === "Changes requested"} onClick={() => choosePinnedResponse("Changes requested")}><MessageCircle size={15} /> {selectedResponse === "Changes requested" ? "Changes requested" : "Request changes"}</button>
          </div>
          {selectedResponse && <p className="pulse-input-saved" role="status"><Check size={13} /> Your response “{selectedResponse}” is saved in this browser.</p>}
          <form className="pulse-pinned-reply" onSubmit={sendPinnedReply}>
            <input aria-label="Reply to pinned request" value={pinnedDraft} onChange={(event) => setPinnedDraft(event.target.value)} maxLength={1000} placeholder="Add a reply or context…" />
            <button type="submit" disabled={!pinnedDraft.trim()}><Send size={14} /> Reply</button>
          </form>
          {workspace.pinnedReplies[channel.id] && <p className="pulse-pinned-last-reply"><strong>Your latest reply:</strong> {workspace.pinnedReplies[channel.id]}</p>}
        </article>

        <section className="pulse-message-panel glass" aria-label={`${channel.name} conversation`}>
          <div className="pulse-message-list">
            <div className="pulse-message-date">TODAY IN {channel.name.toUpperCase()}</div>
            {messages.map((message) => {
              const own = message.sender === CURRENT_AGENT;
              return <article className={`pulse-message ${own ? "own" : "other"}`} key={message.id}>
                {!own && <span className={`pulse-message-avatar ${message.sender === "Meera Bot" ? "bot" : "person"}`}>{message.sender === "Meera Bot" ? <Bot size={15} /> : message.sender.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span>}
                <div className="pulse-message-content"><div className="pulse-message-meta">{!own && <strong>{message.sender}</strong>}<time dateTime={message.sentAt}>{formatTime(message.sentAt)}</time></div><p>{message.text}</p></div>
                {own && <span className="pulse-message-avatar own-avatar">A</span>}
              </article>;
            })}
          </div>
          <form className="pulse-compose" onSubmit={sendMessage}>
            <input aria-label={`Message ${channel.name}`} value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder={`Message #${channel.name}`} />
            <button type="submit" disabled={!draft.trim()} aria-label="Send message"><Send size={17} /></button>
          </form>
        </section>
        {storageError && <p className="pulse-storage-warning" role="alert">{storageError}</p>}
        <p className="pulse-demo-disclaimer">Messages and responses are saved only in this browser. They are not sent to external users or services.</p>
      </section>
    );
  }

  return (
    <section className="pulse-home-page">
      <div className="pulse-demo-banner"><Sparkles size={15} /><span>Team workspace preview</span><small>Sample collaboration content is stored locally in this browser.</small></div>
      <section className="pulse-avani-hero glass">
        <div className="pulse-avani-orb"><Bot size={33} /></div>
        <div className="pulse-avani-copy"><span className="pulse-agent-kicker">YOUR AI TEAMMATE</span><h2>AvaniBot</h2><p>Workspace assistant · Ready to help coordinate your day</p><span className="pulse-avani-status"><i /> Active in the workspace</span></div>
        <button type="button" className="pulse-open-hub" onClick={() => onOpenChannel("agent-hub")}>Open agent-hub <ArrowUpRight size={15} /></button>
        <div className="pulse-hero-decoration">✦</div>
      </section>

      <div className="pulse-home-grid">
        <div className="pulse-home-column">
          <section className="pulse-home-card glass">
            <div className="pulse-home-card-heading"><div><p className="eyebrow">YOUR TEAM</p><h2>Channels</h2></div><span className="pulse-small-count">{channels.length} spaces</span></div>
            <div className="pulse-channel-list">
              {channels.map((item) => {
                const latest = getLastMessage(workspace, item);
                return <button type="button" className="pulse-channel-row" key={item.id} onClick={() => onOpenChannel(item.id)}>
                  <span className="pulse-channel-icon"><Hash size={17} /></span>
                  <span className="pulse-channel-info"><strong>{item.name}</strong><small>{latest ? `${latest.sender}: ${latest.text}` : item.description}</small></span>
                  <span className="pulse-channel-activity">{latest ? formatTime(latest.sentAt) : "New"}</span><ChevronRight size={16} className="pulse-channel-chevron" />
                </button>;
              })}
            </div>
          </section>

          <section className="pulse-home-card glass">
            <div className="pulse-home-card-heading"><div><p className="eyebrow">PEOPLE</p><h2>Role agents</h2></div><Users size={17} className="pulse-section-icon" /></div>
            <div className="pulse-agent-list">{roleAgents.map((agent) => <article className="pulse-role-agent" key={agent.name}>
              <span className={`pulse-role-avatar ${agent.color}`}>{agent.initials}</span><span className="pulse-role-copy"><strong>{agent.name}</strong><small>{agent.role}</small></span><span className={`pulse-presence ${agent.presence === "Available" ? "available" : "focus"}`}><i />{agent.presence}</span>
            </article>)}</div>
          </section>
        </div>

        <div className="pulse-home-column">
          <section className="pulse-home-card glass">
            <div className="pulse-home-card-heading"><div><p className="eyebrow">ASSISTED WORKFLOWS</p><h2>Task agents</h2></div><Sparkles size={17} className="pulse-section-icon" /></div>
            <div className="pulse-task-list">{taskAgents.map((agent) => <article className="pulse-task-agent" key={agent.name}>
              <span className="pulse-task-icon"><Bot size={16} /></span><span><strong>{agent.name}</strong><small>{agent.task}</small></span><span className="pulse-task-status">Preview</span>
            </article>)}</div>
          </section>

          <section className="pulse-home-card pulse-kudos-card glass">
            <div className="pulse-home-card-heading"><div><p className="eyebrow">TEAM APPRECIATION</p><h2>Kudos</h2></div><Star size={17} className="pulse-kudos-icon" /></div>
            <div className="pulse-kudos-list">{kudos.map((item) => <article className="pulse-kudos-item" key={item.name}>
              <span className="pulse-kudos-avatar">{item.initials}</span><div><p><strong>{item.name}</strong> gave a shout-out</p><blockquote>“{item.text}”</blockquote><small>{item.time}</small></div>
            </article>)}</div>
          </section>
        </div>
      </div>
      {storageError && <p className="pulse-storage-warning" role="alert">{storageError}</p>}
    </section>
  );
}

export default PulseHome;
