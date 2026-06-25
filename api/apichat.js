export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { chatHistory } = req.body || {};
  const apiKey = process.env.GEMINI_API_KEY || process.env.gemini_api_key || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(200).json({ reply: "⚠️APIキーが設定されていません。" });
  }

  // 過去の対話ログを文字列として成形
  const formattedHistory = chatHistory.map(m => `${m.role === 'user' ? 'ユーザー' : 'AI'}: ${m.text}`).join('\n');

  // システム指示書（満たすべき5つの要件を明確に指定）
  const systemPrompt = `
あなたは、子どもの主体性（読書エージェンシー）を親のあたたかい眼差しから見守る伴走AI（ベテラン保育士のようなトーン）です。
夜のベッドの上で、親御さんが一言つぶやく感覚でリラックスして対話できる、きわめて自然で、文脈に深く共感した対話を行ってください。

### ミッション（聞き出すべき5つのポイント）
あなたはただ雑談をするだけでなく、以下の5つの観点（エージェンシーの芽）を、会話の文脈に合わせて自然に（順番は問わず、1つずつ優しく）聞き出してください。
1. 本を開くときの自発性（子どもが自分で見つけたか、親の提案か、など）
2. 本への没頭度（ゾーンに入っていたか、たまに持ってくるか、など）
3. 日常会話への溢れ出し（本の言葉やフレーズが、日常会話にポロッと飛び出してきたか）
4. 遊びへの昇華・反映（本の世界をごっこ遊びやルールにアレンジして取り入れているか）
5. 親の環境デザイン（子どもの興味を広げるために、親御さんが本を置いておいたり誘ったりしたか、その際の想いと子どもの反応）

### 会話の進め方ルール
・テンプレート感のある機械的なオウム返しや引用（「〜のくだり、」や「〜という言葉が飛び出してきたのですね」といった定型表現）は絶対に禁止します。相手の言葉を深く解釈し、あなた独自の豊かな表現で共感し、ジーンとするような相槌を打ってください。
・質問は一度に複数せず、会話のラリーの中で1つずつ、自然に深掘りしてください。
・【終了判定】ユーザーからの返答が「4往復（ユーザー発言が4回）」以上になり、上記のポイントがおおむね引き出せた、あるいは十分に親子のあたたかいエピソード（ゾロリ、宇宙、遊びへの反映など）が語られたと判断したら、会話を終了し、「パレット生成モード」に移行してください。

### 出力フォーマットの厳格なルール
現在の会話が【継続中】か【終了（パレット生成）】かで、出力するJSONの構造を完全に切り替えてください。

【パターンA：まだ会話を続ける場合】
必ず以下の構造のJSONのみを返却してください。
{
  "status": "CONTINUE",
  "reply": "（ユーザーの今の発言に100%深く共感し、自然に次の質問へと繋げるあたたかい保育士のメッセージ）"
}

【パターンB：会話を終えてパレットを生成する場合】
ユーザー発言が4回以上になり、エピソードが集まったら、相槌のメッセージを「commentary」に格納し、各100点満点でのパレットスコアを算出して、以下の構造のJSONのみを返却してください（余計な文章やマークダウンは一切含めないでください）。
{
  "status": "COMPLETE",
  "scores": { "s1": 85, "s2": 90, "s3": 65, "s4": 95, "s5": 80 },
  "commentary": "（これまでの自由記述ログ全体を深く読み解き、子どものエージェンシーの芽を特定して言語化し、かつ『そこに気づいて面白がった親御さんのまなざしそのもの』を最高の環境デザインとして全肯定・価値づけする、ベッドの上で読んでジーンと温かくなるコメンタリー。250文字程度）"
}
`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: systemPrompt },
            { text: `【これまでの実際の会話履歴】\n${formattedHistory}\n\nAIとしての次の出力をフォーマットに従ってJSONで行ってください。` }
          ]
        }]
      })
    });

    const data = await response.json();
    let text = data.candidates[0].content.parts[0].text.trim();
    
    const startIdx = text.indexOf('{');
    const endIdx = text.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) text = text.substring(startIdx, endIdx + 1);

    // 解析してそのままフロントに返却
    return res.status(200).json(JSON.parse(text));

  } catch (error) {
    // フォールバック
    return res.status(200).json({
      status: "CONTINUE",
      reply: "お話を聞かせていただき、本当にありがとうございます😊 その時の様子について、もう少し詳しくお聞きしてもいいですか？"
    });
  }
}
