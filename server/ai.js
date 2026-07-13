"use strict";
/* AI機能: Claude API(公式SDK)による議事録TODO抽出とAI秘書チャット。
   ANTHROPIC_API_KEY 未設定時はルールベースにフォールバックし、応答に明示する。 */
const Anthropic = require("@anthropic-ai/sdk");
const { businessContext } = require("./metrics");

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
const hasKey = () => Boolean(process.env.ANTHROPIC_API_KEY);
const client = hasKey() ? new Anthropic() : null;

/* ===== 議事録 → TODO抽出 ===== */

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    todos: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "アクションアイテムの内容(日本語・簡潔に)" },
          due: { type: ["string", "null"], description: "期限。YYYY-MM-DD形式。不明ならnull" },
        },
        required: ["title", "due"],
        additionalProperties: false,
      },
    },
  },
  required: ["todos"],
  additionalProperties: false,
};

async function extractTodos(text) {
  if (!client) return { source: "rules", todos: ruleExtract(text) };
  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system:
        "あなたは経営支援システムのアシスタントです。会議の議事録からアクションアイテム(TODO)を抽出します。" +
        `本日は${new Date().toISOString().slice(0, 10)}です。「7/18まで」のような相対的な期限は本日を基準にYYYY-MM-DDへ変換してください。` +
        "決定事項の共有や単なる情報はTODOに含めず、誰かが実行すべき具体的なアクションのみを抽出してください。",
      messages: [{ role: "user", content: `次の議事録からTODOを抽出してください:\n\n${text}` }],
      output_config: { format: { type: "json_schema", schema: EXTRACT_SCHEMA } },
    });
    if (response.stop_reason === "refusal") {
      return { source: "rules", todos: ruleExtract(text), note: "AIが処理を拒否したためルールベースで抽出しました" };
    }
    const block = response.content.find((b) => b.type === "text");
    const parsed = JSON.parse(block.text);
    return { source: "ai", model: MODEL, todos: parsed.todos };
  } catch (err) {
    console.error("[ai] extractTodos failed, falling back to rules:", err.message);
    return { source: "rules", todos: ruleExtract(text), note: "AI呼び出しに失敗したためルールベースで抽出しました" };
  }
}

/* ルールベース抽出(フォールバック) */
function ruleExtract(text) {
  const dateRe = /(\d{1,2}\/\d{1,2}|\d{1,2}月\d{1,2}日|今週|来週|本日|明日)/;
  return text
    .split("\n")
    .map((l) => l.replace(/^[・\-*\s]+/, "").trim())
    .filter((l) => l && !/^【/.test(l))
    .filter((l) => /(する|します|提出|完了|対応|作成|送付|確認|調整|提案|連絡)/.test(l))
    .map((l) => {
      const m = l.match(dateRe);
      return { title: l, due: m ? normalizeDue(m[1]) : null };
    });
}

function normalizeDue(s) {
  const year = new Date().getFullYear();
  let m = s.match(/^(\d{1,2})\/(\d{1,2})$/) || s.match(/^(\d{1,2})月(\d{1,2})日$/);
  if (m) return `${year}-${String(m[1]).padStart(2, "0")}-${String(m[2]).padStart(2, "0")}`;
  const t = new Date();
  if (s === "本日") return t.toISOString().slice(0, 10);
  if (s === "明日") { t.setDate(t.getDate() + 1); return t.toISOString().slice(0, 10); }
  if (s === "今週") { t.setDate(t.getDate() + (5 - t.getDay() + 7) % 7); return t.toISOString().slice(0, 10); }
  if (s === "来週") { t.setDate(t.getDate() + 7); return t.toISOString().slice(0, 10); }
  return null;
}

/* ===== AI秘書チャット ===== */

async function chat(question, history = []) {
  const context = businessContext();
  if (!client) {
    return { source: "rules", reply: ruleChat(question, context) + "\n\n※ ANTHROPIC_API_KEY が未設定のため、定型ルールで回答しています。" };
  }
  try {
    const messages = [
      ...history.slice(-10).filter((m) => ["user", "assistant"].includes(m.role) && typeof m.content === "string" && m.content.trim())
        .map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: question },
    ];
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system:
        "あなたは中小IT企業の社長を支えるAI秘書です。以下の最新経営データに基づいて、簡潔かつ実行可能な提案を含めて日本語で回答してください。" +
        "数字は必ず経営データに基づき、推測で数字を作らないでください。データにない質問には、わからない旨を正直に伝えてください。\n\n" +
        "【最新経営データ】\n" + context,
      messages,
    });
    if (response.stop_reason === "refusal") {
      return { source: "rules", reply: "その質問にはお答えできません。経営データに関する質問をお願いします。" };
    }
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    return { source: "ai", model: MODEL, reply: text };
  } catch (err) {
    console.error("[ai] chat failed, falling back to rules:", err.message);
    return { source: "rules", reply: ruleChat(question, context) + "\n\n※ AI呼び出しに失敗したため、定型ルールで回答しています。" };
  }
}

/* ルールベース応答(フォールバック): 経営コンテキストの該当セクションを返す */
function ruleChat(q, context) {
  const lines = context.split("\n");
  const pick = (prefix) => lines.find((l) => l.startsWith(prefix)) || "";
  if (/今日|やること|タスク|優先/.test(q)) return "今日の優先事項です。\n" + pick("今日の優先タスク");
  if (/危険|リスク|遅延|やばい/.test(q)) return "危険案件の状況です。\n" + pick("危険案件");
  if (/売上|受注|業績|KPI/.test(q)) return "今月の実績です。\n" + pick("今月KPI");
  if (/キャッシュ|資金|入金|回収/.test(q)) return "資金まわりの状況です。\n" + pick("今月KPI") + "\n" + pick("危険案件");
  if (/エンジニア|稼働|リソース|空き/.test(q)) return "稼働状況です。\n" + pick("エンジニア稼働");
  if (/商談|営業|パイプライン/.test(q)) return "営業の状況です。\n" + pick("パイプライン") + "\n" + pick("商談");
  return "「今日やることは?」「危険案件は?」「今月の売上は?」「キャッシュフローは?」「エンジニアの空きは?」などを聞いてください。\n\n【現在の概況】\n" + context;
}

function aiStatus() {
  return { enabled: hasKey(), model: hasKey() ? MODEL : null };
}

module.exports = { extractTodos, chat, aiStatus };
