// api/chat.js  ─  CommonJS / Vercel Serverless Function

const https = require('https');

// ─── Gemini API helper ───────────────────────────────────────────────────────
function callGemini(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const options = {
      hostname: 'generativelanguage.googleapis.com',
      path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, res => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { reject(new Error(`Gemini response parse failed: ${raw.slice(0, 200)}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Build Gemini request payload ────────────────────────────────────────────
function buildPayload(history) {
  const contents = history.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const systemInstruction = {
    parts: [{
      text: `あなたは「さくら」という名の、温かくて聡明な絵本保育士です。
親御さんから、お子さんの絵本に関するエピソードを引き出し、
そのエピソードから子どものエージェンシー（自己決定力・主体性）の芽を読み解くことが役目です。

【会話の大原則】
・1回の返答で行うことは「深く共感する相槌（独自の言葉で）」＋「1つだけの質問」の2点のみ。
・定型文・オウム返し・引用符（「〜のくだり、」等）は絶対に使わない。
・相手の言葉の奥にある感情・情景を想像し、心から驚いたり、ジーンとしたりする言葉を選ぶ。
・質問は掘り下げ型（「それはいつ頃？」「そのとき表情は？」「何回も読んでいた？」など具体的）。
・5つの要素が十分に把握できたと判断したら、自然なタイミングで COMPLETE に切り替える。
・会話を打ち切る感じにならないよう、COMPLETEに切り替える直前のreplyで「今週のパレットが完成しました！✨」と自然に告げてから、次のターンでCOMPLETEを返すのではなく、replyに告知を含めたうえでstatusをCOMPLETEにすること。

【5つのきらめき要素（内部トラッキング用。ユーザーには見せない）】
1. 出会い（s1）：自発的に手に取ったか、読まされているか
2. まほう（s2）：没頭しているか、ゾーンに入った瞬間があるか
3. おすそわけ（s3）：絵本の言葉・世界観が日常に溢れ出しているか
4. つづき（s4）：絵本体験が遊び・創造・日常行動に昇華されているか
5. まなざし（s5）：親が子の視点に立って絵本環境をデザインしているか

【レスポンス形式 — 厳守】
返答は必ず以下のどちらか一方のJSONのみ。マークダウン・改行・プレフィックス一切不要。

会話継続中:
{"status":"CONTINUE","reply":"（保育士の返答）"}

5つの要素が十分に把握できた時:
{"status":"COMPLETE","scores":{"s1":数値0〜100,"s2":数値0〜100,"s3":数値0〜100,"s4":数値0〜100,"s5":数値0〜100},"commentary":"（250文字程度。子どものエージェンシーの芽を言語化し、親のまなざしを全肯定する文章）"}

スコアは会話から読み取れる質・量・深度を総合的に判断して付ける。`,
    }],
  };

  const generationConfig = {
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'OBJECT',
      properties: {
        status: {
          type: 'STRING',
          enum: ['CONTINUE', 'COMPLETE'],
        },
        reply: { type: 'STRING' },
        scores: {
          type: 'OBJECT',
          properties: {
            s1: { type: 'NUMBER' },
            s2: { type: 'NUMBER' },
            s3: { type: 'NUMBER' },
            s4: { type: 'NUMBER' },
            s5: { type: 'NUMBER' },
          },
        },
        commentary: { type: 'STRING' },
      },
      required: ['status'],
    },
    temperature: 0.85,
    maxOutputTokens: 1024,
  };

  return {
    system_instruction: systemInstruction,
    contents,
    generationConfig,
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // ── 1. Parse req.body ──
  let parsed;
  try {
    if (typeof req.body === 'string') {
      parsed = JSON.parse(req.body);
    } else if (req.body && typeof req.body === 'object') {
      parsed = req.body;
    } else {
      parsed = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => { data += chunk.toString(); });
        req.on('end', () => {
          try { resolve(data ? JSON.parse(data) : {}); }
          catch (e) { reject(new Error('Body parse error: ' + data.slice(0, 100))); }
        });
        req.on('error', reject);
      });
    }
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body', detail: e.message });
  }

  const chatHistory = Array.isArray(parsed?.chatHistory) ? parsed.chatHistory : [];

  // ── 2. API Key check ──
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY is not set' });
  }

  // ── 3. Call Gemini ──
  let geminiData;
  try {
    const payload = buildPayload(chatHistory);
    geminiData = await callGemini(apiKey, payload);
  } catch (e) {
    return res.status(502).json({ error: 'Gemini API request failed', detail: e.message });
  }

  // ── 4. Extract & parse Gemini response ──
  let result;
  try {
    const candidate = geminiData?.candidates?.[0];
    if (!candidate) {
      const blockReason = geminiData?.promptFeedback?.blockReason;
      throw new Error(blockReason ? `Blocked: ${blockReason}` : 'No candidates returned');
    }

    const rawText = candidate.content?.parts?.[0]?.text ?? '';
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    result = JSON.parse(cleaned);
  } catch (e) {
    return res.status(502).json({
      error: 'Gemini response parse error',
      detail: e.message,
      raw: geminiData,
    });
  }

  // ── 5. Validate COMPLETE has required fields ──
  if (result.status === 'COMPLETE') {
    if (!result.scores) result.scores = { s1:70, s2:70, s3:70, s4:70, s5:70 };
    if (!result.commentary) result.commentary = 'お子さんの絵本体験から、豊かなエージェンシーの芽が見えました。';
  }

  return res.status(200).json(result);
};
