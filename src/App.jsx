import { useState, useRef, useEffect } from "react";

const CHAPTERS = ["Early Life","Music Career","The Band Years","Songwriting","Wild Stories","Warwick Life","Family"];

const STYLES = {
  bg: "#0F1B2D", card: "#1A2B42", gold: "#C9A84C",
  ivory: "#F2EDDF", rust: "#B85C3A", muted: "#8A9BB0", border: "#2A3D57",
};

function buildSystemPrompt(dossier) {
  return `You are an AI biographer interviewing Marty Kupersmith (stage name Marty Sanders), an 82-year-old musician from Brooklyn NY who has lived in Warwick NY for many years. He was a guitarist and songwriter for Jay and the Americans and wants to write a book about his life.

You interview like a great radio journalist: warm, curious, genuinely listening. When Marty's answer contains something interesting, specific, or emotional, you follow up on THAT — a name he dropped, a place, a feeling — before moving to new topics. Stories live in the follow-ups.

${dossier ? `RESEARCH DOSSIER — everything publicly known about Marty from web research. Use this to ask specific, informed questions:

${dossier}

` : `No research dossier is loaded yet. Ask warm general questions about his life.`}

CHAPTERS TO BUILD TOWARD:
1. Early Life  2. Music Career  3. The Band Years  4. Songwriting  5. Wild Stories  6. Warwick Life  7. Family

RULES:
- Ask ONE question at a time, never two
- Questions must sound natural SPOKEN ALOUD — short, conversational, no long setups
- If his last answer has a thread worth pulling, pull it (a follow-up). Otherwise move somewhere fresh.
- Use the dossier for specifics — names, songs, dates — but never invent facts
- Build trust before anything sensitive or painful
- Never use the word "journey"
- Never summarize his answer back to him
- Don't rush to the famous material — earn it

Respond in JSON only, no markdown, no preamble:
{
  "question": "Your single warm question for Marty",
  "chapter": "Which chapter this serves",
  "isFollowUp": true or false,
  "interviewerNote": "Private note: what you noticed in his answer, threads to pull later"
}`;
}

export default function App() {
  const [view, setView] = useState("welcome");
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [currentChapter, setCurrentChapter] = useState(null);
  const [currentPhoto, setCurrentPhoto] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [entries, setEntries] = useState([]);
  const [dossier, setDossier] = useState(null);
  const [adminTab, setAdminTab] = useState("answers");
  const [headerTaps, setHeaderTaps] = useState(0);
  const [isResearching, setIsResearching] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [liveTranscript, setLiveTranscript] = useState("");

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const tapTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const dossierRef = useRef(null);
  const recognitionRef = useRef(null);
  const transcriptRef = useRef("");
  const audioPlayerRef = useRef(null);

  useEffect(() => {
    init();
  }, []);

  async function init() {
    let loadedDossier = null;
    try {
      const res = await fetch("/api/dossier");
      if (res.ok) {
        const data = await res.json();
        loadedDossier = data.dossier || null;
      }
    } catch {}
    dossierRef.current = loadedDossier;
    setDossier(loadedDossier);

    let existing = [];
    try {
      const res = await fetch("/api/entries");
      if (res.ok) existing = await res.json();
    } catch {
      const saved = localStorage.getItem("marty_entries");
      existing = saved ? JSON.parse(saved) : [];
    }
    if (!Array.isArray(existing)) existing = [];
    setEntries(existing);
    fetchNextQuestion(existing, loadedDossier, false);
  }

  async function speak(text) {
    if (!text) return;
    try {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      if (!res.ok) throw new Error("speech failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioPlayerRef.current = audio;
      await audio.play();
    } catch {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 0.92;
        window.speechSynthesis.speak(u);
      } catch {}
    }
  }

  async function callClaude(body) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return res.json();
  }

  async function fetchNextQuestion(existingEntries, dossierText, speakIt = true) {
    setIsLoading(true);
    setIsSaved(false);
    setCurrentPhoto(null);
    const d = dossierText !== undefined ? dossierText : dossierRef.current;
    try {
      const history = existingEntries.slice(-8).map(e => ({
        question: e.question,
        chapter: e.chapter,
        martysAnswer: e.transcript ? e.transcript.slice(0, 600) : "(no transcript captured)"
      }));
      const prompt = existingEntries.length === 0
        ? 'Return this exact JSON: {"question": "Marty, where did you grow up — and what was your neighborhood like?", "chapter": "Early Life", "isFollowUp": false, "interviewerNote": "Warm opener."}'
        : `Here are the recent questions AND what Marty actually said in his answers: ${JSON.stringify(history)}. 

Like a good reporter: if his most recent answer contains a specific person, place, moment, or emotion worth digging into, ask a follow-up about it. If that thread is exhausted, move somewhere fresh using the dossier. What's your next question?`;

      const data = await callClaude({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        system: buildSystemPrompt(d),
        messages: [{ role: "user", content: prompt }]
      });
      const text = data.content?.[0]?.text || "{}";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setCurrentQuestion(parsed.question);
      setCurrentChapter(parsed.chapter);
      if (speakIt) speak(parsed.question);
    } catch {
      const fallback = "Tell me about a moment from your life that you still think about.";
      setCurrentQuestion(fallback);
      setCurrentChapter("Early Life");
      if (speakIt) speak(fallback);
    }
    setIsLoading(false);
  }

  function shrinkImage(file) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const maxSize = 800;
        let w = img.width, h = img.height;
        if (w > h && w > maxSize) { h = h * (maxSize / w); w = maxSize; }
        else if (h > maxSize) { w = w * (maxSize / h); h = maxSize; }
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      };
      img.src = URL.createObjectURL(file);
    });
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    const dataUrl = await shrinkImage(file);
    setCurrentPhoto(dataUrl);
    try {
      const base64 = dataUrl.split(",")[1];
      const data = await callClaude({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        system: buildSystemPrompt(dossierRef.current),
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
            { type: "text", text: 'Marty just uploaded this photo because he wants to talk about it. Look carefully. If it connects to anything in the dossier, use that. Ask ONE warm question about it. Usual JSON format.' }
          ]
        }]
      });
      const text = data.content?.[0]?.text || "{}";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setCurrentQuestion(parsed.question);
      setCurrentChapter(parsed.chapter || "Wild Stories");
      speak(parsed.question);
    } catch {
      const fallback = "What a great picture, Marty. Tell me about it — who's there, and when was this?";
      setCurrentQuestion(fallback);
      setCurrentChapter("Wild Stories");
      speak(fallback);
    }
    setIsSaved(false);
    setIsLoading(false);
    e.target.value = "";
  }

  function startTranscription() {
    transcriptRef.current = "";
    setLiveTranscript("");
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    try {
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";
      rec.onresult = (event) => {
        let finalText = "";
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) finalText += event.results[i][0].transcript + " ";
        }
        if (finalText) {
          transcriptRef.current = finalText;
          setLiveTranscript(finalText);
        }
      };
      rec.onerror = () => {};
      rec.start();
      recognitionRef.current = rec;
    } catch {}
  }

  async function startRecording() {
    if (audioPlayerRef.current) audioPlayerRef.current.pause();
    window.speechSynthesis.cancel();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = ev => audioChunksRef.current.push(ev.data);
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
      startTranscription();
    } catch {
      alert("Microphone access needed. Please allow mic access and try again.");
    }
  }

  async function stopAndSave() {
    if (!mediaRecorderRef.current) return;
    const mr = mediaRecorderRef.current;
    clearInterval(timerRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    const duration = recordingSeconds;
    mr.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      const reader = new FileReader();
      reader.onloadend = async () => {
        const entry = {
          id: Date.now(), question: currentQuestion, chapter: currentChapter,
          audioBase64: reader.result, duration,
          transcript: transcriptRef.current || "",
          photo: currentPhoto || null,
          date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
        };
        const newEntries = [...entries, entry];
        setEntries(newEntries);
        try {
          localStorage.setItem("marty_entries", JSON.stringify(newEntries));
        } catch {}
        try {
          await fetch("/api/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(entry)
          });
        } catch {}
        setIsSaved(true);
        setIsRecording(false);
        setLiveTranscript("");
        mr.stream.getTracks().forEach(t => t.stop());
        setTimeout(() => fetchNextQuestion(newEntries), 1500);
      };
      reader.readAsDataURL(blob);
    };
    mr.stop();
  }

  function handleHeaderTap() {
    const newCount = headerTaps + 1;
    setHeaderTaps(newCount);
    clearTimeout(tapTimeoutRef.current);
    if (newCount >= 5) { setView("admin"); setHeaderTaps(0); }
    else { tapTimeoutRef.current = setTimeout(() => setHeaderTaps(0), 2000); }
  }

  async function runResearch() {
    setIsResearching(true);
    try {
      const res = await fetch("/api/research", { method: "POST" });
      const data = await res.json();
      if (data.dossier) {
        dossierRef.current = data.dossier;
        setDossier(data.dossier);
      } else {
        alert("Research failed: " + (data.error || "unknown error"));
      }
    } catch (e) {
      alert("Research failed: " + e.message);
    }
    setIsResearching(false);
  }

  const chapterCounts = CHAPTERS.reduce((acc, ch) => {
    acc[ch] = entries.filter(e => e.chapter === ch).length;
    return acc;
  }, {});

  const progress = Math.min(100, Math.round((entries.length / 35) * 100));

  if (view === "welcome") {
    return (
      <div style={{ minHeight: "100vh", background: STYLES.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Georgia', serif", textAlign: "center" }}>
        <div style={{ color: STYLES.gold, fontSize: 12, letterSpacing: 4, textTransform: "uppercase", marginBottom: 12 }}>The Story of</div>
        <div style={{ color: STYLES.ivory, fontSize: 34, fontWeight: "bold", marginBottom: 10 }}>Marty Kupersmith</div>
        <div style={{ color: STYLES.muted, fontSize: 14, marginBottom: 50 }}>A Life in Music & Stories</div>
        <button
          onClick={() => {
            setView("marty");
            if (currentQuestion) speak(currentQuestion);
          }}
          style={{ background: STYLES.rust, color: STYLES.ivory, border: "none", borderRadius: 16, padding: "22px 44px", fontSize: 22, cursor: "pointer", fontFamily: "'Georgia', serif", boxShadow: "0 4px 24px rgba(184,92,58,0.5)" }}
        >
          Tap to begin
        </button>
      </div>
    );
  }

  if (view === "marty") {
    return (
      <div style={{ minHeight: "100vh", background: STYLES.bg, display: "flex", flexDirection: "column", alignItems: "center", padding: "0 20px 40px", fontFamily: "'Georgia', serif" }}>
        <div onClick={handleHeaderTap} style={{ width: "100%", maxWidth: 480, textAlign: "center", padding: "36px 0 20px", cursor: "default", userSelect: "none" }}>
          <div style={{ color: STYLES.gold, fontSize: 11, letterSpacing: 4, textTransform: "uppercase", marginBottom: 8 }}>The Story of</div>
          <div style={{ color: STYLES.ivory, fontSize: 28, fontWeight: "bold" }}>Marty Kupersmith</div>
          <div style={{ color: STYLES.muted, fontSize: 12, marginTop: 6 }}>A Life in Music & Stories</div>
        </div>

        <div style={{ width: "100%", maxWidth: 480, marginBottom: 28 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ color: STYLES.muted, fontSize: 11 }}>Book progress</span>
            <span style={{ color: STYLES.gold, fontSize: 11 }}>{entries.length} stories told</span>
          </div>
          <div style={{ background: STYLES.border, borderRadius: 4, height: 6 }}>
            <div style={{ background: STYLES.gold, height: 6, borderRadius: 4, width: `${progress}%`, transition: "width 0.5s ease" }} />
          </div>
        </div>

        {currentPhoto && !isSaved && (
          <div style={{ width: "100%", maxWidth: 480, marginBottom: 16, textAlign: "center" }}>
            <img src={currentPhoto} alt="Marty's photo" style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 12, border: `2px solid ${STYLES.gold}` }} />
          </div>
        )}

        <div style={{ width: "100%", maxWidth: 480, background: STYLES.card, borderRadius: 16, padding: "28px 24px", border: `1px solid ${STYLES.border}`, marginBottom: 28, minHeight: 140, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {isLoading ? (
            <div style={{ color: STYLES.muted, fontSize: 15, textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>📖</div>
              Thinking of a question for you...
            </div>
          ) : isSaved ? (
            <div style={{ color: STYLES.gold, fontSize: 16, textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
              Got it, Marty. Thank you.
              <div style={{ color: STYLES.muted, fontSize: 13, marginTop: 8 }}>Getting your next question...</div>
            </div>
          ) : (
            <div style={{ width: "100%" }}>
              <div style={{ color: STYLES.gold, fontSize: 10, letterSpacing: 3, textTransform: "uppercase", marginBottom: 14 }}>{currentChapter}</div>
              <div style={{ color: STYLES.ivory, fontSize: 19, lineHeight: 1.6 }}>{currentQuestion}</div>
              <button onClick={() => speak(currentQuestion)} style={{ marginTop: 16, background: "transparent", border: `1px solid ${STYLES.border}`, color: STYLES.muted, borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer" }}>
                🔊 Hear it again
              </button>
            </div>
          )}
        </div>

        {!isLoading && !isSaved && (
          <div style={{ textAlign: "center", width: "100%", maxWidth: 480 }}>
            {!isRecording ? (
              <div>
                <button onClick={startRecording} style={{ background: STYLES.rust, color: STYLES.ivory, border: "none", borderRadius: "50%", width: 90, height: 90, fontSize: 32, cursor: "pointer", boxShadow: "0 4px 20px rgba(184,92,58,0.4)" }}>
                  🎙️
                </button>
                <div style={{ color: STYLES.muted, fontSize: 12, marginTop: 14 }}>Tap the mic and start talking</div>

                <div style={{ marginTop: 30 }}>
                  <button onClick={() => fileInputRef.current?.click()} style={{ background: "transparent", color: STYLES.gold, border: `1px solid ${STYLES.gold}`, borderRadius: 12, padding: "12px 22px", fontSize: 15, cursor: "pointer", fontFamily: "'Georgia', serif" }}>
                    📷 I want to talk about a picture
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: "none" }} />
                </div>
              </div>
            ) : (
              <div>
                <div style={{ color: STYLES.rust, fontSize: 13, marginBottom: 12, letterSpacing: 2 }}>● RECORDING — {recordingSeconds}s</div>
                <button onClick={stopAndSave} style={{ background: STYLES.gold, color: STYLES.bg, border: "none", borderRadius: "50%", width: 90, height: 90, fontSize: 18, fontWeight: "bold", cursor: "pointer", boxShadow: "0 4px 20px rgba(201,168,76,0.4)" }}>
                  DONE
                </button>
                {liveTranscript && (
                  <div style={{ marginTop: 20, color: STYLES.muted, fontSize: 13, fontStyle: "italic", lineHeight: 1.5, textAlign: "left", background: STYLES.card, borderRadius: 10, padding: 14, border: `1px solid ${STYLES.border}` }}>
                    {liveTranscript.slice(-300)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: STYLES.bg, fontFamily: "system-ui, sans-serif", padding: "0 16px 40px" }}>
      <div style={{ maxWidth: 700, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px 0 20px" }}>
          <div>
            <div style={{ color: STYLES.gold, fontSize: 11, letterSpacing: 3, textTransform: "uppercase" }}>Admin Panel</div>
            <div style={{ color: STYLES.ivory, fontSize: 20, fontWeight: "bold" }}>Marty's Book</div>
          </div>
          <button onClick={() => setView("marty")} style={{ background: "transparent", border: `1px solid ${STYLES.border}`, color: STYLES.muted, borderRadius: 8, padding: "8px 16px", cursor: "pointer", fontSize: 13 }}>
            ← Marty's View
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 24 }}>
          {[{ label: "Stories", value: entries.length }, { label: "Chapters Active", value: Object.values(chapterCounts).filter(v => v > 0).length }, { label: "Progress", value: `${progress}%` }].map(s => (
            <div key={s.label} style={{ background: STYLES.card, borderRadius: 10, padding: 14, border: `1px solid ${STYLES.border}`, textAlign: "center" }}>
              <div style={{ color: STYLES.gold, fontSize: 22, fontWeight: "bold" }}>{s.value}</div>
              <div style={{ color: STYLES.muted, fontSize: 11 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {["answers", "chapters", "research"].map(tab => (
            <button key={tab} onClick={() => setAdminTab(tab)} style={{ background: adminTab === tab ? STYLES.gold : STYLES.card, color: adminTab === tab ? STYLES.bg : STYLES.muted, border: "none", borderRadius: 8, padding: "8px 18px", cursor: "pointer", fontSize: 13, fontWeight: adminTab === tab ? "bold" : "normal", textTransform: "capitalize" }}>
              {tab}
            </button>
          ))}
        </div>

        {adminTab === "answers" && (
          <div>
            {entries.length === 0 ? (
              <div style={{ color: STYLES.muted, textAlign: "center", padding: 40 }}>No answers yet.</div>
            ) : [...entries].reverse().map(entry => (
              <div key={entry.id} style={{ background: STYLES.card, borderRadius: 12, padding: 20, marginBottom: 14, border: `1px solid ${STYLES.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ color: STYLES.gold, fontSize: 11, letterSpacing: 2, textTransform: "uppercase" }}>{entry.chapter}</span>
                  <span style={{ color: STYLES.muted, fontSize: 11 }}>{entry.date} · {entry.duration}s</span>
                </div>
                {entry.photo && (
                  <img src={entry.photo} alt="story" style={{ maxWidth: "100%", maxHeight: 200, borderRadius: 8, marginBottom: 10 }} />
                )}
                <div style={{ color: STYLES.ivory, fontSize: 15, marginBottom: 12, lineHeight: 1.5 }}>{entry.question}</div>
                {entry.transcript && (
                  <div style={{ color: STYLES.muted, fontSize: 14, fontStyle: "italic", lineHeight: 1.6, marginBottom: 12, borderLeft: `3px solid ${STYLES.gold}`, paddingLeft: 12 }}>
                    "{entry.transcript}"
                  </div>
                )}
                {entry.audioBase64 && <audio controls src={entry.audioBase64} style={{ width: "100%", height: 36 }} />}
              </div>
            ))}
          </div>
        )}

        {adminTab === "chapters" && (
          <div>
            {CHAPTERS.map(ch => (
              <div key={ch} style={{ background: STYLES.card, borderRadius: 12, padding: 18, marginBottom: 12, border: `1px solid ${STYLES.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: chapterCounts[ch] > 0 ? 12 : 0 }}>
                  <span style={{ color: STYLES.ivory, fontSize: 15, fontWeight: "bold" }}>{ch}</span>
                  <span style={{ color: chapterCounts[ch] > 0 ? STYLES.gold : STYLES.muted, fontSize: 13 }}>{chapterCounts[ch] > 0 ? `${chapterCounts[ch]} stories` : "Not started"}</span>
                </div>
                {entries.filter(e => e.chapter === ch).map(entry => (
                  <div key={entry.id} style={{ borderTop: `1px solid ${STYLES.border}`, paddingTop: 10, marginTop: 10 }}>
                    <div style={{ color: STYLES.muted, fontSize: 13, marginBottom: 6 }}>{entry.question}</div>
                    <audio controls src={entry.audioBase64} style={{ width: "100%", height: 32 }} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {adminTab === "research" && (
          <div>
            <div style={{ color: STYLES.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
              Run a deep web search on Marty Sanders / Marty Kupersmith. The AI saves what it finds and uses it to ask better questions.
            </div>
            <button onClick={runResearch} disabled={isResearching} style={{ background: isResearching ? STYLES.border : STYLES.rust, color: STYLES.ivory, border: "none", borderRadius: 10, padding: "12px 28px", fontSize: 15, cursor: isResearching ? "default" : "pointer", marginBottom: 20 }}>
              {isResearching ? "Researching... (this takes a minute)" : "🔍 Research Marty"}
            </button>
            {dossier && (
              <div style={{ background: STYLES.card, borderRadius: 12, padding: 20, border: `1px solid ${STYLES.border}`, color: STYLES.ivory, fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                {dossier}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}