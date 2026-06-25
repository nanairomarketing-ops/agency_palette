export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { currentStep, subStep, chosenChoices, freeTexts } = req.body || {};
  const apiKey = process.env.GEMINI_API_KEY || process.env.gemini_api_key || process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  // サーバー側のデバッグログ
  console.log(`🖥️【サーバー受信データ】Step: ${currentStep}, subStep: ${subStep}`);

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
・親が打ったリアルなつぶやきから、「子どものエージェンシーの芽」を具体的に見つけ出して言語化してください。
・「親御さんがその些細な変化や瞬間に気づき、おもしろがったり記録に残そうとしたりした、その『まなざし（視点）』自体が、子どものエージェンシーを育む最高の環境デザインである」という観点を取り入れ、親の観察眼を全肯定し、アップデートするようなコメンタリー（250文字程度）を作成してください。
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
    // 2. 自由記述に対する【リアルタイム・保育士ラリー】
    // ==========================================
    let aiQuestion = "";

    // ーー STEP 1: 没頭（s2）の選択肢直後の問い ーー
    if (currentStep === 1) {
      const q2Choice = chosenChoices ? chosenChoices.s2 : 0;
      if (q2Choice === 2 || q2Choice === 1) {
        aiQuestion = "じっくり没頭している姿、本当に愛おしいですね😊 お子さんがそこまで夢中になれる一冊、とても気になります。何の本を読みましたか？その時、どんな様子だったか印象に残っていることを教えてください！";
      } else {
        aiQuestion = "そうだったのシーン。日によってブームや気分の波もありますよね。何か思い当たる理由はありますか？（実はすぐめくるのも、その子なりの新しい探索の形だったりしますよ✨）";
      }
      return res.status(200).json({ aiQuestion, skip: false });
    } 
    
    // ーー STEP 2: 没頭のテキストを打った直後の打ち返し ーー
    if (currentStep === 2 && subStep === 0) {
      const s2Reply = freeTexts ? (freeTexts.s2_deep || "") : "";
      let cushion = "お話を聞かせていただきありがとうございます！親御さんのあたたかい観察眼、本当にすてきですね🌱";
      if (s2Reply) {
        cushion = `なるほど！「${s2Reply}」のそんな姿が見られたのですね。お話を聞いているだけでこちらまで微笑ましい気持ちになります😊`;
      }
      aiQuestion = `${cushion}\n\nでは、次の質問です。\n読んだ本の言葉や場面が、日常の会話の中で出てきたことはありましたか？`;
      return res.status(200).json({ aiQuestion, skip: false });
    }

    // ーー STEP 3: 日常の溢れ出し（s3）の選択肢直後の問い ーー
    if (currentStep === 2 && subStep === 1) {
      aiQuestion = "わあ、ポロッと言葉が日常に溢れ出るなんて素晴らしい瞬間ですね！👏 それは何という本の、どんな言葉やフレーズでしたか？ぜひ教えてください！";
      return res.status(200).json({ aiQuestion, skip: false });
    }

    // ーー STEP 4: フレーズを打った直後の打ち返し ＆ 場面深掘り ーー
    if (currentStep === 3) {
      const currentReply = freeTexts ? (freeTexts.s3_deep_1 || "") : "";
      let cushion = `「${currentReply}」という言葉が飛び出してきたのですね！お子さんの頭の中に世界が広がっている証拠ですね✨`;
      
      if (!currentReply.includes("とき") && !currentReply.includes("場面") && !currentReply.includes("際") && !currentReply.includes("部屋") && !currentReply.includes("で") && !currentReply.includes("話をしてくる")) {
        aiQuestion = `${cushion}\n\nちなみに、それは日常のどんな場面で、どんな風に飛び出してきたんですか？ぜひその時の文脈も教えてください😊`;
        return res.status(200).json({ aiQuestion, skip: false });
      } else {
        let s3Cushion = `「${currentReply}」のエピソード、ふとした瞬間に溢れ出るの最高に愛おしいですね👏\n\n次の質問です。\n今週（最近）、本の世界観をごっこ遊びやルールに反映させている様子はありましたか？`;
        return res.status(200).json({ aiQuestion: s3Cushion, skip: false });
      }
    } 

    // ーー STEP 5: ごっこ遊びの深掘り質問の提示 ーー
    if (currentStep === 4 && subStep === 0) {
      const q4Choice = chosenChoices ? chosenChoices.s4 : 2;
      if (q4Choice === 0 || q4Choice === 1) {
        aiQuestion = "本の世界が遊びに溶け込んでいたのですね！子どもの創造力って本当に豊かです✨ 何の本で、どんな風に遊びやルールに取り入れられていたかを詳しく教えてください！";
        return res.status(200).json({ aiQuestion, skip: false });
      } else {
        return res.status(200).json({ skip: true });
      }
    } 

    // ーー STEP 6: ごっこ遊びを打った直後の打ち返し ーー
    if (currentStep === 4 && subStep === 1) {
      const s4Reply = freeTexts ? (freeTexts.s4_deep || "") : "";
      let cushion = "お話を聞かせていただきありがとうございます！";
      if (s4Reply) {
        cushion = `わあ、遊びの中にそんな素敵な反映の形（${s4Reply}）があったのですね！本の世界を自分なりに表現していてすごいです👏`;
      }
      aiQuestion = `${cushion}\n\n最後に、今週（最近）あなたご自身は子供の絵本の選択が広がるようなアプローチはしましたか？`;
      return res.status(200).json({ aiQuestion, skip: false });
    }

    // ーー STEP 7: 最初のアプローチの想いを打った直後の問い ーー
    if (currentStep === 4 && subStep === 2) {
      const s5Deep1Reply = freeTexts ? (freeTexts.s5_deep_1 || "") : "";
      aiQuestion = `「${s5Deep1Reply}」というあたたかい想い、ジーンときます。親御さんの素晴らしい環境のデザイン（仕込み）ですね。\n\n結果的にお子さんはその本を読みましたか？読んだ場合、どんな反応だったかもぜひ教えてください！`;
      return res.status(200).json({ aiQuestion, skip: false });
    }

    // どの条件にも引っかからなかったときの「超おしゃべりな保育士の安全弁」
    const lastFreeText = freeTexts ? Object.values(freeTexts).pop() : "";
    let safeReply = "お話を聞かせていただき本当にありがとうございます！親御さんのあたたかい眼差し、ジーンとします🌱";
    if (lastFreeText) {
      safeReply = `なるほど！「${lastFreeText}」という素敵なエピソードがあったのですね。親御さんがそこをしっかりキャッチされているのが素晴らしいです👏\n\nそれでは、次のステップに進んでみましょう！`;
    }
    return res.status(200).json({ aiQuestion: safeReply, skip: false });

  } catch (error) {
    return res.status(200).json({ aiQuestion: "なるほど、お話を聞かせていただきありがとうございます！もう少し詳しく教えていただけますか？", skip: false });
  }
}
