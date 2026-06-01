import { useState, useEffect, useRef } from "react";

const SYSTEM_PROMPT = `You are an expert UK trades estimator with 20 years of experience pricing work across all trades — including builders, plumbers, electricians, plasterers, painters and decorators, tilers, joiners, roofers and landscapers.

When given a job description, generate a conservative, realistic trade quote in JSON format.

IMPORTANT PRICING RULES:
- Use CONSERVATIVE, MID-RANGE UK rates, not premium London rates
- Use trade-specific labour rates appropriate to the trade specified by the user:
  * General Builder: 25-35/hr
  * Bricklayer: 28-38/hr
  * Groundworker: 25-35/hr
  * Plasterer: 28-38/hr
  * Plumber: 40-55/hr
  * Electrician: 45-60/hr
  * HVAC Engineer: 45-60/hr
  * Roofer: 30-45/hr
  * Joiner/Carpenter: 28-40/hr
  * Tiler: 25-35/hr
  * Painter & Decorator: 20-30/hr
  * Landscaper: 20-30/hr
- If the user specifies their trade, use that trade's rates for labour line items
- If the trade is "Other / Multi-Trade", use the most appropriate rates for the specific work described in the job description
- If CIS is mentioned, note that CIS deductions are calculated separately and shown on the quote — do not adjust labour rates for CIS
- Always price on the lower-to-mid end so tradesmen can adjust upward if needed
- For small jobs (under 500), keep line items minimal and realistic
- Do not add unnecessary line items to inflate the quote
- Materials should reflect trade prices, not retail prices

Return ONLY valid JSON with this exact structure, no other text before or after:
{
  "jobTitle": "Brief job title",
  "jobRef": "BQ-XXXX",
  "summary": "2-3 sentence professional summary of the works",
  "lineItems": [
    { "category": "Labour", "description": "Detailed description", "unit": "hrs", "qty": 4, "rate": 35.00, "total": 140.00 }
  ],
  "subtotal": 140.00,
  "vatRate": 20,
  "vatAmount": 28.00,
  "grandTotal": 168.00,
  "notes": "",
  "duration": "1 day"
}

CRITICAL JSON RULES:
- Return ONLY the raw JSON object, nothing else before or after
- No markdown, no code blocks, no backticks
- No pound signs anywhere inside the JSON
- No apostrophes or single quotes inside any text values
- No trailing commas after the last item in any array or object
- All numeric fields must be plain numbers only
- Keep description text simple, avoid special characters
- jobRef must be BQ- followed by 4 random digits, e.g. BQ-3847`;


const TRADES = [
  "General Builder",
  "Bricklayer",
  "Groundworker",
  "Plasterer",
  "Plumber",
  "Electrician",
  "HVAC Engineer",
  "Roofer",
  "Joiner / Carpenter",
  "Tiler",
  "Painter & Decorator",
  "Landscaper",
  "Other / Multi-Trade"
];

const DEFAULT_TERMS = "Quote valid for 30 days. Rates are indicative - adjust to your local market and supplier pricing. 50% deposit required on acceptance of quote. Balance due within 14 days of completion. All works carry a 12-month workmanship guarantee.";

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@700;800;900&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
  @keyframes spin { to { transform:rotate(360deg); } }
  @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse { 0%, 100% { opacity:1; transform:scale(1); } 50% { opacity:0.5; transform:scale(0.8); } }
  * { box-sizing:border-box; }
  body {
    background: #050d1a;
    font-family: 'DM Sans', sans-serif;
  }
  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background:
      radial-gradient(ellipse 80% 60% at 20% -10%, rgba(37,99,235,0.14) 0%, transparent 60%),
      radial-gradient(ellipse 60% 50% at 80% 110%, rgba(37,99,235,0.10) 0%, transparent 60%),
      radial-gradient(ellipse 40% 40% at 50% 50%, rgba(37,99,235,0.03) 0%, transparent 70%);
    pointer-events: none;
    z-index: 0;
  }
  body::after {
    content: '';
    position: fixed;
    inset: 0;
    background-image:
      linear-gradient(rgba(37,99,235,0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(37,99,235,0.03) 1px, transparent 1px);
    background-size: 60px 60px;
    pointer-events: none;
    z-index: 0;
  }
  #root { position: relative; z-index: 1; }
  input, textarea { outline:none !important; }
  input::placeholder, textarea::placeholder { color: #4b5563; }
  .no-print {}
  @media print { .no-print { display:none !important; } body { margin:0; } }
  .btn-glow:hover { box-shadow: 0 0 24px rgba(37,99,235,0.5) !important; transform: translateY(-1px); }
  .card-hover:hover { border-color: rgba(37,99,235,0.35) !important; transform: translateY(-1px); }
  input:focus, textarea:focus { border-color: rgba(96,165,250,0.7) !important; box-shadow: 0 0 0 3px rgba(37,99,235,0.15) !important; background: #1e3a5f !important; }
  input::placeholder, textarea::placeholder { color: #64748b !important; }
  select:focus { border-color: rgba(96,165,250,0.7) !important; }
  @media (max-width: 600px) {
    .line-items-header { display: none !important; }
    .line-item-desktop { display: none !important; }
    .line-item-mobile { display: flex !important; }
  }
  @media (min-width: 601px) {
    .line-item-mobile { display: none !important; }
    .line-item-desktop { display: grid !important; }
  }
`;

const STORAGE_KEY = "briefquote_settings";
const HISTORY_KEY = "briefquote_history";
const QUOTE_COUNT_KEY = "briefquote_quote_count";
const EMAIL_KEY = "briefquote_email";
const PRO_KEY = "briefquote_pro";
const FREE_LIMIT = 3;

// ── CHANGED: replaced STRIPE_URL constant with startCheckout function ──
async function startCheckout(email) {
  const res = await fetch('/api/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email || '' }),
  });
  const data = await res.json();
  if (data.url) window.location.href = data.url;
}

async function openCustomerPortal(email) {
  const res = await fetch('/api/customer-portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json();
  if (data.url) window.location.href = data.url;
  else alert('Could not open subscription portal. Please contact hello@briefquote.co.uk');
}

function getQuoteCount() {
  try { return parseInt(localStorage.getItem(QUOTE_COUNT_KEY)||"0",10); } catch { return 0; }
}
function incrementQuoteCount() {
  try { localStorage.setItem(QUOTE_COUNT_KEY, String(getQuoteCount()+1)); } catch {}
}
function getSavedEmail() {
  try { return localStorage.getItem(EMAIL_KEY)||""; } catch { return ""; }
}
function saveEmail(email) {
  try { localStorage.setItem(EMAIL_KEY, email.toLowerCase().trim()); } catch {}
}
async function checkProStatus(email) {
  try {
    const res = await fetch('/api/check-pro', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({email: email.toLowerCase().trim()})
    });
    const data = await res.json();
    return data.isPro === true;
  } catch { return false; }
}

function loadSettings() {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? JSON.parse(s) : {};
  } catch { return {}; }
}

function saveSettings(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

function loadHistory() {
  try {
    const h = localStorage.getItem(HISTORY_KEY);
    return h ? JSON.parse(h) : [];
  } catch { return []; }
}

function saveToHistory(quote, clientInfo, companyName, jobDesc) {
  try {
    const history = loadHistory();
    const entry = {
      id: Date.now(),
      savedAt: new Date().toISOString(),
      status: "draft",
      jobDesc,
      companyName,
      clientInfo,
      quote
    };
    const updated = [entry, ...history].slice(0, 50);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    return entry;
  } catch {}
}

function updateHistoryStatus(id, status) {
  try {
    const history = loadHistory().map(h => h.id === id ? {...h, status} : h);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

function deleteFromHistory(id) {
  try {
    const history = loadHistory().filter(h => h.id !== id);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

function updateInHistory(id, quote, clientInfo, companyName, jobDesc) {
  try {
    const history = loadHistory().map(h => h.id === id ? {...h, quote, clientInfo, companyName, jobDesc, savedAt: new Date().toISOString()} : h);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {}
}

function duplicateInHistory(id) {
  try {
    const history = loadHistory();
    const original = history.find(h => h.id === id);
    if (!original) return;
    const copy = {
      ...original,
      id: Date.now(),
      savedAt: new Date().toISOString(),
      status: "draft",
      quote: {
        ...original.quote,
        jobRef: "BQ-" + Math.floor(1000 + Math.random() * 9000),
      }
    };
    const updated = [copy, ...history].slice(0, 50);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    return copy;
  } catch {}
}

const STATUS_CONFIG = {
  draft:    { label:"DRAFT",    bg:"#091424", border:"rgba(37,99,235,0.2)", color:"#6b7280" },
  sent:     { label:"SENT",     bg:"#0c1a2e", border:"#1e3a5f", color:"#60a5fa" },
  accepted: { label:"ACCEPTED", bg:"#0a1f0a", border:"#166534", color:"#4ade80" },
  declined: { label:"DECLINED", bg:"#1f0a0a", border:"#7f1d1d", color:"#f87171" },
};

function StatusBadge({ status, onChange }) {
  const [open, setOpen] = useState(false);
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  const mo = {fontFamily:"'DM Mono', monospace"};

  return (
    <div style={{position:"relative"}}>
      <button
        onClick={e=>{ e.stopPropagation(); setOpen(v=>!v); }}
        style={{background:cfg.bg, border:`1px solid ${cfg.border}`, color:cfg.color, borderRadius:"4px", padding:"3px 8px", fontSize:"10px", cursor:"pointer", ...mo, fontWeight:700, letterSpacing:"0.06em"}}>
        {cfg.label} ▾
      </button>
      {open&&(
        <div style={{position:"absolute",top:"100%",right:0,marginTop:"4px",background:"#0d1e35",border:"1px solid rgba(37,99,235,0.2)",borderRadius:"6px",overflow:"hidden",zIndex:100,minWidth:"120px"}}>
          {Object.entries(STATUS_CONFIG).map(([key, c])=>(
            <button key={key} onClick={e=>{ e.stopPropagation(); onChange(key); setOpen(false); }}
              style={{display:"block",width:"100%",background:status===key?"#112540":"transparent",border:"none",borderBottom:"1px solid rgba(37,99,235,0.1)",color:c.color,padding:"8px 12px",fontSize:"11px",cursor:"pointer",...mo,fontWeight:700,textAlign:"left",letterSpacing:"0.06em"}}>
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryPanel({ onLoad, onDuplicate, onClose }) {
  const [history, setHistory] = useState(loadHistory());
  const [filterStatus, setFilterStatus] = useState("all");

  const handleDelete = (id) => {
    deleteFromHistory(id);
    setHistory(loadHistory());
  };

  const handleStatusChange = (id, status) => {
    updateHistoryStatus(id, status);
    setHistory(loadHistory());
  };

  const handleDuplicate = (id) => {
    const copy = duplicateInHistory(id);
    if (copy) onDuplicate(copy);
  };

  const mo = {fontFamily:"'DM Mono', monospace"};
  const am = {color:"#60a5fa"};

  if (history.length === 0) return (
    <div style={{animation:"fadeUp 0.3s ease forwards"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"20px"}}>
        <h2 style={{margin:0,fontSize:"22px",fontWeight:800,color:"#fff",fontFamily:"'Outfit', sans-serif",letterSpacing:"-0.02em"}}>Quote History</h2>
        <button onClick={onClose} style={{background:"transparent",border:"1px solid rgba(37,99,235,0.2)",color:"#6b7280",padding:"6px 12px",borderRadius:"6px",...mo,fontSize:"11px",cursor:"pointer"}}>← BACK</button>
      </div>
      <div style={{background:"#091424",border:"1px solid rgba(37,99,235,0.15)",borderRadius:"10px",padding:"40px",textAlign:"center"}}>
        <div style={{fontSize:"32px",marginBottom:"12px"}}>📋</div>
        <p style={{color:"#6b7280",margin:0,fontSize:"14px"}}>No quotes saved yet. Generate your first quote and it will appear here.</p>
      </div>
    </div>
  );

  const normalised = history.map(h=>({...h, status: h.status||"draft"}));
  const filtered = filterStatus === "all" ? normalised : normalised.filter(h => h.status === filterStatus);
  const counts = { all: normalised.length, ...Object.fromEntries(Object.keys(STATUS_CONFIG).map(s=>[s, normalised.filter(h=>h.status===s).length])) };

  return (
    <div style={{animation:"fadeUp 0.3s ease forwards"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
        <div>
          <h2 style={{margin:"0 0 2px 0",fontSize:"22px",fontWeight:800,color:"#fff",fontFamily:"'Outfit', sans-serif",letterSpacing:"-0.02em"}}>Quote History</h2>
          <p style={{margin:0,color:"#6b7280",fontSize:"13px",...mo}}>{history.length} QUOTE{history.length!==1?"S":""} SAVED</p>
        </div>
        <button onClick={onClose} style={{background:"transparent",border:"1px solid rgba(37,99,235,0.2)",color:"#6b7280",padding:"6px 12px",borderRadius:"6px",...mo,fontSize:"11px",cursor:"pointer"}}>← BACK</button>
      </div>

      <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"16px"}}>
        {[["all","ALL"],["draft","DRAFT"],["sent","SENT"],["accepted","ACCEPTED"],["declined","DECLINED"]].map(([key,label])=>{
          const cfg = STATUS_CONFIG[key];
          const active = filterStatus===key;
          return (
            <button key={key} onClick={()=>setFilterStatus(key)}
              style={{background:active?(cfg?cfg.bg:"#112540"):"transparent", border:`1px solid ${active?(cfg?cfg.border:"#3b82f6"):"#2a2a2a"}`, color:active?(cfg?cfg.color:"#3b82f6"):"#6b7280", borderRadius:"20px", padding:"4px 12px", fontSize:"11px", cursor:"pointer", ...mo, fontWeight:active?700:400}}>
              {label} {counts[key]>0?`(${counts[key]})`:""}
            </button>
          );
        })}
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
        {filtered.length===0&&(
          <div style={{background:"#091424",border:"1px solid rgba(37,99,235,0.15)",borderRadius:"10px",padding:"32px",textAlign:"center"}}>
            <p style={{color:"#6b7280",margin:0,fontSize:"14px"}}>No {filterStatus} quotes yet.</p>
          </div>
        )}
        {filtered.map((entry) => {
          const cfg = STATUS_CONFIG[entry.status||"draft"];
          return (
            <div key={entry.id} style={{background:"#091424",border:"1px solid rgba(37,99,235,0.15)",borderRadius:"10px",padding:"16px 18px",transition:"border-color 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(37,99,235,0.2)"}
              onMouseLeave={e=>e.currentTarget.style.borderColor="#1f1f1f"}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"12px"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"6px",flexWrap:"wrap"}}>
                    <span style={{...am,...mo,fontSize:"11px"}}>{entry.quote.jobRef}</span>
                    <span style={{color:"#6b7280",fontSize:"11px",...mo}}>
                      {new Date(entry.savedAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}
                    </span>
                    <StatusBadge status={entry.status||"draft"} onChange={(s)=>handleStatusChange(entry.id,s)}/>
                  </div>
                  <div style={{color:"#fff",fontSize:"15px",fontWeight:600,marginBottom:"4px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {entry.quote.jobTitle}
                  </div>
                  {entry.clientInfo?.name&&(
                    <div style={{color:"#6b7280",fontSize:"12px",marginBottom:"4px"}}>👤 {entry.clientInfo.name}</div>
                  )}
                  <div style={{color:"#9ca3af",fontSize:"12px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {entry.jobDesc}
                  </div>
                  {(entry.status==="draft"||!entry.status)&&(
                    <div style={{display:"flex",alignItems:"center",gap:"6px",marginTop:"6px"}}>
                      <span style={{color:"#3b82f6",fontSize:"10px"}}>↑</span>
                      <span style={{color:"#4b5563",fontSize:"11px",fontFamily:"monospace"}}>Update status above when sent to client</span>
                    </div>
                  )}
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{...am,fontSize:"20px",fontWeight:800,marginBottom:"8px"}}>
                    £{Number(entry.quote.grandTotal).toLocaleString("en-GB",{minimumFractionDigits:2})}
                  </div>
                  <div style={{display:"flex",gap:"6px",justifyContent:"flex-end",flexWrap:"wrap"}}>
                    <button onClick={()=>onLoad(entry)}
                      style={{background:"#3b82f6",border:"none",color:"#000",padding:"6px 12px",borderRadius:"6px",...mo,fontSize:"11px",fontWeight:700,cursor:"pointer"}}>
                      OPEN
                    </button>
                    <button onClick={()=>handleDuplicate(entry.id)}
                      title="Duplicate this quote"
                      style={{background:"transparent",border:"1px solid rgba(37,99,235,0.2)",color:"#9ca3af",padding:"6px 10px",borderRadius:"6px",...mo,fontSize:"11px",cursor:"pointer"}}
                      onMouseEnter={e=>{e.currentTarget.style.borderColor="#2563eb44";e.currentTarget.style.color="#3b82f6";}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(37,99,235,0.2)";e.currentTarget.style.color="#9ca3af";}}>
                      ⧉
                    </button>
                    <button onClick={()=>handleDelete(entry.id)}
                      title="Delete this quote"
                      style={{background:"transparent",border:"1px solid rgba(37,99,235,0.2)",color:"#4b5563",padding:"6px 10px",borderRadius:"6px",...mo,fontSize:"11px",cursor:"pointer"}}
                      onMouseEnter={e=>{e.currentTarget.style.borderColor="#7f1d1d";e.currentTarget.style.color="#ef4444";}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(37,99,235,0.2)";e.currentTarget.style.color="#4b5563";}}>
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmailGenerator({ quote, clientInfo, companyName, onClose }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const mo = {fontFamily:"'DM Mono', monospace"};
  const am = {color:"#60a5fa"};

  const generate = async () => {
    setLoading(true);
    setEmail("");
    const clientName = clientInfo?.name || "the client";
    const prompt = `Write a short, professional email from a builder to a client to accompany a quote.

Builder/Company: ${companyName || "the builder"}
Client name: ${clientName}
Job: ${quote.jobTitle}
Total quote value: £${Number(quote.grandTotal).toLocaleString("en-GB", {minimumFractionDigits:2})}
Job duration: ${quote.duration}
Job summary: ${quote.summary}

Rules:
- Friendly but professional tone
- 3-4 short paragraphs maximum
- Reference the job title and total
- Mention they can contact with any questions
- Do not use overly formal language
- No subject line needed, just the email body
- Sign off with the company name or "the team"
- Do not use placeholders like [NAME] - use the actual names provided`;

    try {
      const res = await fetch('/api/generate', {
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:500,messages:[{role:"user",content:prompt}]})
      });
      const data = await res.json();
      if (!res.ok) { setEmail("Error generating email. Please try again."); setLoading(false); return; }
      const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("").trim();
      setEmail(text);
    } catch(err) {
      setEmail("Error: " + err.message);
    }
    setLoading(false);
  };

  useEffect(()=>{ generate(); },[]);

  const handleCopy = () => {
    navigator.clipboard.writeText(email);
    setCopied(true);
    setTimeout(()=>setCopied(false),2000);
  };

  return (
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.85)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
      <div style={{background:"#091424",border:"1px solid rgba(37,99,235,0.2)",borderTop:"3px solid #2563eb",borderRadius:"10px",width:"100%",maxWidth:"600px",maxHeight:"90vh",overflow:"auto",padding:"24px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"20px"}}>
          <div>
            <h2 style={{margin:"0 0 2px 0",fontSize:"20px",fontWeight:700,color:"#fff"}}>Cover Email</h2>
            <p style={{margin:0,color:"#6b7280",fontSize:"12px",...mo}}>READY TO SEND WITH YOUR QUOTE</p>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:"1px solid rgba(37,99,235,0.2)",color:"#6b7280",padding:"6px 12px",borderRadius:"6px",...mo,fontSize:"11px",cursor:"pointer"}}>✕ CLOSE</button>
        </div>
        <div style={{background:"#091424",border:"1px solid rgba(37,99,235,0.15)",borderRadius:"8px",padding:"12px 16px",marginBottom:"14px"}}>
          <div style={{display:"flex",gap:"8px",marginBottom:"6px",alignItems:"center"}}>
            <span style={{color:"#6b7280",fontSize:"11px",...mo,width:"60px"}}>TO:</span>
            <span style={{color:"#9ca3af",fontSize:"13px"}}>{clientInfo?.email || "— add client email in quote form"}</span>
          </div>
          <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
            <span style={{color:"#6b7280",fontSize:"11px",...mo,width:"60px"}}>SUBJECT:</span>
            <span style={{color:"#9ca3af",fontSize:"13px"}}>Quote for {quote.jobTitle} — £{Number(quote.grandTotal).toLocaleString("en-GB",{minimumFractionDigits:2})}</span>
          </div>
        </div>
        {loading ? (
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:"12px",padding:"32px"}}>
            <div style={{width:"24px",height:"24px",border:"2px solid #2a2a2a",borderTop:"2px solid #2563eb",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
            <span style={{color:"#6b7280",...mo,fontSize:"13px"}}>WRITING EMAIL...</span>
          </div>
        ) : (
          <textarea value={email} onChange={e=>setEmail(e.target.value)} rows={12}
            style={{width:"100%",background:"#112540",border:"1px solid rgba(37,99,235,0.2)",borderRadius:"8px",color:"#e5e7eb",fontSize:"14px",padding:"14px",fontFamily:"sans-serif",lineHeight:1.7,resize:"vertical"}}
            onFocus={e=>e.target.style.borderColor="#3b82f6"}
            onBlur={e=>e.target.style.borderColor="rgba(37,99,235,0.2)"}
          />
        )}
        {!loading&&email&&(
          <div style={{display:"flex",gap:"10px",marginTop:"14px",flexWrap:"wrap"}}>
            <button onClick={handleCopy}
              style={{background:copied?"#065f46":"#3b82f6",border:"none",color:copied?"#34d399":"#000",padding:"10px 18px",borderRadius:"6px",...mo,fontSize:"12px",fontWeight:700,cursor:"pointer"}}>
              {copied?"✓ COPIED":"⧉ COPY EMAIL"}
            </button>
            <button onClick={generate}
              style={{background:"transparent",border:"1px solid rgba(37,99,235,0.2)",color:"#9ca3af",padding:"10px 18px",borderRadius:"6px",...mo,fontSize:"12px",cursor:"pointer"}}>
              ↻ REGENERATE
            </button>
          </div>
        )}
        <p style={{color:"#6b7280",fontSize:"11px",...mo,marginTop:"12px",marginBottom:0}}>
          Edit the email above before copying. The subject line is suggested — change it as needed.
        </p>
      </div>
    </div>
  );
}

function Spinner() {
  const messages = [
    "ANALYSING JOB...",
    "CALCULATING LABOUR RATES...",
    "PRICING MATERIALS...",
    "BUILDING YOUR QUOTE...",
    "ALMOST THERE...",
  ];
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex(i => (i + 1) % messages.length);
    }, 1800);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"20px",padding:"60px 0"}}>
      <div style={{width:"48px",height:"48px",border:"3px solid #1e3a5f",borderTop:"3px solid #2563eb",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <div style={{textAlign:"center"}}>
        <p style={{color:"#60a5fa",fontFamily:"'DM Mono',monospace",fontSize:"13px",letterSpacing:"0.08em",animation:"fadeUp 0.4s ease forwards"}} key={msgIndex}>
          {messages[msgIndex]}
        </p>
        <p style={{color:"#4b5563",fontFamily:"'DM Mono',monospace",fontSize:"11px",marginTop:"6px"}}>
          This usually takes 5–10 seconds
        </p>
      </div>
    </div>
  );
}

function EditableCell({ value, onChange, isQty=false }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value);
  const ref = useRef(null);
  useEffect(() => { if (editing && ref.current) ref.current.focus(); }, [editing]);
  const commit = () => {
    const p = parseFloat(val);
    if (!isNaN(p) && p >= 0) onChange(p); else setVal(value);
    setEditing(false);
  };
  if (editing) return (
    <input ref={ref} value={val} onChange={e=>setVal(e.target.value)}
      onBlur={commit} onKeyDown={e=>{if(e.key==="Enter")commit();if(e.key==="Escape"){setVal(value);setEditing(false);}}}
      style={{background:"#112540",border:"1px solid #2563eb",borderRadius:"3px",color:"#fff",padding:"2px 5px",width:"70px",fontFamily:"monospace",fontSize:"12px",textAlign:"right"}}
    />
  );
  return (
    <span onClick={()=>{setVal(isQty?value:Number(value).toFixed(2));setEditing(true);}} title="Click to edit"
      style={{color:"#9ca3af",fontSize:"12px",fontFamily:"monospace",cursor:"pointer",borderBottom:"1px dashed rgba(37,99,235,0.2)"}}>
      {isQty ? value : `£${Number(value).toFixed(2)}`}
    </span>
  );
}

function QuoteResult({ quote:init, clientInfo, companyName, defaultTerms, vatRegistered=true, cisRegistered=false, cisRate=20, historyId, jobDesc, onQuoteChange, onSaveTerms, onReset }) {
  const initQ = {...init, notes: defaultTerms || init.notes};
  if (!vatRegistered) { initQ.vatAmount = 0; initQ.grandTotal = initQ.subtotal; }
  const [q, setQ] = useState(initQ);
  const [vatRate, setVatRate] = useState(vatRegistered ? 20 : 0);
  const [editingNotes, setEditingNotes] = useState(false);
  const [savedTerms, setSavedTerms] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showEmail, setShowEmail] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    if (historyId) {
      updateInHistory(historyId, q, clientInfo, companyName, jobDesc);
      setSaved(true);
      setTimeout(()=>setSaved(false), 2000);
    }
  };

  const autoSave = (updatedQuote) => {
    if (onQuoteChange) onQuoteChange(updatedQuote);
    if (historyId) updateInHistory(historyId, updatedQuote, clientInfo, companyName, jobDesc);
  };

  const recalc = (items, rate=vatRate) => {
    const sub = items.reduce((s,i)=>s+Number(i.total),0);
    const vat = vatRegistered ? sub*(rate/100) : 0;
    const updated = {...q, lineItems:items, subtotal:sub, vatRate:rate, vatAmount:vat, grandTotal:sub+vat};
    autoSave(updated);
    return updated;
  };

  const handleVatRateChange = (rate) => {
    setVatRate(rate);
    const sub = q.lineItems.reduce((s,i)=>s+Number(i.total),0);
    const vat = vatRegistered ? sub*(rate/100) : 0;
    const updated = {...q, vatRate:rate, vatAmount:vat, grandTotal:sub+vat};
    setQ(updated);
    autoSave(updated);
  };

  const updateItem = (idx, field, val) => {
    const items = q.lineItems.map((it,i)=>{
      if(i!==idx) return it;
      const u = {...it,[field]:val};
      if(field==="qty"||field==="rate") u.total = Number(u.qty)*Number(u.rate);
      return u;
    });
    setQ(recalc(items));
  };

  const updateDesc = (idx, val) => {
    const items = q.lineItems.map((it,i)=>i===idx?{...it,description:val}:it);
    const updated = {...q, lineItems:items};
    setQ(updated);
    autoSave(updated);
  };

  const updateUnit = (idx, val) => {
    const items = q.lineItems.map((it,i)=>i===idx?{...it,unit:val}:it);
    const updated = {...q, lineItems:items};
    setQ(updated);
    autoSave(updated);
  };

  const deleteItem = (idx) => setQ(recalc(q.lineItems.filter((_,i)=>i!==idx)));

  const getDefaultUnit = (cat) => {
    const c = cat.toLowerCase();
    if (c.includes("labour")||c.includes("labor")) return "hrs";
    if (c.includes("plant")||c.includes("equipment")||c.includes("hire")) return "day";
    if (c.includes("floor")||c.includes("tiling")) return "m2";
    if (c.includes("groundwork")||c.includes("excavat")) return "m3";
    return "item";
  };

  const addItem = (cat) => {
    const items = [...q.lineItems, {category:cat, description:"New item", unit:getDefaultUnit(cat), qty:1, rate:0, total:0}];
    setQ(recalc(items));
  };

  const addCategory = () => {
    const name = prompt("Enter new section name (e.g. Groundworks, Fixings, Subcontractors):");
    if (!name||!name.trim()) return;
    const cat = name.trim();
    if (cats.includes(cat)) { alert("That section already exists."); return; }
    const items = [...q.lineItems, {category:cat, description:"New item", unit:"item", qty:1, rate:0, total:0}];
    setQ(recalc(items));
  };

  const handleCopy = () => {
    const text = [
      companyName||"BUILDER QUOTE",
      clientInfo.name?`Client: ${clientInfo.name}`:"",
      clientInfo.address?`Address: ${clientInfo.address}`:"",
      "",`QUOTE REF: ${q.jobRef}`,q.jobTitle,
      `Date: ${new Date().toLocaleDateString("en-GB")}`,
      `Duration: ${q.duration}`,"",q.summary,"",
      ...q.lineItems.map(i=>`${i.description} — £${Number(i.total).toFixed(2)}`),
      "",`Subtotal: £${Number(q.subtotal).toFixed(2)}`,
      `VAT (20%): £${Number(q.vatAmount).toFixed(2)}`,
      `TOTAL: £${Number(q.grandTotal).toFixed(2)}`,"",q.notes
    ].filter(Boolean).join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true); setTimeout(()=>setCopied(false),2000);
  };

  const handlePrint = () => {
    const catRows = [...new Set(q.lineItems.map(i=>i.category))].map(cat => `
      <tr><td colspan="5" style="padding:7px 12px;background:#f5f5f5;font-size:11px;font-weight:700;letter-spacing:0.08em;color:#666;text-transform:uppercase">${cat}</td></tr>
      ${q.lineItems.filter(i=>i.category===cat).map(item=>`
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px">${item.description}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;text-align:center">${item.unit}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;text-align:right">${item.qty}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;text-align:right">£${Number(item.rate).toFixed(2)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;font-size:13px;text-align:right;font-weight:600">£${Number(item.total).toFixed(2)}</td>
        </tr>`).join("")}`).join("");

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Quote ${q.jobRef}</title>
    <style>
      body{font-family:Arial,sans-serif;margin:0;padding:32px;color:#111;max-width:820px;margin:0 auto}
      h1{font-size:22px;margin:0 0 4px}
      table{width:100%;border-collapse:collapse;margin:20px 0}
      th{background:#111;color:#fff;padding:10px 12px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;text-align:left}
      th:not(:first-child){text-align:right}
      .header{border-bottom:3px solid #3b82f6;padding-bottom:20px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start}
      .grand-total{font-size:28px;font-weight:800}
      .badge{background:#111;color:#fff;padding:3px 10px;border-radius:4px;font-size:11px;letter-spacing:0.08em;display:inline-block;margin-bottom:8px}
      .meta{color:#888;font-size:12px;margin-top:4px}
      .client-box{background:#f9f9f9;border-radius:6px;padding:12px 16px;margin:16px 0;font-size:13px;color:#444;line-height:1.8}
      .notes{background:#f9f9f9;border-left:3px solid #2563eb;padding:12px 16px;font-size:12px;color:#555;line-height:1.7;margin-top:20px}
      .totals td{padding:8px 12px;font-size:13px;text-align:right}
      .total-final td{font-weight:700;font-size:16px;border-top:2px solid #111;padding:12px}
    </style></head><body>
    <div class="header">
      <div>
        ${companyName?`<div style="font-size:18px;font-weight:800;margin-bottom:8px">${companyName}</div>`:""}
        <div class="badge">QUOTE ${q.jobRef}</div>
        <h1>${q.jobTitle}</h1>
        <div class="meta">Date: ${new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"long",year:"numeric"})} &nbsp;|&nbsp; Est. Duration: ${q.duration}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px">Total Inc. VAT</div>
        <div class="grand-total">£${Number(q.grandTotal).toLocaleString("en-GB",{minimumFractionDigits:2})}</div>
      </div>
    </div>
    ${(clientInfo.name||clientInfo.address||clientInfo.email||clientInfo.phone)?`
    <div class="client-box"><strong>Prepared for:</strong><br/>
      ${clientInfo.name?clientInfo.name+"<br/>":""}
      ${clientInfo.address?clientInfo.address+"<br/>":""}
      ${clientInfo.email?clientInfo.email+"<br/>":""}
      ${clientInfo.phone?clientInfo.phone:""}
    </div>`:""}
    <p style="color:#555;font-size:13px;line-height:1.6">${q.summary}</p>
    <table>
      <thead><tr>
        <th style="width:42%">Description</th>
        <th style="text-align:center">Unit</th>
        <th style="text-align:right">Qty</th>
        <th style="text-align:right">Rate</th>
        <th style="text-align:right">Total</th>
      </tr></thead>
      <tbody>
        ${catRows}
        <tr class="totals"><td colspan="4" style="text-align:right;color:#666">Subtotal</td><td style="text-align:right;color:#666">£${Number(q.subtotal).toFixed(2)}</td></tr>
        <tr class="totals"><td colspan="4" style="text-align:right;color:#666">VAT @ 20%</td><td style="text-align:right;color:#666">£${Number(q.vatAmount).toFixed(2)}</td></tr>
        <tr class="total-final"><td colspan="4" style="text-align:right">TOTAL INC. VAT</td><td style="text-align:right;font-size:18px">£${Number(q.grandTotal).toLocaleString("en-GB",{minimumFractionDigits:2})}</td></tr>
      </tbody>
    </table>
    <div class="notes">${q.notes}</div>
    <script>window.onload=()=>window.print();</script>
    </body></html>`;

    const blob = new Blob([html], {type:"text/html"});
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  };

  const cats = [...new Set(q.lineItems.map(i=>i.category))];
  const am = {color:"#60a5fa"};
  const mo = {fontFamily:"'DM Mono', monospace"};

  return (
    <div style={{animation:"fadeUp 0.4s ease forwards"}}>
      <div className="no-print" style={{background:"rgba(37,99,235,0.08)",border:"1px solid rgba(37,99,235,0.2)",borderLeft:"3px solid #3b82f6",borderRadius:"8px",padding:"11px 16px",marginBottom:"14px",display:"flex",alignItems:"center",gap:"10px"}}>
        <span>✏️</span>
        <p style={{color:"#93c5fd",fontSize:"12px",lineHeight:1.5,margin:0}}>
          <strong>Click any number or text to edit.</strong> Use + ADD ROW to add items, + ADD NEW SECTION for new categories. Totals update automatically.
        </p>
      </div>

      <div style={{background:"linear-gradient(135deg,#0d1e35,#091424)",border:"1px solid rgba(37,99,235,0.2)",borderTop:"3px solid #2563eb",borderRadius:"8px",padding:"22px",marginBottom:"14px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:"12px"}}>
          <div style={{flex:1,minWidth:0}}>
            {companyName&&<div style={{color:"#fff",fontSize:"16px",fontWeight:700,marginBottom:"4px"}}>{companyName}</div>}
            <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"8px"}}>
              <span style={{...am,...mo,fontSize:"11px",flexShrink:0}}>QUOTE</span>
              <input value={q.jobRef} onChange={e=>{ const u={...q,jobRef:e.target.value}; setQ(u); autoSave(u); }}
                style={{background:"transparent",border:"none",borderBottom:"1px dashed rgba(96,165,250,0.2)",color:"#60a5fa",fontSize:"11px",...mo,width:"80px",padding:"1px 2px"}}
                onFocus={e=>e.target.style.borderBottomColor="rgba(96,165,250,0.7)"}
                onBlur={e=>e.target.style.borderBottomColor="rgba(96,165,250,0.2)"}
              />
            </div>
            <input value={q.jobTitle} onChange={e=>{ const u={...q,jobTitle:e.target.value}; setQ(u); autoSave(u); }}
              style={{background:"transparent",border:"none",borderBottom:"1px dashed rgba(96,165,250,0.2)",color:"#fff",fontSize:"20px",fontWeight:700,fontFamily:"'Outfit', sans-serif",letterSpacing:"-0.01em",width:"100%",padding:"2px 0"}}
              onFocus={e=>e.target.style.borderBottomColor="rgba(96,165,250,0.7)"}
              onBlur={e=>e.target.style.borderBottomColor="rgba(96,165,250,0.2)"}
            />
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{color:"#6b7280",fontSize:"10px",...mo,marginBottom:"3px"}}>TOTAL INC. VAT</div>
            <div style={{fontSize:"30px",fontWeight:800,...am,fontFamily:"'Outfit', sans-serif",letterSpacing:"-0.02em"}}>£{Number(q.grandTotal).toLocaleString("en-GB",{minimumFractionDigits:2})}</div>
            <div style={{color:"#6b7280",fontSize:"11px",...mo,marginTop:"4px"}}>📅 {new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}).toUpperCase()}</div>
          </div>
        </div>
        {(clientInfo.name||clientInfo.address||clientInfo.email||clientInfo.phone)&&(
          <div style={{marginTop:"14px",paddingTop:"12px",borderTop:"1px solid rgba(37,99,235,0.15)"}}>
            <div style={{color:"#6b7280",fontSize:"10px",...mo,marginBottom:"6px"}}>PREPARED FOR</div>
            <div style={{color:"#9ca3af",fontSize:"13px",lineHeight:1.8}}>
              {clientInfo.name&&<div style={{color:"#e5e7eb",fontWeight:600}}>{clientInfo.name}</div>}
              {clientInfo.address&&<div>{clientInfo.address}</div>}
              {clientInfo.email&&<div>{clientInfo.email}</div>}
              {clientInfo.phone&&<div>{clientInfo.phone}</div>}
            </div>
          </div>
        )}
        <textarea value={q.summary} onChange={e=>{ const updated = {...q, summary:e.target.value}; setQ(updated); autoSave(updated); }}
          style={{background:"transparent",border:"none",borderBottom:"1px dashed rgba(96,165,250,0.2)",color:"#9ca3af",fontSize:"13px",lineHeight:1.6,margin:"14px 0 0 0",width:"100%",resize:"none",fontFamily:"'DM Sans', sans-serif",padding:"2px 0",minHeight:"60px"}}
          onFocus={e=>{e.target.style.borderBottomColor="rgba(96,165,250,0.6)"; e.target.style.color="#cbd5e1";}}
          onBlur={e=>{e.target.style.borderBottomColor="rgba(96,165,250,0.2)"; e.target.style.color="#9ca3af";}}
          rows={3}
        />
        <div style={{display:"flex",alignItems:"center",gap:"6px",marginTop:"10px"}}>
          <span style={{color:"#6b7280",fontSize:"11px",...mo}}>⏱ EST.</span>
          <input value={q.duration} onChange={e=>{ const u={...q,duration:e.target.value}; setQ(u); autoSave(u); }}
            style={{background:"transparent",border:"none",borderBottom:"1px dashed rgba(96,165,250,0.2)",color:"#6b7280",fontSize:"11px",...mo,width:"120px",padding:"1px 2px",textTransform:"uppercase"}}
            onFocus={e=>{e.target.style.borderBottomColor="rgba(96,165,250,0.7)"; e.target.style.color="#93c5fd";}}
            onBlur={e=>{e.target.style.borderBottomColor="rgba(96,165,250,0.2)"; e.target.style.color="#6b7280";}}
          />
        </div>
        <div className="no-print" style={{marginTop:"10px",fontSize:"10px",color:"#2563eb",...mo,letterSpacing:"0.06em"}}>
          ✎ TAP ANY FIELD ABOVE TO EDIT
        </div>
      </div>

      <div style={{background:"#091424",border:"1px solid rgba(37,99,235,0.2)",borderRadius:"8px",overflow:"hidden",marginBottom:"14px"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 48px 60px 70px 70px 24px",padding:"9px 14px",background:"#112540",borderBottom:"1px solid rgba(37,99,235,0.15)"}}>
          {["DESCRIPTION","UNIT","QTY","RATE","TOTAL",""].map((h,i)=>(
            <div key={i} style={{color:"#6b7280",fontSize:"10px",...mo,textAlign:i===0?"left":"right"}}>{h}</div>
          ))}
        </div>

        {cats.map((cat,ci)=>(
          <div key={ci}>
            <div style={{padding:"7px 14px",background:"#091424",borderBottom:"1px solid #1f1f1f",borderTop:ci>0?"1px solid #2a2a2a":"none",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{...am,fontSize:"10px",...mo,fontWeight:600}}>{cat.toUpperCase()}</span>
              <button className="no-print" onClick={()=>addItem(cat)}
                style={{background:"#2563eb22",border:"1px solid #2563eb55",color:"#3b82f6",borderRadius:"4px",padding:"2px 8px",fontSize:"11px",cursor:"pointer",fontWeight:700,...mo}}>
                + ADD ROW
              </button>
            </div>
            {q.lineItems.map((item,ii)=>item.category!==cat?null:(
              <div key={ii}>
                <div className="line-item-desktop" style={{gridTemplateColumns:"1fr 48px 60px 70px 70px 24px",padding:"9px 14px",borderBottom:"1px solid rgba(37,99,235,0.1)",alignItems:"center",gap:"4px"}}>
                  <input value={item.description} onChange={e=>updateDesc(ii,e.target.value)}
                    style={{background:"transparent",border:"none",borderBottom:"1px dashed rgba(96,165,250,0.2)",color:"#f1f5f9",fontSize:"13px",padding:"2px 4px",fontFamily:"'DM Sans', sans-serif",width:"100%"}}
                    onFocus={e=>e.target.style.borderBottomColor="#3b82f6"}
                    onBlur={e=>e.target.style.borderBottomColor="rgba(96,165,250,0.2)"}
                  />
                  <input value={item.unit} onChange={e=>updateUnit(ii,e.target.value)}
                    style={{background:"transparent",border:"none",borderBottom:"1px dashed rgba(96,165,250,0.2)",color:"#94a3b8",fontSize:"11px",fontFamily:"'DM Mono', monospace",textAlign:"right",width:"100%",padding:"2px"}}
                    onFocus={e=>e.target.style.borderBottomColor="#3b82f6"}
                    onBlur={e=>e.target.style.borderBottomColor="rgba(96,165,250,0.2)"}
                  />
                  <div style={{textAlign:"right"}}><EditableCell value={item.qty} isQty onChange={v=>updateItem(ii,"qty",v)}/></div>
                  <div style={{textAlign:"right"}}><EditableCell value={item.rate} onChange={v=>updateItem(ii,"rate",v)}/></div>
                  <div style={{textAlign:"right"}}><EditableCell value={item.total} onChange={v=>updateItem(ii,"total",v)}/></div>
                  <button className="no-print" onClick={()=>deleteItem(ii)}
                    style={{background:"none",border:"none",color:"#4b5563",cursor:"pointer",fontSize:"14px",padding:0,textAlign:"center",lineHeight:1}}
                    onMouseEnter={e=>e.currentTarget.style.color="#ef4444"}
                    onMouseLeave={e=>e.currentTarget.style.color="#4b5563"}>✕</button>
                </div>
                <div className="line-item-mobile no-print" style={{flexDirection:"column",padding:"12px 14px",borderBottom:"1px solid rgba(37,99,235,0.1)",gap:"8px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"8px"}}>
                    <input value={item.description} onChange={e=>updateDesc(ii,e.target.value)}
                      style={{background:"transparent",border:"none",borderBottom:"1px dashed rgba(96,165,250,0.2)",color:"#f1f5f9",fontSize:"14px",padding:"2px 0",fontFamily:"'DM Sans', sans-serif",flex:1}}
                      onFocus={e=>e.target.style.borderBottomColor="#3b82f6"}
                      onBlur={e=>e.target.style.borderBottomColor="rgba(96,165,250,0.2)"}
                    />
                    <button onClick={()=>deleteItem(ii)}
                      style={{background:"none",border:"none",color:"#4b5563",cursor:"pointer",fontSize:"16px",padding:"0 0 0 8px",flexShrink:0}}
                      onMouseEnter={e=>e.currentTarget.style.color="#ef4444"}
                      onMouseLeave={e=>e.currentTarget.style.color="#4b5563"}>✕</button>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:"12px",flexWrap:"wrap"}}>
                    <div style={{display:"flex",alignItems:"center",gap:"4px"}}>
                      <span style={{color:"#4b5563",fontSize:"10px",...mo}}>UNIT</span>
                      <input value={item.unit} onChange={e=>updateUnit(ii,e.target.value)}
                        style={{background:"transparent",border:"none",borderBottom:"1px dashed rgba(96,165,250,0.2)",color:"#60a5fa",fontSize:"11px",fontFamily:"'DM Mono', monospace",width:"40px",padding:"1px 2px",textAlign:"center"}}
                        onFocus={e=>e.target.style.borderBottomColor="#3b82f6"}
                        onBlur={e=>e.target.style.borderBottomColor="rgba(96,165,250,0.2)"}
                      />
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:"4px"}}>
                      <span style={{color:"#4b5563",fontSize:"10px",...mo}}>QTY</span>
                      <EditableCell value={item.qty} isQty onChange={v=>updateItem(ii,"qty",v)}/>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:"4px"}}>
                      <span style={{color:"#4b5563",fontSize:"10px",...mo}}>RATE</span>
                      <EditableCell value={item.rate} onChange={v=>updateItem(ii,"rate",v)}/>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:"4px",marginLeft:"auto"}}>
                      <span style={{color:"#4b5563",fontSize:"10px",...mo}}>TOTAL</span>
                      <EditableCell value={item.total} onChange={v=>updateItem(ii,"total",v)}/>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}

        <div className="no-print" style={{padding:"10px 14px",borderTop:"1px solid rgba(37,99,235,0.1)"}}>
          <button onClick={addCategory}
            style={{background:"transparent",border:"1px dashed rgba(37,99,235,0.2)",color:"#6b7280",borderRadius:"6px",padding:"8px 16px",fontSize:"12px",...mo,cursor:"pointer",width:"100%",letterSpacing:"0.06em"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="#2563eb55";e.currentTarget.style.color="#3b82f6";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(37,99,235,0.2)";e.currentTarget.style.color="#6b7280";}}>
            + ADD NEW SECTION
          </button>
        </div>

        <div style={{borderTop:"2px solid #2a2a2a",padding:"13px 14px"}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:"6px"}}>
            <span style={{color:"#6b7280",fontSize:"12px",...mo}}>SUBTOTAL</span>
            <span style={{color:"#9ca3af",fontSize:"13px",...mo}}>£{Number(q.subtotal).toLocaleString("en-GB",{minimumFractionDigits:2})}</span>
          </div>
          {vatRegistered&&(
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"6px"}}>
              <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                <span style={{color:"#6b7280",fontSize:"12px",...mo}}>VAT RATE</span>
                <div className="no-print" style={{display:"flex",gap:"4px"}}>
                  {[0,5,20].map(r=>(
                    <button key={r} onClick={()=>handleVatRateChange(r)}
                      style={{background:vatRate===r?"#2563eb22":"transparent",border:`1px solid ${vatRate===r?"#3b82f6":"#2a2a2a"}`,color:vatRate===r?"#3b82f6":"#6b7280",borderRadius:"4px",padding:"2px 7px",fontSize:"10px",cursor:"pointer",...mo,fontWeight:vatRate===r?700:400}}>
                      {r}%
                    </button>
                  ))}
                </div>
              </div>
              <span style={{color:"#9ca3af",fontSize:"13px",...mo}}>£{Number(q.vatAmount).toLocaleString("en-GB",{minimumFractionDigits:2})}</span>
            </div>
          )}
          {!vatRegistered&&(
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:"6px"}}>
              <span style={{color:"#6b7280",fontSize:"12px",...mo}}>VAT</span>
              <span style={{color:"#4b5563",fontSize:"12px",...mo}}>NOT REGISTERED</span>
            </div>
          )}
          <div style={{display:"flex",justifyContent:"space-between",marginTop:"10px",paddingTop:"10px",borderTop:"1px solid rgba(37,99,235,0.15)"}}>
            <span style={{...am,fontSize:"13px",...mo,fontWeight:700}}>{vatRegistered?`TOTAL INC. VAT (${vatRate}%)`:"TOTAL"}</span>
            <span style={{...am,fontSize:"22px",fontWeight:800}}>£{Number(q.grandTotal).toLocaleString("en-GB",{minimumFractionDigits:2})}</span>
          </div>
          {vatRegistered&&(
            <div className="no-print" style={{marginTop:"10px",padding:"8px 10px",background:"#091424",borderRadius:"6px",border:"1px solid rgba(37,99,235,0.15)"}}>
              <p style={{color:"#4b5563",fontSize:"11px",...mo,margin:0,lineHeight:1.5}}>
                ⚠ VAT rates vary in construction — 5% applies to some renovations and energy-saving works, 0% to new builds. Consult your accountant to confirm the correct rate for this job.
              </p>
            </div>
          )}
        </div>
      </div>

      <div style={{background:"#091424",border:"1px solid rgba(37,99,235,0.2)",borderLeft:"3px solid #2563eb",borderRadius:"8px",padding:"13px 16px",marginBottom:"16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px",flexWrap:"wrap",gap:"6px"}}>
          <div style={{...am,fontSize:"10px",...mo}}>TERMS & NOTES</div>
          <div className="no-print" style={{display:"flex",gap:"6px"}}>
            {editingNotes&&(
              <button onClick={()=>{ onSaveTerms(q.notes); setSavedTerms(true); setTimeout(()=>setSavedTerms(false),2000); }}
                style={{background:savedTerms?"#065f46":"#112540",border:`1px solid ${savedTerms?"#059669":"rgba(37,99,235,0.2)"}`,color:savedTerms?"#34d399":"#9ca3af",borderRadius:"4px",padding:"2px 8px",fontSize:"11px",cursor:"pointer",...mo}}>
                {savedTerms?"✓ SAVED":"SAVE AS DEFAULT"}
              </button>
            )}
            <button onClick={()=>setEditingNotes(v=>!v)}
              style={{background:"#2563eb22",border:"1px solid #2563eb44",color:"#3b82f6",borderRadius:"4px",padding:"2px 8px",fontSize:"11px",cursor:"pointer",...mo}}>
              {editingNotes?"DONE":"EDIT"}
            </button>
          </div>
        </div>
        {editingNotes ? (
          <textarea value={q.notes} onChange={e=>{ const updated={...q,notes:e.target.value}; setQ(updated); autoSave(updated); }} rows={5}
            style={{width:"100%",background:"#112540",border:"1px solid #2563eb",borderRadius:"6px",color:"#e5e7eb",fontSize:"13px",padding:"10px 12px",fontFamily:"sans-serif",lineHeight:1.6,resize:"vertical"}}
          />
        ) : (
          <p style={{color:"#9ca3af",fontSize:"13px",lineHeight:1.7,margin:0}}>{q.notes}</p>
        )}
        {!editingNotes&&(
          <p className="no-print" style={{color:"#6b7280",fontSize:"11px",...mo,margin:"8px 0 0 0"}}>Click EDIT to customise these terms for this quote</p>
        )}
      </div>

      <div className="no-print" style={{display:"flex",gap:"10px",flexWrap:"wrap"}}>
        <button onClick={()=>setShowEmail(true)}
          style={{background:"#3b82f6",border:"none",color:"#000",padding:"10px 16px",borderRadius:"6px",...mo,fontSize:"12px",cursor:"pointer",fontWeight:700}}>
          ✉ GENERATE EMAIL
        </button>
        <button onClick={handleSave}
          style={{background:saved?"#065f46":"#112540",border:`1px solid ${saved?"#059669":"rgba(37,99,235,0.2)"}`,color:saved?"#34d399":"#6b7280",padding:"10px 16px",borderRadius:"6px",...mo,fontSize:"12px",cursor:"pointer"}}>
          {saved?"✓ SAVED":"💾 SAVE"}
        </button>
        <button onClick={handleCopy}
          style={{background:copied?"#065f46":"#112540",border:`1px solid ${copied?"#059669":"rgba(37,99,235,0.2)"}`,color:copied?"#34d399":"#e5e7eb",padding:"10px 16px",borderRadius:"6px",...mo,fontSize:"12px",cursor:"pointer"}}>
          {copied?"✓ COPIED":"⧉ COPY TEXT"}
        </button>
        <button onClick={handlePrint}
          style={{background:"#112540",border:"1px solid rgba(37,99,235,0.2)",color:"#e5e7eb",padding:"10px 16px",borderRadius:"6px",...mo,fontSize:"12px",cursor:"pointer"}}>
          🖨 PRINT / SAVE PDF
        </button>
        <button onClick={onReset}
          style={{background:"transparent",border:"1px solid rgba(37,99,235,0.2)",color:"#6b7280",padding:"10px 16px",borderRadius:"6px",...mo,fontSize:"12px",cursor:"pointer"}}>
          ← NEW QUOTE
        </button>
      </div>

      {showEmail&&(
        <EmailGenerator quote={q} clientInfo={clientInfo} companyName={companyName} onClose={()=>setShowEmail(false)}/>
      )}
    </div>
  );
}

// ── NEW: Success page shown after Stripe redirect ──
function SuccessPage({ sessionId }) {
  const [email, setEmail] = useState(getSavedEmail() || "");
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const mo = { fontFamily: "'DM Mono', monospace" };

  const handleActivate = async () => {
    if (!email.trim() || !email.includes('@')) {
      setErrorMsg("Please enter a valid email address.");
      return;
    }
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch('/api/activate-pro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, sessionId }),
      });
      const data = await res.json();
      if (data.success) {
        saveEmail(email);
        setStatus("success");
      } else {
        setErrorMsg(data.error || "Something went wrong. Please contact hello@briefquote.co.uk");
        setStatus("error");
      }
    } catch (err) {
      setErrorMsg("Network error. Please try again.");
      setStatus("error");
    }
  };

  if (status === "success") return (
    <div style={{minHeight:"100vh",background:"#050d1a",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
      <div style={{background:"#091424",border:"1px solid rgba(37,99,235,0.3)",borderTop:"3px solid #22c55e",borderRadius:"16px",padding:"40px",maxWidth:"420px",width:"100%",textAlign:"center"}}>
        <div style={{fontSize:"48px",marginBottom:"16px"}}>🎉</div>
        <h1 style={{color:"#fff",fontFamily:"'Outfit', sans-serif",fontSize:"26px",fontWeight:800,margin:"0 0 10px"}}>You're on Pro!</h1>
        <p style={{color:"#94a3b8",fontSize:"14px",marginBottom:"28px"}}>Pro access has been activated for <strong style={{color:"#60a5fa"}}>{email}</strong>.</p>
        <a href="https://app.briefquote.co.uk"
          style={{display:"block",background:"#2563eb",color:"#fff",padding:"13px",borderRadius:"8px",fontWeight:700,textDecoration:"none",fontFamily:"'Outfit', sans-serif",fontSize:"15px"}}>
          START GENERATING QUOTES →
        </a>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"#050d1a",display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
      <div style={{background:"#091424",border:"1px solid rgba(37,99,235,0.3)",borderTop:"3px solid #2563eb",borderRadius:"16px",padding:"40px",maxWidth:"420px",width:"100%"}}>
        <div style={{textAlign:"center",marginBottom:"28px"}}>
          <div style={{fontSize:"40px",marginBottom:"12px"}}>✅</div>
          <h1 style={{color:"#fff",fontFamily:"'Outfit', sans-serif",fontSize:"24px",fontWeight:800,margin:"0 0 8px"}}>Payment successful!</h1>
          <p style={{color:"#94a3b8",fontSize:"14px",margin:0,lineHeight:1.6}}>One last step — enter the email address you use to log into BriefQuote so we can activate your Pro access.</p>
        </div>
        <div style={{marginBottom:"12px"}}>
          <label style={{display:"block",color:"#93c5fd",fontSize:"11px",...mo,letterSpacing:"0.12em",marginBottom:"8px"}}>YOUR BRIEFQUOTE EMAIL</label>
          <input type="email" value={email} onChange={e=>{ setEmail(e.target.value); setErrorMsg(""); }}
            placeholder="your@email.com"
            style={{width:"100%",background:"#1e3a5f",border:"1px solid rgba(96,165,250,0.25)",borderRadius:"8px",padding:"12px 14px",color:"#f1f5f9",fontSize:"15px",fontFamily:"'DM Sans', sans-serif"}}
          />
          {errorMsg && <div style={{color:"#f87171",fontSize:"12px",...mo,marginTop:"6px"}}>{errorMsg}</div>}
        </div>
        <button onClick={handleActivate} disabled={status==="loading"}
          style={{width:"100%",background:"#2563eb",border:"none",color:"#fff",padding:"13px",borderRadius:"8px",fontSize:"15px",fontWeight:700,cursor:"pointer",fontFamily:"'Outfit', sans-serif",opacity:status==="loading"?0.7:1}}>
          {status==="loading" ? "ACTIVATING..." : "ACTIVATE PRO ACCESS →"}
        </button>
        <p style={{color:"#4b5563",fontSize:"11px",...mo,textAlign:"center",marginTop:"16px",marginBottom:0}}>
          Wrong email? Contact hello@briefquote.co.uk
        </p>
      </div>
    </div>
  );
}

function AccountPanel({ onClose, userEmail, proUnlocked }) {
  const [portalLoading, setPortalLoading] = useState(false);
  const mo = { fontFamily: "'DM Mono', monospace" };

  const handlePortal = async () => {
    if (!userEmail) { alert('No email saved. Please set your email in Settings first.'); return; }
    setPortalLoading(true);
    await openCustomerPortal(userEmail);
    setPortalLoading(false);
  };

  return (
    <div style={{background:"rgba(5,13,26,0.97)",borderBottom:"1px solid rgba(37,99,235,0.12)",padding:"0 20px"}}>
      <div style={{maxWidth:"740px",margin:"0 auto",padding:"20px 0"}}>
        <div style={{color:"#60a5fa",fontSize:"11px",...mo,letterSpacing:"0.1em",marginBottom:"14px"}}>👤 ACCOUNT</div>
        <div style={{background:"#091424",border:"1px solid rgba(37,99,235,0.15)",borderRadius:"10px",padding:"20px",marginBottom:"12px"}}>
          <div style={{marginBottom:"16px"}}>
            <div style={{color:"#6b7280",fontSize:"11px",...mo,marginBottom:"4px"}}>EMAIL</div>
            <div style={{color:"#fff",fontSize:"14px",fontWeight:600}}>{userEmail || "— not set"}</div>
          </div>
          <div>
            <div style={{color:"#6b7280",fontSize:"11px",...mo,marginBottom:"4px"}}>PLAN</div>
            <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
              {proUnlocked ? (
                <span style={{background:"rgba(37,99,235,0.15)",border:"1px solid #2563eb",color:"#60a5fa",borderRadius:"4px",padding:"3px 10px",fontSize:"11px",...mo,fontWeight:700}}>✓ PRO ACTIVE</span>
              ) : (
                <span style={{background:"#091424",border:"1px solid rgba(37,99,235,0.2)",color:"#6b7280",borderRadius:"4px",padding:"3px 10px",fontSize:"11px",...mo,fontWeight:700}}>FREE</span>
              )}
            </div>
          </div>
        </div>
        {proUnlocked && (
          <button onClick={handlePortal} disabled={portalLoading}
            style={{background:"#112540",border:"1px solid rgba(37,99,235,0.3)",color:"#60a5fa",borderRadius:"8px",padding:"10px 16px",fontSize:"12px",cursor:"pointer",...mo,fontWeight:700,marginBottom:"8px",opacity:portalLoading?0.7:1}}>
            {portalLoading ? "LOADING..." : "⚙ MANAGE SUBSCRIPTION →"}
          </button>
        )}
        {!proUnlocked && (
          <button onClick={()=>startCheckout(userEmail)}
            style={{background:"#2563eb",border:"none",color:"#fff",borderRadius:"8px",padding:"10px 16px",fontSize:"12px",cursor:"pointer",...mo,fontWeight:700,marginBottom:"8px"}}>
            UPGRADE TO PRO — £14.99/MONTH →
          </button>
        )}
        <div style={{color:"#4b5563",fontSize:"11px",...mo,marginTop:"4px"}}>
          {proUnlocked ? "Manage or cancel your subscription via the Stripe portal." : "Upgrade to generate unlimited quotes."}
        </div>
      </div>
    </div>
  );
}

function FeedbackModal({ onClose }) {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle");
  const mo = { fontFamily: "'DM Mono', monospace" };

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setStatus("loading");
    try {
      await fetch("https://formspree.io/f/xzdwqdqq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, _subject: "BriefQuote App Feedback" }),
      });
      setStatus("success");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
      <div style={{background:"#091424",border:"1px solid rgba(37,99,235,0.2)",borderTop:"3px solid #2563eb",borderRadius:"12px",padding:"24px",maxWidth:"420px",width:"100%"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
          <h2 style={{margin:0,fontSize:"18px",fontWeight:800,color:"#fff",fontFamily:"'Outfit', sans-serif"}}>Send Feedback</h2>
          <button onClick={onClose} style={{background:"transparent",border:"1px solid rgba(37,99,235,0.2)",color:"#6b7280",padding:"4px 10px",borderRadius:"6px",...mo,fontSize:"11px",cursor:"pointer"}}>✕</button>
        </div>
        {status==="success" ? (
          <div style={{textAlign:"center",padding:"20px 0"}}>
            <div style={{fontSize:"32px",marginBottom:"8px"}}>🙏</div>
            <p style={{color:"#60a5fa",fontSize:"14px",...mo}}>Thanks for your feedback!</p>
            <button onClick={onClose} style={{background:"#2563eb",border:"none",color:"#fff",padding:"8px 16px",borderRadius:"6px",...mo,fontSize:"12px",cursor:"pointer",marginTop:"8px"}}>CLOSE</button>
          </div>
        ) : (
          <>
            <p style={{color:"#9ca3af",fontSize:"13px",marginBottom:"12px"}}>What could be better? Any bugs or ideas welcome.</p>
            <textarea value={message} onChange={e=>setMessage(e.target.value)} rows={5} placeholder="Your feedback..."
              style={{width:"100%",background:"#1e3a5f",border:"1px solid rgba(96,165,250,0.25)",borderRadius:"8px",padding:"10px 12px",color:"#f1f5f9",fontSize:"14px",fontFamily:"'DM Sans',sans-serif",resize:"vertical",marginBottom:"12px"}}/>
            <button onClick={handleSubmit} disabled={status==="loading"||!message.trim()}
              style={{width:"100%",background:"#2563eb",border:"none",color:"#fff",padding:"10px",borderRadius:"8px",fontSize:"14px",fontWeight:700,cursor:"pointer",fontFamily:"'Outfit',sans-serif",opacity:status==="loading"?0.7:1}}>
              {status==="loading" ? "SENDING..." : "SEND FEEDBACK →"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function PaywallModal({ onClose, onUnlock, userEmail }) {
  const [email, setEmail] = useState(userEmail||"");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const mo = {fontFamily:"'DM Mono', monospace"};

  const handleCheck = async () => {
    if (!email.trim() || !email.includes('@')) {
      setError("Please enter a valid email address.");
      return;
    }
    setChecking(true);
    setError("");
    const isPro = await checkProStatus(email);
    setChecking(false);
    if (isPro) {
      saveEmail(email);
      onUnlock();
    } else {
      setError("No active subscription found for this email. Please subscribe first or check your email is correct.");
    }
  };

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:"20px"}}>
      <div style={{background:"linear-gradient(135deg,#0d1e35,#091424)",border:"1px solid rgba(37,99,235,0.4)",borderRadius:"16px",padding:"32px",maxWidth:"420px",width:"100%",boxShadow:"0 0 60px rgba(37,99,235,0.2)",overflowY:"auto",maxHeight:"90vh"}}>
        <div style={{textAlign:"center",marginBottom:"24px"}}>
          <div style={{width:"48px",height:"48px",background:"linear-gradient(135deg,#2563eb,#60a5fa)",borderRadius:"12px",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",boxShadow:"0 0 20px rgba(37,99,235,0.4)"}}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M9 12H15M9 8H15M9 16H12M5 20H19C20.1 20 21 19.1 21 18V6C21 4.9 20.1 4 19 4H5C3.9 4 3 4.9 3 6V18C3 19.1 3.9 20 5 20Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div style={{display:"inline-flex",alignItems:"center",gap:"6px",background:"rgba(37,99,235,0.12)",border:"1px solid rgba(37,99,235,0.3)",borderRadius:"100px",padding:"4px 12px",fontSize:"11px",...mo,color:"#93c5fd",letterSpacing:"0.06em",marginBottom:"12px"}}>
            <span style={{width:"5px",height:"5px",background:"#60a5fa",borderRadius:"50%",display:"inline-block"}}></span>
            FREE QUOTES USED
          </div>
          <h2 style={{fontSize:"24px",fontWeight:800,color:"#fff",margin:"0 0 8px",fontFamily:"'Outfit', sans-serif",letterSpacing:"-0.02em"}}>Upgrade to Pro</h2>
          <p style={{color:"#94a3b8",fontSize:"14px",margin:0,lineHeight:1.6}}>You have used your 3 free quotes. Upgrade to generate unlimited quotes.</p>
        </div>

        <div style={{background:"rgba(37,99,235,0.08)",border:"1px solid rgba(37,99,235,0.2)",borderRadius:"12px",padding:"20px",marginBottom:"20px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
            <span style={{color:"#fff",fontWeight:700,fontSize:"16px",fontFamily:"'Outfit', sans-serif"}}>BriefQuote Pro</span>
            <span style={{color:"#60a5fa",fontWeight:800,fontSize:"22px",fontFamily:"'Outfit', sans-serif"}}>£14.99<span style={{fontSize:"13px",fontWeight:400,color:"#94a3b8"}}>/mo</span></span>
          </div>
          {[
            "Unlimited quote generation",
            "All trades & accurate UK rates",
            "PDF export & cover emails",
            "Quote history & status tracking",
            "VAT toggle & CIS support (coming soon)",
          ].map((f,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"10px"}}>
              <span style={{color:"#60a5fa",fontSize:"13px",fontWeight:700,flexShrink:0}}>✓</span>
              <span style={{color:"#cbd5e1",fontSize:"13px"}}>{f}</span>
            </div>
          ))}
        </div>

        {/* ── CHANGED: was <a href={STRIPE_URL}>, now calls startCheckout ── */}
        <button
          onClick={()=>startCheckout(email)}
          style={{display:"block",width:"100%",background:"#2563eb",border:"none",color:"#fff",padding:"14px",borderRadius:"10px",fontSize:"16px",fontWeight:700,letterSpacing:"0.04em",cursor:"pointer",textAlign:"center",boxShadow:"0 0 30px rgba(37,99,235,0.35)",fontFamily:"'Outfit', sans-serif",marginBottom:"16px"}}>
          UPGRADE NOW — £14.99/MONTH →
        </button>

        <div style={{borderTop:"1px solid rgba(37,99,235,0.15)",paddingTop:"16px"}}>
          <div style={{color:"#6b7280",fontSize:"11px",...mo,marginBottom:"8px",textAlign:"center"}}>ALREADY SUBSCRIBED? ENTER YOUR EMAIL TO UNLOCK</div>
          <div style={{display:"flex",gap:"8px"}}>
            <input value={email} onChange={e=>{setEmail(e.target.value);setError("");}}
              placeholder="your@email.com" type="email"
              style={{flex:1,background:"#112540",border:"1px solid rgba(96,165,250,0.2)",borderRadius:"8px",padding:"10px 12px",color:"#f1f5f9",fontSize:"13px",...mo}}
            />
            <button onClick={handleCheck} disabled={checking}
              style={{background:"#112540",border:"1px solid rgba(96,165,250,0.3)",color:"#60a5fa",borderRadius:"8px",padding:"10px 14px",fontSize:"12px",cursor:"pointer",...mo,fontWeight:700,whiteSpace:"nowrap"}}>
              {checking?"...":"UNLOCK"}
            </button>
          </div>
          {error&&<div style={{color:"#f87171",fontSize:"11px",...mo,marginTop:"6px"}}>{error}</div>}
        </div>

        <button onClick={onClose}
          style={{display:"block",width:"100%",background:"transparent",border:"none",color:"#4b5563",fontSize:"12px",cursor:"pointer",marginTop:"16px",...mo,textAlign:"center"}}>
          ← BACK
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const saved = loadSettings();
  const isFirstTime = !saved.companyName;
  const [step, setStep] = useState(isFirstTime ? "setup" : "form");
  const [companyName, setCompanyName] = useState(saved.companyName||"");
  const [defaultTerms, setDefaultTerms] = useState(saved.defaultTerms||DEFAULT_TERMS);
  const [labourRate, setLabourRate] = useState(saved.labourRate||"");
  const [vatRegistered, setVatRegistered] = useState(saved.vatRegistered !== false);
  const [cisRegistered, setCisRegistered] = useState(saved.cisRegistered===true);
  const [cisRate, setCisRate] = useState(saved.cisRate||20);
  const [tradeType, setTradeType] = useState(saved.tradeType||"");
  const [quoteCount, setQuoteCount] = useState(getQuoteCount());
  const [proUnlocked, setProUnlocked] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [userEmail, setUserEmail] = useState(getSavedEmail());
  const [checkingPro, setCheckingPro] = useState(false);
  const [jobDesc, setJobDesc] = useState("");
  const [clientInfo, setClientInfo] = useState({name:"",address:"",email:"",phone:""});
  const [quoteLabourRate, setQuoteLabourRate] = useState(saved.labourRate||"");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [materialsHints, setMaterialsHints] = useState("");
  const [showClient, setShowClient] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [quote, setQuote] = useState(null);
  const [currentHistoryId, setCurrentHistoryId] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(()=>{
    const s = document.createElement("style");
    s.textContent = css;
    document.head.appendChild(s);
  },[]);

  // ── NEW: Check for Stripe success redirect ──
  const urlParams = new URLSearchParams(window.location.search);
  const sessionId = urlParams.get('session_id');
  if (sessionId) {
    return <SuccessPage sessionId={sessionId} />;
  }

  useEffect(()=>{
    const savedEmail = getSavedEmail();
    if (savedEmail) {
      setCheckingPro(true);
      checkProStatus(savedEmail).then(isPro => {
        setProUnlocked(isPro);
        setCheckingPro(false);
      });
    }
  }, []);

  useEffect(()=>{
    saveSettings({companyName, defaultTerms, labourRate, vatRegistered, tradeType, cisRegistered, cisRate});
  },[companyName, defaultTerms, labourRate, vatRegistered, tradeType, cisRegistered, cisRate]);

  const generate = async () => {
    if (jobDesc.trim().length < 15) return;
    const savedEmail = getSavedEmail();
    if (!savedEmail) { alert("Please add your email in Settings before generating quotes."); return; }
    setStep("loading"); setErrorMsg("");

    // Check quote allowance in Upstash
    const trackRes = await fetch('/api/track-quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: savedEmail }),
    });
    const trackData = await trackRes.json();
    if (!trackData.allowed) {
      setShowPaywall(true);
      setStep("form");
      return;
    }
    const labourLine = quoteLabourRate
      ? `Labour rate: GBP${quoteLabourRate} per hour - use this exact rate for ALL labour line items.\n${estimatedHours ? `Total labour hours for this job: ${estimatedHours} hours - use this exact figure for the total labour quantity.\n` : ""}`
      : "";
    const materialsLine = materialsHints ? `Specific materials or parts with known prices (use these exact figures):\n${materialsHints}\n` : "";
    const tradeLine = tradeType ? `Trade: ${tradeType}\n` : "";
    const msg = `${companyName?`Company: ${companyName}\n\n`:""}${tradeLine}${labourLine}${materialsLine}Job Description: ${jobDesc}\n\nRespond with ONLY valid JSON.`;
    try {
      const res = await fetch('/api/generate', {
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-5",max_tokens:4000,system:SYSTEM_PROMPT,messages:[{role:"user",content:msg}]})
      });
      const data = await res.json();
      if (!res.ok) { setErrorMsg(`API Error ${res.status}: ${data?.error?.message||JSON.stringify(data)}`); setStep("error"); return; }
      const raw = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("").trim();
      const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
      if (s===-1||e===-1) { setErrorMsg(`No JSON found. Got: "${raw.slice(0,300)}"`); setStep("error"); return; }
      let jsonStr = raw.slice(s,e+1);
      try {
        jsonStr = jsonStr
          .replace(/\u2018|\u2019/g, "'")
          .replace(/\u201C|\u201D/g, '"')
          .replace(/\u00a3/g, '');
        jsonStr = jsonStr.replace(/,[ \t\r\n]*([}\]])/g, '$1');
        const parsed = JSON.parse(jsonStr);
        const histEntry = saveToHistory(parsed, clientInfo, companyName, jobDesc);
        setCurrentHistoryId(histEntry ? histEntry.id : null);
        setQuote(parsed);
        setStep("result");
        incrementQuoteCount();
        setQuoteCount(getQuoteCount());
      } catch(parseErr) {
        setErrorMsg("Parse error: " + parseErr.message + " | Snippet: " + jsonStr.slice(0,200));
        setStep("error");
      }
    } catch(err) {
      setErrorMsg(`Error: ${err.message}`); setStep("error");
    }
  };

  const reset = () => { setStep("form"); setQuote(null); setErrorMsg(""); setJobDesc(""); setMaterialsHints(""); setEstimatedHours(""); setQuoteLabourRate(labourRate||""); setClientInfo({name:"",address:"",email:"",phone:""}); };

  const inp = {width:"100%",background:"#1e3a5f",border:"1px solid rgba(96,165,250,0.25)",borderRadius:"8px",padding:"10px 14px",color:"#f1f5f9",fontSize:"14px",fontFamily:"'DM Sans', sans-serif",transition:"border-color 0.2s"};
  const lbl = {display:"block",color:"#93c5fd",fontSize:"11px",fontFamily:"'DM Mono', monospace",letterSpacing:"0.12em",marginBottom:"8px",fontWeight:600};
  const mo = {fontFamily:"'DM Mono', monospace"};

  return (
    <div style={{minHeight:"100vh",background:"#050d1a",color:"#e5e7eb",fontFamily:"'DM Sans', sans-serif"}}>
      {showPaywall&&<PaywallModal onClose={()=>setShowPaywall(false)} onUnlock={()=>{ setProUnlocked(true); setShowPaywall(false); }} userEmail={userEmail}/>}
      <div className="no-print" style={{borderBottom:"1px solid rgba(255,255,255,0.06)",background:"rgba(5,13,26,0.85)",backdropFilter:"blur(12px)",padding:"0 20px",position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:"740px",margin:"0 auto",padding:"14px 0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <div style={{width:"36px",height:"36px",background:"linear-gradient(135deg,#2563eb 0%,#60a5fa 100%)",borderRadius:"10px",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 0 18px rgba(37,99,235,0.45)",flexShrink:0}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M9 12H15M9 8H15M9 16H12M5 20H19C20.1 20 21 19.1 21 18V6C21 4.9 20.1 4 19 4H5C3.9 4 3 4.9 3 6V18C3 19.1 3.9 20 5 20Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </div>
            <div>
              <div style={{fontSize:"19px",fontWeight:800,color:"#fff",fontFamily:"'Outfit', sans-serif",letterSpacing:"-0.02em",lineHeight:1}}>Brief<span style={{color:"#60a5fa"}}>Quote</span></div>
              <div style={{color:"#4b5563",fontSize:"10px",fontFamily:"'DM Mono', monospace",letterSpacing:"0.1em"}}>AI QUOTE GENERATOR FOR TRADESMEN</div>
            </div>
          </div>
          <div style={{display:"flex",gap:"6px",alignItems:"center",flexWrap:"wrap",justifyContent:"flex-end"}}>
            <button onClick={()=>{ setShowAccount(v=>!v); setShowHistory(false); setShowSettings(false); }}
              style={{background:showAccount?"#112540":"transparent",border:"1px solid rgba(37,99,235,0.2)",color:showAccount?"#3b82f6":"#6b7280",padding:"5px 10px",borderRadius:"6px",...mo,fontSize:"11px",cursor:"pointer",whiteSpace:"nowrap"}}>
              👤 ACCOUNT
            </button>
            <button onClick={()=>{ setShowHistory(v=>!v); setShowAccount(false); setShowSettings(false); }}
              style={{background:showHistory?"#112540":"transparent",border:"1px solid rgba(37,99,235,0.2)",color:showHistory?"#3b82f6":"#6b7280",padding:"5px 10px",borderRadius:"6px",...mo,fontSize:"11px",cursor:"pointer",whiteSpace:"nowrap"}}>
              📋 HISTORY
            </button>
            <button onClick={()=>{ setShowSettings(v=>!v); setShowAccount(false); setShowHistory(false); }}
              style={{background:showSettings?"#112540":"transparent",border:"1px solid rgba(37,99,235,0.2)",color:showSettings?"#3b82f6":"#6b7280",padding:"5px 10px",borderRadius:"6px",...mo,fontSize:"11px",cursor:"pointer",whiteSpace:"nowrap"}}>
              ⚙ {showSettings?"HIDE":"SETTINGS"}
            </button>
            {step==="result"&&<button onClick={reset} style={{background:"transparent",border:"1px solid rgba(37,99,235,0.2)",color:"#6b7280",padding:"5px 10px",borderRadius:"6px",...mo,fontSize:"11px",cursor:"pointer",whiteSpace:"nowrap"}}>← NEW QUOTE</button>}
          </div>
        </div>
      </div>

      {showAccount&&(
        <AccountPanel
          onClose={()=>setShowAccount(false)}
          userEmail={userEmail}
          proUnlocked={proUnlocked}
        />
      )}

      {showSettings&&(
        <div className="no-print" style={{background:"rgba(5,13,26,0.97)",borderBottom:"1px solid rgba(37,99,235,0.12)",padding:"0 20px"}}>
          <div style={{maxWidth:"740px",margin:"0 auto",padding:"20px 0"}}>
            <div style={{color:"#60a5fa",fontSize:"11px",...mo,letterSpacing:"0.1em",marginBottom:"14px"}}>⚙ DEFAULT SETTINGS — saved automatically</div>
            <div style={{marginBottom:"14px"}}>
              <label style={lbl}>YOUR COMPANY NAME</label>
              <input value={companyName} onChange={e=>setCompanyName(e.target.value)} placeholder="e.g. ABC Construction Ltd" style={inp}/>
            </div>
            <div style={{marginBottom:"14px"}}>
              <label style={lbl}>YOUR EMAIL</label>
              <div style={{display:"flex",gap:"8px"}}>
                <input type="email" value={userEmail} onChange={e=>setUserEmail(e.target.value)} placeholder="your@email.com" style={{...inp,width:"280px"}}/>
                <button onClick={async()=>{ if(!userEmail.includes('@')) return; saveEmail(userEmail); setCheckingPro(true); const isPro = await checkProStatus(userEmail); setProUnlocked(isPro); setCheckingPro(false); alert(isPro?'Pro access confirmed!':'No active subscription found for this email.'); }}
                  style={{background:"#112540",border:"1px solid rgba(96,165,250,0.3)",color:"#60a5fa",borderRadius:"8px",padding:"8px 12px",fontSize:"11px",cursor:"pointer",fontFamily:"'DM Mono', monospace",whiteSpace:"nowrap"}}>
                  {checkingPro?"...":"CHECK"}
                </button>
              </div>
              <div style={{color:"#94a3b8",fontSize:"11px",fontFamily:"'DM Mono', monospace",marginTop:"6px"}}>Used to restore Pro access. {proUnlocked&&<span style={{color:"#60a5fa"}}>✓ Pro active</span>}</div>
            </div>
            <div style={{marginBottom:"14px"}}>
              <label style={lbl}>YOUR TRADE</label>
              <select value={tradeType} onChange={e=>{ setTradeType(e.target.value); saveSettings({companyName,defaultTerms,labourRate,vatRegistered,tradeType:e.target.value}); }}
                style={{...inp, cursor:"pointer", appearance:"none", WebkitAppearance:"none", backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2360a5fa' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat:"no-repeat", backgroundPosition:"right 14px center", paddingRight:"36px", width:"280px"}}>
                <option value="" style={{background:"#0d1e35"}}>Select your trade...</option>
                {TRADES.map(t=><option key={t} value={t} style={{background:"#0d1e35",color:"#f1f5f9"}}>{t}</option>)}
              </select>
            </div>
            <div style={{marginBottom:"14px"}}>
              <label style={lbl}>VAT REGISTERED</label>
              <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
                <button onClick={()=>setVatRegistered(v=>!v)}
                  style={{width:"48px",height:"26px",borderRadius:"13px",border:"none",cursor:"pointer",background:vatRegistered?"#3b82f6":"#2a2a2a",position:"relative",transition:"background 0.2s",flexShrink:0}}>
                  <div style={{width:"20px",height:"20px",borderRadius:"50%",background:"#fff",position:"absolute",top:"3px",left:vatRegistered?"25px":"3px",transition:"left 0.2s"}}/>
                </button>
                <span style={{color:vatRegistered?"#3b82f6":"#6b7280",fontSize:"13px",fontFamily:"monospace",fontWeight:600}}>
                  {vatRegistered?"VAT REGISTERED — 20% added to quotes":"NOT VAT REGISTERED — no VAT on quotes"}
                </span>
              </div>
            </div>
            <div style={{marginBottom:"14px"}}>
              <label style={lbl}>CIS REGISTERED (CONSTRUCTION INDUSTRY SCHEME)</label>
              <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"8px"}}>
                <button onClick={()=>{ const v = !cisRegistered; setCisRegistered(v); saveSettings({companyName,defaultTerms,labourRate,vatRegistered,tradeType,cisRegistered:v,cisRate}); }}
                  style={{width:"48px",height:"26px",borderRadius:"13px",border:"none",cursor:"pointer",background:cisRegistered?"#2563eb":"#1a2a3a",position:"relative",transition:"background 0.2s",flexShrink:0}}>
                  <div style={{width:"20px",height:"20px",borderRadius:"50%",background:"#fff",position:"absolute",top:"3px",left:cisRegistered?"25px":"3px",transition:"left 0.2s"}}/>
                </button>
                <span style={{color:cisRegistered?"#60a5fa":"#6b7280",fontSize:"13px",fontFamily:"'DM Mono',monospace",fontWeight:600}}>
                  {cisRegistered?"CIS ENABLED — deduction applied to labour":"CIS DISABLED"}
                </span>
              </div>
              {cisRegistered&&(
                <div style={{display:"flex",alignItems:"center",gap:"12px",marginTop:"8px"}}>
                  <label style={{...lbl,margin:0}}>DEDUCTION RATE</label>
                  {[20,30].map(r=>(
                    <button key={r} onClick={()=>{ setCisRate(r); saveSettings({companyName,defaultTerms,labourRate,vatRegistered,tradeType,cisRegistered,cisRate:r}); }}
                      style={{background:cisRate===r?"rgba(37,99,235,0.2)":"transparent",border:`1px solid ${cisRate===r?"#2563eb":"rgba(37,99,235,0.2)"}`,color:cisRate===r?"#60a5fa":"#6b7280",borderRadius:"6px",padding:"4px 12px",fontSize:"12px",cursor:"pointer",fontFamily:"'DM Mono',monospace",fontWeight:cisRate===r?700:400}}>
                      {r}%
                    </button>
                  ))}
                  <span style={{color:"#6b7280",fontSize:"11px",fontFamily:"'DM Mono',monospace"}}>applied to labour only</span>
                </div>
              )}
              <div style={{color:"#94a3b8",fontSize:"11px",fontFamily:"'DM Mono',monospace",marginTop:"8px"}}>For subcontractors working under CIS — deduction shown on quote for client reference.</div>
            </div>
            <div style={{marginBottom:"14px"}}>
              <label style={lbl}>YOUR LABOUR RATE (£ PER HOUR)</label>
              <input type="number" value={labourRate} onChange={e=>setLabourRate(e.target.value)} placeholder="e.g. 45" style={{...inp, width:"180px"}}/>
              <div style={{color:"#6b7280",fontSize:"11px",...mo,marginTop:"4px"}}>Used to calculate labour costs accurately on every quote.</div>
            </div>
            <div>
              <label style={lbl}>DEFAULT TERMS & NOTES</label>
              <textarea value={defaultTerms} onChange={e=>setDefaultTerms(e.target.value)} rows={4}
                style={{...inp,lineHeight:1.6,resize:"vertical",fontSize:"13px",background:"#1e3a5f",color:"#f1f5f9"}}/>
              <div style={{color:"#6b7280",fontSize:"11px",...mo,marginTop:"4px"}}>These will appear on every new quote. You can still edit per-quote.</div>
            </div>
          </div>
        </div>
      )}

      <div style={{maxWidth:"740px",margin:"0 auto",padding:"24px 20px"}}>
        {step==="setup"&&(
          <div style={{animation:"fadeUp 0.4s ease forwards"}}>
            <div style={{textAlign:"center",marginBottom:"32px"}}>
              <div style={{width:"56px",height:"56px",background:"linear-gradient(135deg,#2563eb,#60a5fa)",borderRadius:"14px",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",boxShadow:"0 0 24px rgba(37,99,235,0.4)"}}><svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M9 12H15M9 8H15M9 16H12M5 20H19C20.1 20 21 19.1 21 18V6C21 4.9 20.1 4 19 4H5C3.9 4 3 4.9 3 6V18C3 19.1 3.9 20 5 20Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
              <h1 style={{fontSize:"32px",fontWeight:800,color:"#fff",margin:"0 0 8px 0",lineHeight:1.1,fontFamily:"'Outfit', sans-serif",letterSpacing:"-0.02em"}}>Welcome to BriefQuote</h1>
              <p style={{color:"#6b7280",fontSize:"15px",margin:0}}>Quick setup — takes 30 seconds. You can change these anytime.</p>
            </div>
            <div style={{background:"#091424",border:"1px solid rgba(37,99,235,0.15)",borderRadius:"10px",padding:"24px",marginBottom:"12px"}}>
              <label style={lbl}>YOUR COMPANY NAME *</label>
              <input value={companyName} onChange={e=>setCompanyName(e.target.value)} placeholder="e.g. ABC Construction Ltd" style={{...inp, fontSize:"15px"}} autoFocus/>
              <div style={{color:"#94a3b8",fontSize:"11px",fontFamily:"monospace",marginTop:"8px"}}>This will appear on all your quotes. You can change it anytime in Settings.</div>
            </div>
            <div style={{background:"rgba(11,25,46,0.95)",border:"1px solid rgba(96,165,250,0.18)",borderRadius:"12px",padding:"22px",marginBottom:"14px"}}>
              <label style={lbl}>YOUR EMAIL *</label>
              <input type="email" value={userEmail} onChange={e=>setUserEmail(e.target.value)} placeholder="your@email.com" style={inp}/>
              <div style={{color:"#94a3b8",fontSize:"11px",fontFamily:"'DM Mono', monospace",marginTop:"8px"}}>Used to restore your Pro access on any device.</div>
            </div>
            <div style={{background:"rgba(11,25,46,0.95)",border:"1px solid rgba(96,165,250,0.18)",borderRadius:"12px",padding:"22px",marginBottom:"14px"}}>
              <label style={lbl}>YOUR TRADE *</label>
              <select value={tradeType} onChange={e=>setTradeType(e.target.value)}
                style={{...inp, cursor:"pointer", appearance:"none", WebkitAppearance:"none", backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2360a5fa' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat:"no-repeat", backgroundPosition:"right 14px center", paddingRight:"36px"}}>
                <option value="" disabled style={{background:"#0d1e35"}}>Select your trade...</option>
                {TRADES.map(t=><option key={t} value={t} style={{background:"#0d1e35",color:"#f1f5f9"}}>{t}</option>)}
              </select>
              <div style={{color:"#94a3b8",fontSize:"11px",fontFamily:"'DM Mono', monospace",marginTop:"8px"}}>Used to generate accurate labour rates for your trade.</div>
            </div>
            <div style={{background:"rgba(11,25,46,0.95)",border:"1px solid rgba(96,165,250,0.18)",borderRadius:"12px",padding:"22px",marginBottom:"14px"}}>
              <div style={{color:"#3b82f6",fontSize:"11px",fontFamily:"monospace",letterSpacing:"0.1em",marginBottom:"14px"}}>✦ HOW BRIEFQUOTE WORKS</div>
              <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
                {[
                  ["⚡","Describe any job and get a professional itemised quote in seconds"],
                  ["✏️","Click any number, text or unit on the quote to edit it directly"],
                  ["➕","Add or remove line items and sections to customise each quote"],
                  ["📋","Every quote is saved to History automatically — track status as Draft, Sent, Accepted or Declined"],
                  ["✉️","Generate a professional cover email to send alongside your quote"],
                  ["🖨️","Print or save any quote as a PDF to send to your client"],
                  ["💷","Set your VAT status in Settings — toggle between registered and not registered. VAT rate can be adjusted per quote (20%, 5% or 0%)"],
                ].map(([icon,text],i)=>(
                  <div key={i} style={{display:"flex",gap:"12px",alignItems:"flex-start"}}>
                    <span style={{fontSize:"16px",flexShrink:0}}>{icon}</span>
                    <span style={{color:"#9ca3af",fontSize:"13px",lineHeight:1.5}}>{text}</span>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={()=>{ if(!companyName.trim()){ alert("Please enter your company name."); return; } if(!userEmail.trim() || !userEmail.includes('@')){ alert("Please enter your email address."); return; } if(!tradeType){ alert("Please select your trade."); return; } saveEmail(userEmail); saveSettings({companyName,defaultTerms,tradeType}); setStep("form"); }}
              style={{width:"100%",background:"#3b82f6",border:"none",color:"#000",padding:"14px 24px",borderRadius:"8px",fontSize:"18px",fontWeight:800,letterSpacing:"0.04em",cursor:"pointer",marginBottom:"12px"}}>
              START GENERATING QUOTES →
            </button>
            <p style={{color:"#94a3b8",fontSize:"12px",textAlign:"center",margin:0,fontFamily:"monospace"}}>Your details are saved locally on this device only.</p>
          </div>
        )}

        {showHistory&&(
          <HistoryPanel
            onClose={()=>setShowHistory(false)}
            onLoad={(entry)=>{
              setQuote(entry.quote);
              setClientInfo(entry.clientInfo||{name:"",address:"",email:"",phone:""});
              setCompanyName(entry.companyName||companyName);
              setJobDesc(entry.jobDesc||"");
              setCurrentHistoryId(entry.id);
              setShowHistory(false);
              setStep("result");
            }}
            onDuplicate={(entry)=>{
              setQuote(entry.quote);
              setClientInfo(entry.clientInfo||{name:"",address:"",email:"",phone:""});
              setCompanyName(entry.companyName||companyName);
              setJobDesc(entry.jobDesc||"");
              setCurrentHistoryId(entry.id);
              setShowHistory(false);
              setStep("result");
            }}
          />
        )}

        {!showHistory && step==="form"&&(
          <div>
            <h1 style={{fontSize:"clamp(28px,5vw,40px)",fontWeight:800,color:"#fff",margin:"0 0 8px 0",lineHeight:1.08,fontFamily:"'Outfit', sans-serif",letterSpacing:"-0.03em"}}>
              Professional quotes.<br/><span style={{background:"linear-gradient(135deg,#3b82f6 0%,#60a5fa 100%)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",backgroundClip:"text"}}>In 30 seconds.</span>
            </h1>
            <p style={{color:"#cbd5e1",fontSize:"15px",margin:"0 0 16px 0",lineHeight:1.6}}>Describe the job, get a fully itemised quote with labour, materials and VAT.</p>
            {tradeType&&(
              <div style={{display:"inline-flex",alignItems:"center",gap:"8px",background:"rgba(37,99,235,0.12)",border:"1px solid rgba(37,99,235,0.3)",borderRadius:"100px",padding:"5px 14px",fontSize:"12px",fontFamily:"'DM Mono', monospace",color:"#93c5fd",letterSpacing:"0.06em",marginBottom:"20px"}}>
                <span style={{width:"6px",height:"6px",background:"#60a5fa",borderRadius:"50%",display:"inline-block"}}></span>
                {tradeType.toUpperCase()}
              </div>
            )}
            <div style={{background:"rgba(11,25,46,0.95)",border:"1px solid rgba(96,165,250,0.18)",borderRadius:"12px",padding:"22px",marginBottom:"14px"}}>
              <label style={lbl}>DESCRIBE THE JOB *</label>
              <textarea value={jobDesc} onChange={e=>setJobDesc(e.target.value)}
                placeholder="e.g. Single storey rear extension, approx 4m x 5m. Brick and block construction with flat roof, bi-fold doors, underfloor heating, plastered and painted. Manchester."
                rows={4} style={{...inp,lineHeight:1.6,resize:"vertical",background:"#1e3a5f",color:"#f1f5f9"}}/>
              <div style={{color:"#60a5fa",fontSize:"11px",...mo,marginTop:"6px",textAlign:"right",letterSpacing:"0.08em"}}>✦ MORE DETAIL = BETTER QUOTE</div>
            </div>
            <div style={{background:"rgba(11,25,46,0.95)",border:"1px solid rgba(96,165,250,0.18)",borderRadius:"12px",padding:"22px",marginBottom:"14px"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px",marginBottom:"16px"}}>
                <div>
                  <label style={lbl}>YOUR LABOUR RATE (£/HR)</label>
                  <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                    <span style={{color:"#3b82f6",fontFamily:"monospace",fontSize:"16px",fontWeight:700}}>£</span>
                    <input type="number" value={quoteLabourRate}
                      onChange={e=>{ setQuoteLabourRate(e.target.value); if(e.target.value) { setLabourRate(e.target.value); saveSettings({companyName,defaultTerms,labourRate:e.target.value,tradeType}); } }}
                      placeholder="e.g. 45" style={{...inp, width:"100px", fontFamily:"monospace", fontSize:"15px", fontWeight:600}}/>
                    <span style={{color:"#4b5563",fontSize:"11px",fontFamily:"monospace"}}>/hr</span>
                  </div>
                  {labourRate && quoteLabourRate===labourRate && (
                    <div style={{color:"#4b5563",fontSize:"10px",fontFamily:"monospace",marginTop:"4px"}}>✓ FROM SETTINGS</div>
                  )}
                  {quoteLabourRate && quoteLabourRate!==labourRate && (
                    <div style={{color:"#3b82f6",fontSize:"10px",fontFamily:"monospace",marginTop:"4px"}}>OVERRIDE FOR THIS QUOTE</div>
                  )}
                </div>
                <div>
                  <label style={lbl}>EST. HOURS (OPTIONAL)</label>
                  <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                    <input type="number" value={estimatedHours}
                      onChange={e=>{ const v = e.target.value; if (v === "" || Number(v) >= 0) setEstimatedHours(v); }}
                      min="0" placeholder="e.g. 3" style={{...inp, width:"90px", fontFamily:"monospace", fontSize:"15px", fontWeight:600}}/>
                    <span style={{color:"#4b5563",fontSize:"11px",fontFamily:"monospace"}}>/hrs</span>
                  </div>
                  <div style={{color:"#94a3b8",fontSize:"10px",fontFamily:"'DM Mono', monospace",marginTop:"4px"}}>Leave blank to let AI estimate</div>
                </div>
              </div>
              <label style={lbl}>SPECIFIC MATERIALS OR PARTS (OPTIONAL)</label>
              <textarea value={materialsHints} onChange={e=>setMaterialsHints(e.target.value)}
                placeholder={"e.g. Grohe kitchen tap £85, 20m2 porcelain tile £18/m2, underfloor heating kit £320"}
                rows={3} style={{...inp, lineHeight:1.6, resize:"vertical", fontSize:"13px", background:"#1e3a5f", color:"#f1f5f9"}}/>
              <div style={{color:"#94a3b8",fontSize:"11px",fontFamily:"'DM Mono', monospace",marginTop:"6px"}}>
                Enter any materials or parts with known prices — the quote will use these exact figures.
              </div>
            </div>
            <div style={{background:"rgba(11,25,46,0.95)",border:"1px solid rgba(96,165,250,0.18)",borderRadius:"12px",marginBottom:"14px",overflow:"hidden"}}>
              <button onClick={()=>setShowClient(v=>!v)} style={{width:"100%",background:"none",border:"none",padding:"13px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",color:"#9ca3af"}}>
                <span style={{fontSize:"11px",...mo,letterSpacing:"0.12em",color:"#93c5fd",fontWeight:600}}>CLIENT DETAILS (OPTIONAL)</span>
                <span style={{color:"#60a5fa",fontSize:"13px"}}>{showClient?"▲":"▼"}</span>
              </button>
              {showClient&&(
                <div style={{padding:"0 20px 20px",borderTop:"1px solid rgba(37,99,235,0.1)"}}>
                  <div style={{height:"14px"}}/>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px",marginBottom:"12px"}}>
                    <div><label style={lbl}>CLIENT NAME</label><input value={clientInfo.name} onChange={e=>setClientInfo(p=>({...p,name:e.target.value}))} placeholder="John Smith" style={inp}/></div>
                    <div><label style={lbl}>PHONE</label><input value={clientInfo.phone} onChange={e=>setClientInfo(p=>({...p,phone:e.target.value}))} placeholder="07700 900000" style={inp}/></div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"12px"}}>
                    <div><label style={lbl}>EMAIL</label><input value={clientInfo.email} onChange={e=>setClientInfo(p=>({...p,email:e.target.value}))} placeholder="client@email.com" style={inp}/></div>
                    <div><label style={lbl}>JOB ADDRESS</label><input value={clientInfo.address} onChange={e=>setClientInfo(p=>({...p,address:e.target.value}))} placeholder="123 High St, Manchester" style={inp}/></div>
                  </div>
                </div>
              )}
            </div>
            <div style={{display:"flex",gap:"8px",flexWrap:"wrap",marginBottom:"12px"}}>
              {["Kitchen renovation, mid-terrace, new units, worktops, tiling and plumbing","New bathroom installation, full strip out and refit, ground floor","Loft conversion, 3-bed semi, dormer window, en-suite bathroom"].map((ex,i)=>(
                <button key={i} onClick={()=>setJobDesc(ex)} style={{background:"#112540",border:"1px solid rgba(96,165,250,0.2)",color:"#94a3b8",fontSize:"12px",padding:"6px 14px",borderRadius:"20px",cursor:"pointer",transition:"all 0.2s"}}>{ex}</button>
              ))}
            </div>
            {!proUnlocked&&(
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px"}}>
                <span style={{color:"#6b7280",fontSize:"11px",fontFamily:"'DM Mono', monospace"}}>FREE QUOTES USED</span>
                <div style={{display:"flex",gap:"4px"}}>
                  {[0,1,2].map(i=>(
                    <div key={i} style={{width:"24px",height:"6px",borderRadius:"3px",background:i<quoteCount?"#2563eb":"#1e3a5f",transition:"background 0.3s"}}/>
                  ))}
                  <span style={{color:quoteCount>=FREE_LIMIT?"#f87171":"#60a5fa",fontSize:"11px",fontFamily:"'DM Mono', monospace",marginLeft:"6px"}}>{quoteCount}/{FREE_LIMIT}</span>
                </div>
              </div>
            )}
            <button onClick={generate} disabled={jobDesc.trim().length<15} className={jobDesc.trim().length>=15?"btn-glow":""}
              style={{width:"100%",background:jobDesc.trim().length>=15?"#2563eb":"#112540",border:"none",color:jobDesc.trim().length>=15?"#fff":"#4b5563",padding:"14px 24px",borderRadius:"10px",fontSize:"16px",fontWeight:700,letterSpacing:"0.06em",cursor:jobDesc.trim().length>=15?"pointer":"not-allowed",transition:"all 0.2s",fontFamily:"'Outfit', sans-serif",boxShadow:jobDesc.trim().length>=15?"0 0 30px rgba(37,99,235,0.3)":"none"}}>
              {!proUnlocked && quoteCount>=FREE_LIMIT ? "UNLOCK UNLIMITED QUOTES →" : "GENERATE QUOTE →"}
            </button>
          </div>
        )}

        {!showHistory && step==="loading"&&<Spinner/>}

        {!showHistory && step==="result"&&quote&&(
          <QuoteResult
            quote={quote}
            clientInfo={clientInfo}
            companyName={companyName}
            defaultTerms={defaultTerms}
            vatRegistered={vatRegistered}
            historyId={currentHistoryId}
            jobDesc={jobDesc}
            onQuoteChange={(updatedQuote)=>setQuote(updatedQuote)}
            onSaveTerms={(terms)=>{ setDefaultTerms(terms); saveSettings({companyName, defaultTerms:terms, labourRate, vatRegistered, tradeType}); }}
            onReset={reset}
          />
        )}

        {!showHistory && step==="error"&&(
          <div>
            <div style={{background:"#1f0a0a",border:"1px solid #7f1d1d",borderRadius:"8px",padding:"16px 20px",marginBottom:"16px"}}>
              <div style={{color:"#f87171",fontSize:"13px",...mo,marginBottom:"8px"}}>ERROR DETAILS</div>
              <p style={{color:"#fca5a5",fontSize:"14px",margin:0,lineHeight:1.6,wordBreak:"break-all"}}>{errorMsg}</p>
            </div>
            <button onClick={()=>setStep("form")} style={{background:"#3b82f6",border:"none",color:"#000",padding:"11px 20px",borderRadius:"6px",...mo,fontSize:"12px",fontWeight:700,cursor:"pointer"}}>← TRY AGAIN</button>
          </div>
        )}
      </div>

      <div className="no-print" style={{borderTop:"1px solid rgba(37,99,235,0.1)",padding:"12px 20px",marginTop:"24px"}}>
        <div style={{maxWidth:"740px",margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"8px"}}>
          <span style={{color:"#6b7280",fontSize:"11px",...mo}}>BRIEFQUOTE © 2026</span>
          <button onClick={()=>setShowFeedback(true)}
            style={{background:"transparent",border:"1px solid rgba(37,99,235,0.2)",color:"#6b7280",padding:"4px 12px",borderRadius:"6px",fontFamily:"'DM Mono',monospace",fontSize:"11px",cursor:"pointer"}}>
            ✦ FEEDBACK
          </button>
          <span style={{color:"#6b7280",fontSize:"11px",...mo}}>ALWAYS VERIFY RATES WITH YOUR SUPPLIER</span>
        </div>
      </div>
      {showFeedback && <FeedbackModal onClose={()=>setShowFeedback(false)}/>}
    </div>
  );
}
