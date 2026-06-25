export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { currentStep, subStep, chosenChoices, freeTexts } = req.body || {};
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
    // 2. ユーザーの自由記述（テキスト入力）に対してのみ走る、あたたかい返答ラリー
    // ==========================================
    let aiQuestion = "";

    // ーー STEP 1: 没頭（s2）の選択肢を選んだ後に開く、最初の自由記述の問い ーー
    if (currentStep === 1) {
      const q2Choice = chosenChoices ? chosenChoices.s2 : 0;
      if (q2Choice === 2 || q2Choice === 1) {
        aiQuestion = "じっくり没頭している姿、本当に愛おしいですね😊 お子さんがそこまで夢中になれる一冊、とても気になります。何の本を読みましたか？その時、どんな様子だったか印象に残っていることを教えてください！";
      } else {
        aiQuestion = "そうだったのですね。日によってブームや気分の波もありますよね。何か思い当たる理由はありますか？（実はすぐめくるのも、その子なりの新しい探索の形だったりしますよ✨）";
      }
    } 
    
    // ーー STEP 2: 日常の溢れ出し（s3）の自由入力に対するラリー ーー
    else if (currentStep === 2) {
      const q3Choice = chosenChoices ? chosenChoices.s3 : 2;
      
      if (q3Choice === 0) {
        if (subStep === 0) {
          // 選択肢で「溢れ出た！」を選んだ後の最初の問い（ここは選択肢直後なので、シンプルに質問を提示）
          aiQuestion = "わあ、ポロッと言葉が日常に溢れ出るなんて素晴らしい瞬間ですね！👏 それは何という本の、どんな言葉やフレーズでしたか？ぜひ教えてください！";
        } else if (subStep === 1) {
          // ユーザーから具体的な「フレーズ」を打ってもらった直後のリアルタイム・ラリー！
          const currentReply = freeTexts ? (freeTexts.s3_deep_1 || "") : "";
          let cushion = `「${currentReply.slice(0, 20)}…」という言葉が飛び出してきたのですね！お子さんの頭の中に絵本の世界がしっかり広がっている証拠ですね✨`;
          
          // 文脈のキーワードが含まれていなければ、すかさずその場で深掘り
          if (!currentReply.includes("とき") && !currentReply.includes("場面") && !currentReply.includes("際") && !currentReply.includes("部屋") && !currentReply.includes("で") && !currentReply.includes("話をしてくる")) {
            aiQuestion = `${cushion}\n\nちなみに、それは日常のどんな場面で、どんな風に飛び出してきたんですか？ぜひその時の文脈も教えてください😊`;
          } else {
            // すでに文脈が十分なら、次の選択肢へスキップ
            return res.status(200).json({ skip: true });
          }
        }
      } else {
        return res.status(200).json({ skip: true });
      }
    } 
    
    // ーー STEP 3: 遊びの昇華（s4）の自由入力に対するラリー ーー
    else if (currentStep === 3) {
      const q4Choice = chosenChoices ? chosenChoices.s4 : 2;
      
      if (q4Choice === 0 || q4Choice === 1) {
        // 選択肢直後なのでシンプルに深掘りの問いを提示
        aiQuestion = "本の世界が遊びに溶け込んでいたのですね！子どもの創造力って本当に豊かです✨ 何の本で、どんな風に遊びやルールに取り入れられていたかを詳しく教えてください！";
      } else {
        return res.status(200).json({ skip: true });
      }
    } 
    
    // ーー STEP 4: 絵本の選択を広げるアプローチ（s5）の自由入力に対するラリー ーー
    else if (currentStep === 4) {
      // 直前（ごっこ遊び）のユーザーのつぶやきへのクッション
      const lastS4Reply = freeTexts ? (freeTexts.s4_deep || "") : "";
      let s4Cushion = "お話を聞かせていただきありがとうございます！";
      if (lastS4Reply) {
        s4Cushion = `わあ、遊びの中にそんな素敵な反映の形（${lastS4Reply.slice(0, 10)}…）があったのですね！本の世界を自分なりに表現していてすごいです👏`;
      }

      if (subStep === 0) {
        // 選択肢でアプローチを選んだ直後
        aiQuestion = `${s4Cushion}\n\n今回取り組まれたそのアプローチについて、どうしてそれを選んだのですか？背景にある想いをぜひ教えてください😊`;
      } else if (subStep === 1) {
        // 「想い」をテキスト入力してもらった直後
        const s5Deep1Reply = freeTexts ? (freeTexts.s5_deep_1 || "") : "";
        aiQuestion = `「${s5Deep1Reply.slice(0, 15)}…」というあたたかい想い、ジーンときます。素晴らしい環境のデザインですね。\n\n結果的にお子さんはその本を読みましたか？読んだ場合、どんな反応だったかもぜひ教えてください！`;
      }
    }

    return res.status(200).json({ aiQuestion, skip: false });

  } catch (error) {
    return res.status(200).json({ aiQuestion: "なるほど、お話を聞かせていただきありがとうございます！もう少し詳しく教えていただけますか？", skip: false });
  }
}
