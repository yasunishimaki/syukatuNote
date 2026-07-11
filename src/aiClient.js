// ================= Gemini API連携(BYOK: 利用者自身のAPIキー) =================
// キーは利用者の端末(localStorage)にのみ保存し、通信はブラウザ→Googleへ直接行う。
// 運営者のサーバーやAPIキーは介在しない。
const GEMINI_MODEL = "gemini-2.5-flash";
const KEY_STORAGE = "shukatsu-gemini-key";

export const getGeminiKey = () => localStorage.getItem(KEY_STORAGE) || "";
export const setGeminiKey = key => {
  if (key) localStorage.setItem(KEY_STORAGE, key.trim());
  else localStorage.removeItem(KEY_STORAGE);
};

export async function askGemini(prompt) {
  const key = getGeminiKey();
  if (!key) throw new Error("GeminiのAPIキーが設定されていません。");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
  } catch {
    throw new Error("Geminiに接続できませんでした。通信環境を確認してください。");
  }
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).error?.message || ""; } catch { /* 本文なし */ }
    if (res.status === 400 || res.status === 403) {
      throw new Error(`APIキーが無効のようです。「キーを変更」から設定し直してください。(${res.status}${detail ? ": " + detail.slice(0, 150) : ""})`);
    }
    if (res.status === 429) {
      throw new Error("無料枠の利用上限に達した可能性があります。1分ほど待ってから再試行してください。");
    }
    throw new Error(`Gemini APIエラー(${res.status})${detail ? ": " + detail.slice(0, 150) : ""}`);
  }
  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("");
  if (!text) throw new Error("Geminiから回答を取得できませんでした。もう一度お試しください。");
  return text;
}
