import { useState, useEffect } from "react";
import { saveToDrive, restoreFromDrive } from "./driveBackup";

// ================= デザイントークン =================
const C = {
  paper: "#F5F6F8",
  card: "#FFFFFF",
  ink: "#1E2A4A",        // 万年筆の紺インク
  inkSoft: "#5B6785",
  line: "#E3E6EC",
  marker: "#FFE24B",     // 蛍光マーカー
  red: "#E4573D",        // 赤ペン(締切)
  green: "#2E9E6B",
  blue: "#3D6CD9",
  purple: "#8A5CC9",
  orange: "#E88A2D",
};

const STAGES = ["気になる", "説明会", "インターン応募", "インターン参加", "本選考応募", "選考中", "内定"];
const STAGE_COLOR = {
  "気になる": "#9AA3B5", "説明会": C.blue, "インターン応募": C.purple,
  "インターン参加": C.purple, "本選考応募": C.orange, "選考中": C.orange, "内定": C.green,
};
const EVENT_TYPES = {
  "説明会": C.blue, "インターン": C.purple, "ES締切": C.red,
  "Webテスト": C.orange, "面接": C.green, "その他": "#9AA3B5",
};
const PRIORITY = { A: "第一志望群", B: "興味あり", C: "検討中" };

// ================= AIプロンプト生成 =================
const buildResearchPrompt = c => `あなたは新卒就活の企業研究を支援するキャリアアドバイザーです。
「${c.name}」${c.industry ? `(${c.industry})` : ""}について、最新の情報を調べて以下を整理してください。

1. 事業内容と収益の柱(何で稼いでいる会社か)
2. 業界内での立ち位置と、主要競合と比べた強み・弱み
3. 直近1年の重要ニュースと、中期経営計画・今後の方向性
4. 新卒採用で求める人物像(採用サイトや社員インタビューから読み取れること)
5. 説明会や面接で好印象な「逆質問」の案を3つ
${c.research.appeal ? `\n参考: 私がこの会社に惹かれている点は「${c.research.appeal}」です。この観点に関連する情報や逆質問があれば優先してください。\n` : ""}
条件:
- 情報が古い/不確かな場合はその旨を明記してください
- 就活ノートに貼れるよう、見出し+箇条書きで簡潔にまとめてください`;

const buildEsPrompt = (company, es) => `あなたは新卒採用のエントリーシート添削経験が豊富なキャリアコンサルタントです。以下のESを添削してください。

【企業】${company.name}${company.industry ? `(${company.industry})` : ""}
【設問】${es.question}(字数目安: ${es.limit}字)
【現在の文章(${es.draft.length}字)】
${es.draft || "(まだ下書きがありません。この設問の構成案から一緒に考えてください)"}

以下の5つの観点で添削してください:
1. 結論ファースト: 一文目で設問に答えられているか
2. 具体性: 数字や固有の行動で語れているか。「誰にでも書ける表現」があれば指摘
3. 設問の意図: 企業がこの設問で知りたいこととズレていないか
4. 一貫性: 経験→行動→学びの筋が通っているか
5. 字数: 削るべき箇所・膨らませるべき箇所

出力の順番:
① 良い点(先に必ず挙げる) → ② 改善点を優先度順に → ③ 構成案(骨子)
※完成文をそのまま渡すのではなく、私が自分の言葉で書き直せるように導いてください。`;

// ================= 初期サンプルデータ =================
const initCompanies = [
  {
    id: 1, name: "株式会社ミライ商事", industry: "総合商社", priority: "A", stage: "本選考応募",
    research: {
      business: "資源・食料・インフラの3事業が柱。近年は再生可能エネルギー投資を拡大中。",
      appeal: "若手から海外駐在のチャンスがある。OB訪問で「挑戦を歓迎する文化」と聞いた。",
      concerns: "配属リスク。初期配属の希望が通る割合を面接で質問したい。",
    },
    esList: [
      { id: 1, question: "学生時代に力を入れたこと(400字)", limit: 400, status: "提出済", draft: "私はゼミの共同研究プロジェクトでリーダーを務め、メンバー間の意見対立を調整しながら学会発表まで導いた経験があります。当初は方向性の違いから議論が停滞しましたが、全員と個別に対話し、各自の強みを活かせる役割分担を再設計しました。結果、研究は学内発表会で優秀賞を受賞しました。この経験から、多様な意見をまとめ成果につなげる調整力を学びました。" },
      { id: 2, question: "志望動機(300字)", limit: 300, status: "下書き", draft: "貴社の再生可能エネルギー事業に関心があり…(構成メモ: ①原体験→②なぜ商社→③なぜミライ商事)" },
    ],
  },
  {
    id: 2, name: "テックブリッジ株式会社", industry: "IT・SaaS", priority: "A", stage: "インターン参加",
    research: {
      business: "中小企業向け業務SaaSを展開。導入社数3万社、シェア国内2位。",
      appeal: "夏インターンで社員の距離が近いと感じた。プロダクト志向の文化。",
      concerns: "配属部署による業務の差が大きそう。カジュアル面談で確認する。",
    },
    esList: [
      { id: 1, question: "あなたが困難を乗り越えた経験(400字)", limit: 400, status: "作成中", draft: "アルバイト先のカフェで新人教育の仕組みを作った話を書く。①課題: 離職率 ②行動: マニュアル+バディ制度 ③結果: 定着率改善。数字を入れる。" },
    ],
  },
  {
    id: 3, name: "はまなす銀行", industry: "金融", priority: "B", stage: "説明会",
    research: { business: "地方銀行。中小企業向け融資とDX支援に注力。", appeal: "地域経済に貢献できる。転勤範囲が県内中心。", concerns: "業界全体の再編動向をニュースで追う。" },
    esList: [],
  },
  {
    id: 4, name: "グリーンフーズ株式会社", industry: "食品メーカー", priority: "B", stage: "気になる",
    research: { business: "冷凍食品大手。プラントベース食品の新ブランドを昨年立ち上げ。", appeal: "", concerns: "" },
    esList: [],
  },
];

const initEvents = [
  { id: 1, companyId: 3, type: "説明会", title: "はまなす銀行 オンライン説明会", date: "2026-07-03", time: "14:00" },
  { id: 2, companyId: 1, type: "ES締切", title: "ミライ商事 志望動機ES締切", date: "2026-07-06", time: "23:59" },
  { id: 3, companyId: 2, type: "面接", title: "テックブリッジ インターン後面談", date: "2026-07-08", time: "16:00" },
  { id: 4, companyId: 1, type: "Webテスト", title: "ミライ商事 SPI受検期限", date: "2026-07-10", time: "23:59" },
  { id: 5, companyId: 2, type: "インターン", title: "テックブリッジ 2day選抜インターン", date: "2026-07-18", time: "10:00" },
];

const NOTE_CATEGORIES = {
  "説明会メモ": C.blue, "インターンメモ": C.purple, "OB・OG訪問": C.green,
  "面接振り返り": C.orange, "自己分析": C.red, "その他": "#9AA3B5",
};

const initNotes = [
  { id: 1, companyId: 3, category: "説明会メモ", title: "はまなす銀行 業界研究会", date: "2026-06-25", body: "・地銀のDX支援部門が拡大中、文系でもIT企画に関われる\n・登壇した若手社員は2年目で法人担当\n・「地域のために働きたい人」を繰り返し強調→志望動機に接続できそう" },
  { id: 2, companyId: 2, category: "インターンメモ", title: "テックブリッジ 1dayワーク振り返り", date: "2026-06-20", body: "・グループワークで顧客ヒアリング役を担当。メンターから「質問の深掘りが良い」とFB\n・社員の雰囲気: フラット、雑談しやすい\n・反省: 発表で結論を先に言えなかった→次回はPREPを意識" },
  { id: 3, companyId: null, category: "自己分析", title: "ガクチカのネタ帳", date: "2026-06-15", body: "①ゼミ共同研究のリーダー経験(調整力)\n②カフェバイトの新人教育(仕組みづくり)\n③長期インターンの営業同行(傾聴力)\n→軸: 「人と組織の間をつなぐ」が共通項かも" },
];

const _now = new Date();
const TODAY = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate());
const todayStr = () => `${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, "0")}-${String(TODAY.getDate()).padStart(2, "0")}`;

// ================= 共通パーツ =================
const Chip = ({ text, color }) => (
  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: color + "1A", color }}>{text}</span>
);

const SectionTitle = ({ children }) => (
  <h2 className="text-base font-bold mb-3" style={{ color: C.ink }}>
    <span style={{ background: `linear-gradient(transparent 60%, ${C.marker} 60%)`, padding: "0 2px" }}>{children}</span>
  </h2>
);

// URLにプロンプトを埋め込める上限の目安。超えたらコピー+貼り付け方式に切り替える
const AI_URL_LIMIT = 6000;
const AI_TARGETS = [
  { name: "ChatGPT", buildUrl: t => `https://chatgpt.com/?q=${encodeURIComponent(t)}`, home: "https://chatgpt.com/" },
  { name: "Claude", buildUrl: t => `https://claude.ai/new?q=${encodeURIComponent(t)}`, home: "https://claude.ai/new" },
  { name: "Gemini", buildUrl: null, home: "https://gemini.google.com/app" }, // プロンプト埋め込みURL非対応
];

function PromptModal({ title, text, onClose }) {
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");
  const copyText = async () => {
    try { await navigator.clipboard.writeText(text); return true; }
    catch { return false; /* 手動コピー用にテキストは表示済み */ }
  };
  const copy = async () => {
    if (await copyText()) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  };
  const openAI = async ai => {
    await copyText(); // どのAIでも、貼り付けで済むよう先にコピーしておく
    const prefilled = ai.buildUrl && encodeURIComponent(text).length <= AI_URL_LIMIT;
    window.open(prefilled ? ai.buildUrl(text) : ai.home, "_blank", "noopener");
    setNotice(prefilled
      ? `${ai.name}を開きました。もし質問が入力されていなければ、入力欄に貼り付け(Ctrl+V)してください。`
      : `プロンプトをコピーして${ai.name}を開きました。入力欄に貼り付け(Ctrl+V)して送信してください。`);
  };
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: "rgba(30,42,74,0.4)" }} onClick={onClose}>
      <div className="rounded-2xl p-5 w-full max-w-lg space-y-3 max-h-full overflow-y-auto" style={{ background: C.card }} onClick={e => e.stopPropagation()}>
        <div className="font-black" style={{ color: C.ink }}>🤖 {title}</div>
        <p className="text-xs leading-relaxed" style={{ color: C.inkSoft }}>
          ふだん使っているAI(無料プランでOK)を選ぶと、下のプロンプトを持ってAIが開きます。返ってきた回答は、このノートのメモやESの下書きに保存しておきましょう。
        </p>
        <div className="flex gap-2 flex-wrap">
          {AI_TARGETS.map(ai => (
            <button key={ai.name} onClick={() => openAI(ai)}
              className="flex-1 px-3 py-2 rounded-lg text-sm font-bold text-white whitespace-nowrap"
              style={{ background: C.ink }}>
              {ai.name}で開く
            </button>
          ))}
        </div>
        {notice && (
          <p className="text-xs leading-relaxed px-3 py-2 rounded-lg" style={{ background: "#F0F6EF", color: C.green, border: `1px solid ${C.green}55` }}>
            ✓ {notice}
          </p>
        )}
        <textarea readOnly value={text} rows={12}
          className="w-full text-xs rounded-lg p-3 outline-none resize-y leading-relaxed"
          style={{ background: "#F8F9FB", border: `1px solid ${C.line}`, color: C.ink }}
          onFocus={e => e.target.select()} />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-sm font-bold" style={{ color: C.inkSoft }}>閉じる</button>
          <button onClick={copy} className="px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ background: copied ? C.green : C.ink }}>
            {copied ? "✓ コピーしました" : "プロンプトをコピー"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StagePipeline({ stage, onChange }) {
  const idx = STAGES.indexOf(stage);
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {STAGES.map((s, i) => (
        <button key={s} onClick={() => onChange && onChange(s)} className="flex items-center gap-1">
          <span
            className="text-xs px-2 py-1 rounded-md font-bold whitespace-nowrap"
            style={{
              background: i <= idx ? STAGE_COLOR[stage] : "#EEF0F4",
              color: i <= idx ? "#fff" : "#9AA3B5",
              opacity: i < idx ? 0.45 : 1,
              border: i === idx ? `2px solid ${C.ink}` : "2px solid transparent",
            }}
          >{s}</span>
          {i < STAGES.length - 1 && <span style={{ color: "#C6CCD8" }}>›</span>}
        </button>
      ))}
    </div>
  );
}

// ================= ダッシュボード =================
function Dashboard({ companies, events, openCompany }) {
  const upcoming = events
    .filter(e => new Date(e.date) >= TODAY)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  const esAll = companies.flatMap(c => c.esList.map(es => ({ ...es, company: c })));
  const esWorking = esAll.filter(e => e.status !== "提出済");
  const stageCount = STAGES.map(s => ({ s, n: companies.filter(c => c.stage === s).length }));
  const daysLeft = d => Math.ceil((new Date(d) - TODAY) / 86400000);

  const kpi = [
    { label: "登録企業", value: companies.length, unit: "社" },
    { label: "今週の予定", value: events.filter(e => { const dl = daysLeft(e.date); return dl >= 0 && dl <= 7; }).length, unit: "件" },
    { label: "作成中のES", value: esWorking.length, unit: "本" },
    { label: "選考中", value: companies.filter(c => ["本選考応募", "選考中"].includes(c.stage)).length, unit: "社" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpi.map(k => (
          <div key={k.label} className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <div className="text-xs font-bold" style={{ color: C.inkSoft }}>{k.label}</div>
            <div className="text-3xl font-black mt-1" style={{ color: C.ink }}>{k.value}<span className="text-sm font-bold ml-1">{k.unit}</span></div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <SectionTitle>直近の予定・締切</SectionTitle>
          {upcoming.length === 0 && <p className="text-sm" style={{ color: C.inkSoft }}>予定はまだありません。カレンダーから追加できます。</p>}
          <div className="space-y-2">
            {upcoming.map(e => {
              const dl = daysLeft(e.date);
              return (
                <div key={e.id} className="flex items-center gap-3 p-2 rounded-lg" style={{ background: dl <= 2 ? C.red + "0D" : "#F8F9FB" }}>
                  <div className="text-center w-12 shrink-0">
                    <div className="text-lg font-black" style={{ color: dl <= 2 ? C.red : C.ink }}>{new Date(e.date).getDate()}</div>
                    <div className="text-xs" style={{ color: C.inkSoft }}>{new Date(e.date).getMonth() + 1}月</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold truncate" style={{ color: C.ink }}>{e.title}</div>
                    <div className="flex gap-2 items-center mt-0.5">
                      <Chip text={e.type} color={EVENT_TYPES[e.type]} />
                      <span className="text-xs" style={{ color: C.inkSoft }}>{e.time}</span>
                    </div>
                  </div>
                  <div className="text-xs font-bold shrink-0" style={{ color: dl <= 2 ? C.red : C.inkSoft }}>
                    {dl === 0 ? "今日" : `あと${dl}日`}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <SectionTitle>選考ステージ別</SectionTitle>
            <div className="space-y-1.5">
              {stageCount.map(({ s, n }) => (
                <div key={s} className="flex items-center gap-2">
                  <div className="text-xs w-24 shrink-0 font-bold" style={{ color: C.inkSoft }}>{s}</div>
                  <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ background: "#EEF0F4" }}>
                    <div className="h-full rounded-full" style={{ width: `${(n / Math.max(companies.length, 1)) * 100}%`, background: STAGE_COLOR[s], transition: "width .3s" }} />
                  </div>
                  <div className="text-xs font-black w-6 text-right" style={{ color: C.ink }}>{n}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <SectionTitle>ESの進み具合</SectionTitle>
            {esAll.length === 0 && <p className="text-sm" style={{ color: C.inkSoft }}>ESはまだ登録されていません。</p>}
            <div className="space-y-2">
              {esAll.slice(0, 4).map((es, i) => (
                <button key={i} onClick={() => openCompany(es.company.id)} className="w-full text-left flex items-center gap-2 p-2 rounded-lg hover:opacity-80" style={{ background: "#F8F9FB" }}>
                  <Chip text={es.status} color={es.status === "提出済" ? C.green : es.status === "作成中" ? C.orange : "#9AA3B5"} />
                  <div className="min-w-0">
                    <div className="text-sm font-bold truncate" style={{ color: C.ink }}>{es.question}</div>
                    <div className="text-xs" style={{ color: C.inkSoft }}>{es.company.name}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ================= 企業一覧・詳細 =================
function Companies({ companies, setCompanies, events, notes, setNotes, selectedId, setSelectedId }) {
  const [name, setName] = useState("");
  const selected = companies.find(c => c.id === selectedId);

  const addCompany = () => {
    if (!name.trim()) return;
    const id = Date.now();
    setCompanies([...companies, { id, name: name.trim(), industry: "", priority: "C", stage: "気になる", research: { business: "", appeal: "", concerns: "" }, esList: [] }]);
    setName(""); setSelectedId(id);
  };
  const update = (id, patch) => setCompanies(companies.map(c => c.id === id ? { ...c, ...patch } : c));

  if (selected) return <CompanyDetail company={selected} update={p => update(selected.id, p)} back={() => setSelectedId(null)} events={events.filter(e => e.companyId === selected.id)} notes={notes} setNotes={setNotes} />;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && addCompany()}
          placeholder="企業名を入力して追加" className="flex-1 rounded-lg px-3 py-2 text-sm outline-none" style={{ background: C.card, border: `1px solid ${C.line}`, color: C.ink }} />
        <button onClick={addCompany} className="px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ background: C.ink }}>＋ 追加</button>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {companies.map(c => (
          <button key={c.id} onClick={() => setSelectedId(c.id)} className="text-left rounded-xl p-4 hover:shadow-md transition-shadow" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-bold" style={{ color: C.ink }}>{c.name}</div>
                <div className="text-xs mt-0.5" style={{ color: C.inkSoft }}>{c.industry || "業界未設定"}</div>
              </div>
              <span className="text-xs font-black w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={{ background: c.priority === "A" ? C.red : c.priority === "B" ? C.orange : "#9AA3B5", color: "#fff" }}
                title={PRIORITY[c.priority]}>{c.priority}</span>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <Chip text={c.stage} color={STAGE_COLOR[c.stage]} />
              <span className="text-xs" style={{ color: C.inkSoft }}>ES {c.esList.length}本</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function CompanyDetail({ company, update, back, events, notes, setNotes }) {
  const [tab, setTab] = useState("research");
  const [editingNote, setEditingNote] = useState(null);
  const [aiPrompt, setAiPrompt] = useState(null);
  const setResearch = (k, v) => update({ research: { ...company.research, [k]: v } });
  const companyNotes = notes.filter(n => n.companyId === company.id).sort((a, b) => b.date.localeCompare(a.date));

  const saveNote = f => {
    if (f.id) setNotes(notes.map(n => n.id === f.id ? f : n));
    else setNotes([...notes, { ...f, id: Date.now() }]);
    setEditingNote(null);
  };

  const addES = () => update({ esList: [...company.esList, { id: Date.now(), question: "設問を入力", limit: 400, status: "下書き", draft: "" }] });
  const updateES = (id, patch) => update({ esList: company.esList.map(e => e.id === id ? { ...e, ...patch } : e) });

  const fields = [
    { k: "business", label: "事業内容・強み", ph: "何をしている会社か、競合との違いは？" },
    { k: "appeal", label: "惹かれた点(志望動機の種)", ph: "説明会・OB訪問で感じたこと、自分の軸との接点" },
    { k: "concerns", label: "気になる点・面接で聞くこと", ph: "不安な点、逆質問の候補" },
  ];

  return (
    <div className="space-y-4">
      <button onClick={back} className="text-sm font-bold" style={{ color: C.inkSoft }}>‹ 企業一覧に戻る</button>
      <div className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-black" style={{ color: C.ink }}>{company.name}</h2>
          <input value={company.industry} onChange={e => update({ industry: e.target.value })} placeholder="業界"
            className="text-xs rounded px-2 py-1 outline-none w-28" style={{ border: `1px solid ${C.line}`, color: C.inkSoft }} />
          <div className="flex gap-1">
            {["A", "B", "C"].map(p => (
              <button key={p} onClick={() => update({ priority: p })} className="text-xs font-black w-6 h-6 rounded-full"
                style={{ background: company.priority === p ? (p === "A" ? C.red : p === "B" ? C.orange : "#9AA3B5") : "#EEF0F4", color: company.priority === p ? "#fff" : "#9AA3B5" }}>{p}</button>
            ))}
          </div>
        </div>
        <div className="mt-3 overflow-x-auto pb-1">
          <StagePipeline stage={company.stage} onChange={s => update({ stage: s })} />
        </div>
        <p className="text-xs mt-1" style={{ color: C.inkSoft }}>ステージをタップすると進捗を更新できます</p>
      </div>

      <div className="flex gap-2">
        {[["research", "企業研究"], ["notes", `メモ (${companyNotes.length})`], ["es", `ES管理 (${company.esList.length})`], ["events", `予定 (${events.length})`]].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)} className="px-3 py-1.5 rounded-lg text-sm font-bold"
            style={{ background: tab === k ? C.ink : C.card, color: tab === k ? "#fff" : C.inkSoft, border: `1px solid ${C.line}` }}>{label}</button>
        ))}
      </div>

      {tab === "research" && (
        <div className="space-y-3">
          <button onClick={() => setAiPrompt({ title: "AIで企業研究するプロンプト", text: buildResearchPrompt(company) })}
            className="w-full py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: C.blue }}>
            🤖 AIで企業研究(プロンプトを自動作成)
          </button>
          {fields.map(f => (
            <div key={f.k} className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
              <div className="text-sm font-bold mb-2" style={{ color: C.ink }}>{f.label}</div>
              <textarea value={company.research[f.k]} onChange={e => setResearch(f.k, e.target.value)} placeholder={f.ph}
                rows={3} className="w-full text-sm rounded-lg p-2 outline-none resize-y" style={{ background: "#F8F9FB", border: `1px solid ${C.line}`, color: C.ink }} />
            </div>
          ))}
        </div>
      )}

      {tab === "notes" && (
        <div className="space-y-3">
          <button onClick={() => setEditingNote({ title: "", category: "説明会メモ", date: todayStr(), companyId: company.id, body: "" })}
            className="w-full py-2 rounded-xl text-sm font-bold" style={{ border: `2px dashed ${C.line}`, color: C.inkSoft }}>＋ この企業のメモを追加</button>
          {companyNotes.length === 0 && <p className="text-sm" style={{ color: C.inkSoft }}>この企業のメモはまだありません。説明会や面接の直後に記録しておくと、志望動機や逆質問の材料になります。</p>}
          {companyNotes.map(n => (
            <NoteCard key={n.id} note={n} companies={[company]}
              onEdit={() => setEditingNote(n)}
              onDelete={() => setNotes(notes.filter(x => x.id !== n.id))} />
          ))}
          {editingNote && <NoteForm initial={editingNote} companies={[company]} onSave={saveNote} onCancel={() => setEditingNote(null)} />}
        </div>
      )}

      {tab === "es" && (
        <div className="space-y-3">
          {company.esList.map(es => (
            <div key={es.id} className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <input value={es.question} onChange={e => updateES(es.id, { question: e.target.value })}
                  className="flex-1 min-w-40 text-sm font-bold outline-none rounded px-2 py-1" style={{ border: `1px solid ${C.line}`, color: C.ink }} />
                <select value={es.status} onChange={e => updateES(es.id, { status: e.target.value })}
                  className="text-xs font-bold rounded px-2 py-1 outline-none" style={{ border: `1px solid ${C.line}`, color: C.ink }}>
                  {["下書き", "作成中", "提出済"].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <textarea value={es.draft} onChange={e => updateES(es.id, { draft: e.target.value })} rows={5}
                placeholder="構成メモ→下書き→完成稿。提出した文章はここに残しておくと面接前に見返せます。"
                className="w-full text-sm rounded-lg p-2 outline-none resize-y leading-relaxed" style={{ background: "#F8F9FB", border: `1px solid ${C.line}`, color: C.ink }} />
              <div className="flex justify-between items-center mt-1 flex-wrap gap-2">
                <div className="flex items-center gap-1 text-xs" style={{ color: C.inkSoft }}>
                  目安 <input type="number" value={es.limit} onChange={e => updateES(es.id, { limit: Number(e.target.value) })}
                    className="w-14 rounded px-1 py-0.5 outline-none" style={{ border: `1px solid ${C.line}` }} /> 字
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={() => setAiPrompt({ title: "ES添削を依頼するプロンプト", text: buildEsPrompt(company, es) })}
                    className="text-xs font-bold px-2 py-1 rounded-lg text-white" style={{ background: C.blue }}>🤖 AI添削</button>
                  <div className="text-xs font-bold" style={{ color: es.draft.length > es.limit ? C.red : C.inkSoft }}>
                    {es.draft.length} / {es.limit} 字
                  </div>
                </div>
              </div>
            </div>
          ))}
          <button onClick={addES} className="w-full py-2 rounded-xl text-sm font-bold" style={{ border: `2px dashed ${C.line}`, color: C.inkSoft }}>＋ 設問を追加</button>
        </div>
      )}

      {tab === "events" && (
        <div className="space-y-2">
          {events.length === 0 && <p className="text-sm" style={{ color: C.inkSoft }}>この企業の予定はまだありません。カレンダータブから追加できます。</p>}
          {events.sort((a, b) => a.date.localeCompare(b.date)).map(e => (
            <div key={e.id} className="rounded-xl p-3 flex items-center gap-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
              <Chip text={e.type} color={EVENT_TYPES[e.type]} />
              <div className="text-sm font-bold" style={{ color: C.ink }}>{e.title}</div>
              <div className="text-xs ml-auto" style={{ color: C.inkSoft }}>{e.date} {e.time}</div>
            </div>
          ))}
        </div>
      )}
      {aiPrompt && <PromptModal title={aiPrompt.title} text={aiPrompt.text} onClose={() => setAiPrompt(null)} />}
    </div>
  );
}

// ================= カレンダー =================
function CalendarView({ events, setEvents, companies }) {
  const [ym, setYm] = useState({ y: TODAY.getFullYear(), m: TODAY.getMonth() });
  const [form, setForm] = useState(null);

  const first = new Date(ym.y, ym.m, 1);
  const startDow = first.getDay();
  const days = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells = [...Array(startDow).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const dateStr = d => `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const save = () => {
    if (!form.title.trim()) return;
    setEvents([...events, { ...form, id: Date.now(), companyId: Number(form.companyId) || null }]);
    setForm(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button onClick={() => setYm(p => ({ y: p.m === 0 ? p.y - 1 : p.y, m: (p.m + 11) % 12 }))} className="px-3 py-1 rounded-lg font-bold" style={{ background: C.card, border: `1px solid ${C.line}`, color: C.ink }}>‹</button>
        <div className="font-black text-lg" style={{ color: C.ink }}>{ym.y}年 {ym.m + 1}月</div>
        <button onClick={() => setYm(p => ({ y: p.m === 11 ? p.y + 1 : p.y, m: (p.m + 1) % 12 }))} className="px-3 py-1 rounded-lg font-bold" style={{ background: C.card, border: `1px solid ${C.line}`, color: C.ink }}>›</button>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <div className="grid grid-cols-7 text-center text-xs font-bold py-2" style={{ color: C.inkSoft, borderBottom: `1px solid ${C.line}` }}>
          {["日", "月", "火", "水", "木", "金", "土"].map((d, i) => <div key={d} style={{ color: i === 0 ? C.red : i === 6 ? C.blue : C.inkSoft }}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, i) => {
            const ds = d ? dateStr(d) : null;
            const evs = d ? events.filter(e => e.date === ds) : [];
            const isToday = d && ym.y === TODAY.getFullYear() && ym.m === TODAY.getMonth() && d === TODAY.getDate();
            return (
              <button key={i} disabled={!d} onClick={() => setForm({ date: ds, time: "10:00", type: "説明会", title: "", companyId: "" })}
                className="min-h-20 p-1 text-left align-top disabled:opacity-0"
                style={{ borderTop: `1px solid ${C.line}`, borderLeft: i % 7 !== 0 ? `1px solid ${C.line}` : "none", background: isToday ? C.marker + "33" : "transparent" }}>
                <div className="text-xs font-bold" style={{ color: isToday ? C.ink : C.inkSoft }}>{d}</div>
                <div className="space-y-0.5 mt-0.5">
                  {evs.slice(0, 3).map(e => (
                    <div key={e.id} className="text-xs truncate rounded px-1 font-bold text-white" style={{ background: EVENT_TYPES[e.type] }}>{e.title}</div>
                  ))}
                  {evs.length > 3 && <div className="text-xs" style={{ color: C.inkSoft }}>+{evs.length - 3}</div>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(EVENT_TYPES).map(([t, col]) => <Chip key={t} text={t} color={col} />)}
      </div>

      {form && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: "rgba(30,42,74,0.4)" }} onClick={() => setForm(null)}>
          <div className="rounded-2xl p-5 w-full max-w-sm space-y-3" style={{ background: C.card }} onClick={e => e.stopPropagation()}>
            <div className="font-black" style={{ color: C.ink }}>{form.date} に予定を追加</div>
            <input autoFocus value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="タイトル(例: ○○社 説明会)"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ border: `1px solid ${C.line}`, color: C.ink }} />
            <div className="flex gap-2">
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })} className="flex-1 rounded-lg px-2 py-2 text-sm outline-none" style={{ border: `1px solid ${C.line}`, color: C.ink }}>
                {Object.keys(EVENT_TYPES).map(t => <option key={t}>{t}</option>)}
              </select>
              <input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} className="rounded-lg px-2 py-2 text-sm outline-none" style={{ border: `1px solid ${C.line}`, color: C.ink }} />
            </div>
            <select value={form.companyId} onChange={e => setForm({ ...form, companyId: e.target.value })} className="w-full rounded-lg px-2 py-2 text-sm outline-none" style={{ border: `1px solid ${C.line}`, color: C.ink }}>
              <option value="">企業と紐づけない</option>
              {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setForm(null)} className="px-3 py-2 rounded-lg text-sm font-bold" style={{ color: C.inkSoft }}>キャンセル</button>
              <button onClick={save} className="px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ background: C.ink }}>保存する</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ================= ES一覧 =================
function ESOverview({ companies, openCompany }) {
  const esAll = companies.flatMap(c => c.esList.map(es => ({ ...es, company: c })));
  const groups = [["作成中", C.orange], ["下書き", "#9AA3B5"], ["提出済", C.green]];
  return (
    <div className="space-y-5">
      <p className="text-sm" style={{ color: C.inkSoft }}>すべての企業のESを横断して確認できます。提出済の文章も残るので、面接前の見直しや他社への使い回し検討に使えます。</p>
      {groups.map(([status, color]) => {
        const list = esAll.filter(e => e.status === status);
        return (
          <div key={status}>
            <div className="flex items-center gap-2 mb-2">
              <Chip text={status} color={color} />
              <span className="text-xs font-bold" style={{ color: C.inkSoft }}>{list.length}本</span>
            </div>
            {list.length === 0 && <p className="text-xs mb-2" style={{ color: "#B5BCC9" }}>なし</p>}
            <div className="space-y-2">
              {list.map((es, i) => (
                <button key={i} onClick={() => openCompany(es.company.id)} className="w-full text-left rounded-xl p-3 hover:shadow-md transition-shadow" style={{ background: C.card, border: `1px solid ${C.line}` }}>
                  <div className="text-sm font-bold" style={{ color: C.ink }}>{es.question}</div>
                  <div className="text-xs mt-0.5" style={{ color: C.inkSoft }}>{es.company.name} ・ {es.draft.length}/{es.limit}字</div>
                  {es.draft && <p className="text-xs mt-1 line-clamp-2" style={{ color: C.inkSoft }}>{es.draft}</p>}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ================= メモ =================
function NoteCard({ note, companies, onEdit, onDelete }) {
  const company = companies.find(c => c.id === note.companyId);
  return (
    <div className="rounded-xl p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div className="flex flex-wrap items-center gap-2">
        <Chip text={note.category} color={NOTE_CATEGORIES[note.category]} />
        {company && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#EEF0F4", color: C.inkSoft }}>{company.name}</span>}
        <span className="text-xs ml-auto" style={{ color: C.inkSoft }}>{note.date}</span>
      </div>
      <div className="font-bold mt-2 text-sm" style={{ color: C.ink }}>{note.title}</div>
      <p className="text-sm mt-1 whitespace-pre-wrap leading-relaxed" style={{ color: C.inkSoft }}>{note.body}</p>
      <div className="flex gap-3 mt-2 justify-end">
        <button onClick={onEdit} className="text-xs font-bold" style={{ color: C.blue }}>編集</button>
        <button onClick={onDelete} className="text-xs font-bold" style={{ color: C.red }}>削除</button>
      </div>
    </div>
  );
}

function NoteForm({ initial, companies, onSave, onCancel }) {
  const [f, setF] = useState(initial);
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 z-50" style={{ background: "rgba(30,42,74,0.4)" }} onClick={onCancel}>
      <div className="rounded-2xl p-5 w-full max-w-md space-y-3 max-h-full overflow-y-auto" style={{ background: C.card }} onClick={e => e.stopPropagation()}>
        <div className="font-black" style={{ color: C.ink }}>{f.id ? "メモを編集" : "メモを追加"}</div>
        <input autoFocus value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="タイトル(例: ○○社 説明会メモ)"
          className="w-full rounded-lg px-3 py-2 text-sm outline-none" style={{ border: `1px solid ${C.line}`, color: C.ink }} />
        <div className="flex gap-2">
          <select value={f.category} onChange={e => setF({ ...f, category: e.target.value })} className="flex-1 rounded-lg px-2 py-2 text-sm outline-none" style={{ border: `1px solid ${C.line}`, color: C.ink }}>
            {Object.keys(NOTE_CATEGORIES).map(t => <option key={t}>{t}</option>)}
          </select>
          <input type="date" value={f.date} onChange={e => setF({ ...f, date: e.target.value })} className="rounded-lg px-2 py-2 text-sm outline-none" style={{ border: `1px solid ${C.line}`, color: C.ink }} />
        </div>
        <select value={f.companyId ?? ""} onChange={e => setF({ ...f, companyId: e.target.value ? Number(e.target.value) : null })}
          className="w-full rounded-lg px-2 py-2 text-sm outline-none" style={{ border: `1px solid ${C.line}`, color: C.ink }}>
          <option value="">企業と紐づけない(自己分析など)</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <textarea value={f.body} onChange={e => setF({ ...f, body: e.target.value })} rows={8}
          placeholder="聞いたこと・感じたこと・次にやることを箇条書きで。&#10;説明会で刺さった言葉は志望動機の材料になります。"
          className="w-full text-sm rounded-lg p-2 outline-none resize-y leading-relaxed" style={{ background: "#F8F9FB", border: `1px solid ${C.line}`, color: C.ink }} />
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-3 py-2 rounded-lg text-sm font-bold" style={{ color: C.inkSoft }}>キャンセル</button>
          <button onClick={() => f.title.trim() && onSave(f)} className="px-4 py-2 rounded-lg text-sm font-bold text-white" style={{ background: C.ink }}>保存する</button>
        </div>
      </div>
    </div>
  );
}

function NotesView({ notes, setNotes, companies }) {
  const [filter, setFilter] = useState("すべて");
  const [editing, setEditing] = useState(null);
  const filtered = notes
    .filter(n => filter === "すべて" || n.category === filter)
    .sort((a, b) => b.date.localeCompare(a.date));

  const save = f => {
    if (f.id) setNotes(notes.map(n => n.id === f.id ? f : n));
    else setNotes([...notes, { ...f, id: Date.now() }]);
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {["すべて", ...Object.keys(NOTE_CATEGORIES)].map(t => (
          <button key={t} onClick={() => setFilter(t)} className="px-3 py-1 rounded-full text-xs font-bold"
            style={{ background: filter === t ? C.ink : C.card, color: filter === t ? "#fff" : C.inkSoft, border: `1px solid ${filter === t ? C.ink : C.line}` }}>{t}</button>
        ))}
        <button onClick={() => setEditing({ title: "", category: "説明会メモ", date: todayStr(), companyId: null, body: "" })}
          className="ml-auto px-4 py-1.5 rounded-lg text-sm font-bold text-white" style={{ background: C.ink }}>＋ メモを追加</button>
      </div>
      {filtered.length === 0 && (
        <div className="rounded-xl p-8 text-center text-sm" style={{ background: C.card, border: `2px dashed ${C.line}`, color: C.inkSoft }}>
          このカテゴリのメモはまだありません。「＋ メモを追加」から記録を始められます。
        </div>
      )}
      <div className="space-y-3">
        {filtered.map(n => (
          <NoteCard key={n.id} note={n} companies={companies}
            onEdit={() => setEditing(n)}
            onDelete={() => setNotes(notes.filter(x => x.id !== n.id))} />
        ))}
      </div>
      {editing && <NoteForm initial={editing} companies={companies} onSave={save} onCancel={() => setEditing(null)} />}
    </div>
  );
}

// ================= 使い方(バックアップガイド) =================
const HelpCard = ({ icon, title, children }) => (
  <div className="rounded-2xl p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
    <div className="font-bold text-sm mb-2" style={{ color: C.ink }}>{icon} {title}</div>
    <div className="text-xs leading-relaxed space-y-2" style={{ color: C.inkSoft }}>{children}</div>
  </div>
);

const Step = ({ n, children }) => (
  <div className="flex gap-2 items-start">
    <span className="shrink-0 w-5 h-5 rounded-full text-white text-xs font-bold flex items-center justify-center" style={{ background: C.ink }}>{n}</span>
    <span>{children}</span>
  </div>
);

function HelpView({ onSaveDrive, onRestoreDrive, driveBusy }) {
  const faqs = [
    ["アプリの運営者や他の人に、私のデータは見えますか?",
      "見えません。データはあなたの端末のブラウザ内と、あなた自身のGoogleドライブにだけ保存されます。サーバーには一切送信されないため、運営者もデータに触れられない仕組みです。"],
    ["Googleの許可画面では、何を許可することになりますか?",
      "「このアプリで作成したファイルの表示・管理」だけです。就活ノートが作ったバックアップファイル以外(Drive内の他のファイルやメール等)には、一切アクセスできません。"],
    ["Driveのスプレッドシートを直接書き換えたら、アプリに反映されますか?",
      "反映されません。スプレッドシートは「見るため」のコピーです。編集してもアプリ側は変わらず、次の保存で上書きされます。また「_backup」シートは復元用データなので削除・編集しないでください。"],
    ["どのくらいの頻度で保存すればいいですか?",
      "週1回が目安です。最後のバックアップから7日たつと画面上部にお知らせが出るので、そのタイミングで「Drive保存」を押せばOKです。"],
    ["Googleアカウントを使いたくない場合は?",
      "ヘッダーの「書き出し」でJSONファイルとして端末に保存できます。復元するときは「読み込み」でそのファイルを選んでください。"],
    ["ブラウザの履歴・サイトデータを削除するとどうなりますか?",
      "この端末のデータは消えますが、Driveに保存してあれば「Drive復元」で元に戻せます。履歴削除の前には必ずバックアップしてください。"],
  ];
  return (
    <div className="space-y-4">
      <SectionTitle>データの保存とバックアップ</SectionTitle>

      <HelpCard icon="💾" title="あなたのデータはどこにある?">
        <p>入力した内容は、<b>この端末のブラウザの中</b>に自動保存されています。サーバーには送信されないので、あなた以外の誰にも見えません。</p>
        <p>ただし裏返すと、<b>端末やブラウザのデータが消えるとノートも消えます</b>。だからバックアップが大切です。</p>
      </HelpCard>

      <HelpCard icon="☁️" title="Driveに保存する(おすすめ・設定不要)">
        <p>あなた自身のGoogleドライブに、スプレッドシート「就活ノート バックアップ」として保存します。事前の設定は不要で、Googleアカウントがあればすぐ使えます。</p>
        <div className="space-y-1.5 pt-1">
          <Step n="1">画面右上の「☁️ Drive保存」を押す</Step>
          <Step n="2">Googleのログイン画面が出たら、自分のアカウントを選ぶ</Step>
          <Step n="3">「このアプリで作成したファイルの表示・管理」を許可する</Step>
          <Step n="4">「保存しました」と出たら完了。2回目からは同じファイルが上書き更新されます</Step>
        </div>
        <p className="pt-1">保存したスプレッドシートはDriveでいつでも開けて、企業リスト・ES・予定・メモが表の形で確認できます(スマホからの見返しにも便利)。</p>
        <button onClick={onSaveDrive} disabled={driveBusy !== null}
          className="mt-1 px-3 py-2 rounded-lg text-xs font-bold text-white disabled:opacity-50" style={{ background: C.ink }}>
          {driveBusy === "save" ? "保存中…" : "☁️ 今すぐDriveに保存する"}
        </button>
      </HelpCard>

      <HelpCard icon="🔄" title="復元する(機種変更・データが消えたとき)">
        <div className="space-y-1.5">
          <Step n="1">新しい端末(またはデータが消えた端末)でこのアプリを開く</Step>
          <Step n="2">「☁️ Drive復元」を押して、<b>保存したときと同じGoogleアカウント</b>でログインする</Step>
          <Step n="3">確認メッセージで OK を押すと、最後に保存した内容がそのまま戻ります</Step>
        </div>
      </HelpCard>

      <HelpCard icon="📄" title="ファイルで書き出す(もう1つの方法)">
        <p>「書き出し」を押すと、全データがJSONファイルとして端末にダウンロードされます。「読み込み」でそのファイルを選べば復元できます。Googleアカウントを使いたくない場合や、二重のバックアップとして併用してください。</p>
      </HelpCard>

      <SectionTitle>AI添削・企業研究</SectionTitle>
      <HelpCard icon="🤖" title="AIとの連携はどうなっている?">
        <p>企業ページの「AIで企業研究」やESの「AI添削」は、<b>あなた自身がふだん使っているAI</b>(ChatGPT・Claude・Geminiなど、無料プランでOK)に依頼する仕組みです。このアプリがAIと直接通信したり、データを送ったりすることはありません。</p>
        <p>「〇〇で開く」ボタンを押すと、添削・調査の依頼文(プロンプト)を持ってそのAIのページが開きます。入力欄が空だった場合は、依頼文はコピー済みなので貼り付け(Ctrl+V)して送信してください。</p>
      </HelpCard>

      <SectionTitle>よくある質問</SectionTitle>
      <div className="space-y-3">
        {faqs.map(([q, a]) => (
          <HelpCard key={q} icon="Q." title={q}>
            <p>{a}</p>
          </HelpCard>
        ))}
      </div>
    </div>
  );
}

// ================= アプリ本体 =================
const load = (key, fallback) => {
  try { const v = localStorage.getItem("shukatsu-" + key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
};

export default function App() {
  const [companies, setCompanies] = useState(() => load("companies", initCompanies));
  const [events, setEvents] = useState(() => load("events", initEvents));
  const [notes, setNotes] = useState(() => load("notes", initNotes));
  const [view, setView] = useState("dashboard");
  const [selectedId, setSelectedId] = useState(null);
  const [lastExport, setLastExport] = useState(() => {
    const v = localStorage.getItem("shukatsu-last-export");
    return v ? Number(v) : null;
  });
  const [backupDismissed, setBackupDismissed] = useState(false);
  const [driveBusy, setDriveBusy] = useState(null); // "save" | "restore" | null

  // 変更があるたびにブラウザへ自動保存
  useEffect(() => { localStorage.setItem("shukatsu-companies", JSON.stringify(companies)); }, [companies]);
  useEffect(() => { localStorage.setItem("shukatsu-events", JSON.stringify(events)); }, [events]);
  useEffect(() => { localStorage.setItem("shukatsu-notes", JSON.stringify(notes)); }, [notes]);

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ companies, events, notes }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `shukatsu-note-${todayStr()}.json`;
    a.click();
    const now = Date.now();
    localStorage.setItem("shukatsu-last-export", String(now));
    setLastExport(now);
    setBackupDismissed(false);
  };

  const markBackedUp = () => {
    const now = Date.now();
    localStorage.setItem("shukatsu-last-export", String(now));
    setLastExport(now);
    setBackupDismissed(false);
  };

  const saveDrive = async () => {
    setDriveBusy("save");
    try {
      await saveToDrive({ companies, events, notes });
      markBackedUp();
      alert("Googleドライブに保存しました。\nDriveの「就活ノート バックアップ」からいつでも確認できます。");
    } catch (e) {
      alert("Driveへの保存に失敗しました。\n" + e.message);
    } finally { setDriveBusy(null); }
  };

  const restoreDrive = async () => {
    if (hasData && !window.confirm("Driveのバックアップで、今この端末にあるデータを上書きします。よろしいですか?")) return;
    setDriveBusy("restore");
    try {
      const { data, modifiedTime } = await restoreFromDrive();
      if (data.companies) setCompanies(data.companies);
      if (data.events) setEvents(data.events);
      if (data.notes) setNotes(data.notes);
      alert(`Driveから復元しました。\n(バックアップ日時: ${modifiedTime ? new Date(modifiedTime).toLocaleString("ja-JP") : "不明"})`);
    } catch (e) {
      alert("Driveからの復元に失敗しました。\n" + e.message);
    } finally { setDriveBusy(null); }
  };

  const hasData = companies.length > 0 || events.length > 0 || notes.length > 0;
  const daysSinceExport = lastExport ? Math.floor((Date.now() - lastExport) / 86400000) : null;
  const showBackupWarning = hasData && !backupDismissed && (lastExport === null || daysSinceExport >= 7);
  const backupMessage = lastExport === null
    ? "⚠️ まだ一度もバックアップされていません。「Drive保存」または「書き出し」でデータを保存してください。"
    : `⚠️ 前回のバックアップから${daysSinceExport}日経過しています。「Drive保存」または「書き出し」を推奨します。`;
  const importData = file => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (d.companies) setCompanies(d.companies);
        if (d.events) setEvents(d.events);
        if (d.notes) setNotes(d.notes);
      } catch { alert("読み込めませんでした。「書き出し」で保存したJSONファイルを選んでください。"); }
    };
    r.readAsText(file);
  };

  const openCompany = id => { setSelectedId(id); setView("companies"); };

  const tabs = [
    ["dashboard", "🏠 ダッシュボード"], ["companies", "🏢 企業"], ["calendar", "📅 カレンダー"], ["es", "✍️ ES"], ["notes", "📝 メモ"], ["help", "❓ 使い方"],
  ];

  return (
    <div className="min-h-screen" style={{ background: C.paper, fontFamily: '"Hiragino Kaku Gothic ProN","Yu Gothic","Noto Sans JP",sans-serif' }}>
      <header className="px-4 pt-5 pb-3 max-w-4xl mx-auto">
        <div className="flex items-end justify-between">
          <h1 className="text-xl font-black tracking-wide" style={{ color: C.ink }}>
            就活ノート
          </h1>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <div className="text-xs font-bold" style={{ color: C.inkSoft }}>
              {TODAY.getFullYear()}/{TODAY.getMonth() + 1}/{TODAY.getDate()}({["日", "月", "火", "水", "木", "金", "土"][TODAY.getDay()]})
            </div>
            <button onClick={saveDrive} disabled={driveBusy !== null} className="text-xs font-bold px-2 py-1 rounded-lg disabled:opacity-50" style={{ border: `1px solid ${C.line}`, color: C.inkSoft, background: C.card }}>
              {driveBusy === "save" ? "保存中…" : "☁️ Drive保存"}
            </button>
            <button onClick={restoreDrive} disabled={driveBusy !== null} className="text-xs font-bold px-2 py-1 rounded-lg disabled:opacity-50" style={{ border: `1px solid ${C.line}`, color: C.inkSoft, background: C.card }}>
              {driveBusy === "restore" ? "復元中…" : "☁️ Drive復元"}
            </button>
            <button onClick={exportData} className="text-xs font-bold px-2 py-1 rounded-lg" style={{ border: `1px solid ${C.line}`, color: C.inkSoft, background: C.card }}>書き出し</button>
            <label className="text-xs font-bold px-2 py-1 rounded-lg cursor-pointer" style={{ border: `1px solid ${C.line}`, color: C.inkSoft, background: C.card }}>
              読み込み
              <input type="file" accept=".json" className="hidden" onChange={e => e.target.files[0] && importData(e.target.files[0])} />
            </label>
          </div>
        </div>
        <nav className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {tabs.map(([k, label]) => (
            <button key={k} onClick={() => { setView(k); if (k !== "companies") setSelectedId(null); }}
              className="px-3 py-1.5 rounded-full text-sm font-bold whitespace-nowrap"
              style={{ background: view === k ? C.ink : C.card, color: view === k ? "#fff" : C.inkSoft, border: `1px solid ${view === k ? C.ink : C.line}` }}>
              {label}
            </button>
          ))}
        </nav>
      </header>
      {showBackupWarning && (
        <div className="px-4 max-w-4xl mx-auto mb-3">
          <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-xs font-bold"
               style={{ background: "#FEF2F2", color: "#B91C1C", border: "1px solid #FCA5A5" }}>
            <span>{backupMessage}</span>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={saveDrive} disabled={driveBusy !== null}
                      className="px-2 py-1 rounded-md disabled:opacity-50"
                      style={{ background: "#B91C1C", color: "#fff" }}>{driveBusy === "save" ? "保存中…" : "Driveへ保存"}</button>
              <button onClick={exportData}
                      className="px-2 py-1 rounded-md"
                      style={{ background: "#B91C1C", color: "#fff" }}>今すぐ書き出し</button>
              <button onClick={() => setBackupDismissed(true)}
                      aria-label="閉じる"
                      className="px-2 py-1 rounded-md"
                      style={{ color: "#B91C1C" }}>×</button>
            </div>
          </div>
        </div>
      )}
      <main className="px-4 pb-10 max-w-4xl mx-auto">
        {view === "dashboard" && <Dashboard companies={companies} events={events} openCompany={openCompany} />}
        {view === "companies" && <Companies companies={companies} setCompanies={setCompanies} events={events} notes={notes} setNotes={setNotes} selectedId={selectedId} setSelectedId={setSelectedId} />}
        {view === "calendar" && <CalendarView events={events} setEvents={setEvents} companies={companies} />}
        {view === "es" && <ESOverview companies={companies} openCompany={openCompany} />}
        {view === "notes" && <NotesView notes={notes} setNotes={setNotes} companies={companies} />}
        {view === "help" && <HelpView onSaveDrive={saveDrive} onRestoreDrive={restoreDrive} driveBusy={driveBusy} />}
      </main>
    </div>
  );
}
