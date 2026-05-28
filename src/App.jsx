import { useState, useEffect, useRef } from "react";

const SYSTEM_PROMPT = `You are an expert quantity surveyor and builder's estimator with 20 years of UK construction experience.

When given a job description, generate a conservative, realistic builder's quote in JSON format.

IMPORTANT PRICING RULES:
- Use CONSERVATIVE, MID-RANGE UK rates, not premium London rates
- Labour: general builder 25-35 per hour, specialist trades (plumber/electrician) 35-45 per hour
- Always price on the lower-to-mid end so builders can adjust upward if needed
- For small jobs (under 500), keep line items minimal and realistic
- Do not add unnecessary line items to inflate the quote
- Materials should reflect trade prices, not retail prices

Return ONLY valid JSON with this exact structure, no other text before or after:
{
  "jobTitle": "Brief job title",
  "jobRef": "QB-4829",
  "summary": "2-3 sentence professional summary of the works",
  "lineItems": [
    { "category": "Labour", "description": "Detailed description", "unit": "hrs", "qty": 4, "rate": 35.00, "total": 140.00 }
  ],
  "subtotal": 140.00,
  "vatRate": 20,
  "vatAmount": 28.00,
  "grandTotal": 168.00,
  "notes": "Quote valid for 30 days. Rates are indicative - adjust to your local market. 50% deposit on acceptance. Balance due within 14 days of completion.",
  "duration": "1 day"
}

CRITICAL JSON RULES:
- Return ONLY the raw JSON object, nothing else before or after
- No markdown, no code blocks, no backticks
- No pound signs anywhere inside the JSON
- No apostrophes or single quotes inside any text values
- No trailing commas after the last item in any array or object
- All numeric fields must be plain numbers only
- Keep description text simple, avoid special characters`;

const DEFAULT_TERMS = "Quote valid for 30 days. Rates are indicative - adjust to your local market and supplier pricing. 50% deposit required on acceptance of quote. Balance due within 14 days of completion. All works carry a 12-month workmanship guarantee.";

const css = `
  @keyframes spin { to { transform:rotate(360deg); } }
  @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
  * { box-sizing:border-box; }
  input, textarea { outline:none !important; }
  .no-print {}
  @media print { .no-print { display:none !important; } body { margin:0; } }
`;

const STORAGE_KEY = "quotebuild_settings";
const HISTORY_KEY = "quotebuild_history";

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
        jobRef: "QB-" + Math.floor(1000 + Math.random() * 9000),
      }
    };
    const updated = [copy, ...history].slice(0, 50);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
    return copy;
  } catch {}
}

const STATUS_CONFIG = {
  draft:    { label:"DRAFT",    bg:"#1a1a1a", border:"#3a3a3a", color:"#6b7280" },
  sent:     { label:"SENT",     bg:"#0c1a2e", border:"#1e3a5f", color:"#60a5fa" },
  accepted: { label:"ACCEPTED", bg:"#0a1f0a", border:"#166534", color:"#4ade80" },
  declined: { label:"DECLINED", bg:"#1f0a0a", border:"#7f1d1d", color:"#f87171" },
};

function StatusBadge({ status, onChange }) {
  const [open, setOpen] = useState(false);
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  const mo = {fontFamily:"monospace"};

  return (
    <div style={{position:"relative"}}>
      <button
        onClick={e=>{ e.stopPropagation(); setOpen(v=>!v); }}
        style={{background:cfg.bg, border:`1px solid ${cfg.border}`, color:cfg.color, borderRadius:"4px", padding:"3px 8px", fontSize:"10px", cursor:"pointer", ...mo, fontWeight:700, letterSpacing:"0.06em"}}>
        {cfg.label} ▾
      </button>
      {open&&(
        <div style={{position:"absolute",top:"100%",right:0,marginTop:"4px",background:"#111",border:"1px solid #2a2a2a",borderRadius:"6px",overflow:"hidden",zIndex:100,minWidth:"120px"}}>
          {Object.entries(STATUS_CONFIG).map(([key, c])=>(
            <button key={key} onClick={e=>{ e.stopPropagation(); onChange(key); setOpen(false); }}
              style={{display:"block",width:"100%",background:status===key?"#1a1a1a":"transparent",border:"none",borderBottom:"1px solid #1a1a1a",color:c.color,padding:"8px 12px",fontSize:"11px",cursor:"pointer",...mo,fontWeight:700,textAlign:"left",letterSpacing:"0.06em"}}>
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


  const mo = {fontFamily:"monospace"};
  const am = {color:"#f59e0b"};


  if (history.length === 0) return (
    <div style={{animation:"fadeUp 0.3s ease forwards"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"20px"}}>
        <h2 style={{margin:0,fontSize:"22px",fontWeight:700,color:"#fff"}}>Quote History</h2>
        <button onClick={onClose} style={{background:"transparent",border:"1px solid #2a2a2a",color:"#6b7280",padding:"6px 12px",borderRadius:"6px",...mo,fontSize:"11px",cursor:"pointer"}}>← BACK</button>
      </div>
      <div style={{background:"#0f0f0f",border:"1px solid #1f1f1f",borderRadius:"10px",padding:"40px",textAlign:"center"}}>
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
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"16px"}}>
        <div>
          <h2 style={{margin:"0 0 2px 0",fontSize:"22px",fontWeight:700,color:"#fff"}}>Quote History</h2>
          <p style={{margin:0,color:"#6b7280",fontSize:"13px",...mo}}>{history.length} QUOTE{history.length!==1?"S":""} SAVED</p>
        </div>
        <button onClick={onClose} style={{background:"transparent",border:"1px solid #2a2a2a",color:"#6b7280",padding:"6px 12px",borderRadius:"6px",...mo,fontSize:"11px",cursor:"pointer"}}>← BACK</button>
      </div>

      {/* Filter tabs */}
      <div style={{display:"flex",gap:"6px",flexWrap:"wrap",marginBottom:"16px"}}>
        {[["all","ALL"],["draft","DRAFT"],["sent","SENT"],["accepted","ACCEPTED"],["declined","DECLINED"]].map(([key,label])=>{
          const cfg = STATUS_CONFIG[key];
          const active = filterStatus===key;
          return (
            <button key={key} onClick={()=>setFilterStatus(key)}
              style={{background:active?(cfg?cfg.bg:"#1a1a1a"):"transparent", border:`1px solid ${active?(cfg?cfg.border:"#f59e0b"):"#2a2a2a"}`, color:active?(cfg?cfg.color:"#f59e0b"):"#6b7280", borderRadius:"20px", padding:"4px 12px", fontSize:"11px", cursor:"pointer", ...mo, fontWeight:active?700:400}}>
              {label} {counts[key]>0?`(${counts[key]})`:""}
            </button>
          );
        })}
      </div>

      {/* Quote cards */}
      <div style={{display:"flex",flexDirection:"column",gap:"10px"}}>
        {filtered.length===0&&(
          <div style={{background:"#0f0f0f",border:"1px solid #1f1f1f",borderRadius:"10px",padding:"32px",textAlign:"center"}}>
            <p style={{color:"#6b7280",margin:0,fontSize:"14px"}}>No {filterStatus} quotes yet.</p>
          </div>
        )}
        {filtered.map((entry) => {
          const cfg = STATUS_CONFIG[entry.status||"draft"];
          return (
            <div key={entry.id} style={{background:"#0f0f0f",border:"1px solid #1f1f1f",borderRadius:"10px",padding:"16px 18px",transition:"border-color 0.15s"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor="#2a2a2a"}
              onMouseLeave={e=>e.currentTarget.style.borderColor="#1f1f1f"}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"12px"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"6px",flexWrap:"wrap"}}>
                    <span style={{...am,...mo,fontSize:"11px"}}>{entry.quote.jobRef}</span>
                    <span style={{color:"#374151",fontSize:"11px",...mo}}>
                      {new Date(entry.savedAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}
                    </span>
                    <StatusBadge
                      status={entry.status||"draft"}
                      onChange={(s)=>handleStatusChange(entry.id,s)}
                    />
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
                      <span style={{color:"#f59e0b",fontSize:"10px"}}>↑</span>
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
                      style={{background:"#f59e0b",border:"none",color:"#000",padding:"6px 12px",borderRadius:"6px",...mo,fontSize:"11px",fontWeight:700,cursor:"pointer"}}>
                      OPEN
                    </button>
                    <button onClick={()=>handleDuplicate(entry.id)}
                      title="Duplicate this quote"
                      style={{background:"transparent",border:"1px solid #2a2a2a",color:"#9ca3af",padding:"6px 10px",borderRadius:"6px",...mo,fontSize:"11px",cursor:"pointer"}}
                      onMouseEnter={e=>{e.currentTarget.style.borderColor="#f59e0b44";e.currentTarget.style.color="#f59e0b";}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor="#2a2a2a";e.currentTarget.style.color="#9ca3af";}}>
                      ⧉
                    </button>
                    <button onClick={()=>handleDelete(entry.id)}
                      title="Delete this quote"
                      style={{background:"transparent",border:"1px solid #2a2a2a",color:"#4b5563",padding:"6px 10px",borderRadius:"6px",...mo,fontSize:"11px",cursor:"pointer"}}
                      onMouseEnter={e=>{e.currentTarget.style.borderColor="#7f1d1d";e.currentTarget.style.color="#ef4444";}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor="#2a2a2a";e.currentTarget.style.color="#4b5563";}}>
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
  const mo = {fontFamily:"monospace"};
  const am = {color:"#f59e0b"};

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
      const res = await fetch("/api/generate", {
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
      <div style={{background:"#0f0f0f",border:"1px solid #2a2a2a",borderTop:"3px solid #f59e0b",borderRadius:"10px",width:"100%",maxWidth:"600px",maxHeight:"90vh",overflow:"auto",padding:"24px"}}>

        {/* Header */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"20px"}}>
          <div>
            <h2 style={{margin:"0 0 2px 0",fontSize:"20px",fontWeight:700,color:"#fff"}}>Cover Email</h2>
            <p style={{margin:0,color:"#6b7280",fontSize:"12px",...mo}}>READY TO SEND WITH YOUR QUOTE</p>
          </div>
          <button onClick={onClose} style={{background:"transparent",border:"1px solid #2a2a2a",color:"#6b7280",padding:"6px 12px",borderRadius:"6px",...mo,fontSize:"11px",cursor:"pointer"}}>✕ CLOSE</button>
        </div>

        {/* To/Subject fields */}
        <div style={{background:"#111",border:"1px solid #1a1a1a",borderRadius:"8px",padding:"12px 16px",marginBottom:"14px"}}>
          <div style={{display:"flex",gap:"8px",marginBottom:"6px",alignItems:"center"}}>
            <span style={{color:"#6b7280",fontSize:"11px",...mo,width:"60px"}}>TO:</span>
            <span style={{color:"#9ca3af",fontSize:"13px"}}>{clientInfo?.email || "— add client email in quote form"}</span>
          </div>
          <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
            <span style={{color:"#6b7280",fontSize:"11px",...mo,width:"60px"}}>SUBJECT:</span>
            <span style={{color:"#9ca3af",fontSize:"13px"}}>Quote for {quote.jobTitle} — £{Number(quote.grandTotal).toLocaleString("en-GB",{minimumFractionDigits:2})}</span>
          </div>
        </div>

        {/* Email body */}
        {loading ? (
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:"12px",padding:"32px"}}>
            <div style={{width:"24px",height:"24px",border:"2px solid #2a2a2a",borderTop:"2px solid #f59e0b",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
            <span style={{color:"#6b7280",...mo,fontSize:"13px"}}>WRITING EMAIL...</span>
          </div>
        ) : (
          <textarea
            value={email}
            onChange={e=>setEmail(e.target.value)}
            rows={12}
            style={{width:"100%",background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:"8px",color:"#e5e7eb",fontSize:"14px",padding:"14px",fontFamily:"sans-serif",lineHeight:1.7,resize:"vertical"}}
            onFocus={e=>e.target.style.borderColor="#f59e0b"}
            onBlur={e=>e.target.style.borderColor="#2a2a2a"}
          />
        )}

        {/* Actions */}
        {!loading&&email&&(
          <div style={{display:"flex",gap:"10px",marginTop:"14px",flexWrap:"wrap"}}>
            <button onClick={handleCopy}
              style={{background:copied?"#065f46":"#f59e0b",border:"none",color:copied?"#34d399":"#000",padding:"10px 18px",borderRadius:"6px",...mo,fontSize:"12px",fontWeight:700,cursor:"pointer"}}>
              {copied?"✓ COPIED":"⧉ COPY EMAIL"}
            </button>
            <button onClick={generate}
              style={{background:"transparent",border:"1px solid #2a2a2a",color:"#9ca3af",padding:"10px 18px",borderRadius:"6px",...mo,fontSize:"12px",cursor:"pointer"}}>
              ↻ REGENERATE
            </button>
          </div>
        )}

        <p style={{color:"#374151",fontSize:"11px",...mo,marginTop:"12px",marginBottom:0}}>
          Edit the email above before copying. The subject line is suggested — change it as needed.
        </p>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"16px",padding:"48px 0"}}>
      <div style={{width:"44px",height:"44px",border:"3px solid #2a2a2a",borderTop:"3px solid #f59e0b",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <p style={{color:"#6b7280",fontFamily:"monospace",fontSize:"13px",letterSpacing:"0.05em"}}>GENERATING QUOTE...</p>
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
      style={{background:"#1a1a1a",border:"1px solid #f59e0b",borderRadius:"3px",color:"#fff",padding:"2px 5px",width:"70px",fontFamily:"monospace",fontSize:"12px",textAlign:"right"}}
    />
  );
  return (
    <span onClick={()=>{setVal(isQty?value:Number(value).toFixed(2));setEditing(true);}} title="Click to edit"
      style={{color:"#9ca3af",fontSize:"12px",fontFamily:"monospace",cursor:"pointer",borderBottom:"1px dashed #3a3a3a"}}>
      {isQty ? value : `£${Number(value).toFixed(2)}`}
    </span>
  );
}

function QuoteResult({ quote:init, clientInfo, companyName, defaultTerms, vatRegistered=true, historyId, jobDesc, onSaveTerms, onReset }) {
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

  const recalc = (items, rate=vatRate) => {
    const sub = items.reduce((s,i)=>s+Number(i.total),0);
    const vat = vatRegistered ? sub*(rate/100) : 0;
    return {...q, lineItems:items, subtotal:sub, vatRate:rate, vatAmount:vat, grandTotal:sub+vat};
  };

  const handleVatRateChange = (rate) => {
    setVatRate(rate);
    const sub = q.lineItems.reduce((s,i)=>s+Number(i.total),0);
    const vat = vatRegistered ? sub*(rate/100) : 0;
    setQ(prev=>({...prev, vatRate:rate, vatAmount:vat, grandTotal:sub+vat}));
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
    setQ({...q, lineItems:items});
  };

  const updateUnit = (idx, val) => {
    const items = q.lineItems.map((it,i)=>i===idx?{...it,unit:val}:it);
    setQ({...q, lineItems:items});
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

    const html = `<!DOCTYPE html><html><head><title>Quote ${q.jobRef}</title>
    <style>
      body{font-family:Arial,sans-serif;margin:0;padding:32px;color:#111;max-width:820px;margin:0 auto}
      h1{font-size:22px;margin:0 0 4px}
      table{width:100%;border-collapse:collapse;margin:20px 0}
      th{background:#111;color:#fff;padding:10px 12px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;text-align:left}
      th:not(:first-child){text-align:right}
      .header{border-bottom:3px solid #f59e0b;padding-bottom:20px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:flex-start}
      .grand-total{font-size:28px;font-weight:800}
      .badge{background:#111;color:#fff;padding:3px 10px;border-radius:4px;font-size:11px;letter-spacing:0.08em;display:inline-block;margin-bottom:8px}
      .meta{color:#888;font-size:12px;margin-top:4px}
      .client-box{background:#f9f9f9;border-radius:6px;padding:12px 16px;margin:16px 0;font-size:13px;color:#444;line-height:1.8}
      .notes{background:#f9f9f9;border-left:3px solid #f59e0b;padding:12px 16px;font-size:12px;color:#555;line-height:1.7;margin-top:20px}
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
  const am = {color:"#f59e0b"};
  const mo = {fontFamily:"monospace"};

  return (
    <div style={{animation:"fadeUp 0.4s ease forwards"}}>

      {/* Edit tip */}
      <div className="no-print" style={{background:"#111a0a",border:"1px solid #3a5a10",borderLeft:"3px solid #84cc16",borderRadius:"8px",padding:"11px 16px",marginBottom:"14px",display:"flex",alignItems:"center",gap:"10px"}}>
        <span>✏️</span>
        <p style={{color:"#bef264",fontSize:"12px",lineHeight:1.5,margin:0}}>
          <strong>Click any number or text to edit.</strong> Use + ADD ROW to add items, + ADD NEW SECTION for new categories. Totals update automatically.
        </p>
      </div>

      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#1a1a1a,#0f0f0f)",border:"1px solid #2a2a2a",borderTop:"3px solid #f59e0b",borderRadius:"8px",padding:"22px",marginBottom:"14px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:"12px"}}>
          <div>
            {companyName&&<div style={{color:"#fff",fontSize:"16px",fontWeight:700,marginBottom:"4px"}}>{companyName}</div>}
            <div style={{...am,...mo,fontSize:"12px",marginBottom:"5px"}}>QUOTE {q.jobRef}</div>
            <h2 style={{fontSize:"20px",fontWeight:700,color:"#fff",margin:0}}>{q.jobTitle}</h2>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{color:"#6b7280",fontSize:"10px",...mo,marginBottom:"3px"}}>TOTAL INC. VAT</div>
            <div style={{fontSize:"30px",fontWeight:800,...am}}>£{Number(q.grandTotal).toLocaleString("en-GB",{minimumFractionDigits:2})}</div>
            <div style={{color:"#6b7280",fontSize:"11px",...mo,marginTop:"4px"}}>📅 {new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}).toUpperCase()}</div>
          </div>
        </div>
        {(clientInfo.name||clientInfo.address||clientInfo.email||clientInfo.phone)&&(
          <div style={{marginTop:"14px",paddingTop:"12px",borderTop:"1px solid #2a2a2a"}}>
            <div style={{color:"#6b7280",fontSize:"10px",...mo,marginBottom:"6px"}}>PREPARED FOR</div>
            <div style={{color:"#9ca3af",fontSize:"13px",lineHeight:1.8}}>
              {clientInfo.name&&<div style={{color:"#e5e7eb",fontWeight:600}}>{clientInfo.name}</div>}
              {clientInfo.address&&<div>{clientInfo.address}</div>}
              {clientInfo.email&&<div>{clientInfo.email}</div>}
              {clientInfo.phone&&<div>{clientInfo.phone}</div>}
            </div>
          </div>
        )}
        <p style={{color:"#9ca3af",fontSize:"13px",lineHeight:1.6,margin:"14px 0 0 0"}}>{q.summary}</p>
        <div style={{color:"#6b7280",fontSize:"11px",...mo,marginTop:"8px"}}>⏱ EST. {q.duration.toUpperCase()}</div>
      </div>

      {/* Line items */}
      <div style={{background:"#0f0f0f",border:"1px solid #2a2a2a",borderRadius:"8px",overflow:"hidden",marginBottom:"14px"}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 48px 60px 70px 70px 24px",padding:"9px 14px",background:"#1a1a1a",borderBottom:"1px solid #2a2a2a"}}>
          {["DESCRIPTION","UNIT","QTY","RATE","TOTAL",""].map((h,i)=>(
            <div key={i} style={{color:"#6b7280",fontSize:"10px",...mo,textAlign:i===0?"left":"right"}}>{h}</div>
          ))}
        </div>

        {cats.map((cat,ci)=>(
          <div key={ci}>
            <div style={{padding:"7px 14px",background:"#141414",borderBottom:"1px solid #1f1f1f",borderTop:ci>0?"1px solid #2a2a2a":"none",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{...am,fontSize:"10px",...mo,fontWeight:600}}>{cat.toUpperCase()}</span>
              <button className="no-print" onClick={()=>addItem(cat)}
                style={{background:"#f59e0b22",border:"1px solid #f59e0b55",color:"#f59e0b",borderRadius:"4px",padding:"2px 8px",fontSize:"11px",cursor:"pointer",fontWeight:700,...mo}}>
                + ADD ROW
              </button>
            </div>
            {q.lineItems.map((item,ii)=>item.category!==cat?null:(
              <div key={ii} style={{display:"grid",gridTemplateColumns:"1fr 48px 60px 70px 70px 24px",padding:"9px 14px",borderBottom:"1px solid #1a1a1a",alignItems:"center",gap:"4px"}}>
                <input value={item.description} onChange={e=>updateDesc(ii,e.target.value)}
                  style={{background:"transparent",border:"none",borderBottom:"1px dashed #2a2a2a",color:"#e5e7eb",fontSize:"13px",padding:"2px 4px",fontFamily:"sans-serif",width:"100%"}}
                  onFocus={e=>e.target.style.borderBottomColor="#f59e0b"}
                  onBlur={e=>e.target.style.borderBottomColor="#2a2a2a"}
                />
                <input value={item.unit} onChange={e=>updateUnit(ii,e.target.value)}
                  style={{background:"transparent",border:"none",borderBottom:"1px dashed #2a2a2a",color:"#6b7280",fontSize:"11px",fontFamily:"monospace",textAlign:"right",width:"100%",padding:"2px"}}
                  onFocus={e=>e.target.style.borderBottomColor="#f59e0b"}
                  onBlur={e=>e.target.style.borderBottomColor="#2a2a2a"}
                />
                <div style={{textAlign:"right"}}><EditableCell value={item.qty} isQty onChange={v=>updateItem(ii,"qty",v)}/></div>
                <div style={{textAlign:"right"}}><EditableCell value={item.rate} onChange={v=>updateItem(ii,"rate",v)}/></div>
                <div style={{textAlign:"right"}}><EditableCell value={item.total} onChange={v=>updateItem(ii,"total",v)}/></div>
                <button className="no-print" onClick={()=>deleteItem(ii)}
                  style={{background:"none",border:"none",color:"#4b5563",cursor:"pointer",fontSize:"14px",padding:0,textAlign:"center",lineHeight:1}}
                  onMouseEnter={e=>e.currentTarget.style.color="#ef4444"}
                  onMouseLeave={e=>e.currentTarget.style.color="#4b5563"}>✕</button>
              </div>
            ))}
          </div>
        ))}

        <div className="no-print" style={{padding:"10px 14px",borderTop:"1px solid #1f1f1f"}}>
          <button onClick={addCategory}
            style={{background:"transparent",border:"1px dashed #2a2a2a",color:"#6b7280",borderRadius:"6px",padding:"8px 16px",fontSize:"12px",...mo,cursor:"pointer",width:"100%",letterSpacing:"0.06em"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="#f59e0b55";e.currentTarget.style.color="#f59e0b";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="#2a2a2a";e.currentTarget.style.color="#6b7280";}}>
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
                      style={{background:vatRate===r?"#f59e0b22":"transparent",border:`1px solid ${vatRate===r?"#f59e0b":"#2a2a2a"}`,color:vatRate===r?"#f59e0b":"#6b7280",borderRadius:"4px",padding:"2px 7px",fontSize:"10px",cursor:"pointer",...mo,fontWeight:vatRate===r?700:400}}>
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
          <div style={{display:"flex",justifyContent:"space-between",marginTop:"10px",paddingTop:"10px",borderTop:"1px solid #2a2a2a"}}>
            <span style={{...am,fontSize:"13px",...mo,fontWeight:700}}>{vatRegistered?`TOTAL INC. VAT (${vatRate}%)`:"TOTAL"}</span>
            <span style={{...am,fontSize:"22px",fontWeight:800}}>£{Number(q.grandTotal).toLocaleString("en-GB",{minimumFractionDigits:2})}</span>
          </div>
          {vatRegistered&&(
            <div className="no-print" style={{marginTop:"10px",padding:"8px 10px",background:"#111",borderRadius:"6px",border:"1px solid #1a1a1a"}}>
              <p style={{color:"#4b5563",fontSize:"11px",...mo,margin:0,lineHeight:1.5}}>
                ⚠ VAT rates vary in construction — 5% applies to some renovations and energy-saving works, 0% to new builds. Consult your accountant to confirm the correct rate for this job.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Editable Terms & Notes */}
      <div style={{background:"#0f0f0f",border:"1px solid #2a2a2a",borderLeft:"3px solid #f59e0b",borderRadius:"8px",padding:"13px 16px",marginBottom:"16px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"8px",flexWrap:"wrap",gap:"6px"}}>
          <div style={{...am,fontSize:"10px",...mo}}>TERMS & NOTES</div>
          <div className="no-print" style={{display:"flex",gap:"6px"}}>
            {editingNotes&&(
              <button
                onClick={()=>{
                  onSaveTerms(q.notes);
                  setSavedTerms(true);
                  setTimeout(()=>setSavedTerms(false),2000);
                }}
                style={{background:savedTerms?"#065f46":"#1a1a1a",border:`1px solid ${savedTerms?"#059669":"#3a3a3a"}`,color:savedTerms?"#34d399":"#9ca3af",borderRadius:"4px",padding:"2px 8px",fontSize:"11px",cursor:"pointer",...mo}}>
                {savedTerms?"✓ SAVED":"SAVE AS DEFAULT"}
              </button>
            )}
            <button onClick={()=>setEditingNotes(v=>!v)}
              style={{background:"#f59e0b22",border:"1px solid #f59e0b44",color:"#f59e0b",borderRadius:"4px",padding:"2px 8px",fontSize:"11px",cursor:"pointer",...mo}}>
              {editingNotes?"DONE":"EDIT"}
            </button>
          </div>
        </div>
        {editingNotes ? (
          <textarea
            value={q.notes}
            onChange={e=>setQ(prev=>({...prev,notes:e.target.value}))}
            rows={5}
            style={{width:"100%",background:"#1a1a1a",border:"1px solid #f59e0b",borderRadius:"6px",color:"#e5e7eb",fontSize:"13px",padding:"10px 12px",fontFamily:"sans-serif",lineHeight:1.6,resize:"vertical"}}
          />
        ) : (
          <p style={{color:"#9ca3af",fontSize:"13px",lineHeight:1.7,margin:0}}>{q.notes}</p>
        )}
        {!editingNotes&&(
          <p className="no-print" style={{color:"#374151",fontSize:"11px",...mo,margin:"8px 0 0 0"}}>Click EDIT to customise these terms for this quote</p>
        )}
      </div>

      {/* Actions */}
      <div className="no-print" style={{display:"flex",gap:"10px",flexWrap:"wrap"}}>
        <button onClick={()=>setShowEmail(true)}
          style={{background:"#f59e0b",border:"none",color:"#000",padding:"10px 16px",borderRadius:"6px",...mo,fontSize:"12px",cursor:"pointer",fontWeight:700}}>
          ✉ GENERATE EMAIL
        </button>
        <button onClick={handleSave}
          style={{background:saved?"#065f46":"#1a1a1a",border:`1px solid ${saved?"#059669":"#3a3a3a"}`,color:saved?"#34d399":"#e5e7eb",padding:"10px 16px",borderRadius:"6px",...mo,fontSize:"12px",cursor:"pointer"}}>
          {saved?"✓ SAVED":"💾 SAVE EDITS"}
        </button>
        <button onClick={handleCopy}
          style={{background:copied?"#065f46":"#1a1a1a",border:`1px solid ${copied?"#059669":"#3a3a3a"}`,color:copied?"#34d399":"#e5e7eb",padding:"10px 16px",borderRadius:"6px",...mo,fontSize:"12px",cursor:"pointer"}}>
          {copied?"✓ COPIED":"⧉ COPY TEXT"}
        </button>
        <button onClick={handlePrint}
          style={{background:"#1a1a1a",border:"1px solid #3a3a3a",color:"#e5e7eb",padding:"10px 16px",borderRadius:"6px",...mo,fontSize:"12px",cursor:"pointer"}}>
          🖨 PRINT / SAVE PDF
        </button>
        <button onClick={onReset}
          style={{background:"transparent",border:"1px solid #2a2a2a",color:"#6b7280",padding:"10px 16px",borderRadius:"6px",...mo,fontSize:"12px",cursor:"pointer"}}>
          ← NEW QUOTE
        </button>
      </div>

      {/* Email Generator Modal */}
      {showEmail&&(
        <EmailGenerator
          quote={q}
          clientInfo={clientInfo}
          companyName={companyName}
          onClose={()=>setShowEmail(false)}
        />
      )}
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
  const [jobDesc, setJobDesc] = useState("");
  const [clientInfo, setClientInfo] = useState({name:"",address:"",email:"",phone:""});
  const [quoteLabourRate, setQuoteLabourRate] = useState(saved.labourRate||"");
  const [estimatedHours, setEstimatedHours] = useState("");
  const [materialsHints, setMaterialsHints] = useState("");
  const [showClient, setShowClient] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [quote, setQuote] = useState(null);
  const [loadedClientInfo, setLoadedClientInfo] = useState(null);
  const [currentHistoryId, setCurrentHistoryId] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(()=>{
    const s = document.createElement("style");
    s.textContent = css;
    document.head.appendChild(s);
  },[]);

  // Auto-save settings when company name or terms change
  useEffect(()=>{
    saveSettings({companyName, defaultTerms, labourRate, vatRegistered});
  },[companyName, defaultTerms, labourRate, vatRegistered]);

  const generate = async () => {
    if (jobDesc.trim().length < 15) return;
    setStep("loading"); setErrorMsg("");
    const labourLine = quoteLabourRate
      ? `Labour rate: GBP${quoteLabourRate} per hour - use this exact rate for ALL labour line items.\n${estimatedHours ? `Total labour hours for this job: ${estimatedHours} hours - use this exact figure for the total labour quantity.\n` : ""}`
      : "";
    const materialsLine = materialsHints ? `Specific materials or parts with known prices (use these exact figures):\n${materialsHints}\n` : "";
    const msg = `${companyName?`Company: ${companyName}\n\n`:""}${labourLine}${materialsLine}Job Description: ${jobDesc}\n\nRespond with ONLY valid JSON.`;
    try {
      const res = await fetch("/api/generate", {
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
      } catch(parseErr) {
        setErrorMsg("Parse error: " + parseErr.message + " | Snippet: " + jsonStr.slice(0,200));
        setStep("error");
      }
    } catch(err) {
      setErrorMsg(`Error: ${err.message}`); setStep("error");
    }
  };

  const reset = () => { setStep("form"); setQuote(null); setErrorMsg(""); setJobDesc(""); setMaterialsHints(""); setEstimatedHours(""); setQuoteLabourRate(labourRate||""); setClientInfo({name:"",address:"",email:"",phone:""}); };

  const inp = {width:"100%",background:"#1a1a1a",border:"1px solid #2a2a2a",borderRadius:"6px",padding:"10px 13px",color:"#e5e7eb",fontSize:"14px",fontFamily:"sans-serif"};
  const lbl = {display:"block",color:"#9ca3af",fontSize:"11px",fontFamily:"monospace",letterSpacing:"0.1em",marginBottom:"6px"};
  const mo = {fontFamily:"monospace"};

  return (
    <div style={{minHeight:"100vh",background:"#080808",color:"#e5e7eb",fontFamily:"sans-serif"}}>
      {/* Header */}
      <div className="no-print" style={{borderBottom:"1px solid #1a1a1a",background:"#050505",padding:"0 20px"}}>
        <div style={{maxWidth:"740px",margin:"0 auto",padding:"16px 0",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
            <div style={{width:"32px",height:"32px",background:"#f59e0b",borderRadius:"6px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"15px"}}>🏗</div>
            <div>
              <div style={{fontSize:"18px",fontWeight:800,color:"#fff",letterSpacing:"0.04em",lineHeight:1}}>QUOTEBUILD</div>
              <div style={{color:"#4b5563",fontSize:"10px",...mo,letterSpacing:"0.1em"}}>AI QUOTE GENERATOR FOR BUILDERS</div>
            </div>
          </div>
          <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
            <button onClick={()=>setShowHistory(v=>!v)}
              style={{background:showHistory?"#1a1a1a":"transparent",border:"1px solid #2a2a2a",color:showHistory?"#f59e0b":"#6b7280",padding:"6px 12px",borderRadius:"6px",...mo,fontSize:"11px",cursor:"pointer"}}>
              📋 HISTORY
            </button>
            <button onClick={()=>setShowSettings(v=>!v)}
              style={{background:showSettings?"#1a1a1a":"transparent",border:"1px solid #2a2a2a",color:showSettings?"#f59e0b":"#6b7280",padding:"6px 12px",borderRadius:"6px",...mo,fontSize:"11px",cursor:"pointer"}}>
              ⚙ {showSettings?"HIDE":"SETTINGS"}
            </button>
            {step==="result"&&<button onClick={reset} style={{background:"transparent",border:"1px solid #2a2a2a",color:"#6b7280",padding:"6px 12px",borderRadius:"6px",...mo,fontSize:"11px",cursor:"pointer"}}>← NEW QUOTE</button>}
          </div>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings&&(
        <div className="no-print" style={{background:"#0a0a0a",borderBottom:"1px solid #1a1a1a",padding:"0 20px"}}>
          <div style={{maxWidth:"740px",margin:"0 auto",padding:"20px 0"}}>
            <div style={{color:"#f59e0b",fontSize:"11px",...mo,letterSpacing:"0.1em",marginBottom:"14px"}}>⚙ DEFAULT SETTINGS — saved automatically</div>
            <div style={{marginBottom:"14px"}}>
              <label style={lbl}>YOUR COMPANY NAME</label>
              <input value={companyName} onChange={e=>setCompanyName(e.target.value)} placeholder="e.g. ABC Construction Ltd" style={inp}/>
            </div>
            <div style={{marginBottom:"14px"}}>
              <label style={lbl}>VAT REGISTERED</label>
              <div style={{display:"flex",alignItems:"center",gap:"12px"}}>
                <button
                  onClick={()=>setVatRegistered(v=>!v)}
                  style={{
                    width:"48px",height:"26px",borderRadius:"13px",border:"none",cursor:"pointer",
                    background:vatRegistered?"#f59e0b":"#2a2a2a",
                    position:"relative",transition:"background 0.2s",flexShrink:0
                  }}>
                  <div style={{
                    width:"20px",height:"20px",borderRadius:"50%",background:"#fff",
                    position:"absolute",top:"3px",
                    left:vatRegistered?"25px":"3px",
                    transition:"left 0.2s"
                  }}/>
                </button>
                <span style={{color: vatRegistered?"#f59e0b":"#6b7280",fontSize:"13px",fontFamily:"monospace",fontWeight:600}}>
                  {vatRegistered?"VAT REGISTERED — 20% added to quotes":"NOT VAT REGISTERED — no VAT on quotes"}
                </span>
              </div>
            </div>

            <div style={{marginBottom:"14px"}}>
              <label style={lbl}>YOUR LABOUR RATE (£ PER HOUR)</label>
              <input
                type="number"
                value={labourRate}
                onChange={e=>setLabourRate(e.target.value)}
                placeholder="e.g. 45"
                style={{...inp, width:"180px"}}
              />
              <div style={{color:"#374151",fontSize:"11px",...mo,marginTop:"4px"}}>Used to calculate labour costs accurately on every quote.</div>
            </div>
            <div>
              <label style={lbl}>DEFAULT TERMS & NOTES</label>
              <textarea value={defaultTerms} onChange={e=>setDefaultTerms(e.target.value)} rows={4}
                style={{...inp,lineHeight:1.6,resize:"vertical",fontSize:"13px"}}/>
              <div style={{color:"#374151",fontSize:"11px",...mo,marginTop:"4px"}}>These will appear on every new quote. You can still edit per-quote.</div>
            </div>
          </div>
        </div>
      )}

      <div style={{maxWidth:"740px",margin:"0 auto",padding:"24px 20px"}}>

        {step==="setup"&&(
          <div style={{animation:"fadeUp 0.4s ease forwards"}}>
            <div style={{textAlign:"center",marginBottom:"32px"}}>
              <div style={{width:"56px",height:"56px",background:"#f59e0b",borderRadius:"12px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"26px",margin:"0 auto 16px"}}>🏗</div>
              <h1 style={{fontSize:"32px",fontWeight:800,color:"#fff",margin:"0 0 8px 0",lineHeight:1.1}}>Welcome to QuoteBuild</h1>
              <p style={{color:"#6b7280",fontSize:"15px",margin:0}}>Quick setup — takes 30 seconds. You can change these anytime.</p>
            </div>

            <div style={{background:"#0f0f0f",border:"1px solid #1f1f1f",borderRadius:"10px",padding:"24px",marginBottom:"12px"}}>
              <label style={lbl}>YOUR COMPANY NAME *</label>
              <input
                value={companyName}
                onChange={e=>setCompanyName(e.target.value)}
                placeholder="e.g. ABC Construction Ltd"
                style={{...inp, fontSize:"15px"}}
                autoFocus
              />
              <div style={{color:"#374151",fontSize:"11px",fontFamily:"monospace",marginTop:"8px"}}>
                This will appear on all your quotes. You can change it anytime in Settings.
              </div>
            </div>

            {/* How it works — shown once on setup only */}
            <div style={{background:"#0f0f0f",border:"1px solid #1f1f1f",borderRadius:"10px",padding:"20px",marginBottom:"12px"}}>
              <div style={{color:"#f59e0b",fontSize:"11px",fontFamily:"monospace",letterSpacing:"0.1em",marginBottom:"14px"}}>✦ HOW QUOTEBUILD WORKS</div>
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

            <button
              onClick={()=>{ if(!companyName.trim()){ alert("Please enter your company name."); return; } saveSettings({companyName,defaultTerms}); setStep("form"); }}
              style={{width:"100%",background:"#f59e0b",border:"none",color:"#000",padding:"14px 24px",borderRadius:"8px",fontSize:"18px",fontWeight:800,letterSpacing:"0.04em",cursor:"pointer",marginBottom:"12px"}}>
              START GENERATING QUOTES →
            </button>
            <p style={{color:"#374151",fontSize:"12px",textAlign:"center",margin:0,fontFamily:"monospace"}}>
              Your details are saved locally on this device only.
            </p>
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
            <h1 style={{fontSize:"36px",fontWeight:800,color:"#fff",margin:"0 0 6px 0",lineHeight:1.1}}>
              Professional quotes.<br/><span style={{color:"#f59e0b"}}>In 30 seconds.</span>
            </h1>
            <p style={{color:"#6b7280",fontSize:"14px",margin:"0 0 20px 0"}}>Describe the job, get a fully itemised quote with labour, materials and VAT.</p>

            <div style={{background:"#0f0f0f",border:"1px solid #1f1f1f",borderRadius:"10px",padding:"20px",marginBottom:"12px"}}>
              <label style={lbl}>DESCRIBE THE JOB *</label>
              <textarea value={jobDesc} onChange={e=>setJobDesc(e.target.value)}
                placeholder="e.g. Single storey rear extension, approx 4m x 5m. Brick and block construction with flat roof, bi-fold doors, underfloor heating, plastered and painted. Manchester."
                rows={4} style={{...inp,lineHeight:1.6,resize:"vertical"}}/>
              <div style={{color:"#374151",fontSize:"11px",...mo,marginTop:"5px",textAlign:"right"}}>MORE DETAIL = BETTER QUOTE</div>
            </div>

            <div style={{background:"#0f0f0f",border:"1px solid #1f1f1f",borderRadius:"10px",padding:"20px",marginBottom:"12px"}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"16px",marginBottom:"16px"}}>
                <div>
                  <label style={lbl}>YOUR LABOUR RATE (£/HR)</label>
                  <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                    <span style={{color:"#f59e0b",fontFamily:"monospace",fontSize:"16px",fontWeight:700}}>£</span>
                    <input
                      type="number"
                      value={quoteLabourRate}
                      onChange={e=>{ setQuoteLabourRate(e.target.value); if(e.target.value) { setLabourRate(e.target.value); saveSettings({companyName,defaultTerms,labourRate:e.target.value}); } }}
                      placeholder="e.g. 45"
                      style={{...inp, width:"100px", fontFamily:"monospace", fontSize:"15px", fontWeight:600}}
                    />
                    <span style={{color:"#4b5563",fontSize:"11px",fontFamily:"monospace"}}>/hr</span>
                  </div>
                  {labourRate && quoteLabourRate===labourRate && (
                    <div style={{color:"#4b5563",fontSize:"10px",fontFamily:"monospace",marginTop:"4px"}}>✓ FROM SETTINGS</div>
                  )}
                  {quoteLabourRate && quoteLabourRate!==labourRate && (
                    <div style={{color:"#f59e0b",fontSize:"10px",fontFamily:"monospace",marginTop:"4px"}}>OVERRIDE FOR THIS QUOTE</div>
                  )}
                </div>
                <div>
                  <label style={lbl}>EST. HOURS (OPTIONAL)</label>
                  <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                    <input
                      type="number"
                      value={estimatedHours}
                      onChange={e=>{ const v = e.target.value; if (v === "" || Number(v) >= 0) setEstimatedHours(v); }}
                      min="0"
                      placeholder="e.g. 3"
                      style={{...inp, width:"90px", fontFamily:"monospace", fontSize:"15px", fontWeight:600}}
                    />
                    <span style={{color:"#4b5563",fontSize:"11px",fontFamily:"monospace"}}>/hrs</span>
                  </div>
                  <div style={{color:"#374151",fontSize:"10px",fontFamily:"monospace",marginTop:"4px"}}>Leave blank to let AI estimate</div>
                </div>
              </div>
              <label style={lbl}>SPECIFIC MATERIALS OR PARTS (OPTIONAL)</label>
              <textarea
                value={materialsHints}
                onChange={e=>setMaterialsHints(e.target.value)}
                placeholder={"e.g. Grohe kitchen tap £85, 20m2 porcelain tile £18/m2, underfloor heating kit £320"}
                rows={3}
                style={{...inp, lineHeight:1.6, resize:"vertical", fontSize:"13px"}}
              />
              <div style={{color:"#374151",fontSize:"11px",fontFamily:"monospace",marginTop:"5px"}}>
                Enter any materials or parts with known prices — the quote will use these exact figures.
              </div>
            </div>

            <div style={{background:"#0f0f0f",border:"1px solid #1f1f1f",borderRadius:"10px",marginBottom:"12px",overflow:"hidden"}}>
              <button onClick={()=>setShowClient(v=>!v)} style={{width:"100%",background:"none",border:"none",padding:"13px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",color:"#9ca3af"}}>
                <span style={{fontSize:"11px",...mo,letterSpacing:"0.1em"}}>CLIENT DETAILS (OPTIONAL)</span>
                <span style={{color:"#f59e0b"}}>{showClient?"▲":"▼"}</span>
              </button>
              {showClient&&(
                <div style={{padding:"0 20px 20px",borderTop:"1px solid #1a1a1a"}}>
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
                <button key={i} onClick={()=>setJobDesc(ex)} style={{background:"#111",border:"1px solid #2a2a2a",color:"#9ca3af",fontSize:"12px",padding:"6px 12px",borderRadius:"20px",cursor:"pointer"}}>{ex}</button>
              ))}
            </div>

            <button onClick={generate} disabled={jobDesc.trim().length<15}
              style={{width:"100%",background:jobDesc.trim().length>=15?"#f59e0b":"#1a1a1a",border:"none",color:jobDesc.trim().length>=15?"#000":"#374151",padding:"13px 24px",borderRadius:"8px",fontSize:"17px",fontWeight:700,letterSpacing:"0.06em",cursor:jobDesc.trim().length>=15?"pointer":"not-allowed"}}>
              GENERATE QUOTE →
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
            onSaveTerms={(terms)=>{ setDefaultTerms(terms); saveSettings({companyName, defaultTerms:terms, labourRate, vatRegistered}); }}
            onReset={reset}
          />
        )}

        {!showHistory && step==="error"&&(
          <div>
            <div style={{background:"#1f0a0a",border:"1px solid #7f1d1d",borderRadius:"8px",padding:"16px 20px",marginBottom:"16px"}}>
              <div style={{color:"#f87171",fontSize:"13px",...mo,marginBottom:"8px"}}>ERROR DETAILS</div>
              <p style={{color:"#fca5a5",fontSize:"14px",margin:0,lineHeight:1.6,wordBreak:"break-all"}}>{errorMsg}</p>
            </div>
            <button onClick={()=>setStep("form")} style={{background:"#f59e0b",border:"none",color:"#000",padding:"11px 20px",borderRadius:"6px",...mo,fontSize:"12px",fontWeight:700,cursor:"pointer"}}>← TRY AGAIN</button>
          </div>
        )}
      </div>

      <div className="no-print" style={{borderTop:"1px solid #111",padding:"12px 20px",marginTop:"24px"}}>
        <div style={{maxWidth:"740px",margin:"0 auto",display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:"8px"}}>
          <span style={{color:"#374151",fontSize:"11px",...mo}}>QUOTEBUILD © 2026</span>
          <span style={{color:"#374151",fontSize:"11px",...mo}}>ALWAYS VERIFY RATES WITH YOUR SUPPLIER</span>
        </div>
      </div>
    </div>
  );
}
