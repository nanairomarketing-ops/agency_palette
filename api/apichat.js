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
必ず以下のJSONフォーマットのみで返却してください。余計なマークダウンは一切含めないでください。
{
  "scores": { "s1": 85, "s2": 90, "s3": 60, "s4": 95, "s5": 80 },
  "commentary": "（コメンタリー）"
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
    // 2. 途中のステップ：その場で打ち返すリアルタイム・ラリーロジック
    // ==========================================
    let aiQuestion = "";

    // ーー STEP 1: 没頭（s2）の自由記述に対する打ち返し ーー
    if (currentStep === 1) {
      const userReply = freeTexts ? (freeTexts.s2_deep || "") : "";
      const q2Choice = chosenChoices ? chosenChoices.s2 : 0;
      
      let cushion = "お話を聞かせていただきありがとうございます！";
      if (q2Choice === 2 || q2Choice === 1) {
        cushion = `なるほど！「${userReply.slice(0, 12)}…」の本にそこまで夢中になっていたのですね。その様子を想像するだけで愛おしいです😊`;
      } else {
        cushion = "なるほど、日によって色々なブームや気分の波もありますよね。親御さんがそこを優しく見守られているのが素敵です✨";
      }

      // 次の質問（日常の溢れ出し：選択肢）へ進むためのダミーではなく、ここはHTML側のフローで自動で choice に移るため、
      // この文言がそのまま使われます。
      aiQuestion = cushion;
    } 
    
    // ーー STEP 2: 日常の溢れ出し（s3）の深掘り ーー
    else if (currentStep === 2) {
      const q3Choice = chosenChoices ? chosenChoices.s3 : 2;
      
      if (q3Choice === 0) {
        if (subStep === 0) {
          // 選択肢で「溢れ出た！」を選んだ直後
          aiQuestion = "わあ、ポロッと言葉が溢れ出るなんて素晴らしい瞬間ですね！👏 それは何という本の、どんな言葉やフレーズでしたか？ぜひ教えてください！";
        } else if (subStep === 1) {
          // 「言葉」を教えてもらった直後 ➡️ 【ここがズレていた場所です！】
          const currentReply = freeTexts ? (freeTexts.s3_deep_1 || "") : "";
          
          // 今届いたホヤホヤの言葉に対して、その場ですぐに相槌を打つ
          let cushion = `「${currentReply.slice(0, 20)}…」という言葉が飛び出してきたのですね！お子さんの頭の中に世界が広がっている証拠ですね✨`;
          
          // 文脈（場面）キーワードが入っていなければ、その場ですかさず深掘り
          if (!currentReply.includes("とき") && !currentReply.includes("場面") && !currentReply.includes("際") && !currentReply.includes("部屋") && !currentReply.includes("で") && !currentReply.includes("話をしてくる")) {
            aiQuestion = `${cushion}\n\nちなみに、それは日常のどんな場面で、どんな風に飛び出してきたんですか？ぜひその時の文脈も教えてください😊`;
          } else {
            // すでに文脈が入っていれば、このサブステップは用済みなので次へ流す（skip）
            return res.status(200).json({ skip: true });
          }
        }
      } else {
        return res.status(200).json({ skip: true });
      }
    } 
    
    // ーー STEP 3: 遊びの昇華（s4）の深掘り ーー
    else if (currentStep === 3) {
      const q4Choice = chosenChoices ? chosenChoices.s4 : 2;
      const userReply = freeTexts ? (freeTexts.s4_deep || "") : "";
      
      // 直前（STEP2の最後、または文脈深掘り）のユーザーのつぶやきへのクッション
      // s3_deep_2 があればそれを、なければ s3_deep_1 を見る
      const lastS3Reply = freeTexts ? (freeTexts.s3_deep_2 || freeTexts.s3_deep_1 || "") : "";
      let cushion = "お話を聞かせていただきありがとうございます！親のあたたかい観察眼、本当にすてきですね。";
      if (lastS3Reply) {
        cushion = `「${lastS3Reply.slice(0, 15)}…」のくだり、お話を聞いているだけで情景が浮かんで微笑ましい気持ちになります！教えていただきありがとうございます。`;
      }

      if (q4Choice === 0 || q4Choice === 1) {
        aiQuestion = `${cushion}\n\nさて、本の世界をごっこ遊びやルールに反映させていたとのことですが、何の本で、どんな風に遊びに取り入れられていたかを詳しく教えてください✨`;
      } else {
        return res.status(200).json({ skip: true });
      }
    } 
    
    // ーー STEP 4: 絵本の選択を広げるアプローチ（s5）の深掘り ーー
    else if (currentStep === 4) {
      const userReply = freeTexts ? (freeTexts.s4_deep || "") : "";
      let cushion = "お話を聞かせていただきありがとうございます！";
      if (userReply) {
        cushion = `わあ、遊びの中にそんな素敵な反映の形（${userReply.slice(0, 10)}…）があったのですね！本の世界を自分なりに料理していてすごいです。`;
      }

      if (subStep === 0) {
        aiQuestion = `${cushion}\n\n今回取り組まれたそのアプローチについて、どうしてそれを選んだのですか？背景にある想いをぜひ教えてください。`;
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
