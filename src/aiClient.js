// ================= Gemini API連携(BYOK: 利用者自身のAPIキー) =================
// キーは利用者の端末(localStorage)にのみ保存し、通信はブラウザ→Googleへ直接行う。
// 運営者のサーバーやAPIキーは介在しない。
// モデル名は固定せず、そのキーで利用できるモデル一覧から最新のFlash系を自動選択する
// (Google側のモデル世代交代で 404 になっても自動で追従できるようにするため)。
const KEY_STORAGE = "shukatsu-gemini-key";
const MODEL_STORAGE = "shukatsu-gemini-model";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export const getGeminiKey = () => localStorage.getItem(KEY_STORAGE) || "";
export const setGeminiKey = key => {
  if (key) localStorage.setItem(KEY_STORAGE, key.trim());
  else localStorage.removeItem(KEY_STORAGE);
  localStorage.removeItem(MODEL_STORAGE); // キーが変わればモデルも選び直す
};

const apiError = (status, detail) => {
  if (status === 400 || status === 403) {
    return new Error(`APIキーが無効のようです。「キーを変更」から設定し直してください。(${status}${detail ? ": " + detail.slice(0, 150) : ""})`);
  }
  if (status === 429) {
    return new Error("無料枠の利用上限に達した可能性があります。1分ほど待ってから再試行してください。");
  }
  return new Error(`Gemini APIエラー(${status})${detail ? ": " + detail.slice(0, 150) : ""}`);
};

const readErrorDetail = async res => {
  try { return (await res.json()).error?.message || ""; } catch { return ""; }
};

// このキーで使えるモデルから、テキスト生成対応の最新Flash系を選ぶ
const pickFlashModel = async key => {
  const res = await fetch(`${API_BASE}/models?pageSize=200&key=${encodeURIComponent(key)}`);
  if (!res.ok) throw apiError(res.status, await readErrorDetail(res));
  const data = await res.json();
  const names = (data.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map(m => (m.name || "").replace(/^models\//, ""));
  // 「常に最新のFlashを指す」公式エイリアスがあれば最優先
  if (names.includes("gemini-flash-latest")) return "gemini-flash-latest";
  const version = n => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || "0");
  const flash = names
    .filter(n => n.includes("flash") && !/(lite|preview|exp|tts|image|audio|live|thinking|8b)/.test(n))
    .sort((a, b) => version(b) - version(a));
  const pick = flash[0] || names.find(n => n.includes("flash")) || names.find(n => n.includes("pro")) || names[0];
  if (!pick) throw new Error("このAPIキーで利用できるテキスト生成モデルが見つかりませんでした。");
  return pick;
};

const generate = async (key, model, prompt) => fetch(
  `${API_BASE}/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  },
);

export async function askGemini(prompt) {
  const key = getGeminiKey();
  if (!key) throw new Error("GeminiのAPIキーが設定されていません。");
  let model = localStorage.getItem(MODEL_STORAGE);
  let res;
  try {
    if (!model) {
      model = await pickFlashModel(key);
      localStorage.setItem(MODEL_STORAGE, model);
    }
    res = await generate(key, model, prompt);
    if (res.status === 404) {
      // 記憶していたモデルが廃止された場合: 選び直して1回だけ再試行
      localStorage.removeItem(MODEL_STORAGE);
      model = await pickFlashModel(key);
      localStorage.setItem(MODEL_STORAGE, model);
      res = await generate(key, model, prompt);
    }
  } catch (e) {
    if (e instanceof TypeError) throw new Error("Geminiに接続できませんでした。通信環境を確認してください。");
    throw e;
  }
  if (!res.ok) throw apiError(res.status, await readErrorDetail(res));
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
  if (!text) throw new Error("Geminiから回答を取得できませんでした。もう一度お試しください。");
  return text;
}
