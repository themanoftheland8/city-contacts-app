import { useState, useEffect, useMemo } from "react";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot,
} from "firebase/firestore";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { db, auth, googleProvider } from "./firebase";

const CATEGORIES = ["Massage", "Wrestling", "Content"];

const SOCIAL_PLATFORMS = [
  { key: "meetfighters", label: "Meetfighters", placeholder: "username", url: (u) => u ? `https://www.meetfighters.com/users/${encodeURIComponent(u.trim())}` : "", icon: "🥊" },
  { key: "x", label: "X (Twitter)", placeholder: "username", url: (u) => u ? `https://x.com/${encodeURIComponent(u.trim())}` : "", icon: "✕" },
  { key: "bsky", label: "Bluesky", placeholder: "handle", url: (u) => {
      if (!u) return "";
      const val = String(u).trim();
      return `https://bsky.app/profile/${encodeURIComponent(val.includes(".") ? val : val + ".bsky.social")}`;
    }, icon: "🦋" },
  { key: "instagram", label: "Instagram", placeholder: "username", url: (u) => u ? `https://instagram.com/${encodeURIComponent(u.trim())}` : "", icon: "📷" },
  { key: "rentmasseur", label: "RentMasseur", placeholder: "username", url: (u) => u ? `https://rentmasseur.com/${encodeURIComponent(u.trim())}` : "", icon: "💆" },
];

const emptyForm = {
  name: "", city: "", newCity: "", phone: "",
  meetfighters: "", x: "", bsky: "", instagram: "", rentmasseur: "",
  categories: [], manualCategories: [], removedCategories: [],
};

function formatPhone(raw) {
  if (!raw) return "";
  const digits = raw.replace(/[^0-9]/g, "");
  const local = (digits.length === 11 && digits.startsWith("1")) ? digits.slice(1) : digits;
  const d = local.slice(0, 10);
  if (d.length >= 7) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`;
  if (d.length >= 4) return `(${d.slice(0,3)}) ${d.slice(3)}`;
  if (d.length >= 1) return `(${d}`;
  return "";
}

function autoCategories(form) {
  const removed = new Set(form.removedCategories || []);
  const cats = new Set(form.manualCategories || []);

  const hasPhone = !!(form.phone || "").trim();
  const hasX = !!(form.x || "").trim();
  const hasBsky = !!(form.bsky || "").trim();
  const hasMeetfighters = !!(form.meetfighters || "").trim();
  const hasInsta = !!(form.instagram || "").trim();

  // If phone is entered -> Default to Massage
  if (!removed.has("Massage") && hasPhone) cats.add("Massage");
  
  // If x/bsky is entered -> Default to Content
  if (!removed.has("Content") && (hasX || hasBsky)) cats.add("Content");
  
  // If meetfighters/insta is entered -> Default to Wrestling
  if (!removed.has("Wrestling") && (hasMeetfighters || hasInsta)) cats.add("Wrestling");

  return [...cats];
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { 
      setUser(u); 
      setAuthLoading(false); 
    });
    return () => unsub();
  }, []);

  if (authLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p style={{ color: "var(--text-secondary)" }}>Checking authorization...</p>
      </div>
    );
  }

  if (!user) return <LoginScreen />;
  return <MainApp user={user} />;
}

function LoginScreen() {
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  const handleGoogle = async () => {
    setSigningIn(true); 
    setError("");
    try { 
      await signInWithPopup(auth, googleProvider); 
    } catch { 
      setError("Sign-in failed. Please try again."); 
      setSigningIn(false); 
    }
  };

  return (
    <div className="login-container">
      <div className="glass-card login-card">
        <div className="login-icon">📍</div>
        <h1 className="login-title">City Contacts</h1>
        <p className="login-subtitle">Sync your contacts across cities</p>
        <button 
          className="google-signin-btn" 
          onClick={handleGoogle} 
          disabled={signingIn}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
            <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.548 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
          </svg>
          {signingIn ? "Signing in..." : "Continue with Google"}
        </button>
        {error && <p style={{ color: "var(--danger)", marginTop: "16px", fontSize: "14px" }}>{error}</p>}
      </div>
    </div>
  );
}

function MainApp({ user }) {
  const [contacts, setContacts] = useState({});
  const [cities, setCities] = useState([]);
  const [selectedCity, setSelectedCity] = useState("");
  const [view, setView] = useState("browse"); // 'browse' | 'add'
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    const ref = collection(db, "users", user.uid, "contacts");
    const unsub = onSnapshot(ref, (snapshot) => {
      const data = {};
      snapshot.forEach((d) => { 
        data[d.id] = { ...d.data(), id: d.id }; 
      });
      setContacts(data);
      
      const usedCities = [...new Set(Object.values(data).map((c) => c.city))].sort();
      setCities(usedCities);
      
      setSelectedCity((prev) => {
        if (prev && usedCities.includes(prev)) return prev;
        return usedCities[0] || "";
      });
      setLoading(false);
    }, (error) => {
      console.error("Firestore subscription error:", error);
      setLoading(false);
    });
    return () => unsub();
  }, [user.uid]);

  const s = (v) => (v || "").trim();

  const handleFormChange = (field, value) => {
    setForm((f) => {
      const updated = { ...f, [field]: value };
      // Auto-update categories whenever a contact detail field changes
      if (["phone", "x", "bsky", "meetfighters", "instagram"].includes(field)) {
        updated.categories = autoCategories({ ...updated, removedCategories: updated.removedCategories || [] });
      }
      return updated;
    });
  };

  const toggleCategory = (cat) => {
    setForm((f) => {
      const isCurrentlyOn = (f.categories || []).includes(cat);
      const newManual = isCurrentlyOn
        ? (f.manualCategories || []).filter(c => c !== cat)
        : [...(f.manualCategories || []), cat];
      
      const newRemoved = isCurrentlyOn
        ? [...new Set([...(f.removedCategories || []), cat])]
        : (f.removedCategories || []).filter(c => c !== cat);
      
      const newCategories = autoCategories({ ...f, manualCategories: newManual, removedCategories: newRemoved });
      
      return { 
        ...f, 
        manualCategories: newManual, 
        removedCategories: newRemoved, 
        categories: newCategories 
      };
    });
  };

  const getEffectiveCity = () => form.city === "__new__" ? form.newCity.trim() : form.city;

  const handleSave = async () => {
    const city = getEffectiveCity();
    if (!city) return;
    
    const contact = {
      name: s(form.name), 
      city,
      phone: s(form.phone), 
      meetfighters: s(form.meetfighters),
      x: s(form.x), 
      bsky: s(form.bsky),
      instagram: s(form.instagram), 
      rentmasseur: s(form.rentmasseur),
      categories: form.categories || [],
      manualCategories: form.manualCategories || [],
      removedCategories: form.removedCategories || [],
    };
    
    const ref = collection(db, "users", user.uid, "contacts");
    if (editingId) {
      await updateDoc(doc(db, "users", user.uid, "contacts", editingId), contact);
    } else {
      await addDoc(ref, { ...contact, createdAt: Date.now() });
    }
    
    setSelectedCity(city);
    setView("browse");
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleDelete = async (id) => { 
    await deleteDoc(doc(db, "users", user.uid, "contacts", id)); 
  };

  const handleEdit = (contact) => {
    setForm({
      name: contact.name || "", 
      city: contact.city, 
      newCity: "",
      phone: contact.phone || "", 
      meetfighters: contact.meetfighters || "",
      x: contact.x || "", 
      bsky: contact.bsky || "",
      instagram: contact.instagram || "", 
      rentmasseur: contact.rentmasseur || "",
      categories: contact.categories || [],
      manualCategories: contact.manualCategories || [],
      removedCategories: contact.removedCategories || [],
    });
    setEditingId(contact.id);
    setView("add");
  };

  const cancelForm = () => { 
    setView("browse"); 
    setEditingId(null); 
    setForm(emptyForm); 
  };

  const cityContacts = useMemo(() =>
    Object.values(contacts)
      .filter((c) => c.city === selectedCity)
      .sort((a, b) => (a.name || "").localeCompare(b.name || "")),
    [contacts, selectedCity]
  );

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p style={{ color: "var(--text-secondary)" }}>Loading contacts...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-section">
          <div className="logo-badge">📍</div>
          <div className="title-area">
            <h1>City Contacts</h1>
            <p>Select your location & find your contacts</p>
          </div>
        </div>
        <div className="header-controls">
          <button 
            className="btn btn-primary"
            onClick={() => {
              if (view === "add") { 
                cancelForm(); 
              } else { 
                setForm(f => ({ ...f, city: selectedCity })); 
                setView("add"); 
              }
            }}
          >
            {view === "add" ? "← Back" : "+ Add Contact"}
          </button>
          <div className="user-profile">
            <img 
              src={user.photoURL || ""} 
              alt="" 
              className="user-avatar"
              onError={(e) => { e.target.style.display = "none"; }} 
            />
            <button className="signout-button" onClick={() => signOut(auth)}>Sign Out</button>
          </div>
        </div>
      </header>

      {view === "browse" ? (
        <BrowseView
          cities={cities} 
          selectedCity={selectedCity} 
          setSelectedCity={setSelectedCity}
          cityContacts={cityContacts} 
          onEdit={handleEdit} 
          onDelete={handleDelete}
        />
      ) : (
        <AddView
          form={form} 
          cities={cities} 
          onChange={handleFormChange}
          onToggleCategory={toggleCategory}
          onSave={handleSave} 
          onCancel={cancelForm}
          isEditing={!!editingId} 
          effectiveCity={getEffectiveCity()}
        />
      )}
    </div>
  );
}

function BrowseView({ cities, selectedCity, setSelectedCity, cityContacts, onEdit, onDelete }) {
  const [expanded, setExpanded] = useState(() => ({
    ...Object.fromEntries(CATEGORIES.map(c => [c, true])),
    "Uncategorized": true,
  }));

  const toggleExpanded = (cat) => setExpanded(e => ({ ...e, [cat]: !e[cat] }));

  // Group contacts by category; contacts with no category go into "Uncategorized"
  const grouped = useMemo(() => {
    const groups = {};
    CATEGORIES.forEach(c => groups[c] = []);
    groups["Uncategorized"] = [];
    cityContacts.forEach(contact => {
      const cats = contact.categories && contact.categories.length > 0 ? contact.categories : ["Uncategorized"];
      cats.forEach(cat => {
        if (groups[cat]) groups[cat].push(contact);
        else groups["Uncategorized"].push(contact);
      });
    });
    return groups;
  }, [cityContacts]);

  const allGroups = [...CATEGORIES, "Uncategorized"].filter(cat => grouped[cat]?.length > 0);

  return (
    <div>
      {cities.length === 0 ? (
        <div className="glass-card empty-state">
          <div className="empty-state-emoji">🌆</div>
          <h3>Your Contacts List is Empty</h3>
          <p>Click "+ Add Contact" in the top right to save your first contact.</p>
        </div>
      ) : (
        <>
          <div className="city-select-bar">
            <label>Current Location</label>
            <select 
              className="city-dropdown" 
              value={selectedCity} 
              onChange={(e) => setSelectedCity(e.target.value)}
            >
              {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <span style={{ fontSize: "14px", color: "var(--text-secondary)", fontWeight: 500 }}>
              {cityContacts.length} contact{cityContacts.length !== 1 ? "s" : ""}
            </span>
          </div>

          {allGroups.length === 0 ? (
            <div className="glass-card empty-state">
              <div className="empty-state-emoji">📍</div>
              <h3>No Contacts Here Yet</h3>
              <p>Add a contact to {selectedCity} to view them here.</p>
            </div>
          ) : (
            <div>
              {allGroups.map(cat => (
                <div key={cat} className={`category-card cat-${cat.toLowerCase()}`}>
                  <button className="category-header" onClick={() => toggleExpanded(cat)}>
                    <div className="category-title-wrapper">
                      <span className="category-emoji">{catIcon(cat)}</span>
                      <span className="category-title">{cat}</span>
                    </div>
                    <span className="category-count-badge">{grouped[cat].length}</span>
                    <span className={`chevron-icon ${expanded[cat] ? "chevron-open" : ""}`}>▶</span>
                  </button>
                  {expanded[cat] && (
                    <div className="contacts-list">
                      {grouped[cat].map(contact => (
                        <ContactRow 
                          key={`${contact.id}-${cat}`} 
                          contact={contact} 
                          onEdit={onEdit} 
                          onDelete={onDelete} 
                        />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function catIcon(cat) {
  if (cat === "Massage") return "💆";
  if (cat === "Wrestling") return "🥊";
  if (cat === "Content") return "🎥";
  return "👤";
}

function ContactRow({ contact, onEdit, onDelete }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const socials = SOCIAL_PLATFORMS.filter((p) => contact[p.key]);

  return (
    <div className="contact-item">
      <div className="contact-info">
        <div className="contact-avatar">
          {(contact.name || "?").charAt(0).toUpperCase()}
        </div>
        <span className="contact-name">
          {contact.name || <em style={{ color: "var(--text-muted)", fontWeight: 400 }}>Unnamed</em>}
        </span>
      </div>

      <div className="contact-links">
        {contact.phone && (
          <a href={`tel:${contact.phone}`} className="contact-link-badge badge-phone" title="Call contact">
            <span>📞</span> {contact.phone}
          </a>
        )}
        {socials.map((platform) => (
          <a 
            key={platform.key} 
            href={platform.url(contact[platform.key])}
            target="_blank" 
            rel="noopener noreferrer" 
            className={`contact-link-badge badge-${platform.key}`}
          >
            <span>{platform.icon}</span> @{contact[platform.key]} ↗
          </a>
        ))}
      </div>

      <div className="contact-actions">
        <button className="action-btn" onClick={() => onEdit(contact)} title="Edit Contact">✎</button>
        {confirmDelete ? (
          <div className="delete-confirm-box">
            <button className="btn btn-danger" style={{ padding: "6px 12px", borderRadius: "8px", fontSize: "12px" }} onClick={() => onDelete(contact.id)}>Delete</button>
            <button className="btn btn-secondary" style={{ padding: "6px 10px", borderRadius: "8px", fontSize: "12px" }} onClick={() => setConfirmDelete(false)}>✕</button>
          </div>
        ) : (
          <button className="action-btn action-delete" onClick={() => setConfirmDelete(true)} title="Delete Contact">✕</button>
        )}
      </div>
    </div>
  );
}

function AddView({ form = {}, cities = [], onChange, onToggleCategory, onSave, onCancel, isEditing, effectiveCity }) {
  const valid = !!effectiveCity;

  // Track active rule indicators
  const showMassageRule = !!(form.phone || "").trim();

  return (
    <div className="glass-card" style={{ maxWidth: "600px", margin: "0 auto" }}>
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "22px", marginBottom: "24px" }}>
        {isEditing ? "Edit Contact" : "Add New Contact"}
      </h2>

      <div className="form-group">
        <label className="form-label">Contact Name</label>
        <input 
          type="text"
          className="form-input" 
          placeholder="Enter name or nickname" 
          value={form.name}
          onChange={(e) => onChange("name", e.target.value)} 
        />
      </div>

      <div className="form-group">
        <label className="form-label">City / Location <span style={{ color: "var(--primary)" }}>*</span></label>
        <select 
          className="form-input" 
          value={form.city} 
          onChange={(e) => onChange("city", e.target.value)}
        >
          <option value="">— Select Location or Add New —</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
          <option value="__new__">+ Add New City...</option>
        </select>
        {form.city === "__new__" && (
          <input 
            type="text"
            className="form-input" 
            style={{ marginTop: "12px" }} 
            placeholder="Type city name"
            value={form.newCity} 
            onChange={(e) => onChange("newCity", e.target.value)} 
            autoFocus 
          />
        )}
      </div>

      <div style={{ margin: "24px 0 12px", borderTop: "1px solid var(--border-light)" }} />

      <div className="form-group">
        <label className="form-label">📞 Phone Number</label>
        <div className="input-icon-wrapper">
          <span className="input-icon">📞</span>
          <input 
            type="tel" 
            className="form-input input-with-icon" 
            placeholder="(555) 000-0000" 
            value={form.phone}
            onChange={(e) => onChange("phone", formatPhone(e.target.value))}
            inputMode="numeric"
          />
        </div>
        {showMassageRule && (
          <div className="rule-indicator rule-indicator-active">
            <span>✨ Phone entered → Defaulted category to <strong>Massage</strong></span>
          </div>
        )}
      </div>

      {SOCIAL_PLATFORMS.map((p) => {
        const isWrestlingRulePlatform = p.key === "meetfighters" || p.key === "instagram";
        const isContentRulePlatform = p.key === "x" || p.key === "bsky";
        const hasValue = !!(form[p.key] || "").trim();

        return (
          <div key={p.key} className="form-group">
            <label className="form-label">
              {p.icon} {p.label}
              {p.key === "bsky" && <span style={{ textTransform: "none", fontSize: "10px", color: "var(--text-muted)", marginLeft: "4px" }}> (no .bsky.social needed)</span>}
            </label>
            <div className="input-icon-wrapper">
              <span className="input-icon">{p.icon}</span>
              <input 
                type="text"
                className="form-input input-with-icon" 
                placeholder={p.placeholder} 
                value={form[p.key]}
                onChange={(e) => onChange(p.key, e.target.value)} 
              />
              {form[p.key] && (
                <a 
                  href={p.url(form[p.key])} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="input-preview-btn"
                >
                  Test Link ↗
                </a>
              )}
            </div>
            {hasValue && isWrestlingRulePlatform && (
              <div className="rule-indicator rule-indicator-active">
                <span>✨ {p.label} entered → Defaulted category to <strong>Wrestling</strong></span>
              </div>
            )}
            {hasValue && isContentRulePlatform && (
              <div className="rule-indicator rule-indicator-active">
                <span>✨ {p.label} entered → Defaulted category to <strong>Content</strong></span>
              </div>
            )}
          </div>
        );
      })}

      <div style={{ margin: "24px 0 12px", borderTop: "1px solid var(--border-light)" }} />

      <div className="form-group">
        <label className="form-label">Categories <span style={{ textTransform: "none", fontSize: "11px", color: "var(--text-muted)", fontWeight: "normal" }}>(Select one or more)</span></label>
        <div className="category-chips-wrapper">
          {CATEGORIES.map(cat => {
            const checked = (form.categories || []).includes(cat);
            return (
              <button 
                key={cat} 
                type="button"
                className={`cat-chip ${checked ? 'cat-chip-active' : ''} chip-${cat.toLowerCase()}`}
                onClick={() => onToggleCategory(cat)}
              >
                {catIcon(cat)} {cat} {checked && "✓"}
              </button>
            );
          })}
        </div>
      </div>

      <div className="form-actions">
        <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
        <button 
          className="btn btn-primary" 
          onClick={valid ? onSave : undefined} 
          disabled={!valid}
          style={{ opacity: valid ? 1 : 0.5, cursor: valid ? "pointer" : "not-allowed" }}
        >
          {isEditing ? "Save Changes" : "Save Contact"}
        </button>
      </div>
    </div>
  );
}
