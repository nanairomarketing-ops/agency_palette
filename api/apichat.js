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
    // 1. 最終ステップ：親のまなざしをアップデートするフィードバック生成
    // ==========================================
    if (currentStep === 5) {
      try {
        const prompt = `
あなたは、子どもの主体性（読書エージェンシー）を親のあたたかい眼差しから見守る伴走AIです。
親が回答した指標データと、これまでの深掘り対話（自由記述ログ）をもとに、文脈を深く読み解き、「エージェンシーパレット」のスコア（各100点満点）と、あたたかいフィードバックを生成してください。

【フィードバックの最重要指示】
・親が打ったリアルなつぶやき（自由記述）から、「子どものエージェンシーの芽（きらめきや成長）」を具体的に1つ以上見つけ出して言語化してください。
・単にお子さんや親御さんを褒めるだけでなく、「親御さんがその些細な変化や瞬間に気づき、おもしろがったり記録に残そうとしたりした、その『まなざし（視点）』自体が、子どものエージェンシーを育む最高の環境デザインである」という観点を取り入れ、親の観察眼を肯定し、アップデートするようなコメンタリー（250文字程度）を作成してください。
・「点数」「スコア」という言葉は絶対に使用しないでください。

【入力データ】
・選択肢: ${JSON.stringify(chosenChoices || {})}
・親の自由記述ログ: ${JSON.stringify(freeTexts || {})}

【出力フォーマット】
必ず以下のJSONフォーマットのみで返却してください。余計なマークダウンは一切含めないでください。
{
  "scores": { "s1": 85, "s2": 90, "s3": 60, "s4": 95, "s5": 80 },
  "commentary": "（ここに親御さんのまなざしをアップデートするあたたかいメッセージを記述）"
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
          commentary: "今週（最近）もお疲れ様でした。親子のあたたかい対話ログは大切に預かっています✨お子さんの日々のきらめきは独自の彩りで育まれていますので、どうぞそのまま見守ってあげてくださいね！"
        });
      }
    }

    // ==========================================
    // 2. 途中のステップ：あたたかい保育士風クッション ＆ 分岐深掘り
    // ==========================================
    let aiQuestion = "";

    // ーー STEP 1: 没頭（s2）の深掘り ーー
    if (currentStep === 1) {
      const q2Choice = chosenChoices ? chosenChoices.s2 : 0;
      if (q2Choice === 2 || q2Choice === 1) {
        aiQuestion = "すてきですね！お子さんがそこまで夢中になれる一冊、とても気になります。何の本を読みましたか？その時、どんな様子だったか印象に残っていることを教えてください😊";
      } else {
        aiQuestion = "そうだったのですね。年齢的にページをどんどんめくりたい時期だったり、他におもしろそうな誘惑があったりしたのかもしれませんね。何か思い当たる理由はありますか？（実はすぐめくるのも、その子なりの新しい探索の形だったりしますよ✨）";
      }
    } 
    
    // ーー STEP 2: 日常の溢れ出し（s3）の深掘り（2段階） ーー
    else if (currentStep === 2) {
      const q3Choice = chosenChoices ? chosenChoices.s3 : 2;
      if (q3Choice === 0) {
        if (subStep === 0) {
          // 保育士風の共感クッション
          aiQuestion = "わあ、ポロッと言葉が溢れ出るなんて素晴らしい瞬間ですね！👏 それは何という本の、どんな言葉やフレーズでしたか？ぜひ教えてください！";
        } else if (subStep === 1) {
          // 文脈の追加聞き取り（場面深掘り）
          const prevText = freeTexts ? (freeTexts.s3_deep_1 || "") : "";
          // ユーザーの回答に「とき」「場面」「場所」「で」などの文脈キーワードが薄かったら発動
          if (!prevText.includes("とき") && !prevText.includes("場面") && !prevText.includes("際") && !prevText.includes("部屋") && !prevText.includes("で")) {
            aiQuestion = "教えていただきありがとうございます！その言葉、日常のどんな場面で、どんな風に飛び出してきたんですか？ぜひ文脈も知りたいです✨";
          } else {
            // すでに文脈が書かれていれば、保育士風に受け止めて次のステップへスキップ
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
      const prevUserReply = freeTexts ? (freeTexts.s3_deep_1 || freeTexts.s3_deep_2 || "") : "";
      
      // 保育士風の軽い返答クッションを生成
      let cushion = "お話を聞かせていただきありがとうございます！親御さんのあたたかい観察眼、本当にすてきですね。";
      if (prevUserReply) cushion = `「${prevUserReply.slice(0, 15)}…」のくだり、お話を聞いているだけで情景が浮かんで微笑ましい気持ちになります、お答えいただきありがとうございます！`;

      if (q4Choice === 0 || q4Choice === 1) {
        aiQuestion = `${cushion}\n\nさて、本の世界をごっこ遊びやルールに反映させていたとのことですが、何の本で、どんな風に遊びに取り入れられていたかを詳しく教えてください✨`;
      } else {
        // 深掘り対象外ならクッションを挟むためにskipせず、会話を整えて次へ流す用のフラグ処理（今回はシンプルにskip）
        return res.status(200).json({ skip: true });
      }
    } 
    
    // ーー STEP 4: 絵本の選択を広げるアプローチ（s5）の深掘り（2段階） ーー
    else if (currentStep === 4) {
      const prevUserReply = freeTexts ? (freeTexts.s4_deep || "") : "";
      let cushion = "ありがとうございます！なるほど、本の世界がそんな風に遊びに溶け込んでいくのですね。";
      if (prevUserReply) cushion = `わあ、遊びの中にそんな素敵な反映の形があったのですね！お話を聞けて嬉しいです。`;

      if (subStep === 0) {
        aiQuestion = `${cushion}\n\n今回選ばれたそのアプローチ（仕込みや見守りなど）について、どうしてそれを選んだのですか？背景にある想いをぜひ教えてください。`;
      } else if (subStep === 1) {
        aiQuestion = "あたたかい想いを聞かせていただき、ありがとうございます。結果的にお子さんはその本を読みましたか？読んだ場合、どんな反応だったかもぜひ教えてください！";
      }
    }

    return res.status(200).json({ aiQuestion, skip: false });

  } catch (error) {
    return res.status(200).json({ aiQuestion: "なるほど、お話を聞かせていただきありがとうございます！もう少し詳しく教えていただけますか？", skip: false });
  }
}
