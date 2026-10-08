const express = require("express");
const app = express();
app.use(express.json({ limit: "1mb" }));

const GEMINI_KEY = process.env.GEMINI_KEY;
const SHARED_SECRET = process.env.SHARED_SECRET || "change-me";

const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > 20;
}

app.post("/chat", async (req, res) => {
  if (req.headers.authorization !== "Bearer " + SHARED_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  if (rateLimited(ip)) return res.status(429).json({ error: "too many requests" });

  const { messages } = req.body;
  if (!Array.isArray(messages)) return res.status(400).json({ error: "bad request" });

  try {
    const contents = messages
      .filter(m => m.role !== "system")
      .map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      }));

    const systemMsg = messages.find(m => m.role === "system");

    const body = {
      contents: contents,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 800
      }
    };

    if (systemMsg) {
      body.systemInstruction = {
        parts: [{ text: systemMsg.content }]
      };
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await r.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "…";
    res.json({ reply });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/", (req, res) => res.send("Dark GPT Proxy is running ✅"));

app.listen(process.env.PORT || 3000, () => console.log("Server running"));
