import { useState, useEffect, useCallback } from "react";

// ── GAS API 網址（部署後填入）──
const GAS_URL = process.env.REACT_APP_GAS_URL || "";

// ── 呼叫 GAS API ──
async function gasCall(params = {}) {
  const url = new URL(GAS_URL);
  // 複雜物件轉成 JSON 字串
  const encoded = {};
  Object.entries(params).forEach(([k, v]) => {
    encoded[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
  });
  Object.entries(encoded).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  return res.json();
}

  const res = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

// ── 流程資料 ──
const FLOWS = {
  morning: [
    { label: "撈取今日輿情", action: "fetchNews", btnLabel: "🔍 撈取今日新聞（Step 1）", desc: ["系統跑 14 條雷達線 + 中央社、自由時報、ETtoday、聯合報、公視直訂 RSS。", "撈完會自動跳到下一步。"] },
    { label: "打底自動過濾", action: "filterNews", btnLabel: "🧹 自動清洗篩選（Step 2-A）", desc: ["系統自動清洗、去重、媒體正名。", "完成後新聞出現在「今日精選純新聞」分頁。"] },
    { label: "人工校對（最重要）", action: null, btnLabel: null, desc: ["刪除不相關新聞，只留前一晚與當天的", "「網路媒體」要點開核對，改成正確報社", "更生日報一定要手動補標題（系統抓不到）", "刪掉標題尾端多餘版別字（如 -生活）", "開啟網址後複製真實連結貼回 D 欄"], isProofread: true, withOptional: true },
    { label: "確認寄出", action: "send", btnLabel: "🚀 寄出日報（Step 3）", desc: ["按下後先自動掃描五道品質防線，通過才進入校對海報。"], withLine: true, warnMsg: "若 LINE 額度用光，寄出後去信箱複製內文，手動貼到 LINE 群組。" },
  ],
  night: [
    { label: "撈取今晚輿情", action: "fetchNews", btnLabel: "🔍 撈取今日新聞（Step 1）", desc: ["前一晚先預查，先撈一輪當天的新聞。"] },
    { label: "打底自動過濾", action: "filterNews", btnLabel: "🧹 自動清洗篩選（Step 2-A）", desc: ["系統自動清洗篩選。"] },
    { label: "人工校對", action: null, btnLabel: null, desc: ["刪除不相關新聞", "媒體正名、更生日報補標題", "開啟網址後複製真實連結貼回 D 欄"], isProofread: true },
    { label: "存入保險箱（交接關鍵）", action: "saveHeart", btnLabel: "💾 存檔今晚進度（交接保險箱）", desc: ["把今晚心血鎖進保險箱，明早同仁才能一鍵召回。"], warnMsg: "這一步是前一晚預查的重點，忘了存明早就白做了！" },
    { label: "（明早）還原昨晚進度", action: "restoreHeart", btnLabel: "⏪ 還原昨晚進度（清晨接班用）", desc: ["隔天清晨第一步：先點這個召回昨晚進度。"] },
    { label: "（明早）撈取今早新聞", action: "fetchNews", btnLabel: "🔍 撈取今日新聞（Step 1）", desc: ["還原後，重跑一次 Step 1 撈取今天最新的早報。"] },
    { label: "（明早）融合今早早報", action: "filterAppend", btnLabel: "🔄 融合今早早報（Step 2-B）", desc: ["把今早新撈的早報，與昨晚的心血融合在一起。"], warnMsg: "若忘記先撈早報就按這個，系統會自動攔截並提醒你先做上一步。" },
    { label: "（明早）再次人工校對", action: null, btnLabel: null, desc: ["刪除不相關或時效已過的新聞", "媒體正名、更生日報補標題", "開啟網址後複製真實連結貼回 D 欄", "確認今日精選內容完整、無遺漏"], isProofread: true, withOptional: true },
    { label: "（明早）確認寄出", action: "send", btnLabel: "🚀 寄出日報（Step 3）", desc: ["最後校對後正式寄出。"], withLine: true, warnMsg: "前一晚預查的稿，寄出前記得進信箱改主旨日期！" },
  ],
};

const S = {
  app: { maxWidth: 480, margin: "0 auto", padding: "14px 12px 40px", fontFamily: '"Microsoft JhengHei","PingFang TC",sans-serif', fontSize: 17, background: "#fafaf8", minHeight: "100vh" },
  hdr: { borderBottom: "2px solid #1a4733", paddingBottom: 10, marginBottom: 14 },
  hdrTitle: { fontSize: 19, fontWeight: 700, color: "#1a4733" },
  hdrSub: { fontSize: 15, color: "#8a8a82", marginTop: 3 },
  ebar: (empty) => ({ display: "flex", flexDirection: "column", gap: 2, padding: "9px 11px", borderRadius: 7, marginBottom: 14, border: `1.5px solid ${empty ? "#f0c0a0" : "#cfe3d6"}`, background: empty ? "#fff4ec" : "#eef6f0", transition: "all .2s" }),
  ebarLabel: (empty) => ({ fontSize: 14.5, fontWeight: 700, color: empty ? "#c0440a" : "#5a7a64" }),
  esel: { width: "100%", padding: "8px 9px", borderRadius: 5, border: "1.5px solid #b8d4c2", background: "#fff", fontSize: 16.5, fontWeight: 700, color: "#1a4733", fontFamily: "inherit", margin: "4px 0 2px", cursor: "pointer" },
  ehint: (empty) => ({ fontSize: 14, color: empty ? "#c0440a" : "#8a8a82", marginTop: 2, fontWeight: empty ? 700 : 400 }),
  ptabs: { display: "flex", gap: 8, marginBottom: 10 },
  ptab: (active, night) => ({ flex: 1, padding: "11px 6px", borderRadius: 8, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", border: `2px solid ${active ? (night ? "#2c3e6b" : "#1a4733") : (night ? "#b8c4e0" : "#a8d4bc")}`, background: active ? (night ? "#2c3e6b" : "#1a4733") : (night ? "#dde3f5" : "#d4ece0"), color: active ? "#fff" : (night ? "#2c3e6b" : "#1a4733"), transition: "all .15s", textAlign: "center", minHeight: 44 }),
  pdesc: (night) => ({ borderLeft: `3px solid ${night ? "#2c3e6b" : "#1a4733"}`, padding: "8px 10px", borderRadius: 4, fontSize: 15, color: night ? "#2c3e6b" : "#3a5a48", marginBottom: 16, lineHeight: 1.5, background: night ? "#eef0f8" : "#f0f4f1" }),
  step: (active, done, night) => ({ border: `1.5px solid ${active ? (night ? "#4a6fa5" : "#d97a28") : "#e0e0d8"}`, borderRadius: 8, marginBottom: 10, overflow: "hidden", background: "#fff" }),
  shead: { display: "flex", alignItems: "center", padding: "12px 11px", cursor: "pointer", gap: 9, minHeight: 50 },
  snum: (active, done, night) => ({ width: 30, height: 30, borderRadius: "50%", background: done ? "#2e7d52" : active ? (night ? "#4a6fa5" : "#d97a28") : "#f0f0e8", color: done || active ? "#fff" : "#8a8a82", fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: `0.5px solid ${done ? "#2e7d52" : active ? (night ? "#4a6fa5" : "#d97a28") : "#e0e0d8"}`, boxShadow: active ? (night ? "0 0 0 3px #d0dff5" : "0 0 0 3px #f7e2cf") : "none", transition: "all .2s" }),
  slabel: (active, night) => ({ fontWeight: 700, fontSize: 16.5, flex: 1, lineHeight: 1.3, color: active ? (night ? "#2c3e6b" : "#c45e10") : "#2a2a28" }),
  stog: { color: "#b0b0a8", fontSize: 15, flexShrink: 0 },
  sbody: { padding: "0 12px 14px 51px" },
  li: (night) => ({ position: "relative", paddingLeft: 16, marginBottom: 6, fontSize: 15.5, color: "#4a4a44", lineHeight: 1.5, "::before": { content: '"·"', position: "absolute", left: 4, color: night ? "#4a6fa5" : "#d97a28" } }),
  warn: { background: "#fff6ed", border: "1px solid #f0d2b0", borderRadius: 5, padding: "8px 10px", fontSize: 15, color: "#a85816", margin: "8px 0", lineHeight: 1.5 },
  btn: (ghost, green, night, disabled) => ({ width: "100%", padding: 12, border: ghost ? `1.5px solid ${night ? "#2c3e6b" : "#1a4733"}` : "none", borderRadius: 8, fontWeight: 700, fontSize: 16, cursor: disabled ? "wait" : "pointer", marginTop: 8, fontFamily: "inherit", transition: "all .15s", minHeight: 48, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, background: disabled ? "#8a8a82" : green ? "#2e7d52" : ghost ? "#fff" : (night ? "#2c3e6b" : "#1a4733"), color: (ghost && !disabled) ? (night ? "#2c3e6b" : "#1a4733") : "#fff", opacity: disabled ? 0.8 : 1 }),
  chk: { display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8, fontSize: 15.5, lineHeight: 1.5, cursor: "pointer", padding: "4px 0", color: "#4a4a44" },
  opt: { background: "#f4f4f0", border: "1px dashed #c8c8be", borderRadius: 6, padding: "10px 12px", marginTop: 14 },
  optTag: { display: "inline-block", background: "#c8c8be", color: "#fff", fontSize: 13, fontWeight: 700, padding: "2px 8px", borderRadius: 3, letterSpacing: 1 },
  optTitle: { fontWeight: 700, fontSize: 16, color: "#6a6a62", margin: "6px 0 3px" },
  optDesc: { fontSize: 15, color: "#8a8a82", lineHeight: 1.5, marginBottom: 8 },
  pzone: (ok) => ({ border: `1.5px dashed ${ok ? "#2e7d52" : "#c8c8be"}`, borderRadius: 8, padding: "14px 12px", marginTop: 10, textAlign: "center", cursor: "pointer", background: ok ? "#eef6f0" : "#f4f4f0", position: "relative", minHeight: 80, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }),
  ptxt: (ok) => ({ fontSize: ok ? 15 : 14, color: ok ? "#2e7d52" : "#8a8a82", lineHeight: 1.6, fontWeight: ok ? 700 : 400 }),
  urlbox: { fontSize: 12, color: "#5a5a54", background: "#ebebdf", border: "0.5px solid #e0e0d8", borderRadius: 4, padding: "6px 8px", marginTop: 6, lineHeight: 1.8, wordBreak: "break-all", maxHeight: 80, overflowY: "auto", width: "100%", textAlign: "left" },
  lrow: { display: "flex", alignItems: "center", gap: 10, padding: 12, background: "#f4f4f0", border: "1.5px solid #e0e0d8", borderRadius: 8, marginBottom: 8 },
  ltxt: { flex: 1 },
  lmain: { fontSize: 15, fontWeight: 700 },
  lsub: { fontSize: 13, color: "#8a8a82", marginTop: 2, lineHeight: 1.4 },
  overlay: { position: "fixed", inset: 0, background: "rgba(250,250,248,.9)", zIndex: 999, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 },
  spin: { width: 40, height: 40, borderRadius: "50%", border: "4px solid #d8d8d0", borderTopColor: "#1a4733", animation: "spin .7s linear infinite" },
  ovtxt: { fontSize: 17, fontWeight: 700, color: "#1a4733", textAlign: "center", padding: "0 20px" },
  ovsub: { fontSize: 15, color: "#8a8a82" },
  toast: (show, err) => ({ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: err ? "#c0440a" : "#2e7d52", color: "#fff", padding: "12px 22px", borderRadius: 10, fontSize: 15, fontWeight: 700, opacity: show ? 1 : 0, transition: "opacity .3s", pointerEvents: "none", zIndex: 1000, whiteSpace: "nowrap", maxWidth: "90vw", textAlign: "center" }),
  resetlnk: { display: "block", textAlign: "center", marginTop: 20, fontSize: 15, color: "#8a8a82", cursor: "pointer", textDecoration: "underline", padding: 8 },
  tip: { fontSize: 14, color: "#9a9a92", textAlign: "center", marginTop: 14, lineHeight: 1.6 },
  loading: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", gap: 16 },
};

export default function App() {
  const [phase, setPhase] = useState("morning");
  const [current, setCurrent] = useState(0);
  const [email, setEmail] = useState("");
  const [emailOptions, setEmailOptions] = useState([]);
  const [running, setRunning] = useState(false);
  const [runningLabel, setRunningLabel] = useState("");
  const [toast, setToast] = useState({ show: false, msg: "", err: false });
  const [lineOn, setLineOn] = useState(false);
  const [pastedUrls, setPastedUrls] = useState([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [gasUrl, setGasUrl] = useState(GAS_URL);

  const night = phase === "night";
  const flow = FLOWS[phase];

  // ── 載入設定 ──
  useEffect(() => {
    if (!gasUrl) { setLoadingConfig(false); return; }
    gasCall({ action: "config" })
      .then((cfg) => {
        if (cfg.ok) {
          setEmailOptions(cfg.emailOptions || []);
          setEmail(cfg.currentEmail || "");
          if (cfg.state) {
            setPhase(cfg.state.phase || "morning");
            setCurrent(cfg.state.current || 0);
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoadingConfig(false));
  }, [gasUrl]);

  const showToast = useCallback((msg, err = false) => {
    setToast({ show: true, msg, err });
    setTimeout(() => setToast((t) => ({ ...t, show: false })), 3000);
  }, []);

  const saveState = useCallback((ph, cur) => {
    if (!gasUrl) return;
    gasCall({ action: "setState", state: { phase: ph, current: cur } }).catch(() => {});
  }, [gasUrl]);

  const advance = useCallback((i) => {
    const next = Math.min(i + 1, flow.length - 1);
    setCurrent(next);
    saveState(phase, next);
  }, [flow.length, phase, saveState]);

  const switchPhase = (p) => {
    setPhase(p);
    setCurrent(0);
    saveState(p, 0);
  };

  const resetAll = () => {
    setCurrent(0);
    saveState(phase, 0);
  };

  const runAction = async (label, action, stepIdx) => {
    if (running || !gasUrl) return;
    setRunning(true);
    setRunningLabel(label);
    try {
      const params = { action };
      if (action === "send") params.sendLine = lineOn;
      const result = await gasCall(params);
      if (result.ok) {
        showToast("✅ " + label + " 完成");
        if (stepIdx >= 0) advance(stepIdx);
      } else {
        showToast("❌ " + (result.error || result.message || "執行失敗"), true);
      }
    } catch (e) {
      showToast("❌ 連線失敗：" + e.message, true);
    } finally {
      setRunning(false);
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text");
    const urls = text.split(/[\n\r]+/).map((u) => u.trim()).filter((u) => /^https?:\/\//.test(u));
    if (!urls.length) { showToast("⚠️ 沒有偵測到 http 開頭的網址", true); return; }
    setPastedUrls(urls);
  };

  const applyUrls = async () => {
    if (!pastedUrls.length || !gasUrl) return;
    setRunning(true);
    setRunningLabel("寫入 D 欄");
    try {
      const result = await gasCall({ action: "applyUrls", urls: pastedUrls });
      if (result.ok) {
        showToast(`✅ 已將 ${pastedUrls.length} 個網址寫入精選表 D 欄`);
        setPastedUrls([]);
      } else {
        showToast("❌ " + (result.message || "寫入失敗"), true);
      }
    } catch (e) {
      showToast("❌ 連線失敗：" + e.message, true);
    } finally {
      setRunning(false);
    }
  };

  const onEmailChange = async (val) => {
    setEmail(val);
    if (val && gasUrl) {
      try { await gasCall({ action: "setEmail", email: val }); } catch (e) {}
    }
  };

  // ── 如果還沒設定 GAS URL ──
  if (!gasUrl) {
    return (
      <div style={S.app}>
        <div style={S.hdr}>
          <div style={S.hdrTitle}>📰 太魯閣輿情日報</div>
          <div style={S.hdrSub}>設定 GAS API 網址</div>
        </div>
        <div style={{ background: "#fff6ed", border: "1px solid #f0d2b0", borderRadius: 8, padding: 16, marginBottom: 16, fontSize: 15, lineHeight: 1.6, color: "#a85816" }}>
          <b>第一次使用需要設定 GAS API 網址</b><br />
          請將 GAS 部署的 exec 網址貼到下方：
        </div>
        <input
          type="url"
          placeholder="https://script.google.com/macros/s/..."
          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #ccc", fontSize: 15, fontFamily: "inherit", marginBottom: 8 }}
          onBlur={(e) => { if (e.target.value.includes("script.google.com")) { localStorage.setItem("GAS_URL", e.target.value); setGasUrl(e.target.value); } }}
        />
        <div style={{ fontSize: 13, color: "#8a8a82", lineHeight: 1.6 }}>
          設定後會自動儲存在您的瀏覽器，下次不需要重新輸入。
        </div>
      </div>
    );
  }

  if (loadingConfig) {
    return (
      <div style={{ ...S.app, ...S.loading }}>
        <div style={{ ...S.spin }} />
        <div style={{ fontSize: 16, color: "#1a4733", fontWeight: 700, fontFamily: '"Microsoft JhengHei",sans-serif' }}>載入中，請稍候…</div>
      </div>
    );
  }

  const emptyEmail = !email;

  return (
    <div style={S.app}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* 執行遮罩 */}
      {running && (
        <div style={S.overlay}>
          <div style={S.spin} />
          <div style={S.ovtxt}>正在執行：{runningLabel}…</div>
          <div style={S.ovsub}>請勿關閉或重複點擊</div>
        </div>
      )}

      {/* Toast */}
      <div style={S.toast(toast.show, toast.err)}>{toast.msg}</div>

      {/* Header */}
      <div style={S.hdr}>
        <div style={S.hdrTitle}>📰 輿情日報操作導引</div>
        <div style={S.hdrSub}>跟著亮起的步驟做，不會漏</div>
      </div>

      {/* 信箱選擇 */}
      <div style={S.ebar(emptyEmail)}>
        <span style={S.ebarLabel(emptyEmail)}>📬 本次日報寄給</span>
        <select style={S.esel} value={email} onChange={(e) => onEmailChange(e.target.value)}>
          <option value="">— 請選擇你是誰 —</option>
          {emailOptions.map((o) => (
            <option key={o.email} value={o.email}>{o.name}</option>
          ))}
        </select>
        <span style={S.ehint(emptyEmail)}>
          {emptyEmail ? "請先選擇你的名字，否則 Email 寄不出去" : "換人輪值時，直接在上面選自己的名字即可（會自動存回設定表）"}
        </span>
      </div>

      {/* 分頁按鈕 */}
      <div style={S.ptabs}>
        <button style={S.ptab(phase === "morning", false)} onClick={() => switchPhase("morning")}>☀️ 當天早上查</button>
        <button style={S.ptab(phase === "night", true)} onClick={() => switchPhase("night")}>🌙 前一晚預查</button>
      </div>

      {/* 說明條 */}
      <div style={S.pdesc(night)}>
        {phase === "morning"
          ? "當天早上輪值：撈取 → 打底 → 校對 → 直接寄出，共 4 步。"
          : "前一晚預查：撈取 → 打底 → 校對 → 存保險箱。明早再還原 → 撈早報 → 補收融合 → 再次校對 → 寄出。"}
      </div>

      {/* 步驟 */}
      {flow.map((step, i) => {
        const isActive = i === current;
        const isDone = i < current;
        return (
          <div key={i} style={S.step(isActive, isDone, night)}>
            <div style={S.shead} onClick={() => setCurrent(i)}>
              <div style={S.snum(isActive, isDone, night)}>{isDone ? "✓" : i + 1}</div>
              <div style={S.slabel(isActive, night)}>{step.label}</div>
              <div style={S.stog}>{isActive ? "▾" : "▸"}</div>
            </div>

            {isActive && (
              <div style={S.sbody}>
                {/* 說明清單 */}
                {step.isProofread ? (
                  <div style={{ marginBottom: 10 }}>
                    {step.desc.map((d, j) => (
                      <label key={j} style={S.chk}>
                        <input type="checkbox" style={{ marginTop: 3, flexShrink: 0, accentColor: "#1a4733", width: 18, height: 18 }} />
                        <span>{d}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <ul style={{ listStyle: "none", margin: "4px 0 10px" }}>
                    {step.desc.map((d, j) => (
                      <li key={j} style={{ position: "relative", paddingLeft: 16, marginBottom: 6, fontSize: 15.5, color: "#4a4a44", lineHeight: 1.5 }}>
                        <span style={{ position: "absolute", left: 4, color: night ? "#4a6fa5" : "#d97a28", fontWeight: 700 }}>·</span>
                        {d}
                      </li>
                    ))}
                  </ul>
                )}

                {/* 警告訊息 */}
                {step.warnMsg && (
                  <div style={S.warn}><b>⚠️ 注意：</b>{step.warnMsg}</div>
                )}

                {/* 校對工具按鈕 */}
                {step.isProofread && (
                  <>
                    <button disabled={running} style={S.btn(true, false, night, running)} onClick={() => runAction("開啟所有新聞網址", "openAllUrls", -1)}>🌐 開啟所有新聞網址（逐一核對用）</button>
                    <button disabled={running} style={S.btn(true, false, night, running)} onClick={() => runAction("批次還原Google轉址", "batchRestore", -1)}>🔗 批次還原 Google 轉址</button>

                    {/* 貼上區 */}
                    <div
                      style={S.pzone(pastedUrls.length > 0)}
                      onClick={() => document.getElementById("pasteInput").focus()}
                    >
                      <div style={S.ptxt(pastedUrls.length > 0)}>
                        {pastedUrls.length > 0
                          ? `✅ 讀取到 ${pastedUrls.length} 個網址，點下方確認寫入 D 欄`
                          : "📋 Safari 複製所有分頁連結後，在此貼上"}
                      </div>
                      {pastedUrls.length === 0 && (
                        <div style={{ fontSize: 13, color: "#9a9a92" }}>系統會自動分配到精選表 D 欄對應列</div>
                      )}
                      <textarea
                        id="pasteInput"
                        style={{ position: "absolute", opacity: 0, width: 1, height: 1, top: 0, left: 0 }}
                        onPaste={handlePaste}
                      />
                    </div>
                    {pastedUrls.length > 0 && (
                      <>
                        <div style={S.urlbox}>
                          {pastedUrls.slice(0, 3).join("\n")}{pastedUrls.length > 3 ? `\n…還有 ${pastedUrls.length - 3} 個` : ""}
                        </div>
                        <button disabled={running} style={{ ...S.btn(false, true, night, running), marginTop: 6 }} onClick={applyUrls}>✅ 確認寫入 D 欄</button>
                      </>
                    )}
                  </>
                )}

                {/* 選用區 */}
                {step.withOptional && (
                  <div style={S.opt}>
                    <span style={S.optTag}>選用</span>
                    <div style={S.optTitle}>🔍 確保沒有遺漏？手動補搜</div>
                    <div style={S.optDesc}>建議至 Google 手動搜尋「太魯閣」「國家公園署」等關鍵字確認無遺漏。若有，到「手動加入網址」分頁貼上網址後按下方按鈕匯入。</div>
                    <button disabled={running} style={S.btn(true, false, night, running)} onClick={() => runAction("匯入手動補充的新聞", "importManual", -1)}>📥 匯入手動補充的新聞（Step 2-C）</button>
                  </div>
                )}

                {/* LINE 開關 */}
                {step.withLine && (
                  <div style={S.lrow}>
                    <div style={S.ltxt}>
                      <div style={S.lmain}>同步推播 LINE 群組</div>
                      <div style={S.lsub}>⚠️ LINE 每月配額有限，練習時請關閉</div>
                    </div>
                    <label style={{ position: "relative", width: 44, height: 26, flexShrink: 0 }}>
                      <input type="checkbox" checked={lineOn} onChange={(e) => setLineOn(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                      <span style={{ position: "absolute", inset: 0, background: lineOn ? "#1a4733" : "#c8c8be", borderRadius: 13, cursor: "pointer", transition: ".2s" }}>
                        <span style={{ position: "absolute", width: 20, height: 20, left: lineOn ? 21 : 3, top: 3, background: "#fff", borderRadius: "50%", transition: ".2s" }} />
                      </span>
                    </label>
                  </div>
                )}

                {/* 主要執行按鈕 */}
                {step.action ? (
                  <button disabled={running} style={S.btn(false, false, night, running)} onClick={() => runAction(step.label, step.action, i)}>
                    {step.btnLabel}
                  </button>
                ) : (
                  <button style={{ ...S.btn(false, true, night, false), marginTop: 10 }} onClick={() => advance(i)}>
                    ✓ 校對完成，進入下一步
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div style={S.resetlnk} onClick={resetAll}>↺ 全部重置，重新開始今天的流程</div>
      <div style={S.tip}>每完成一步會自動點亮下一步。<br />進度會自動儲存，關掉再開不會消失。</div>
    </div>
  );
}
