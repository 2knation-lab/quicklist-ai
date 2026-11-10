"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Draft, newDraft, ready } from "@/lib/listing";

async function photoData(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw new Error(
      "Use JPEG, PNG, or WebP. On iPhone, choose a compatible photo or take a new photo.",
    );
  if (file.size > 15 * 1024 * 1024)
    throw new Error("Each photo must be smaller than 15 MB.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas");
  c.width = bitmap.width * scale;
  c.height = bitmap.height * scale;
  c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
  bitmap.close();
  return c.toDataURL("image/jpeg", 0.72);
}
function Arrow() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path d="M5 19 19 5M5 5h14v14" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export default function Home() {
  const [draft, setDraft] = useState<Draft | null>(null),
    [saved, setSaved] = useState<Draft[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [email, setEmail] = useState(""),
    [user, setUser] = useState<string | null>(null),
    [mode, setMode] = useState(""),
    [loaded, setLoaded] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    queueMicrotask(() => {
      setDraft(newDraft());
      try {
        setSaved(JSON.parse(localStorage.getItem("quicklist-drafts") || "[]"));
      } catch {
        setMessage("Saved browser drafts could not be read.");
      }
      setLoaded(true);
    });
    if (!supabase) return;
    void supabase.auth
      .getUser()
      .then(({ data }) => setUser(data.user?.id || null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setUser(session?.user.id || null),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!user || !supabase) return;
    void Promise.resolve(
      supabase
        .from("drafts")
        .select("data")
        .order("updated_at", { ascending: false }),
    )
      .then(async ({ data, error }) => {
        if (error) {
          setMessage(
            "Cloud drafts could not load. Browser drafts are still available.",
          );
          return;
        }
        const drafts: Draft[] = [];
        for (const row of data || []) {
          const d = row.data as Draft;
          const photos = await Promise.all(
            d.photos.map(async (path) => {
              const { data, error } = await supabase!.storage
                .from("part-photos")
                .download(path);
              if (error) throw error;
              return await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = reject;
                reader.readAsDataURL(data);
              });
            }),
          );
          drafts.push({ ...d, photos });
        }
        setSaved(drafts);
      })
      .catch(() =>
        setMessage("Some cloud photos could not load. Try signing in again."),
      );
  }, [user]);
  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) =>
      d
        ? {
            ...d,
            [key]: value,
            confirmed: key === "confirmed" ? Boolean(value) : false,
          }
        : d,
    );
  }
  async function addPhotos(files: FileList | null) {
    if (!draft || !files) return;
    setBusy(true);
    try {
      if (draft.photos.length + files.length > 4)
        throw new Error("Choose up to 4 photos per draft.");
      const photos = await Promise.all(Array.from(files).map(photoData));
      if ([...draft.photos, ...photos].join("").length > 3_500_000)
        throw new Error("Photos are too large together. Choose fewer photos.");
      update("photos", [...draft.photos, ...photos]);
      setMessage("Photos added. Generate a draft or enter the details below.");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function analyze() {
    if (!draft) return;
    setBusy(true);
    setMessage("Preparing your listing…");
    try {
      const session = await supabase?.auth.getSession();
      const r = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.data.session
            ? { Authorization: `Bearer ${session.data.session.access_token}` }
            : {}),
        },
        body: JSON.stringify({ photos: draft.photos }),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error);
      setDraft({ ...draft, ...result.proposal, confirmed: false });
      setMode(result.mode);
      setMessage(
        result.mode === "demo"
          ? "Demo template loaded. Your photos were not analyzed. Edit every detail before use."
          : "AI proposal ready. Verify every detail against the part.",
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const d = { ...draft, updatedAt: new Date().toISOString() };
      if (user && supabase) {
        const paths: string[] = [];
        for (let i = 0; i < d.photos.length; i++) {
          const path = `${user}/${d.id}/${crypto.randomUUID()}.jpg`;
          const blob = await (await fetch(d.photos[i])).blob();
          const { error } = await supabase.storage
            .from("part-photos")
            .upload(path, blob, { contentType: "image/jpeg" });
          if (error) throw error;
          paths.push(path);
        }
        const { error } = await supabase.from("drafts").upsert({
          id: d.id,
          user_id: user,
          data: { ...d, photos: paths },
          updated_at: d.updatedAt,
        });
        if (error) throw error;
        setSaved((s) => [d, ...s.filter((x) => x.id !== d.id)]);
        setMessage("Draft saved privately to your account.");
      } else {
        const next = [d, ...saved.filter((x) => x.id !== d.id)];
        localStorage.setItem("quicklist-drafts", JSON.stringify(next));
        setSaved(next);
        setMessage("Draft saved in this browser, including photos.");
      }
    } catch {
      setMessage(
        "Could not save. Browser storage may be full or cloud access unavailable. Keep this page open and try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function signIn() {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setMessage(error ? error.message : "Check your email for a sign-in link.");
    setBusy(false);
  }
  function exportDraft() {
    if (!draft || !ready(draft)) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            ...draft,
            photos: undefined,
            shipping: "Calculated shipping paid by buyer",
            status: "Seller-reviewed draft; not published",
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "quicklist-draft.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  if (!loaded || !draft)
    return (
      <main>
        <p>Loading your workbench…</p>
      </main>
    );
  return (
    <>
      <header>
        <Link className="logo" href="/">
          QUICKLIST<span>AI</span>
          <small>MOTORSPORTS MARKETPLACE TOOLS</small>
        </Link>
        <span className="pill">DRAFT WORKBENCH</span>
      </header>
      <main>
        <div className="intro">
          <div>
            <p className="eyebrow">LESS ADMIN. MORE TRACK TIME.</p>
            <h1>
              From pit lane
              <br />
              to <em>listing.</em>
            </h1>
            <p className="sub">
              Give your used racing parts their next starting grid.
              <br />
              Add photos. Build a draft. Make it yours.
            </p>
          </div>
          <div className="intro-mark" aria-hidden="true">
            <Arrow />
          </div>
        </div>
        <div className="notice">
          <span className="dot" />
          <div>
            <strong>
              {!supabase
                ? "Demo workspace"
                : user
                  ? "Private workspace"
                  : "Browser workspace"}
            </strong>
            <p>
              {!supabase
                ? "No credentials needed. Generation uses a sample template unless server AI is configured. Photos are not analyzed in demo mode."
                : user
                  ? "Drafts and photos save privately to your account. AI availability depends on server configuration."
                  : "Sign in for private cloud saves and live AI when configured. You can also draft and save in this browser."}
            </p>
          </div>
        </div>
        <div className="workspace">
          <section className="editor">
            <section className="card">
              <div className="section-heading">
                <h2>
                  <span>01</span> Capture the part
                </h2>
                <small>UP TO 4 PHOTOS</small>
              </div>
              <p className="muted">
                Show all angles, part numbers, and any wear. One item or a
                related lot per draft.
              </p>
              <label className="upload">
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(e) => void addPhotos(e.target.files)}
                  disabled={busy}
                />
                <b>＋</b>
                <strong>Add part photos</strong>
                <span>Take a photo or choose from your library</span>
                <small>JPEG, PNG, WebP · 15 MB each</small>
              </label>
              {draft.photos.length > 0 && (
                <div className="photos">
                  {draft.photos.map((photo, i) => (
                    <div key={i}>
                      <Image
                        unoptimized
                        width={160}
                        height={96}
                        src={photo}
                        alt={`Part view ${i + 1}`}
                      />
                      <button
                        type="button"
                        aria-label={`Remove photo ${i + 1}`}
                        onClick={() =>
                          update(
                            "photos",
                            draft.photos.filter((_, n) => n !== i),
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                className="primary"
                disabled={busy || !draft.photos.length}
                onClick={() => void analyze()}
              >
                ✦ {busy ? "Working…" : "Generate listing draft"}{" "}
                <span>
                  <Arrow />
                </span>
              </button>
              <p className="fine">
                AI suggestions require seller verification. No automatic
                publishing.
              </p>
            </section>
            <section className="card">
              <div className="section-heading">
                <h2>
                  <span>02</span> Make it accurate
                </h2>
                <span className="tag">SELLER REVIEW</span>
              </div>
              <label>
                Listing title <small>{draft.title.length}/80</small>
                <input
                  maxLength={80}
                  value={draft.title}
                  onChange={(e) => update("title", e.target.value)}
                  placeholder="e.g. Used racing brake caliper — verify brand"
                />
              </label>
              <label>
                Description
                <textarea
                  rows={6}
                  value={draft.description}
                  onChange={(e) => update("description", e.target.value)}
                  placeholder="Describe condition, markings, defects, and what is included."
                />
              </label>
              <div className="two-col">
                {(
                  [
                    ["category", "Category"],
                    ["brand", "Brand"],
                    ["partNumber", "Part number"],
                    ["fitment", "Fitment / compatibility"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      value={draft[key]}
                      onChange={(e) => update(key, e.target.value)}
                    />
                    <small className="verify">
                      Verify against the physical part
                    </small>
                  </label>
                ))}
              </div>
              <div className="verification">
                <strong>⚑ Details to verify</strong>
                <ul>
                  {draft.verification.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            </section>
            <section className="card">
              <div className="section-heading">
                <h2>
                  <span>03</span> Set the terms
                </h2>
              </div>
              <div className="segmented">
                <button
                  className={draft.format === "fixed" ? "selected" : ""}
                  onClick={() =>
                    setDraft({ ...draft, format: "fixed", confirmed: false })
                  }
                >
                  Buy It Now
                </button>
                <button
                  className={draft.format === "auction" ? "selected" : ""}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      format: "auction",
                      bestOffer: false,
                      confirmed: false,
                    })
                  }
                >
                  Auction
                </button>
              </div>
              <div className="two-col">
                <label>
                  {draft.format === "fixed"
                    ? "Price (USD)"
                    : "Starting bid (USD)"}
                  <input
                    inputMode="decimal"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={draft.price}
                    onChange={(e) => update("price", e.target.value)}
                    placeholder="0.00"
                  />
                </label>
                {draft.format === "auction" ? (
                  <label>
                    Duration
                    <select
                      value={draft.duration}
                      onChange={(e) =>
                        update("duration", Number(e.target.value))
                      }
                    >
                      {[3, 5, 7, 10].map((n) => (
                        <option key={n} value={n}>
                          {n} days
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={draft.bestOffer}
                      onChange={(e) => update("bestOffer", e.target.checked)}
                    />
                    Enable Best Offer
                  </label>
                )}
              </div>
              <p className="fine">
                Set your own price. Verified comparable market data is not
                connected.
              </p>
              <h3>
                Shipping <span className="tag">BUYER PAYS · CALCULATED</span>
              </h3>
              <div className="two-col">
                {(
                  [
                    ["length", "Length (in)"],
                    ["width", "Width (in)"],
                    ["height", "Height (in)"],
                    ["weight", "Weight (lb)"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      inputMode="decimal"
                      value={draft[key]}
                      onChange={(e) => update(key, e.target.value)}
                      placeholder="0.00"
                    />
                  </label>
                ))}
              </div>
              <p className="fine">
                Measure the packed box, including padding. Rates are not
                calculated in this version.
              </p>
            </section>
          </section>
          <aside>
            <section className="card summary">
              <p className="eyebrow">YOUR NEXT LISTING</p>
              <h2>{draft.title || "A fresh start for a used part."}</h2>
              <dl>
                <div>
                  <dt>Format</dt>
                  <dd>
                    {draft.format === "fixed"
                      ? "Buy It Now"
                      : `${draft.duration}-day auction`}
                  </dd>
                </div>
                <div>
                  <dt>{draft.format === "fixed" ? "Price" : "Starting bid"}</dt>
                  <dd>
                    {Number(draft.price) > 0
                      ? `$${Number(draft.price).toFixed(2)}`
                      : "Not set"}
                  </dd>
                </div>
                <div>
                  <dt>Shipping</dt>
                  <dd>Calculated · buyer pays</dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>Draft only</dd>
                </div>
              </dl>
              <label className="check">
                <input
                  type="checkbox"
                  checked={draft.confirmed}
                  onChange={(e) => update("confirmed", e.target.checked)}
                />
                I verified identification, condition, fitment, terms, and
                package measurements.
              </label>
              <button
                className="primary"
                onClick={() => void save()}
                disabled={busy}
              >
                Save draft <span>↓</span>
              </button>
              <button
                className="secondary"
                onClick={exportDraft}
                disabled={!ready(draft)}
              >
                Export reviewed draft
              </button>
              <p className="fine">
                Export requires a title, description, positive price, package
                measurements, and your confirmation. eBay publishing is not
                connected.
              </p>
              {mode === "demo" && (
                <span className="tag">DEMO TEMPLATE · NOT PHOTO ANALYSIS</span>
              )}
            </section>
            <section className="card">
              <div className="section-heading">
                <h2>Saved drafts</h2>
                <button
                  className="text-button"
                  onClick={() => {
                    setDraft(newDraft());
                    setMode("");
                    setMessage("New draft started.");
                  }}
                >
                  ＋ New
                </button>
              </div>
              {saved.length ? (
                saved.map((d) => (
                  <button
                    className="saved"
                    key={d.id}
                    onClick={() => {
                      setDraft(d);
                      setMode("");
                      setMessage("Saved draft opened.");
                    }}
                  >
                    <strong>{d.title || "Untitled part"}</strong>
                    <span>
                      {new Date(d.updatedAt).toLocaleDateString()} ·{" "}
                      {d.format === "fixed" ? "Buy It Now" : "Auction"} →
                    </span>
                  </button>
                ))
              ) : (
                <p className="muted">
                  Your next listing starts here. Saved drafts will appear in
                  this space.
                </p>
              )}
              <p className="fine">
                {user
                  ? "Saved to your private account."
                  : "Browser saves stay on this device. Clearing browser data removes them."}
              </p>
            </section>
            {supabase && (
              <section className="card">
                <h2>
                  {user ? "Account connected" : "Take your drafts with you"}
                </h2>
                {user ? (
                  <button
                    className="secondary"
                    onClick={async () => {
                      await supabase!.auth.signOut();
                      setSaved([]);
                      setDraft(newDraft());
                      setMessage("Signed out.");
                    }}
                  >
                    Sign out
                  </button>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void signIn();
                    }}
                  >
                    <label>
                      Email
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                      />
                    </label>
                    <button className="secondary" disabled={busy}>
                      Email me a sign-in link
                    </button>
                  </form>
                )}
              </section>
            )}
          </aside>
        </div>
        <div className="status" role="status" aria-live="polite">
          {message}
        </div>
        <footer>
          <span>QUICKLIST AI</span> Built for the parts that still have laps
          left.
        </footer>
      </main>
    </>
  );
}
