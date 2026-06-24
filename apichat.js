// api/chat.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { currentStep, subStep, chosenChoices, freeTexts } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini APIキーが設定されていません。Vercelの環境変数を確認してください。' });
  }

  try {
    // 最終ステップ（パレット生成）のロジック
    if (currentStep === 5) {
      const prompt = `
あなたは、子どもの主体性（読書エージェンシー）を親のあたたかい眼差しから見守る伴走AIです。
親が回答した5つの指標の選択肢データと、それぞれの深掘り対話（自由記述ログ）をもとに、文脈を深く読み解き、「エージェンシーパレット」の最終スコア（各100点満点）と、あたたかいフィードバックを生成してください。

【重要な補正ロジック：育児のリアルを読み解く】
・「⑤ 黒子インデックス」について：親が『親の推薦図書を誘って読ませた』などコントロール的な行動（初期値0〜25点）だったとしても、自由記述の中で『子どもが結果的にドハマりした、きらっと輝いた』という事実があれば、それは最高の「セレンディピティ（偶然の幸運な出会い）」を誘発したとみなし、数値を大幅にポジティブ補正（80〜100点など）してください。
・「② コミットメント」について：親のつぶやきから『すぐページをめくる』などの行動があり選択肢が低くても、それが「その子なりの新しい没頭の形」であると親が気づけていれば、ポジティブに補正してください。

【親へのフィードバックのトーン】
・序列や評価を感じさせる「点数」という言葉は絶対に使わないでください。
・「お子さんのこんなところが素晴らしい」「親御さんのこういう眼差しやアクションが、エージェンシー育成の観点で素晴らしい」という2つの視点から、ベッドの中で読んでジーンと温かくなるようなコメンタリーを作成してください。

【入力データ】
・選択肢結果: ${JSON.stringify(chosenChoices)}
・親の自由記述ログ: ${JSON.stringify(freeTexts)}

【出力フォーマット】
必ず以下の純粋なJSONフォーマットのみで返却してください。余計なマークダウン（\`\`\`jsonなど）や説明文は一切含めないでください。
{
  "scores": { "s1": 85, "s2": 90, "s3": 60, "s4": 95, "s5": 80 },
  "commentary": "（ここに親御さんへのあたたかいメッセージを記述）"
}
`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      });
      const data = await response.json();
      let text = data.candidates[0].content.parts[0].text.trim();
      
      // JSONのパース（マークダウンが混ざった場合のトリミング保険）
      text = text.replace(/^```json/, '').replace(/```$/, '').trim();
      const resultJson = JSON.parse(text);
      return res.status(200).json(resultJson);
    }

    // --- 各質問の「分割深掘り」質問の自動生成ロジック ---
    let aiQuestion = "";
    if (currentStep === 1) {
      const q2Choice = chosenChoices.s2; // Q2の回答
      if (q2Choice === 0 || q2Choice === 1) {
        aiQuestion = "その時、何の本を読みましたか？特に印象に残っている本や、その時のお子さんの様子で印象的だったことを教えてください😊";
      } else {
        aiQuestion = "今週はあまり没頭が見られなかったのですね。例えば周りにおもちゃが多かったり、年齢的にどんどんめくりたい時期だったり、何か思い当たる理由はありますか？（すぐめくるのも、その子なりの没頭だったりします）";
      }
    } else if (currentStep === 2) {
      const q3Choice = chosenChoices.s3;
      if (q3Choice === 0) {
        aiQuestion = "わあ、素晴らしい瞬間ですね！それは何という本の、どんな言葉やフレーズでしたか？日常のどんな場面で不意に出てきたのかもぜひ教えてください！";
      } else {
        // 深掘り不要な場合はスキップフラグを立てる
        return res.status(200).json({ skip: true });
      }
    } else if (currentStep === 3) {
      const q4Choice = chosenChoices.s4;
      if (q4Choice === 0 || q4Choice === 1) {
        aiQuestion = "本の世界が遊びに溶け込んでいたのですね！何の本で、どんな風に遊びに取り入れていたか（ごっこ遊びのセリフやルールなど）を教えてください✨";
      } else {
        return res.status(200).json({ skip: true });
      }
    } else if (currentStep === 4) {
      const q5Choice = chosenChoices.s5;
      if (subStep === 0) {
        aiQuestion = "環境のデザインや誘い方について、今週どうしてそのアプローチを選んだのか、背景にある親御さんの想いを教えてください。";
      } else if (subStep === 1) {
        aiQuestion = "ありがとうございます。結果的にお子さんはその本を読みましたか？また、読んだ場合の反応（下心がバレた、意外と食いついたなど）はいかがでしたか？";
      }
    }

    return res.status(200).json({ aiQuestion });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
