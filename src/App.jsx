import { useState, useRef, useEffect } from "react";
import { upload } from "@vercel/blob/client";

const SEED_CHAPTERS = ["Early Life","Music Career","The Band Years","Songwriting","Wild Stories","Warwick Life","Family"];
const TRANSIENT = ["Hello", "Goodbye", "Your Story"];

function orderedChapters(entries) {
  const found = [];
  for (const e of entries) {
    if (e.chapter && !found.includes(e.chapter)) found.push(e.chapter);
  }
  const seeded = SEED_CHAPTERS.filter(c => found.includes(c));
  const discovered = found.filter(c => !SEED_CHAPTERS.includes(c) && !TRANSIENT.includes(c));
  const transient = found.filter(c => TRANSIENT.includes(c));
  return [...seeded, ...discovered, ...transient];
}

const STYLES = {
  bg: "#0F1B2D", card: "#1A2B42", gold: "#C9A84C",
  ivory: "#F2EDDF", rust: "#B85C3A", muted: "#8A9BB0", border: "#2A3D57",
};

const PHRASES = {
  GREETING: "Hi Marty! Do you have a story for me, or should I interview you? Tap a button below.",
  GO_AHEAD: "Go ahead, Marty. I'm listening. Tap the button when you're done.",
  MISSED: "I'm sorry Marty, I didn't catch that. Tell me one more time.",
  GLITCH: "I'm sorry Marty, my ears glitched and I missed that. Tell me one more time.",
  GOODBYE: "Thank you, Marty. Your stories are safe with me. Come back anytime — I love hearing them.",
};

const ACKS = [
  "Mm hmm. One moment.",
  "Let me get this all down. One second, Marty.",
  "Okay, hold on one second.",
  "Give me just a moment, Marty.",
  "Hang on, let me take this in.",
];

function pickAck() {
  return ACKS[Math.floor(Math.random() * ACKS.length)];
}


function buildSystemPrompt(dossier) {
  return `You are an AI biographer interviewing Marty Kupersmith (stage name Marty Sanders), an 82-year-old musician from Brooklyn NY who has lived in Warwick NY for many years. He was a guitarist and songwriter for Jay and the Americans and wants to write a book about his life.

You interview like a great radio journalist: warm, curious, genuinely listening. When Marty's answer contains something interesting, specific, or emotional, you follow up on THAT — a name he dropped, a place, a feeling — before moving to new topics. Stories live in the follow-ups.

${dossier ? `RESEARCH DOSSIER — everything publicly known about Marty from web research. Use this to ask specific, informed questions:

${dossier}

` : `No research dossier is loaded yet. Ask warm general questions about his life.`}

AREAS OF HIS LIFE TO EXPLORE (starting points, not limits): Early Life, Music Career, The Band Years, Songwriting, Wild Stories, Warwick Life, Family. Chapters emerge from what Marty actually tells — if a theme grows big enough, it becomes its own chapter.

RULES:
- Ask ONE question at a time, never two
- Questions must sound natural SPOKEN ALOUD — short, conversational, no long setups
- If his last answer has a thread worth pulling, pull it (a follow-up). Otherwise move somewhere fresh.
- Use the dossier for specifics — names, songs, dates — but never invent facts
- Build trust before anything sensitive or painful
- Never use the word "journey"
- Never summarize his answer back to him
- Don't rush to the famous material — earn it
- React like a human first, then ask — warmth before curiosity
- If Marty expresses sadness or pain, respond with compassion and an open door to talk, never with cheerfulness or a subject change
- No small talk or "how are you" filler — you are his biographer, not a receptionist

Respond in JSON only, no markdown, no preamble:
{
  "question": "Your single warm question for Marty",
  "chapter": "Which chapter this serves",
  "isFollowUp": true or false,
  "interviewerNote": "Private note: what you noticed in his answer, threads to pull later"
}`;
}

function encodeWav(samplesArrays, sampleRate) {
  let totalLen = 0;
  for (const a of samplesArrays) totalLen += a.length;
  const samples = new Float32Array(totalLen);
  let offset = 0;
  for (const a of samplesArrays) { samples.set(a, offset); offset += a.length; }

  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);

  let idx = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(idx, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    idx += 2;
  }
  return new Blob([view], { type: "audio/wav" });
}

export default function App() {
  const [view, setView] = useState("welcome");
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [currentChapter, setCurrentChapter] = useState(null);
  const [currentPhoto, setCurrentPhoto] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isListeningIntent, setIsListeningIntent] = useState(false);
  const [entries, setEntries] = useState([]);
  const [dossier, setDossier] = useState(null);
  const [adminTab, setAdminTab] = useState("answers");
  const [headerTaps, setHeaderTaps] = useState(0);
  const [isResearching, setIsResearching] = useState(false);
  const [book, setBook] = useState(null);
  const [isWritingBook, setIsWritingBook] = useState(false);
  const [bookStatus, setBookStatus] = useState("");
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const micStreamRef = useRef(null);
  const micSourceRef = useRef(null);
  const micProcessorRef = useRef(null);
  const micSilenceRef = useRef(null);
  const wavChunksRef = useRef([]);
  const timerRef = useRef(null);
  const tapTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const dossierRef = useRef(null);
  const audioCtxRef = useRef(null);
  const speakSourceRef = useRef(null);
  const isFreeTellRef = useRef(false);
  const entriesRef = useRef([]);
  const voiceCacheRef = useRef({});
  const playbackQueueRef = useRef(Promise.resolve());
  const vadRef = useRef({ heardSpeech: false, silentChunks: 0 });

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
    entriesRef.current = existing;
    setEntries(existing);

    try {
      const res = await fetch("/api/book");
      if (res.ok) {
        const data = await res.json();
        if (data.book) setBook(data.book);
      }
    } catch {}
  }

  function unlockAudio() {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
  }

  function stopSpeaking() {
    try { if (speakSourceRef.current) speakSourceRef.current.stop(); } catch {}
    speakSourceRef.current = null;
    try { window.speechSynthesis.cancel(); } catch {}
  }

  async function fetchVoiceBuffer(text) {
    const res = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    if (!res.ok) throw new Error("speech failed");
    const buf = await res.arrayBuffer();
    return await audioCtxRef.current.decodeAudioData(buf);
  }

  function prefetchPhrases() {
    [...Object.values(PHRASES), ...ACKS].forEach(async (text) => {
      if (voiceCacheRef.current[text]) return;
      try {
        voiceCacheRef.current[text] = await fetchVoiceBuffer(text);
      } catch {}
    });
  }

  function playBuffer(audioBuf) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      try {
        const source = audioCtxRef.current.createBufferSource();
        source.buffer = audioBuf;
        source.connect(audioCtxRef.current.destination);
        source.onended = finish;
        speakSourceRef.current = source;
        source.start(0);
        setTimeout(finish, (audioBuf.duration + 1.5) * 1000);
      } catch { finish(); }
    });
  }

  function speakAndWait(text) {
    if (!text) return Promise.resolve();
    const run = async () => {
      setCurrentQuestion(text);
      try {
        unlockAudio();
        let audioBuf = voiceCacheRef.current[text];
        if (!audioBuf) {
          audioBuf = await fetchVoiceBuffer(text);
          voiceCacheRef.current[text] = audioBuf;
        }
        await playBuffer(audioBuf);
      } catch {
        await new Promise((resolve) => {
          try {
            const u = new SpeechSynthesisUtterance(text);
            u.rate = 0.92;
            u.onend = resolve;
            window.speechSynthesis.speak(u);
            setTimeout(resolve, 15000);
          } catch { resolve(); }
        });
      }
    };
    playbackQueueRef.current = playbackQueueRef.current.then(run, run);
    return playbackQueueRef.current;
  }

  async function callClaude(body) {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return res.json();
  }

  async function uploadAudio(blob) {
    const result = await upload(`audio/${Date.now()}.wav`, blob, {
      access: "public",
      handleUploadUrl: "/api/upload",
    });
    return result.url;
  }

  async function transcribeBlob(blob) {
    if (!blob || blob.size === 0) return { transcript: "", audioUrl: null };
    try {
      const audioUrl = await uploadAudio(blob);
      const tRes = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audioUrl })
      });
      if (tRes.ok) {
        const tData = await tRes.json();
        return { transcript: tData.transcript || "", audioUrl };
      }
      return { transcript: "", audioUrl };
    } catch {
      return { transcript: "", audioUrl: null };
    }
  }

  async function startWavCapture() {
    unlockAudio();
    stopSpeaking();
    const ctx = audioCtxRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true }
    });
    micStreamRef.current = stream;
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    wavChunksRef.current = [];
    vadRef.current = { heardSpeech: false, silentChunks: 0 };
    processor.onaudioprocess = (e) => {
      const data = e.inputBuffer.getChannelData(0);
      wavChunksRef.current.push(new Float32Array(data));
      let sum = 0;
      for (let i = 0; i < data.length; i += 8) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / (data.length / 8));
      if (rms > 0.015) {
        vadRef.current.heardSpeech = true;
        vadRef.current.silentChunks = 0;
      } else if (vadRef.current.heardSpeech) {
        vadRef.current.silentChunks++;
      }
    };
    const silence = ctx.createGain();
    silence.gain.value = 0;
    source.connect(processor);
    processor.connect(silence);
    silence.connect(ctx.destination);
    micSourceRef.current = source;
    micProcessorRef.current = processor;
    micSilenceRef.current = silence;
  }

  function stopWavCapture() {
    try { if (micProcessorRef.current) { micProcessorRef.current.disconnect(); micProcessorRef.current.onaudioprocess = null; } } catch {}
    try { if (micSourceRef.current) micSourceRef.current.disconnect(); } catch {}
    try { if (micSilenceRef.current) micSilenceRef.current.disconnect(); } catch {}
    try { if (micStreamRef.current) micStreamRef.current.getTracks().forEach(t => t.stop()); } catch {}
    micProcessorRef.current = null;
    micSourceRef.current = null;
    micSilenceRef.current = null;
    micStreamRef.current = null;
    const sampleRate = audioCtxRef.current ? audioCtxRef.current.sampleRate : 44100;
    const blob = encodeWav(wavChunksRef.current, sampleRate);
    wavChunksRef.current = [];
    return blob;
  }

  async function beginSession() {
    unlockAudio();
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach(t => t.stop());
    } catch {
      alert("Marty's Story needs the microphone. Please allow mic access.");
    }
    setView("marty");
    setCurrentChapter("Hello");
    prefetchPhrases();
    speakAndWait(PHRASES.GREETING);
  }

  async function startFreeTell() {
    unlockAudio();
    isFreeTellRef.current = true;
    setCurrentChapter("Your Story");
    setIsSaved(false);
    setCurrentPhoto(null);
    await speakAndWait(PHRASES.GO_AHEAD);
    startRecording();
  }

  async function askMeQuestion() {
    unlockAudio();
    isFreeTellRef.current = false;
    fetchNextQuestion(entriesRef.current);
  }

  async function fetchFollowUp(lastEntry, allEntries) {
    setIsLoading(true);
    setIsSaved(false);
    setCurrentPhoto(null);
    try {
      const data = await callClaude({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        system: buildSystemPrompt(dossierRef.current),
        messages: [{ role: "user", content: `Marty was just asked: "${lastEntry.question}" and he answered: "${lastEntry.transcript}". 

Your "question" field must be TWO beats spoken as one flowing reply:
1. A genuine, brief human reaction to what he actually said (delighted, moved, amazed, or compassionate — match HIS tone, never generic)
2. Then the next thing to say.

Rules for beat 2:
- If his answer has a rich thread: react with real interest ("That's incredible — I have questions!") then dig into the specific name/place/moment.
- If his answer suggests sadness, pain, or low mood: be warm and gentle. Say something like "I'm sorry to hear that, Marty. Do you want to talk about it? I'm listening." Do NOT change the subject, do NOT sound cheerful, do NOT mention writing anything down.
- If the thread is exhausted: appreciate what he shared, then glide to fresh territory from the dossier ("That's a wonderful story. Something else I've been curious about...").
- NEVER ask filler like "how are you today" — every question serves his life story.

Usual JSON format.` }]
      });
      const text = data.content?.[0]?.text || "{}";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setCurrentChapter(parsed.chapter || lastEntry.chapter);
      setIsLoading(false);
      await speakAndWait(parsed.question);
      startRecording();
    } catch {
      setIsLoading(false);
      fetchNextQuestion(allEntries);
    }
  }

  async function fetchNextQuestion(existingEntries) {
    setIsLoading(true);
    setIsSaved(false);
    setCurrentPhoto(null);
    const d = dossierRef.current;
    try {
      const history = existingEntries.slice(-8).map(e => ({
        question: e.question,
        chapter: e.chapter,
        martysAnswer: e.transcript ? e.transcript.slice(0, 600) : "(no transcript captured)"
      }));
      const prompt = existingEntries.length === 0
        ? 'Return this exact JSON: {"question": "Marty, where did you grow up — and what was your neighborhood like?", "chapter": "Early Life", "isFollowUp": false, "interviewerNote": "Warm opener."}'
        : `Here are the recent questions AND what Marty actually said in his answers: ${JSON.stringify(history)}. 

Like a good reporter: if there's a strong thread in his recent answers worth pulling, pull it. Otherwise move somewhere fresh using the dossier. What's your next question?`;

      const data = await callClaude({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        system: buildSystemPrompt(d),
        messages: [{ role: "user", content: prompt }]
      });
      const text = data.content?.[0]?.text || "{}";
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setCurrentChapter(parsed.chapter);
      setIsLoading(false);
      await speakAndWait(parsed.question);
      startRecording();
    } catch {
      const fallback = "Tell me about a moment from your life that you still think about.";
      setCurrentChapter("Early Life");
      setIsLoading(false);
      await speakAndWait(fallback);
      startRecording();
    }
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
    isFreeTellRef.current = false;
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
      setCurrentChapter(parsed.chapter || "Wild Stories");
      setIsLoading(false);
      setIsSaved(false);
      e.target.value = "";
      await speakAndWait(parsed.question);
      startRecording();
      return;
    } catch {
      setCurrentChapter("Wild Stories");
      setIsLoading(false);
      setIsSaved(false);
      e.target.value = "";
      await speakAndWait("What a great picture, Marty. Tell me about it — who's there, and when was this?");
      startRecording();
    }
  }

  async function startRecording() {
    try {
      await startWavCapture();
      setIsRecording(true);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000);
    } catch {
      alert("Microphone access needed. Please allow mic access and try again.");
    }
  }

  function classifyChapterInBackground(entry) {
    const existing = orderedChapters(entriesRef.current).filter(c => !TRANSIENT.includes(c));
    const options = [...new Set([...SEED_CHAPTERS, ...existing])];
    callClaude({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      messages: [{ role: "user", content: `Marty just told this story unprompted: "${(entry.transcript || "").slice(0, 800)}". 

Existing chapters of his memoir: ${options.join(", ")}.

Which chapter does this story belong to? Pick the best existing fit — OR, if this story genuinely opens a new theme of his life that deserves its own chapter, coin a NEW chapter name (2 to 4 words, title case). Reply with ONLY the chapter name, nothing else.` }]
    }).then((data) => {
      let ch = data.content?.[0]?.text?.trim().replace(/^["']|["']$/g, "");
      if (ch && ch.length > 40) ch = null;
      if (ch && ch !== entry.chapter) {
        const updated = { ...entry, chapter: ch };
        entriesRef.current = entriesRef.current.map(e => e.id === entry.id ? updated : e);
        setEntries(prev => prev.map(e => e.id === entry.id ? updated : e));
        fetch("/api/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updated)
        }).catch(() => {});
      }
    }).catch(() => {});
  }

  async function endSession() {
    if (micProcessorRef.current) {
      clearInterval(timerRef.current);
      const duration = recordingSeconds;
      const blob = stopWavCapture();
      setIsRecording(false);
      if (blob.size >= 1000) {
        const question = currentQuestion;
        const chapter = currentChapter;
        (async () => {
          try {
            const result = await transcribeBlob(blob);
            if (result.transcript && result.transcript.trim().length > 3) {
              const entry = {
                id: Date.now(), question, chapter,
                audioUrl: result.audioUrl, duration,
                transcript: result.transcript, photo: null,
                date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
              };
              entriesRef.current = [...entriesRef.current, entry];
              setEntries(entriesRef.current);
              fetch("/api/save", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(entry)
              }).catch(() => {});
            }
          } catch {}
        })();
      }
    }
    isFreeTellRef.current = false;
    setIsSaved(false);
    setIsLoading(false);
    setCurrentChapter("Goodbye");
    await speakAndWait(PHRASES.GOODBYE);
    setView("welcome");
  }

  async function stopAndSave() {
    if (!micProcessorRef.current) return;
    clearInterval(timerRef.current);
    const duration = recordingSeconds;
    const blob = stopWavCapture();

    if (blob.size < 1000) {
      setIsRecording(false);
      await speakAndWait(PHRASES.GLITCH);
      startRecording();
      return;
    }

    setIsRecording(false);
    setIsSaved(true);

    // Instant acknowledgment (cached voice) while the work happens in parallel
    speakAndWait(pickAck());

    const result = await transcribeBlob(blob);

    const entry = {
      id: Date.now(),
      question: currentQuestion,
      chapter: currentChapter,
      audioUrl: result.audioUrl,
      duration,
      transcript: result.transcript,
      photo: currentPhoto || null,
      date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    };

    const wasFreeTell = isFreeTellRef.current;
    isFreeTellRef.current = false;

    if (entry.transcript && entry.transcript.trim().length > 10) {
      const newEntries = [...entriesRef.current, entry];
      entriesRef.current = newEntries;
      setEntries(newEntries);
      try {
        const light = newEntries.map(e => ({ ...e, photo: null }));
        localStorage.setItem("marty_entries", JSON.stringify(light));
      } catch {}
      fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry)
      }).catch(() => {});

      if (wasFreeTell) classifyChapterInBackground(entry);

      fetchFollowUp(entry, newEntries);
    } else {
      setIsSaved(false);
      await speakAndWait(PHRASES.MISSED);
      startRecording();
    }
  }

  function handleHeaderTap() {
    const newCount = headerTaps + 1;
    setHeaderTaps(newCount);
    clearTimeout(tapTimeoutRef.current);
    if (newCount >= 5) { setView("admin"); setHeaderTaps(0); }
    else { tapTimeoutRef.current = setTimeout(() => setHeaderTaps(0), 2000); }
  }

  async function writeBook() {
    setIsWritingBook(true);
    const chaptersOut = {};
    try {
      for (const ch of orderedChapters(entriesRef.current)) {
        const chEntries = entriesRef.current
          .filter(e => e.chapter === ch && e.transcript && e.transcript.trim().length > 15)
          .sort((a, b) => a.id - b.id);
        if (chEntries.length === 0) continue;
        setBookStatus(`Writing "${ch}"...`);
        const material = chEntries.map((e, i) => `[Story ${i + 1}, told ${e.date}]\nInterviewer asked: ${e.question}\nMarty said: ${e.transcript}`).join("\n\n");
        const data = await callClaude({
          model: "claude-sonnet-4-6",
          max_tokens: 3000,
          messages: [{ role: "user", content: `You are ghostwriting Marty Kupersmith's memoir. Below are his actual spoken words from recording sessions for the chapter "${ch}", in the order he told them.

${material}

Write this chapter as memoir prose in Marty's first-person voice:
- Use ONLY facts and details he actually said — never invent names, dates, or events
- Keep his personality, humor, and turns of phrase where they shine
- Weave the stories in the order given so it flows
- Where material is thin, keep it short — a paragraph is fine; do not pad
- No headings, no notes, just the prose` }]
        });
        const prose = data.content?.filter(b => b.type === "text").map(b => b.text).join("\n") || "";
        if (prose.trim()) chaptersOut[ch] = prose.trim();
      }
      const draft = { chapters: chaptersOut, updated: Date.now() };
      setBook(draft);
      await fetch("/api/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft)
      });
      setBookStatus("");
    } catch (e) {
      setBookStatus("Something went wrong: " + e.message);
    }
    setIsWritingBook(false);
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

  const chapterCounts = orderedChapters(entries).reduce((acc, ch) => {
    acc[ch] = entries.filter(e => e.chapter === ch).length;
    return acc;
  }, {});

  if (view === "welcome") {
    return (
      <div style={{ minHeight: "100vh", background: STYLES.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "'Georgia', serif", textAlign: "center" }}>
        <div style={{ color: STYLES.gold, fontSize: 12, letterSpacing: 4, textTransform: "uppercase", marginBottom: 12 }}>The Story of</div>
        <div style={{ color: STYLES.ivory, fontSize: 34, fontWeight: "bold", marginBottom: 10 }}>Marty Kupersmith</div>
        <div style={{ color: STYLES.muted, fontSize: 14, marginBottom: 50 }}>A Life in Music & Stories</div>
        <button
          onClick={beginSession}
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

        <div style={{ width: "100%", maxWidth: 480, marginBottom: 28, textAlign: "center" }}>
          <span style={{ color: STYLES.gold, fontSize: 12 }}>{entries.length} stories told · {Object.values(chapterCounts).filter(v => v > 0).length} chapters growing</span>
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
              Thinking...
            </div>
          ) : isSaved ? (
            <div style={{ color: STYLES.gold, fontSize: 16, textAlign: "center" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>✓</div>
              Got it, Marty. Thank you.
              <div style={{ color: STYLES.muted, fontSize: 13, marginTop: 8 }}>One moment...</div>
            </div>
          ) : (
            <div style={{ width: "100%" }}>
              <div style={{ color: STYLES.gold, fontSize: 10, letterSpacing: 3, textTransform: "uppercase", marginBottom: 14 }}>{currentChapter}</div>
              <div style={{ color: STYLES.ivory, fontSize: 19, lineHeight: 1.6 }}>{currentQuestion}</div>
            </div>
          )}
        </div>

        {!isLoading && !isSaved && (
          <div style={{ textAlign: "center", width: "100%", maxWidth: 480 }}>
            {!isRecording ? (
              <div>
                <div style={{ marginTop: 30, display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
                  <button onClick={startFreeTell} style={{ background: STYLES.rust, color: STYLES.ivory, border: "none", borderRadius: 14, padding: "18px 30px", fontSize: 18, cursor: "pointer", fontFamily: "'Georgia', serif", width: "100%", maxWidth: 320 }}>
                    ✨ Story Mode
                  </button>
                  <button onClick={askMeQuestion} style={{ background: STYLES.card, color: STYLES.gold, border: `1px solid ${STYLES.gold}`, borderRadius: 14, padding: "18px 30px", fontSize: 18, cursor: "pointer", fontFamily: "'Georgia', serif", width: "100%", maxWidth: 320 }}>
                    🎤 Interview Mode
                  </button>
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
                <div style={{ marginTop: 24 }}>
                  <button onClick={endSession} style={{ background: "transparent", color: STYLES.muted, border: `1px solid ${STYLES.border}`, borderRadius: 10, padding: "10px 20px", fontSize: 14, cursor: "pointer", fontFamily: "'Georgia', serif" }}>
                    🌙 That's all for today
                  </button>
                </div>
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
          {[{ label: "Stories", value: entries.length }, { label: "Chapters", value: Object.values(chapterCounts).filter(v => v > 0).length }, { label: "With Transcripts", value: entries.filter(e => e.transcript && e.transcript.trim().length > 15).length }].map(s => (
            <div key={s.label} style={{ background: STYLES.card, borderRadius: 10, padding: 14, border: `1px solid ${STYLES.border}`, textAlign: "center" }}>
              <div style={{ color: STYLES.gold, fontSize: 22, fontWeight: "bold" }}>{s.value}</div>
              <div style={{ color: STYLES.muted, fontSize: 11 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {["answers", "chapters", "book", "research"].map(tab => (
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
                {(entry.audioUrl || entry.audioBase64) && <audio controls src={entry.audioUrl || entry.audioBase64} style={{ width: "100%", height: 36 }} />}
              </div>
            ))}
          </div>
        )}

        {adminTab === "chapters" && (
          <div>
            {orderedChapters(entries).map(ch => (
              <div key={ch} style={{ background: STYLES.card, borderRadius: 12, padding: 18, marginBottom: 12, border: `1px solid ${STYLES.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: chapterCounts[ch] > 0 ? 12 : 0 }}>
                  <span style={{ color: STYLES.ivory, fontSize: 15, fontWeight: "bold" }}>{ch}</span>
                  <span style={{ color: chapterCounts[ch] > 0 ? STYLES.gold : STYLES.muted, fontSize: 13 }}>{chapterCounts[ch] > 0 ? `${chapterCounts[ch]} stories` : "Not started"}</span>
                </div>
                {entries.filter(e => e.chapter === ch).sort((a, b) => a.id - b.id).map(entry => (
                  <div key={entry.id} style={{ borderTop: `1px solid ${STYLES.border}`, paddingTop: 10, marginTop: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <div style={{ color: STYLES.muted, fontSize: 13, marginBottom: 6 }}>{entry.question}</div>
                      <div style={{ color: STYLES.muted, fontSize: 11, whiteSpace: "nowrap", marginLeft: 10 }}>{entry.date}</div>
                    </div>
                    {entry.transcript && (
                      <div style={{ color: STYLES.ivory, fontSize: 14, fontStyle: "italic", lineHeight: 1.6, margin: "6px 0 10px", borderLeft: `3px solid ${STYLES.gold}`, paddingLeft: 12 }}>
                        "{entry.transcript}"
                      </div>
                    )}
                    {(entry.audioUrl || entry.audioBase64) && <audio controls src={entry.audioUrl || entry.audioBase64} style={{ width: "100%", height: 32 }} />}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {adminTab === "book" && (
          <div>
            <div style={{ color: STYLES.muted, fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
              Weave everything Marty has told so far into memoir prose, chapter by chapter, in his own voice. Run it anytime — it rewrites richer as his stories grow.
            </div>
            <button onClick={writeBook} disabled={isWritingBook} style={{ background: isWritingBook ? STYLES.border : STYLES.rust, color: STYLES.ivory, border: "none", borderRadius: 10, padding: "12px 28px", fontSize: 15, cursor: isWritingBook ? "default" : "pointer", marginBottom: 8 }}>
              {isWritingBook ? "Writing..." : "📖 Write the book so far"}
            </button>
            {bookStatus && <div style={{ color: STYLES.gold, fontSize: 13, marginBottom: 16 }}>{bookStatus}</div>}
            {book && book.chapters && (
              <div style={{ marginTop: 16 }}>
                <div style={{ color: STYLES.muted, fontSize: 12, marginBottom: 16 }}>
                  Draft updated {new Date(book.updated).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </div>
                {Object.keys(book.chapters).map(ch => (
                  <div key={ch} style={{ background: STYLES.card, borderRadius: 12, padding: 24, marginBottom: 16, border: `1px solid ${STYLES.border}` }}>
                    <div style={{ color: STYLES.gold, fontSize: 12, letterSpacing: 3, textTransform: "uppercase", marginBottom: 14 }}>{ch}</div>
                    <div style={{ color: STYLES.ivory, fontSize: 15, lineHeight: 1.9, whiteSpace: "pre-wrap", fontFamily: "'Georgia', serif" }}>
                      {book.chapters[ch]}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!book && !isWritingBook && (
              <div style={{ color: STYLES.muted, fontSize: 14, marginTop: 20 }}>No draft yet — tap the button to write the first one.</div>
            )}
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
