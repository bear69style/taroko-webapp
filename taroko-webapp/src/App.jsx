import { useState, useEffect, useCallback } from "react";

const GAS_URL = process.env.REACT_APP_GAS_URL || "";

async function gasCall(params = {}) {
  const url = new URL(GAS_URL);
  Object.entries(params).forEach(([k, v]) => {
    url.searchParams.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  });
  const res = await fetch(url.toString());
  return res.json();
}

const FLOWS = {
  morning: [
    { label: "撈取今日輿情", action: "fetchNews", btnLabel: "🔍 撈取今日新聞（Step 1）", desc: ["系統跑 14 條雷達線 + 中央社、自由時報、ETtoday、聯合報、公視直訂 RSS。"] },
    { label: "打底自動過濾", action: "filterNews", btnLabel: "🧹 自動清洗篩選（Step 2-A）", desc: ["系統自動清洗、去重、媒體正名。"] },
    { label: "人工校對（最重要）", action: null, isProofread: true, withOptional: true, desc: ["以下是今日精選新聞，請逐一確認：", "刪除不相關新聞", "修改錯誤的媒體名稱", "補上更生日報的標題", "確認網址是否已還原（非 Google News 連結）"] },
    { label: "確認寄出", action: "send", btnLabel: "🚀 寄出日報（Step 3）", desc: ["按下後先自動掃描品質，通過才寄出。"], withLine: true, warnMsg: "若 LINE 額度用光，寄出後去信箱複製內文，手動貼到 LINE 群組。" },
  ],
  night: [
    { label: "撈取今晚輿情", action: "fetchNews", btnLabel: "🔍 撈取今日新聞（Step 1）", desc: ["前一晚先預查，先撈一輪當天的新聞。"] },
    { label: "打底自動過濾", action: "filterNews", btnLabel: "🧹 自動清洗篩選（Step 2-A）", desc: ["系統自動清洗篩選。"] },
    { label: "人工校對", action: null, isProofread: true, desc: ["逐一確認新聞內容正確"] },
    { label: "存入保險箱", action: "saveHeart", btnLabel: "💾 存檔今晚進度（交接保險箱）", desc: ["把今晚心血鎖進保險箱，明早同仁才能一鍵召回。"], warnMsg: "這一步是前一晚預查的重點，忘了存明早就白做了！" },
    { label: "（明早）還原昨晚進度", action: "restoreHeart", btnLabel: "⏪ 還原昨晚進度（清晨接班用）", desc: ["隔天清晨第一步：先點這個召回昨晚進度。"] },
    { label: "（明早）撈取今早新聞", action: "fetchNews", btnLabel: "🔍 撈取今日新聞（Step 1）", desc: ["還原後，重跑一次撈取今天最新的早報。"] },
    { label: "（明早）融合今早早報", action: "filterAppend", btnLabel: "🔄 融合今早早報（Step 2-B）", desc: ["把今早新撈的早報，與昨晚的心血融合在一起。"], warnMsg: "若忘記先撈早報就按這個，系統會自動攔截。" },
    { label: "（明早）再次人工校對", action: null, isProofread: true, withOptional: true, desc: ["逐一確認新聞內容正確"] },
    { label: "（明早）確認寄出", action: "send", btnLabel: "🚀 寄出日報（Step 3）", desc: ["最後校對後正式寄出。"], withLine: true, warnMsg: "前一晚預查的稿，寄出前記得進信箱改主旨日期！" },
  ],
};

// ── 顏色主題 ──
const C = {
  green: "#1a4733", greenLight: "#d4ece0", greenBorder: "#a8d4bc",
  night: "#2c3e6b", nightLight: "#dde3f5", nightBorder: "#b8c4e0",
  orange: "#d97a28", red: "#c0440a", success: "#2e7d52",
};

export default function App() {
  const [phase, setPhase] = useState("morning");
  const [current, setCurrent] = useState(0);
  const [email, setEmail] = useState("");
  const [emailOptions, setEmailOptions] = useState([]);
  const [running, setRunning] = useState(false);
  const [runLabel, setRunLabel] = useState("");
  const [toast, setToast] = useState({ show: false, msg: "", err: false });
  const [lineOn, setLineOn] = useState(false);
  const [newsRows, setNewsRows] = useState([]);
  const [loadingNews, setLoadingNews] = useState(false);
  const [editCell, setEditCell] = useState(null); // {rowNum, field, value}
  const [qualityIssues, setQualityIssues] = useState([]);
  const [pastedUrls, setPastedUrls] = useState([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [gasUrl] = useState(GAS_URL);

  const night = phase === "night";
  const accent = night ? C.night : C.green;
  const flow = FLOWS[phase];

  useEffect(() => {
    if (!gasUrl) { setLoadingConfig(false); return; }
    gasCall({ action: "config" })
      .then(cfg => {
        if (cfg.ok) {
          setEmailOptions(cfg.emailOptions || []);
          setEmail(cfg.currentEmail || "");
          if (cfg.state) { setPhase(cfg.state.phase || "morning"); setCurrent(cfg.state.current || 0); }
        }
      }).catch(() => {}).finally(() => setLoadingConfig(false));
  }, [gasUrl]);

  const showToast = useCallback((msg, err = false) => {
    setToast({ show: true, msg, err });
    setTimeout(() => setToast(t => ({ ...t, show: false })), 4000);
  }, []);

  const saveState = useCallback((ph, cur) => {
    if (!gasUrl) return;
    gasCall({ action: "setState", state: { phase: ph, current: cur } }).catch(() => {});
  }, [gasUrl]);

  const advance = useCallback((i) => {
    const next = Math.min(i + 1, flow.length - 1);
    setCurrent(next); saveState(phase, next);
  }, [flow.length, phase, saveState]);

  const switchPhase = (p) => { setPhase(p); setCurrent(0); saveState(p, 0); };
  const resetAll = () => { setCurrent(0); saveState(phase, 0); };

  // 載入精選表
  const loadNews = useCallback(async () => {
    setLoadingNews(true);
    try {
      const r = await gasCall({ action: "getNews" });
      if (r.ok) setNewsRows(r.rows || []);
      else showToast("❌ 載入失敗：" + r.error, true);
    } catch(e) { showToast("❌ 連線失敗", true); }
    finally { setLoadingNews(false); }
  }, [showToast]);

  // 當進入校對步驟時自動載入
  useEffect(() => {
    const step = flow[current];
    if (step && step.isProofread) loadNews();
  }, [current, phase]);

  const runAction = async (label, action, stepIdx) => {
    if (running || !gasUrl) return;
    setRunning(true); setRunLabel(label);
    try {
      const params = { action };
      if (action === "send") params.sendLine = lineOn;
      const result = await gasCall(params);
      if (result.ok) {
        showToast("✅ " + label + " 完成");
        if (stepIdx >= 0) advance(stepIdx);
      } else if (result.issues && result.issues.length > 0) {
        // 品質問題
        setQualityIssues(result.issues);
        showToast("⚠️ 發現 " + result.issues.length + " 個品質問題，請修正後再寄出", true);
        // 跳回校對步驟
        const proofStep = flow.findIndex(s => s.isProofread);
        if (proofStep >= 0) { setCurrent(proofStep); saveState(phase, proofStep); loadNews(); }
      } else {
        showToast("❌ " + (result.error || result.message || "執行失敗"), true);
      }
    } catch(e) { showToast("❌ 連線失敗：" + e.message, true); }
    finally { setRunning(false); }
  };

  // 刪除列
  const deleteRow = async (rowNum, title) => {
    if (!window.confirm("確定刪除這則新聞？\n「" + title.substring(0, 30) + "」")) return;
    try {
      const r = await gasCall({ action: "deleteRow", row: rowNum });
      if (r.ok) { showToast("✅ 已刪除"); loadNews(); }
      else showToast("❌ 刪除失敗：" + r.error, true);
    } catch(e) { showToast("❌ 連線失敗", true); }
  };

  // 儲存編輯
  const saveEdit = async () => {
    if (!editCell) return;
    try {
      const r = await gasCall({ action: "updateRow", row: editCell.rowNum, field: editCell.field, value: editCell.value });
      if (r.ok) {
        showToast("✅ 已儲存");
        setNewsRows(rows => rows.map(row =>
          row.rowNum === editCell.rowNum ? { ...row, [editCell.field === 'source' ? 'source' : editCell.field === 'title' ? 'title' : 'url']: editCell.value } : row
        ));
        setEditCell(null);
      } else showToast("❌ 儲存失敗：" + r.error, true);
    } catch(e) { showToast("❌ 連線失敗", true); }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text");
    const urls = text.split(/[\n\r]+/).map(u => u.trim()).filter(u => /^https?:\/\//.test(u));
    if (!urls.length) { showToast("⚠️ 沒有偵測到網址", true); return; }
    setPastedUrls(urls);
  };

  const applyUrls = async () => {
    if (!pastedUrls.length) return;
    setRunning(true); setRunLabel("寫入 D 欄");
    try {
      const r = await gasCall({ action: "applyUrls", urls: pastedUrls });
      if (r.ok) { showToast("✅ 已寫入 " + pastedUrls.length + " 個網址"); setPastedUrls([]); loadNews(); }
      else showToast("❌ " + r.message, true);
    } catch(e) { showToast("❌ 連線失敗", true); }
    finally { setRunning(false); }
  };

  const onEmailChange = async (val) => {
    setEmail(val);
    if (val && gasUrl) gasCall({ action: "setEmail", email: val }).catch(() => {});
  };

  if (!gasUrl) return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: 20, fontFamily: '"Microsoft JhengHei",sans-serif' }}>
      <h2 style={{ color: C.green, marginBottom: 12 }}>📰 太魯閣輿情日報</h2>
      <p style={{ marginBottom: 12, fontSize: 15 }}>請先在 Vercel 設定 GAS API 網址（REACT_APP_GAS_URL）</p>
    </div>
  );

  if (loadingConfig) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 16, fontFamily: '"Microsoft JhengHei",sans-serif' }}>
      <div style={{ width: 40, height: 40, border: "4px solid #d8d8d0", borderTopColor: C.green, borderRadius: "50%", animation: "spin .7s linear infinite" }} />
      <div style={{ fontSize: 16, color: C.green, fontWeight: 700 }}>載入中…</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  const F = { fontFamily: '"Microsoft JhengHei","PingFang TC",sans-serif' };

  return (
    <div style={{ ...F, maxWidth: 480, margin: "0 auto", padding: "14px 12px 40px", background: "#fafaf8", minHeight: "100vh", fontSize: 17 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} * {box-sizing:border-box}`}</style>

      {/* 執行遮罩 */}
      {running && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(250,250,248,.9)", zIndex: 999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <div style={{ width: 40, height: 40, border: "4px solid #d8d8d0", borderTopColor: accent, borderRadius: "50%", animation: "spin .7s linear infinite" }} />
          <div style={{ fontSize: 17, fontWeight: 700, color: accent }}>正在執行：{runLabel}…</div>
          <div style={{ fontSize: 15, color: "#8a8a82" }}>請勿關閉或重複點擊</div>
        </div>
      )}

      {/* Toast */}
      {toast.show && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: toast.err ? C.red : C.success, color: "#fff", padding: "12px 22px", borderRadius: 10, fontSize: 15, fontWeight: 700, zIndex: 1000, maxWidth: "90vw", textAlign: "center", whiteSpace: "nowrap" }}>
          {toast.msg}
        </div>
      )}

      {/* 編輯浮層 */}
      {editCell && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", zIndex: 998, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 12, padding: 20, width: "100%", maxWidth: 440 }}>
            <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 16 }}>
              編輯{editCell.field === 'source' ? '媒體名稱' : editCell.field === 'title' ? '標題' : '網址'}
            </div>
            {editCell.field === 'url' ? (
              <textarea value={editCell.value} onChange={e => setEditCell(c => ({ ...c, value: e.target.value }))}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1.5px solid #ccc", fontSize: 14, fontFamily: "inherit", minHeight: 80, resize: "vertical" }} />
            ) : (
              <input value={editCell.value} onChange={e => setEditCell(c => ({ ...c, value: e.target.value }))}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1.5px solid #ccc", fontSize: 16, fontFamily: "inherit" }} autoFocus />
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button onClick={() => setEditCell(null)} style={{ flex: 1, padding: 10, borderRadius: 8, border: "1.5px solid #ccc", background: "#fff", fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>取消</button>
              <button onClick={saveEdit} style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", background: accent, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>儲存</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ borderBottom: `2px solid ${C.green}`, paddingBottom: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 19, fontWeight: 700, color: C.green }}>📰 輿情日報操作導引</div>
        <div style={{ fontSize: 15, color: "#8a8a82", marginTop: 3 }}>跟著亮起的步驟做，不會漏</div>
      </div>

      {/* 信箱 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "9px 11px", borderRadius: 7, marginBottom: 14, border: `1.5px solid ${email ? "#cfe3d6" : "#f0c0a0"}`, background: email ? "#eef6f0" : "#fff4ec" }}>
        <span style={{ fontSize: 14.5, fontWeight: 700, color: email ? "#5a7a64" : "#c0440a" }}>📬 本次日報寄給</span>
        <select value={email} onChange={e => onEmailChange(e.target.value)}
          style={{ width: "100%", padding: "8px 9px", borderRadius: 5, border: "1.5px solid #b8d4c2", background: "#fff", fontSize: 16.5, fontWeight: 700, color: C.green, fontFamily: "inherit", margin: "4px 0 2px" }}>
          <option value="">— 請選擇你是誰 —</option>
          {emailOptions.map(o => <option key={o.email} value={o.email}>{o.name}</option>)}
        </select>
        <span style={{ fontSize: 14, color: email ? "#8a8a82" : "#c0440a", fontWeight: email ? 400 : 700 }}>
          {email ? "換人輪值時，直接在上面選自己的名字即可（會自動存回設定表）" : "請先選擇你的名字，否則 Email 寄不出去"}
        </span>
      </div>

      {/* 分頁按鈕 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {[["morning","☀️ 當天早上查",false],["night","🌙 前一晚預查",true]].map(([p,label,isNight]) => (
          <button key={p} onClick={() => switchPhase(p)}
            style={{ flex: 1, padding: "11px 6px", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: `2px solid ${phase===p ? (isNight?C.night:C.green) : (isNight?C.nightBorder:C.greenBorder)}`, background: phase===p ? (isNight?C.night:C.green) : (isNight?C.nightLight:C.greenLight), color: phase===p ? "#fff" : (isNight?C.night:C.green), textAlign: "center", minHeight: 44 }}>
            {label}
          </button>
        ))}
      </div>

      {/* 說明條 */}
      <div style={{ borderLeft: `3px solid ${accent}`, padding: "8px 10px", borderRadius: 4, fontSize: 15, color: night ? C.night : "#3a5a48", marginBottom: 16, lineHeight: 1.5, background: night ? "#eef0f8" : "#f0f4f1" }}>
        {phase === "morning" ? "當天早上輪值：撈取 → 打底 → 校對 → 直接寄出，共 4 步。" : "前一晚預查：撈取 → 打底 → 校對 → 存保險箱。明早再還原 → 撈早報 → 補收融合 → 再次校對 → 寄出。"}
      </div>

      {/* 步驟 */}
      {flow.map((step, i) => {
        const isActive = i === current;
        const isDone = i < current;
        const hasQualityIssue = qualityIssues.length > 0 && step.isProofread;
        return (
          <div key={i} style={{ border: `1.5px solid ${isActive ? (night?"#4a6fa5":C.orange) : "#e0e0d8"}`, borderRadius: 8, marginBottom: 10, overflow: "hidden", background: "#fff" }}>
            <div onClick={() => setCurrent(i)} style={{ display: "flex", alignItems: "center", padding: "12px 11px", cursor: "pointer", gap: 9, minHeight: 50 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: isDone ? C.success : isActive ? (night?"#4a6fa5":C.orange) : "#f0f0e8", color: isDone||isActive ? "#fff" : "#8a8a82", fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: isActive ? `0 0 0 3px ${night?"#d0dff5":"#f7e2cf"}` : "none" }}>
                {isDone ? "✓" : i+1}
              </div>
              <div style={{ fontWeight: 700, fontSize: 16.5, flex: 1, color: isActive ? (night?C.night:C.orange) : "#2a2a28" }}>
                {step.label}
                {hasQualityIssue && isActive && <span style={{ fontSize: 13, color: C.red, marginLeft: 8 }}>⚠️ {qualityIssues.length} 個問題待修</span>}
              </div>
              <div style={{ color: "#b0b0a8", fontSize: 15 }}>{isActive ? "▾" : "▸"}</div>
            </div>

            {isActive && (
              <div style={{ padding: "0 12px 14px 51px" }}>
                {/* 說明 */}
                <ul style={{ listStyle: "none", margin: "4px 0 10px" }}>
                  {step.desc.map((d, j) => (
                    <li key={j} style={{ position: "relative", paddingLeft: 16, marginBottom: 6, fontSize: 15.5, color: "#4a4a44", lineHeight: 1.5 }}>
                      <span style={{ position: "absolute", left: 4, color: night?"#4a6fa5":C.orange, fontWeight: 700 }}>·</span>{d}
                    </li>
                  ))}
                </ul>

                {/* 品質問題清單 */}
                {qualityIssues.length > 0 && step.isProofread && (
                  <div style={{ background: "#fff5f5", border: "1px solid #feb2b2", borderRadius: 6, padding: "10px 12px", marginBottom: 12 }}>
                    <div style={{ fontWeight: 700, color: C.red, marginBottom: 6, fontSize: 15 }}>🛑 以下 {qualityIssues.length} 則需要修正才能寄出：</div>
                    {qualityIssues.map((issue, j) => (
                      <div key={j} style={{ fontSize: 14, color: "#c0440a", marginBottom: 4, paddingLeft: 8 }}>
                        • 第{issue.row}列「{issue.title.substring(0,20)}{issue.title.length>20?"…":""}」→ {issue.type}
                      </div>
                    ))}
                  </div>
                )}

                {/* 警告訊息 */}
                {step.warnMsg && <div style={{ background: "#fff6ed", border: "1px solid #f0d2b0", borderRadius: 5, padding: "8px 10px", fontSize: 15, color: "#a85816", margin: "8px 0", lineHeight: 1.5 }}><b>⚠️ 注意：</b>{step.warnMsg}</div>}

                {/* 校對區：顯示精選表 */}
                {step.isProofread && (
                  <div style={{ marginBottom: 12 }}>
                    {/* 工具按鈕列 */}
                    <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                      <button disabled={running} onClick={() => { setLoadingNews(true); loadNews(); }}
                        style={{ padding: "7px 12px", borderRadius: 6, border: `1px solid ${accent}`, background: "#fff", color: accent, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        🔄 重新載入
                      </button>
                      <button disabled={running} onClick={() => runAction("批次還原Google轉址", "batchRestore", -1).then(() => loadNews())}
                        style={{ padding: "7px 12px", borderRadius: 6, border: `1px solid ${accent}`, background: "#fff", color: accent, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        🔗 批次還原網址
                      </button>
                    </div>

                    {/* 貼上區 */}
                    <div onClick={() => document.getElementById("pasteInput").focus()}
                      style={{ border: `1.5px dashed ${pastedUrls.length>0?"#2e7d52":"#c8c8be"}`, borderRadius: 8, padding: "12px", marginBottom: 8, textAlign: "center", cursor: "pointer", background: pastedUrls.length>0?"#eef6f0":"#f4f4f0", position: "relative", minHeight: 60, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ fontSize: 14, color: pastedUrls.length>0?"#2e7d52":"#8a8a82", fontWeight: pastedUrls.length>0?700:400 }}>
                        {pastedUrls.length>0 ? `✅ 讀取到 ${pastedUrls.length} 個網址，點下方確認寫入` : "📋 Safari 複製所有分頁連結後，在此貼上"}
                      </div>
                      <textarea id="pasteInput" style={{ position: "absolute", opacity: 0, width: 1, height: 1 }} onPaste={handlePaste} />
                    </div>
                    {pastedUrls.length > 0 && (
                      <button disabled={running} onClick={applyUrls}
                        style={{ width: "100%", padding: 10, borderRadius: 8, border: "none", background: C.success, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", marginBottom: 10, fontFamily: "inherit" }}>
                        ✅ 確認寫入 D 欄
                      </button>
                    )}

                    {/* 新聞列表 */}
                    {loadingNews ? (
                      <div style={{ textAlign: "center", padding: 20, color: "#8a8a82", fontSize: 15 }}>載入精選表中…</div>
                    ) : newsRows.length === 0 ? (
                      <div style={{ textAlign: "center", padding: 20, color: "#8a8a82", fontSize: 15, background: "#f4f4f0", borderRadius: 8 }}>精選表是空的，請先完成步驟 1 和 2</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {newsRows.map((row, idx) => {
                          const isGoogleUrl = row.url.includes("news.google.com");
                          const isNetMedia = row.source === "網路媒體" || row.source === "";
                          const hasIssue = isGoogleUrl || isNetMedia;
                          return (
                            <div key={row.rowNum} style={{ background: hasIssue?"#fff8f0":"#fff", border: `1px solid ${hasIssue?"#f0d2b0":"#e0e0d8"}`, borderRadius: 8, padding: "10px 12px" }}>
                              {/* 媒體名 + 時間 */}
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span onClick={() => setEditCell({ rowNum: row.rowNum, field: "source", value: row.source })}
                                    style={{ fontSize: 13, fontWeight: 700, color: isNetMedia?"#c0440a":"#1a4733", background: isNetMedia?"#fff0f0":"#eef6f0", padding: "2px 8px", borderRadius: 4, cursor: "pointer", border: `1px solid ${isNetMedia?"#f0a0a0":"#b8d4c2"}` }}>
                                    {row.source || "（空白）"} ✏️
                                  </span>
                                  {isNetMedia && <span style={{ fontSize: 12, color: C.red }}>⚠️需改</span>}
                                </div>
                                <span style={{ fontSize: 12, color: "#9a9a92" }}>{row.time ? row.time.substring(5,16) : ""}</span>
                              </div>
                              {/* 標題 */}
                              <div onClick={() => setEditCell({ rowNum: row.rowNum, field: "title", value: row.title })}
                                style={{ fontSize: 15.5, fontWeight: 500, color: "#2a2a28", lineHeight: 1.5, marginBottom: 6, cursor: "pointer" }}>
                                {row.title} <span style={{ fontSize: 13, color: "#9a9a92" }}>✏️</span>
                              </div>
                              {/* 網址 */}
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                                <div onClick={() => setEditCell({ rowNum: row.rowNum, field: "url", value: row.url })}
                                  style={{ flex: 1, fontSize: 12, color: isGoogleUrl?"#c0440a":"#4a86c8", wordBreak: "break-all", lineHeight: 1.4, cursor: "pointer" }}>
                                  {isGoogleUrl && "⚠️ "}{row.url ? row.url.substring(0,60)+"…" : "（無網址）"}
                                </div>
                                <a href={row.url} target="_blank" rel="noreferrer"
                                  style={{ fontSize: 13, color: "#4a86c8", whiteSpace: "nowrap", padding: "2px 6px", borderRadius: 4, border: "1px solid #b8c4e0", textDecoration: "none" }}>
                                  開啟
                                </a>
                                <button onClick={() => deleteRow(row.rowNum, row.title)}
                                  style={{ fontSize: 13, color: C.red, padding: "2px 8px", borderRadius: 4, border: `1px solid #f0a0a0`, background: "#fff0f0", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" }}>
                                  刪除
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* 選用區 */}
                    {step.withOptional && (
                      <div style={{ background: "#f4f4f0", border: "1px dashed #c8c8be", borderRadius: 6, padding: "10px 12px", marginTop: 14 }}>
                        <span style={{ display: "inline-block", background: "#c8c8be", color: "#fff", fontSize: 13, fontWeight: 700, padding: "2px 8px", borderRadius: 3 }}>選用</span>
                        <div style={{ fontWeight: 700, fontSize: 16, color: "#6a6a62", margin: "6px 0 3px" }}>📥 手動補充遺漏的新聞</div>
                        <div style={{ fontSize: 15, color: "#8a8a82", marginBottom: 8, lineHeight: 1.5 }}>到「手動加入網址」分頁貼上網址後按下方按鈕匯入。</div>
                        <button disabled={running} onClick={() => runAction("匯入手動補充的新聞", "importManual", -1).then(() => loadNews())}
                          style={{ width: "100%", padding: 10, borderRadius: 8, border: `1.5px solid ${accent}`, background: "#fff", color: accent, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                          📥 匯入手動補充的新聞（Step 2-C）
                        </button>
                      </div>
                    )}

                    <button onClick={() => { setQualityIssues([]); advance(i); }}
                      style={{ width: "100%", padding: 12, borderRadius: 8, border: "none", background: C.success, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", marginTop: 14, fontFamily: "inherit" }}>
                      ✓ 校對完成，進入下一步
                    </button>
                  </div>
                )}

                {/* LINE 開關 */}
                {step.withLine && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 12, background: "#f4f4f0", border: "1.5px solid #e0e0d8", borderRadius: 8, marginBottom: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>同步推播 LINE 群組</div>
                      <div style={{ fontSize: 13, color: "#8a8a82", marginTop: 2 }}>⚠️ LINE 每月配額有限，練習時請關閉</div>
                    </div>
                    <label style={{ position: "relative", width: 44, height: 26, flexShrink: 0 }}>
                      <input type="checkbox" checked={lineOn} onChange={e => setLineOn(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                      <span style={{ position: "absolute", inset: 0, background: lineOn?C.green:"#c8c8be", borderRadius: 13, cursor: "pointer", transition: ".2s" }}>
                        <span style={{ position: "absolute", width: 20, height: 20, left: lineOn?21:3, top: 3, background: "#fff", borderRadius: "50%", transition: ".2s" }} />
                      </span>
                    </label>
                  </div>
                )}

                {/* 主要執行按鈕 */}
                {step.action && (
                  <button disabled={running} onClick={() => runAction(step.label, step.action, i)}
                    style={{ width: "100%", padding: 12, borderRadius: 8, border: "none", background: running?"#8a8a82":accent, color: "#fff", fontSize: 16, fontWeight: 700, cursor: running?"wait":"pointer", marginTop: 8, fontFamily: "inherit" }}>
                    {step.btnLabel}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div onClick={resetAll} style={{ display: "block", textAlign: "center", marginTop: 20, fontSize: 15, color: "#8a8a82", cursor: "pointer", textDecoration: "underline", padding: 8 }}>↺ 全部重置，重新開始今天的流程</div>
      <div style={{ fontSize: 14, color: "#9a9a92", textAlign: "center", marginTop: 14, lineHeight: 1.6 }}>每完成一步會自動點亮下一步。<br />進度會自動儲存，關掉再開不會消失。</div>
    </div>
  );
}
