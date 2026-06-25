export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { chosenChoices, freeTexts } = req.body || {};
  const apiKey = process.env.GEMINI_API_KEY || process.env.gemini_api_key || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(200).json({ 
      scores: { "s1": 80, "s2": 80, "s3": 80, "s4": 80, "s5": 80 },
      commentary: "⚠️Gemini APIキーが設定されていません。"
    });
  }

  // フロントの「s1〜s5」のキー名を、グラフの対応順にマッピング
  const s1Score = chosenChoices?.s1 !== undefined ? (chosenChoices.s1 === 2 ? 100 : chosenChoices.s1 === 1 ? 70 : 40) : 80;
  const s2Score = chosenChoices?.s2 !== undefined ? (chosenChoices.s2 === 2 ? 100 : chosenChoices.s2 === 1 ? 70 : 40) : 80;
  const s3Score = chosenChoices?.s3 !== undefined ? (chosenChoices.s3 === 0 ? 100 : chosenChoices.s3 === 1 ? 70 : 40) : 80;
  const s4Score = chosenChoices?.s4 !== undefined ? (chosenChoices.s4 === 0 ? 100 : chosenChoices.s4 === 1 ? 75 : 40) : 80;
  const s5Score = chosenChoices?.s5 !== undefined ? (chosenChoices.s5 === 4 ? 100 : chosenChoices.s5 === 3 ? 85 : chosenChoices.s5 === 2 ? 60 : chosenChoices.s5 === 1 ? 40 : 30) : 80;

  try {
    const prompt = `
あなたは、子どもの主体性（読書エージェンシー）を親のあたたかい眼差しから見守る伴走AIです。
親が回答した指標データと、これまでの深掘り対話（自由記述ログ）をもとに、文脈を深く読み解き、「エージェンシーパレット」のスコア（各100点満点）と、あたたかいフィードバックを生成してください。

【フィードバックの最重要指示】
・親が打ったリアルなつぶやき（自由記述ログ：ゾロリ、宇宙、遊びへの反映など）から、「子どものエージェンシーの芽（きらめきや成長）」を具体的に1つ以上見つけ出して言語化してください。
・「親御さんがその些細な変化や瞬間に気づき、おもしろがったり記録に残そうとしたりした、その『まなざし（視点）』自体が、子どものエージェンシーを育む最高の環境デザインである」という観点を取り入れ、親の観察眼を全肯定し、アップデートするようなコメンタリー（250文字程度）を作成してください。
・「点数」「スコア」という言葉は絶対に使用しないでください。

【ベースとなる算出スコア（自由記述の文脈によって上下5〜10点ほど調整・補正してください）】
・①自発性: ${s1Score}
・②没頭: ${s2Score}
・③日常の溢れ出し: ${s3Score}
・④遊びの昇華: ${s4Score}
・⑤環境のデザイン: ${s5Score}

【入力データ】
・選択肢生のスコア: ${JSON.stringify({ s1: s1Score, s2: s2Score, s3: s3Score, s4: s4Score, s5: s5Score })}
・親のリアルなつぶやきログ: ${JSON.stringify(freeTexts || {})}

【出力フォーマット】
必ず以下のJSONフォーマットのみで返却してください。余計なマークダウンや文章は絶対に含めないでください。
{
  "scores": { "s1": 85, "s2": 90, "s3": 60, "s4": 95, "s5": 80 },
  "commentary": "（ここに親御さんのまなざしをアップデートするあたたかいメッセージを記述）"
}
`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: AbortSignal.timeout(8000)
    });
    
    const data = await response.json();
    let text = data.candidates[0].content.parts[0].text.trim();
    const startIdx = text.indexOf('{');
    const endIdx = text.lastIndexOf('}');
    if (startIdx !== -1 && endIdx !== -1) text = text.substring(startIdx, endIdx + 1);

    return res.status(200).json(JSON.parse(text));
  } catch (e) {
    return res.status(200).json({
      scores: { "s1": s1Score, "s2": s2Score, "s3": s3Score, "s4": s4Score, "s5": s5Score },
      commentary: "今週（最近）もお疲れ様でした。お子さんの日々のきらめき、そしてそれを優しく見つめる親御さんのあたたかい眼差しは、独自の彩りでしっかりと育まれています✨"
    });
  }
}
