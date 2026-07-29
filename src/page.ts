export const SITE_URL = "https://ask-my-resume.huiningli.workers.dev";
const OG_TITLE = "Ask my resume — Huining Li";
const OG_DESC =
  "A RAG assistant I built that answers questions about my engineering experience — grounded in my own documents, with source citations.";

export const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${OG_TITLE}</title>
<meta name="description" content="${OG_DESC}">
<link rel="canonical" href="${SITE_URL}/">

<!-- OpenGraph: required for LinkedIn / Slack / Facebook link previews -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="Ask my resume">
<meta property="og:url" content="${SITE_URL}/">
<meta property="og:title" content="${OG_TITLE}">
<meta property="og:description" content="${OG_DESC}">
<meta property="og:image" content="${SITE_URL}/og.png">
<meta property="og:image:secure_url" content="${SITE_URL}/og.png">
<meta property="og:image:type" content="image/png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Ask my resume — a grounded RAG assistant built by Huining Li">
<meta property="og:locale" content="en_AU">

<!-- Twitter/X card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${OG_TITLE}">
<meta name="twitter:description" content="${OG_DESC}">
<meta name="twitter:image" content="${SITE_URL}/og.png">
<style>
  :root {
    --royal:#1d4ed8; --royal-dk:#1e3a8a; --amber:#d97706; --ink:#1f2937;
    --muted:#5a6b85; --line:#dce4f2; --bg:#f7f9fc; --card:#fff;
  }
  * { box-sizing:border-box; }
  body { margin:0; font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Calibri,Arial,sans-serif;
         color:var(--ink); background:var(--bg); }
  .wrap { max-width:760px; margin:0 auto; padding:32px 20px 64px; }
  header { border-left:4px solid var(--amber); padding-left:16px; margin-bottom:28px; }
  h1 { margin:0 0 4px; font-size:26px; color:var(--royal-dk); }
  .tag { color:var(--muted); font-size:14px; }
  .tag a { color:var(--royal); }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:20px; margin-bottom:20px; }
  form { display:flex; gap:10px; }
  input[type=text] { flex:1; padding:12px 14px; font-size:16px; border:1px solid var(--line);
                     border-radius:8px; font-family:inherit; }
  input[type=text]:focus { outline:2px solid var(--royal); border-color:var(--royal); }
  button { padding:12px 20px; font-size:16px; font-weight:600; color:#fff; background:var(--royal);
           border:0; border-radius:8px; cursor:pointer; font-family:inherit; }
  button:disabled { background:#9db4e0; cursor:default; }
  .chips { margin-top:14px; display:flex; flex-wrap:wrap; gap:8px; }
  .chip { font-size:13px; color:var(--royal-dk); background:#eef3fd; border:1px solid var(--line);
          border-radius:999px; padding:6px 12px; cursor:pointer; }
  .chip:hover { background:#e2ebfb; }
  #answer { white-space:pre-wrap; }
  .cites { margin-top:14px; font-size:13px; color:var(--muted); border-top:1px solid var(--line); padding-top:12px; }
  .cites b { color:var(--ink); }
  .spin { color:var(--muted); font-style:italic; }
  h2 { font-size:15px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin:0 0 12px; }
  details summary { cursor:pointer; font-weight:600; color:var(--royal-dk); }
  ul { margin:10px 0 0; padding-left:20px; }
  li { margin-bottom:6px; font-size:15px; }
  footer { color:var(--muted); font-size:13px; text-align:center; margin-top:8px; }
  code { background:#eef1f6; padding:1px 5px; border-radius:4px; font-size:13px; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Ask my resume</h1>
    <div class="tag">
      Huining Li · Technical Lead, Brisbane ·
      <a href="https://www.linkedin.com/in/huining-li-2b05ab26/" target="_blank" rel="noopener">LinkedIn</a> ·
      <a href="mailto:hiro.l.dragon@gmail.com">hiro.l.dragon@gmail.com</a>
    </div>
  </header>

  <div class="card">
    <p style="margin-top:0">Ask anything about my engineering background. Answers are generated
    <strong>only</strong> from my own documents and every answer shows which ones it used —
    if the answer isn't in there, it says so rather than guessing.</p>
    <form id="f">
      <input id="q" type="text" maxlength="500" autocomplete="off"
             placeholder="e.g. What AI systems has he built in production?">
      <button id="btn" type="submit">Ask</button>
    </form>
    <div class="chips" id="chips"></div>
  </div>

  <div class="card" id="out" hidden>
    <h2>Answer</h2>
    <div id="answer"></div>
    <div class="cites" id="cites" hidden></div>
  </div>

  <div class="card">
    <details>
      <summary>How this is built (and why)</summary>
      <ul>
        <li><b>Retrieval-Augmented Generation.</b> My CV and project notes are split into chunks and
            embedded once at build time with <code>text-embedding-3-small</code>. The index ships with the
            worker as JSON, so there's no vector database to run or pay for.</li>
        <li><b>Per question:</b> embed the question, rank chunks by cosine similarity, and pass only the
            top matches to <code>gpt-4o-mini</code> as context.</li>
        <li><b>Grounding over fluency.</b> The model is instructed to answer only from the retrieved
            context and never to infer titles, dates or years of experience. Nothing relevant retrieved
            means it refuses — a wrong claim about my own background would be worse than no answer.</li>
        <li><b>Citations are earned.</b> I list only the documents the answer actually cites, not
            everything retrieval returned. Retrieval is not grounding.</li>
        <li><b>Guardrails both ways.</b> Prompt-injection and credential-probing questions are screened
            before the model is called; the answer is screened for leaks before you see it. Both record
            reasons, not just a pass/fail flag.</li>
        <li><b>Reliability &amp; cost.</b> Transient errors only are retried, calls time out, output tokens
            are capped, and there's a per-IP rate limit plus a global daily cap.</li>
        <li><b>Stack:</b> TypeScript on Cloudflare Workers, OpenAI embeddings + chat, no framework.
            Pure functions for retrieval, guardrails and prompt-building, covered by unit tests.</li>
      </ul>
    </details>
  </div>

  <footer>
    This assistant can still be wrong. For anything that matters, please
    <a href="mailto:hiro.l.dragon@gmail.com">email me</a>.
  </footer>
</div>

<script>
  const SAMPLES = [
    "What AI systems has he built in production?",
    "Tell me about his architecture experience",
    "Has he led a team?",
    "What's his experience with LangChain and LangGraph?",
    "Does he know AWS?",
    "What is he looking for in his next role?"
  ];
  const chips = document.getElementById("chips");
  SAMPLES.forEach(s => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.textContent = s;
    b.onclick = () => { document.getElementById("q").value = s; document.getElementById("f").requestSubmit(); };
    chips.appendChild(b);
  });

  const f = document.getElementById("f");
  const out = document.getElementById("out");
  const answerEl = document.getElementById("answer");
  const citesEl = document.getElementById("cites");
  const btn = document.getElementById("btn");

  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const question = document.getElementById("q").value.trim();
    if (!question) return;

    btn.disabled = true;
    out.hidden = false;
    citesEl.hidden = true;
    answerEl.innerHTML = '<span class="spin">Retrieving and answering…</span>';

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question })
      });
      const data = await res.json();
      answerEl.textContent = data.answer || "No answer returned.";
      if (data.citations && data.citations.length) {
        citesEl.innerHTML = "<b>Sources used:</b> " + data.citations.join(", ");
        citesEl.hidden = false;
      }
    } catch (err) {
      answerEl.textContent = "Network error. Please try again, or email hiro.l.dragon@gmail.com.";
    } finally {
      btn.disabled = false;
    }
  });
</script>
</body>
</html>`;
