// ================= Googleドライブ連携(バックアップ・復元) =================
// 使い方: GOOGLE_DRIVE_SETUP.md の手順で OAuth クライアントIDを作成し、下に貼り付ける。
// クライアントIDは公開しても問題ない識別子です(秘密鍵ではありません)。
// 例: const GOOGLE_CLIENT_ID = "123456789-abc123.apps.googleusercontent.com";
const GOOGLE_CLIENT_ID = "711895586401-07qq0vvm5rausqq410b7cu450becipfc.apps.googleusercontent.com";

// このアプリが作成したファイルだけ読み書きできる最小権限(Drive全体は見えない)
const SCOPE = "https://www.googleapis.com/auth/drive.file";
const FILE_NAME = "就活ノート バックアップ";
const SHEET_NAMES = ["企業", "ES", "予定", "メモ", "_backup"];
// スプレッドシートのセルは最大5万文字のため、JSONは4万文字ずつ複数行に分けて保存する
const CHUNK_SIZE = 40000;
const FILE_ID_KEY = "shukatsu-drive-file-id";

export const isDriveConfigured = () => GOOGLE_CLIENT_ID !== "";

// ---- Google認証(GIS)の読み込みとトークン取得 ----
let gisPromise = null;
const loadGis = () => {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = resolve;
    s.onerror = () => { gisPromise = null; reject(new Error("Google認証スクリプトを読み込めませんでした。通信環境を確認してください。")); };
    document.head.appendChild(s);
  });
  return gisPromise;
};

let cachedToken = null; // { token, expiresAt }
const getToken = async () => {
  if (!isDriveConfigured()) {
    throw new Error("GoogleクライアントIDが未設定です。GOOGLE_DRIVE_SETUP.md の手順に沿って src/driveBackup.js に設定してください。");
  }
  await loadGis();
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) return cachedToken.token;
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: resp => {
        if (resp.error) return reject(new Error(resp.error_description || resp.error));
        cachedToken = { token: resp.access_token, expiresAt: Date.now() + (Number(resp.expires_in) || 3600) * 1000 };
        resolve(resp.access_token);
      },
      error_callback: err => reject(new Error(err?.message || "Googleへのログインがキャンセルされました。")),
    });
    client.requestAccessToken();
  });
};

// ---- Google API 呼び出しの共通処理 ----
const gapi = async (token, url, { method = "GET", body } = {}) => {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google APIエラー(${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
};

const findBackupFile = async token => {
  const q = encodeURIComponent(`name='${FILE_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`);
  const res = await gapi(token, `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&pageSize=1&fields=files(id,modifiedTime)`);
  return res.files?.[0] || null;
};

// 記憶しているファイルIDが今も有効か確認する(削除・ゴミ箱行きなら null)
const verifyFileId = async (token, id) => {
  try {
    const meta = await gapi(token, `https://www.googleapis.com/drive/v3/files/${id}?fields=trashed,modifiedTime`);
    return meta.trashed ? null : meta;
  } catch { return null; }
};

const ensureSheets = async (token, id) => {
  const meta = await gapi(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties.title`);
  const existing = new Set((meta.sheets || []).map(s => s.properties.title));
  const missing = SHEET_NAMES.filter(t => !existing.has(t));
  if (missing.length) {
    await gapi(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}:batchUpdate`, {
      method: "POST",
      body: { requests: missing.map(t => ({ addSheet: { properties: { title: t } } })) },
    });
  }
};

// ---- データ→シート変換 ----
// 「企業〜メモ」シートは人が見るための表示専用。復元は _backup シートのJSONから行う。
const buildValues = data => {
  const companyName = id => data.companies.find(c => c.id === id)?.name ?? "";
  const values = {
    "企業": [
      ["企業名", "業界", "志望度", "選考段階", "事業内容", "魅力に感じる点", "懸念点"],
      ...data.companies.map(c => [c.name ?? "", c.industry ?? "", c.priority ?? "", c.stage ?? "",
        c.research?.business ?? "", c.research?.appeal ?? "", c.research?.concerns ?? ""]),
    ],
    "ES": [
      ["企業名", "設問", "字数制限", "ステータス", "下書き"],
      ...data.companies.flatMap(c => (c.esList || []).map(e => [c.name ?? "", e.question ?? "", e.limit ?? "", e.status ?? "", e.draft ?? ""])),
    ],
    "予定": [
      ["日付", "時刻", "種別", "タイトル", "企業名"],
      ...data.events.map(e => [e.date ?? "", e.time ?? "", e.type ?? "", e.title ?? "", companyName(e.companyId)]),
    ],
    "メモ": [
      ["日付", "カテゴリ", "タイトル", "企業名", "本文"],
      ...data.notes.map(n => [n.date ?? "", n.category ?? "", n.title ?? "", companyName(n.companyId), n.body ?? ""]),
    ],
  };
  const json = JSON.stringify(data);
  const chunks = [];
  for (let i = 0; i < json.length; i += CHUNK_SIZE) chunks.push([json.slice(i, i + CHUNK_SIZE)]);
  values["_backup"] = [
    ["このシートは復元用データです。編集・削除しないでください。"],
    ["v1"],
    [new Date().toISOString()],
    ...chunks, // 4行目以降にJSON本体
  ];
  return values;
};

// ---- 保存: 既存ファイルがあれば上書き、なければ新規作成 ----
export async function saveToDrive(data) {
  const token = await getToken();
  let id = localStorage.getItem(FILE_ID_KEY);
  if (id && !(await verifyFileId(token, id))) id = null;
  if (!id) id = (await findBackupFile(token))?.id || null; // 別端末で作成済みの場合を拾う
  if (!id) {
    const created = await gapi(token, "https://sheets.googleapis.com/v4/spreadsheets", {
      method: "POST",
      body: { properties: { title: FILE_NAME }, sheets: SHEET_NAMES.map(t => ({ properties: { title: t } })) },
    });
    id = created.spreadsheetId;
  } else {
    await ensureSheets(token, id);
  }
  localStorage.setItem(FILE_ID_KEY, id);
  const values = buildValues(data);
  await gapi(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchClear`, {
    method: "POST",
    body: { ranges: SHEET_NAMES },
  });
  await gapi(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`, {
    method: "POST",
    body: { valueInputOption: "RAW", data: SHEET_NAMES.map(t => ({ range: `'${t}'!A1`, values: values[t] })) },
  });
  return `https://docs.google.com/spreadsheets/d/${id}`;
}

// ---- 復元: _backup シートのJSONを読み戻す ----
export async function restoreFromDrive() {
  const token = await getToken();
  let id = localStorage.getItem(FILE_ID_KEY);
  let modifiedTime = null;
  if (id) {
    const meta = await verifyFileId(token, id);
    if (meta) modifiedTime = meta.modifiedTime; else id = null;
  }
  if (!id) {
    const file = await findBackupFile(token);
    if (!file) throw new Error("Drive上にバックアップが見つかりませんでした。「Drive保存」を実行したときと同じGoogleアカウントか確認してください。");
    id = file.id;
    modifiedTime = file.modifiedTime;
  }
  const res = await gapi(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent("'_backup'!A4:A")}`);
  const json = (res.values || []).map(r => r[0] ?? "").join("");
  if (!json) throw new Error("バックアップデータ(_backupシート)が空でした。先に「Drive保存」を実行してください。");
  const data = JSON.parse(json);
  localStorage.setItem(FILE_ID_KEY, id);
  return { data, modifiedTime };
}
