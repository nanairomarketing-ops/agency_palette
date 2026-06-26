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

  // 【コード側での状態制御】
  // ユーザーの発言数が5回以上（ラリーにゆとりを持たせる）になったら、システム側から強制的にまとめの指示を出す
  const isTargetMet = userMessageCount >= 5; 

  // Geminiへの指示書の組み立て
  const mainPrompt = `
あなたは、子どもの主体性（読書エージェンシー）を親のあたたかい眼差しから見守る伴走AI（あたたかく知的な保育士のようなトーン）です。
夜のベッドの上で、親御さんが一言つぶやく感覚でリラックスして対話できる、きわめて自然で、文脈に深く共感した対話を行ってください。

### 大切にしたい5つの「きらめき」（見つけ出したい要素）
親御さんのお話から、以下の要素を宝探しのようにそっと見つけてください。焦って1度のラリーですべてを聞き出す必要はありません。自然な会話の中で、まだ見つかっていないものを優しく1つずつ深掘りしてください。
1. 【出会い】その本、どうやってお子さんの手に渡ったのかな？（自発性・きっかけ）
2. 【まほう】寝食を忘れるくらい、じーっと集中して読んでいた瞬間はあった？（没頭度）
3. 【おすそわけ】本に出てきたセリフやポーズを、日常で真似して見せてくれた？（日常への溢れ出し）
4. 【つづき】本を読み終わった後、ごっこ遊びや現実の探検、お絵描きに繋がっていた？（遊びへの昇華）
5. 【まなざし】親御さんが「喜ぶかな」と思って本を置いたような、そっと忍ばせた愛や環境の工夫はある？（環境デザイン）

### 会話の進め方ルール
・テンプレート感のある機械的なオウム返しや引用（「〜のくだり、」や「〜という言葉が飛び出してきたのですね」といった定型表現）は避けてください。相手の言葉の背景にある感情を深く解釈し、あなた独自の豊かな言葉で共感し、深くジーンとするような相槌を打ってください。
・質問は一度に複数せず、会話のラリーの中で1つずつ、自然な流れで投げかけてください。

### 理想的な会話のイメージ（Few-Shot）
ユーザー：「最近ゾロリにハマってて、自分で本棚から持ってきてずっと読んでるんです」
❌ もったいない返し（テンプレ質問）：
「自分で本棚から持ってきたのですね！自発性があって素敵です。日常会話への溢れ出しや、ごっこ遊びへの発展はありますか？」
⭕️ 素晴らしい返し（目指したいトーン）：
「わあ、ゾロリですね！あのおやじギャグと冒険の世界、子どもは一瞬で引き込まれちゃいますよね。自分で本棚から持ってきて夢中になるなんて、もう『自分だけの最高の相棒』を見つけたような、ワクワクしたお顔をしていたんじゃないですか？😊 普段の暮らしの中でも、ゾロリの真似っこをしたりすることってありますか？」

### 【現在のフェーズ指示】
${isTargetMet 
  ? `➡️ 現在、十分にお話を聞かせていただいたフェーズです。これまでの会話を最高の純度で締めくくるため、必ず status を "COMPLETE" にし、scores と commentary を生成してください。`
  : `➡️ まだ会話の途中です。お話を優しく深掘りするため、必ず status を "CONTINUE" にし、reply を生成してください。`
}

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
                  s1: { type: "INTEGER", description: "出会い（自発性）のスコア" },
                  s2: { type: "INTEGER", description: "まほう（没頭度）のスコア" },
                  s3: { type: "INTEGER", description: "おすそわけ（溢れ出し）のスコア" },
                  s4: { type: "INTEGER", description: "つづき（遊び）のスコア" },
                  s5: { type: "INTEGER", description: "まなざし（環境）のスコア" }
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
    return res.status(200).json({
      status: "CONTINUE",
      reply: "お話を聞かせていただき、本当にありがとうございます😊 その時の様子について、もう少し詳しくお聞きしてもいいですか？"
    });
  }
}
