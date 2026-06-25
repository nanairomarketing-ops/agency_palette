export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { currentStep, isChoiceResponse, subStep, chosenChoices, freeTexts } = req.body || {};
  const apiKey = process.env.GEMINI_API_KEY || process.env.gemini_api_key || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(200).json({ 
      scores: { "s1": 60, "s2": 60, "s3": 60, "s4": 60, "s5": 60 },
      commentary: "⚠️Gemini APIキーが設定されていません。"
    });
  }

  try {
    // ==========================================
    // 1. 最終ステップ：フィードバック生成
    // ==========================================
    if (currentStep === 5) {
      try {
        const prompt = `
あなたは、子どもの主体性（読書エージェンシー）を親のあたたかい眼差しから見守る伴走AIです。
親が回答した指標データと、これまでの深掘り対話（自由記述ログ）をもとに、文脈を深く読み解き、「エージェンシーパレット」のスコア（各100点満点）と、あたたかいフィードバックを生成してください。

【フィードバックの最重要指示】
・親が打ったリアルなつぶやき（自由記述）から、「子どものエージェンシーの芽（きらめきや成長）」を具体的に1つ以上見つけ出して言語化してください。
・「親御さんがその些細な変化や瞬間に気づき、おもしろがったり記録に残そうとしたりした、その『まなざし（視点）』自体が、子どものエージェンシーを育む最高の環境デザインである」という観点を取り入れ、親の観察眼を肯定し、アップデートするようなコメンタリー（250文字程度）を作成してください。
・「点数」「スコア」という言葉は絶対に使用しないでください。

【入力データ】
・選択肢: ${JSON.stringify(chosenChoices || {})}
・親の自由記述ログ: ${JSON.stringify(freeTexts || {})}

【出力フォーマット】
必ず以下のJSONフォーマットのみで返却してください。
{
  "scores": { "s1": 85, "s2": 90, "s3": 60, "s4": 95, "s5": 80 },
  "commentary": "（メッセージ）"
}
`;

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        
        const data = await response.json();
        let text = data.candidates[0].content.parts[0].text.trim();
        const startIdx = text.indexOf('{');
        const endIdx = text.lastIndexOf('}');
        if (startIdx !== -1 && endIdx !== -1) text = text.substring(startIdx, endIdx + 1);

        return res.status(200).json(JSON.parse(text));
      } catch (e) {
        return res.status(200).json({
          scores: { "s1": 80, "s2": 80, "s3": 80, "s4": 80, "s5": 80 },
          commentary: "今週（最近）もお疲れ様でした。親子のあたたかい対話ログは大切に預かっています✨"
        });
      }
    }

    // ==========================================
    // 2. 選択肢に対する純粋なあたたかい返答（シナリオを止めない相槌）
    // ==========================================
    if (isChoiceResponse) {
      let choiceFeedback = "お話を聞かせていただきありがとうございます！";
      
      if (currentStep === 0) { // s1(本の読み方)へのリアクション
        choiceFeedback = "なるほど、そんな風に本を開く時間があったのですね。親子の心地よい距離感が伝わってきます🌱";
      } else if (currentStep === 1) { // s2(没頭)へのリアクション
        const q2Choice = chosenChoices ? chosenChoices.s2 : 0;
        if (q2Choice === 2 || q2Choice === 1) {
          choiceFeedback = "じっくり没頭している姿、本当に愛おしいですね。その世界にグッと入り込んでいる時間が素晴らしいです😊";
        } else {
          choiceFeedback = "そうだったのですね。日によって色々なブームや気分の波もありますよね、優しく見守られているのが素敵です✨";
        }
      } else if (currentStep === 2) { // s3(日常の溢れ出し)へのリアクション
        const q3Choice = chosenChoices ? chosenChoices.s3 : 2;
        if (q3Choice === 0) {
          choiceFeedback = "わあ、ポロッと言葉が日常に溢れ出るなんて素晴らしい瞬間ですね！👏";
        } else {
          choiceFeedback = "なるほど、お子さんのタイミングで頭の中にじっくり熟成されているのかもしれませんね。";
        }
      } else if (currentStep === 3) { // s4(遊びの昇華)へのリアクション
        const q4Choice = chosenChoices ? chosenChoices.s4 : 2;
        if (q4Choice === 0 || q4Choice === 1) {
          choiceFeedback = "本の世界が遊びに溶け込んでいたのですね！子どもの創造力って本当に豊かです✨";
        } else {
          choiceFeedback = "なるほど、静かに本の世界を楽しんだり、自分の中で味わったりしている時間なのかもしれませんね😊";
        }
      } else if (currentStep === 4) { // s5(広げるアプローチ)へのリアクション
        choiceFeedback = "素敵なアプローチですね。親御さんのあたたかい想いや仕込みが、これからの彩りに繋がっていきますね✨";
      }

      return res.status(200).json({ aiQuestion: choiceFeedback, skip: false });
    }

    // ==========================================
    // 3. 自由記述（テキスト入力）に対するその場での深掘り・ラリー
    // ==========================================
    let aiQuestion = "";

    if (currentStep === 1) {
      const userReply = freeTexts ? (freeTexts.s2_deep || "") : "";
      aiQuestion = `「${userReply.slice(0, 15)}…」の様子、お話を聞いているだけで情情景が浮かんで微笑ましいです！教えていただきありがとうございます。`;
    } 
    
    else if (currentStep === 2) {
      if (subStep === 0) {
        aiQuestion = "それは何という本の、どんな言葉やフレーズでしたか？ぜひ教えてください！";
      } else if (subStep === 1) {
        const currentReply = freeTexts ? (freeTexts.s3_deep_1 || "") : "";
        let cushion = `「${currentReply.slice(0, 20)}…」という言葉が飛び出してきたの遷ですね！お子さんの頭の中に世界が広がっている証拠ですね✨`;
        
        if (!currentReply.includes("とき") && !currentReply.includes("場面") && !currentReply.includes("際") && !currentReply.includes("部屋") && !currentReply.includes("で") && !currentReply.includes("話をしてくる")) {
          aiQuestion = `${cushion}\n\nちなみに、それは日常のどんな場面で、どんな風に飛び出してきたんですか？ぜひその時の文脈も教えてください😊`;
        } else {
          return res.status(200).json({ skip: true });
        }
      }
    } 
    
    else if (currentStep === 3) {
      const userReply = freeTexts ? (freeTexts.s4_deep || "") : "";
      aiQuestion = `わあ、遊びの中にそんな素敵な反映の形（${userReply.slice(0, 12)}…）があったのですね！本の世界を自分なりに料理していてすごいです。`;
    } 
    
    else if (currentStep === 4) {
      if (subStep === 0) {
        aiQuestion = "今回取り組まれたそのアプローチについて、どうしてそれを選んだのですか？背景にある想いをぜひ教えてください😊";
      } else if (subStep === 1) {
        const s5Deep1Reply = freeTexts ? (freeTexts.s5_deep_1 || "") : "";
        aiQuestion = `「${s5Deep1Reply.slice(0, 15)}…」というあたたかい想い、ジーンときます。素晴らしい環境のデザインですね。\n\n結果的にお子さんはその本を読みましたか？読んだ場合、どんな反応だったかもぜひ教えてください！`;
      }
    }

    return res.status(200).json({ aiQuestion, skip: false });

  } catch (error) {
    return res.status(200).json({ aiQuestion: "なるほど、お話を聞かせていただきありがとうございます！もう少し詳しく教えていただけますか？", skip: false });
  }
}
