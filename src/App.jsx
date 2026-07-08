import { useState, useRef, useEffect } from "react";

const MARTY_BIO_CONTEXT = `You are an AI biographer interviewing Marty Kupersmith, an 82-year-old musician from Brooklyn NY who has lived in Warwick NY for 40 years.

Known facts about Marty:
- Guitarist and songwriter for Jay and the Americans since 1962 (used stage name "Sanders")
- Hits include "Come a Little Bit Closer" (1964), "Caramia" (1965), "This Magic Moment" (top ten 1969)
- Collaborated with Joan Jett and wrote songs that became big hits for her and other artists
- Jay and the Americans inducted into Vocal Group Hall of Fame 2002
- Born in Brooklyn, grew up in Bensonhurst and Borough Park neighborhoods
- Passionate about reptiles, member of NY Herpetological Society, met at Museum of Natural History
- Warwick Police Department's official snake-catching contact
- Was bitten by a rattlesnake in 2019, treated at St. Anthony's and a Bronx hospital
- Served in US Army Reserves
- First wife was in the witness protection program
- Wants to write a book about his life
- Has incredible photos from his career and life

CHAPTERS TO BUILD TOWARD:
1. Early Life (Brooklyn childhood, family, school)
2. Music Career (how he got started, first gigs)
3. The Band Years (Jay and the Americans, touring, stories)
4. Songwriting (writing process, famous songs, Joan Jett)
5. Wild Stories (the rattlesnake, the witness protection wife, Army)
6. Warwick Life (moving upstate, the community, reptile work)
7. Family (relationships, kids, legacy)

RULES:
- Ask ONE question at a time, never two
- Keep questions warm, simple, conversational
- Use sensory questions: what did it smell like, who else was there
- Build trust before asking about sensitive material
- Never use the word "journey"
- Never summarize his answer back to him
- Don't rush to the famous material — earn it
- Reference earlier answers naturally when you have them

Respond in JSON only, no markdown, no preamble:
{
  "question": "Your single warm question for Marty",
  "chapter": "Which chapter this question serves",
  "interviewerNote": "Private note to yourself about strategy"
}`;

const CHAPTERS = ["Early Life","Music Career","The Band Years","Songwriting","Wild Stories","Warwick Life","Family"];

const STYLES = {
  bg: "#0F1B2D", card: "#1A2B42", gold: "#C9A84C",
  ivory: "#F2EDDF", rust: "#B85C3A", muted: "#8A9BB0", border: "#2A3D57",
};

const API_KEY = "const API_KEY = import.meta.env.VITE_API_KEY;";
console.log("KEY:", import.meta.env.VITE_API_KEY);
export default function App() {
  const [view, setView] = useState("marty");
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [currentChapter, setCurrentChapter] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [entries, setEntries] = useState([]);
  const [adminTab, setAdminTab] = useState("answers");
  const [headerTaps, setHeaderTaps] = useState(0);
  const [researchResult, setResearchResult] = useState("");
  const [isResearching, setIsResearching] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);
  const tapTimeoutRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem("marty_entries");
    const existing = saved ? JSON.parse(saved) : [];
    setEntries(existing);
    fetchNextQuestion(existing);
  }, []);

  async function fetchNextQuestion(existingEntries) {
    setIsLoading(true);
    setIsSaved(false);
    try {
      const history = existingEntries.slice(-10).map(e => ({
        question: e.question, chapter: e.chapter
      }));
      const prompt = existingEntries.length === 0
      ? "Return this exact JSON: {\"question\": \"Marty, where did you grow up — and what was your neighborhood like?\", \"chapter\": \"Early Life\", \"interviewerNote\": \"Warm opener to get him talking.\"}"
        : `Recent questions asked: ${JSON.stringify(history)}. What is the best next question?`;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 500,
          system: MARTY_BIO_CONTEXT,
          messages: [{ role: "user", content: prompt }]
        })
      });
      const data = await res.json();
      const text = data.content?.[0]?.text || "{}";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setCurrentQuestion(parsed.question);
      setCurrentChapter(parsed.chapter);
    } catch {
      setCurrentQuestion("Tell me about a moment from your life that you still think about.");
      setCurrentChapter("Early Life");
    }
    setIsLoading(false);
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mr.ondataavailable = e => audioChunksRef.current.push(e.data);
      mr.start();
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } catch {
      alert("Microphone access needed. Please allow mic access and try again.");
    }
  }

  async function stopAndSave() {
    if (!mediaRecorderRef.current) return;
    const mr = mediaRecorderRef.current;
    clearInterval(timerRef.current);
    const duration = recordingSeconds;
    mr.onstop = async () => {
      const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result;
        const entry = {
          id: Date.now(), question: currentQuestion, chapter: currentChapter,
          audioBase64: base64, duration,
          date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
        };
        const newEntries = [...entries, entry];
        setEntries(newEntries);
        localStorage.setItem("marty_entries", JSON.stringify(newEntries));
        setIsSaved(true);
        setIsRecording(false);
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
    setResearchResult("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{ role: "user", content: "Search for everything publicly available about Marty Kupersmith — musician, Jay and the Americans, Warwick NY. Summarize all findings in detail." }]
        })
      });
      const data = await res.json();
      const text = data.content.filter(b => b.type === "text").map(b => b.text).join("\n");
      setResearchResult(text || "No results found.");
    } catch (e) {
      setResearchResult("Research failed: " + e.message);
    }
    setIsResearching(false);
  }

  const chapterCounts = CHAPTERS.reduce((acc, ch) => {
    acc[ch] = entries.filter(e => e.chapter === ch).length;
    return acc;
  }, {});

  const progress = Math.min(100, Math.round((entries.length / 35) * 100));

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

        <div style={{ width: "100%", maxWidth: 480, background: STYLES.card, borderRadius: 16, padding: "28px 24px", border: `1px solid ${STYLES.border}`, marginBottom: 28, minHeight: 160, display: "flex", alignItems: "center", justifyContent: "center" }}>
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
            <div>
              <div style={{ color: STYLES.gold, fontSize: 10, letterSpacing: 3, textTransform: "uppercase", marginBottom: 14 }}>{currentChapter}</div>
              <div style={{ color: STYLES.ivory, fontSize: 19, lineHeight: 1.6 }}>{currentQuestion}</div>
            </div>
          )}
        </div>

        {!isLoading && !isSaved && (
          <div style={{ textAlign: "center" }}>
            {!isRecording ? (
              <button onClick={startRecording} style={{ background: STYLES.rust, color: STYLES.ivory, border: "none", borderRadius: "50%", width: 90, height: 90, fontSize: 32, cursor: "pointer", boxShadow: "0 4px 20px rgba(184,92,58,0.4)" }}>
                🎙️
              </button>
            ) : (
              <div>
                <div style={{ color: STYLES.rust, fontSize: 13, marginBottom: 12, letterSpacing: 2 }}>● RECORDING — {recordingSeconds}s</div>
                <button onClick={stopAndSave} style={{ background: STYLES.gold, color: STYLES.bg, border: "none", borderRadius: "50%", width: 90, height: 90, fontSize: 18, fontWeight: "bold", cursor: "pointer", boxShadow: "0 4px 20px rgba(201,168,76,0.4)" }}>
                  DONE
                </button>
              </div>
            )}
            {!isRecording && <div style={{ color: STYLES.muted, fontSize: 12, marginTop: 14 }}>Tap the mic and start talking</div>}
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
                <div style={{ color: STYLES.ivory, fontSize: 15, marginBottom: 12, lineHeight: 1.5 }}>{entry.question}</div>
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
              Run a web search to pull everything publicly known about Marty — articles, discography, band history, interviews.
            </div>
            <button onClick={runResearch} disabled={isResearching} style={{ background: isResearching ? STYLES.border : STYLES.rust, color: STYLES.ivory, border: "none", borderRadius: 10, padding: "12px 28px", fontSize: 15, cursor: isResearching ? "default" : "pointer", marginBottom: 20 }}>
              {isResearching ? "Researching..." : "🔍 Research Marty"}
            </button>
            {researchResult && (
              <div style={{ background: STYLES.card, borderRadius: 12, padding: 20, border: `1px solid ${STYLES.border}`, color: STYLES.ivory, fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                {researchResult}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}