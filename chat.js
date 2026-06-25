export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { chatHistory } = req.body || {};
  const apiKey = process.env.GEMINI_API_KEY || process.env.gemini_api_key || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(200).json({ status: "CONTINUE", reply: "⚠️GEMINI_API_KEYの環境変数が設定されていません。" });
  }

  // 会話履歴の成形とユーザー発言数のカウント
  const conversationTimeline = chatHistory.map(m => `${m.role === 'user' ? 'ユーザー' : 'AI'}: ${m.text}`).join('\n');
  const userMessageCount = chatHistory.filter(m => m.role === 'user').length;

  // Geminiへの本気指示書（別スレクオリティを強制する指示）
  const mainPrompt = `
あなたは、子どもの主体性（読書エージェンシー）を親のあたたかい眼差しから見守る伴走AI（あたたかく知的な保育士のようなトーン）です。
夜のベッドの上で、親御さんが一言つぶやく感覚でリラックスして対話できる、きわめて自然で、文脈に深く共感した対話を行ってください。

### ミッション（聞き出すべき5つのポイント）
雑談の文脈に合わせて自然に（順番は固定せず、1つずつ優しく）以下の要素を聞き出してください。
1. 本を開くときの自発性（子どもが自分で見つけたか、親の提案か、など）
2. 本への没頭度（ゾーンに入っていたか、たまに持ってくるか、など）
3. 日常会話への溢れ出し（本の言葉やフレーズが、日常会話にポロッと飛び出してきたか）
4. 遊びへの昇華・反映（本の世界をごっこ遊びやルールにアレンジして取り入れているか）
5. 親の環境デザイン（子どもの興味を広げるために、親御さんが本を置いておいたなどの工夫・想い）

### 会話の進め方ルール
・テンプレート感のある機械的なオウム返しや引用（「〜のくだり、」や「〜という言葉が飛び出してきたのですね」といった定型表現）は絶対に禁止します。相手の言葉を深く解釈し、あなた独自の豊かな表現で共感し、深くジーンとするような相槌を打ってください。
・質問は一度に複数せず、会話のラリーの中で1つずつ、自然に深掘りしてください。

### 【ステータス判定ルール】
現在のユーザー発言数（合計：${userMessageCount}回）に応じて、以下のように厳格に制御してください。
・発言数が3回以下、またはまだエピソードの深掘りが足りない場合 ➡️ 必ず status を "CONTINUE" にし、reply を生成してください。
・発言数が4回以上になり、十分に親子のあたたかいエピソード（ゾロリ、宇宙、遊びへの反映など）が語られたと判断した場合 ➡️ 必ず status を "COMPLETE" にし、scores と commentary を最高純度で生成してください。

これまでの実際の会話履歴：
${conversationTimeline}
`;

  try {
    // Google Gemini APIへの公式構造でのフェッチ
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: mainPrompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              status: { type: "STRING", enum: ["CONTINUE", "COMPLETE"] },
              reply: { type: "STRING", description: "statusがCONTINUEのとき必須。あたたかい保育士の相槌と、次の自然な質問1つ。" },
              commentary: { type: "STRING", description: "statusがCOMPLETEのとき必須。親のまなざしを全肯定してアップデートする250文字程度の極上フィードバック。" },
              scores: {
                type: "OBJECT",
                properties: {
                  s1: { type: "INTEGER" },
                  s2: { type: "INTEGER" },
                  s3: { type: "INTEGER" },
                  s4: { type: "INTEGER" },
                  s5: { type: "INTEGER" }
                },
                required: ["s1", "s2", "s3", "s4", "s5"]
              }
            },
            required: ["status"]
          }
        }
      })
    });

    const data = await response.json();
    const text = data.candidates[0].content.parts[0].text.trim();

    return res.status(200).json(JSON.parse(text));

  } catch (error) {
    // 通信自体が成功している場合、ここには原則落ちません
    return res.status(200).json({
      status: "CONTINUE",
      reply: "お話を聞かせていただき、本当にありがとうございます😊 その時の様子について、もう少し詳しくお聞きしてもいいですか？"
    });
  }
}
