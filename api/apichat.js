// api/apichat.js (JSONパース防御力を限界突破させた最終版)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { currentStep, subStep, chosenChoices, freeTexts } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(200).json({ 
      scores: { "s1": 50, "s2": 50, "s3": 50, "s4": 50, "s5": 50 },
      commentary: "⚠️Gemini APIキーがVercel側に設定されていないようです。環境変数(GEMINI_API_KEY)をご確認ください。"
    });
  }

  try {
    // ==========================================
    // 1. 最終ステップ：エージェンシー・パレットの生成
    // ==========================================
    if (currentStep === 5) {
      try {
        const prompt = `
あなたは、子どもの主体性（読書エージェンシー）を親のあたたかい眼差しから見守る伴走AIです。
親が回答した5つの指標の選択肢データと、それぞれの深掘り対話（自由記述ログ）をもとに、文脈を深く読み解き、「エージェンシーパレット」の最終スコア（各100点満点）と、あたたかいフィードバックを生成してください。

【最重要：育児のリアルを読み解く補正ロジック】
・「⑤ 環境のデザイン」について：
  親の選択肢がプッシュ型コントロール（0点）であっても、自由記述で『子どもが結果的にドハマりした、きらっと輝いた』という事実があれば、それは親の押しつけではなく最高の「セレンディピティ（偶然の出会い）」を誘発したとみなし、数値を【80〜100点】へと大幅にポジティブ上方補正してください。
・「② 没頭」について：
  『すぐページをめくってしまう』などの行動があり初期値が低くても、それが「その子なりの新しい没頭・探索の形」であると親がつぶやきの中で気づけていれば、ポジティブに数値を補正してください。

【親へのフィードバックのトーン】
・「点数」「スコア」という言葉は絶対に使用しないでください。
・「お子さんのこんなところが素晴らしい」「親御さんのこういう眼差しやアクションが、エージェンシー育成の観点で素晴らしい」という2つの視点から、ベッドの中で読んでジーンと温かくなるようなコメンタリー（250文字程度）を作成してください。

【入力データ】
・選択肢の生データ: ${JSON.stringify(chosenChoices)}
・親の自由記述ログ: ${JSON.stringify(freeTexts)}

【出力フォーマット】
必ず以下の純粋なJSONフォーマットのみで返却してください。余計なマークダウン（\`\`\`jsonなど）や説明の文章は絶対に含めないでください。
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
        if (!data.candidates || data.candidates.length === 0) {
          throw new Error("Gemini response empty");
        }

        let text = data.candidates[0].content.parts[0].text.trim();
        
        // --- 強力なJSON抽出ロジック（ここを強化しました！） ---
        // もし文字列の中に { と } があれば、その間だけを無理やり切り出す
        const startIdx = text.indexOf('{');
        const endIdx = text.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1) {
          text = text.substring(startIdx, endIdx + 1);
        }

        const resultJson = JSON.parse(text);
        return res.status(200).json(resultJson);

      } catch (finalError) {
        // デバッグ用にエラーメッセージをフィードバックに混ぜて原因を特定しやすくする
        return res.status(200).json({
          scores: { "s1": 75, "s2": 75, "s3": 75, "s4": 75, "s5": 75 },
          commentary: `親子のあたたかい対話ログは裏側で大切に預かっています✨（AIのインク生成で少し微調整が発生したため、今回はフラットなパレットでお届けしています。お子さんの日々のきらめきは独自の彩りで育まれていますので、どうぞそのまま見守ってあげてくださいね！）\n\n※開発用エラーメモ: ${finalError.message}`
        });
      }
    }

    // ==========================================
    // 2. 途中のステップ：分割深掘り質問の生成
    // ==========================================
    let aiQuestion = "";

    if (currentStep === 1) {
      const q2Choice = chosenChoices.s2;
      if (q2Choice === 2 || q2Choice === 1) {
        aiQuestion = "何の本を読みましたか？特に印象に残っている本を教えてください。その時、どんな様子だったか印象に残っていることを教えてください😊";
      } else {
        aiQuestion = "今週はあまり没頭が見られなかったのですね。例えば、周りにおもちゃなど誘惑が多かったり、あるいは年齢的にページをどんどんめくりたい時期だったり、何か思い当たる理由はありますか？（実はすぐめくるのも、その子なりの新しい没頭の形だったりします）";
      }
    } 
    
    else if (currentStep === 2) {
      const q3Choice = chosenChoices.s3;
      if (q3Choice === 0) {
        aiQuestion = "わあ、素晴らしい瞬間ですね！それは何という本の、どんな言葉やフレーズでしたか？どんな場面で出てきたのかもぜひ教えてください！";
      } else {
        return res.status(200).json({ skip: true });
      }
    } 
    
    else if (currentStep === 3) {
      const q4Choice = chosenChoices.s4;
      if (q4Choice === 0 || q4Choice === 1) {
        aiQuestion = "本の世界が遊びに溶け込んでいたのですね！何の本で、どんな風に遊びに取り入れられていたかを教えてください✨";
      } else {
        return res.status(200).json({ skip: true });
      }
    } 
    
    else if (currentStep === 4) {
      if (subStep === 0) {
        aiQuestion = "今週のアプローチについて、どうしてそれ（仕込み、または見守りなど）を選んだのですか？背景にある親御さんの想いを教えてください。";
      } else if (subStep === 1) {
        aiQuestion = "ありがとうございます。結果的にお子さんはその本を読みましたか？読んだ場合、どんな反応だったかもぜひ教えてください！";
      }
    }

    return res.status(200).json({ aiQuestion });

  } catch (error) {
    return res.status(200).json({ 
      aiQuestion: "なるほど、お話を聞かせていただきありがとうございます！もう少し詳しく、その時のエピソードやつぶやきを教えていただけますか？",
      skip: false
    });
  }
}
