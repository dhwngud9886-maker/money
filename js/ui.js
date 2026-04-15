// ================================================================
// ui.js  (v2 — 2026-04 리팩토링)
//
// [변경 내역]
//   - tx.name → tx.counterparty
//   - tx.destination → tx.accountName
//   - "deposit" → "income", "transfer" → "expense"
//   - isDeposit → isIncome
//   - 상태 배지: checking 제거, pending/processing/completed 3단계
//   - 액션 버튼: 상태 단순화 반영
//   - fillDepositForm → fillIncomeForm, fillTransferForm → fillExpenseForm
//   - resetDepositForm → resetIncomeForm, resetTransferForm → resetExpenseForm
// ================================================================

import { getStatusLabel } from "./db.js";

// ================================================================
// 포맷 헬퍼
// ================================================================
export function formatAmount(n) {
  if (n == null || isNaN(n)) return "₩ 0";
  return "₩ " + Math.abs(Number(n)).toLocaleString("ko-KR");
}

export function formatDate(dateStr) {
  if (!dateStr) return "-";
  return dateStr.replace(/-/g, ".");
}

export function formatDateTime(date) {
  if (!date) return "-";
  const d   = date instanceof Date ? date : new Date(date);
  const mm  = String(d.getMonth() + 1).padStart(2, "0");
  const dd  = String(d.getDate()).padStart(2, "0");
  const hh  = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${min}`;
}

export function formatAmountPreview(value) {
  const n = parseInt(String(value).replace(/,/g, ""), 10);
  if (isNaN(n) || n <= 0) return "";
  return n.toLocaleString("ko-KR") + " 원";
}

// ================================================================
// 로딩 오버레이
// ================================================================
export function showLoading(text = "처리 중...") {
  const el = document.getElementById("loading-overlay");
  const t  = el?.querySelector(".loading-text");
  if (t)  t.textContent = text;
  el?.classList.remove("hidden");
}

export function hideLoading() {
  document.getElementById("loading-overlay")?.classList.add("hidden");
}

// ================================================================
// 버튼 로딩 상태
// ================================================================
export function setButtonLoading(btn, isLoading, originalText = "") {
  if (!btn) return;
  if (isLoading) {
    btn.classList.add("loading");
    btn.disabled = true;
    btn.dataset.originalText = btn.textContent;
    btn.textContent = "";
  } else {
    btn.classList.remove("loading");
    btn.disabled = false;
    btn.textContent = originalText || btn.dataset.originalText || "";
  }
}

// ================================================================
// 토스트 알림
// ================================================================
export function showToast(message, type = "info", duration = 3000) {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const icons = { success: "✅", error: "❌", info: "ℹ️", warning: "⚠️" };
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] ?? "ℹ️"}</span>
    <span class="toast-msg">${escapeHtml(message)}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-out");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  }, duration);
}

// ================================================================
// 모달 열기 / 닫기
// ================================================================
export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove("hidden");
  setTimeout(() => {
    modal.querySelector("input:not([type=hidden]), textarea, select")?.focus();
  }, 100);
}

export function closeModal(modalId) {
  document.getElementById(modalId)?.classList.add("hidden");
}

export function closeAllModals() {
  document.querySelectorAll(".modal-overlay").forEach((m) => m.classList.add("hidden"));
}

// ================================================================
// 거래 카드 렌더링
// ================================================================

// ----------------------------------------------------------------
// renderTransactionCard(tx, currentUid)
// income → 초록(deposit-card), expense → 빨강(transfer-card)
// CSS 클래스명은 HTML/CSS와 호환을 위해 deposit-card/transfer-card 유지
// ----------------------------------------------------------------
export function renderTransactionCard(tx, currentUid) {
  const isIncome    = tx.type === "income";
  const isMyCard    = tx.createdBy === currentUid;
  const isCompleted = tx.status === "completed";

  const card = document.createElement("div");
  card.className = [
    "transaction-card",
    isIncome  ? "deposit-card"  : "transfer-card",   // CSS 클래스명 유지
    isMyCard  ? "my-card" : ""
  ].join(" ").trim();
  card.dataset.id     = tx.id;
  card.dataset.type   = tx.type;
  card.dataset.status = tx.status;

  // ── 배지 ──
  const statusBadge = buildStatusBadge(tx);
  const typeBadge   = `<span class="badge ${isIncome ? "badge-completed-deposit" : "badge-completed-transfer"}">
    ${isIncome ? "🔽 입금" : "🔼 송금"}
  </span>`;
  const newBadge    = (tx.isNew && !isMyCard)
    ? `<span class="badge badge-new">🆕 NEW</span>` : "";
  const editedBadge = tx.isEdited
    ? `<span class="badge badge-edited">✏️ 수정됨</span>` : "";
  const myBadge     = isMyCard
    ? `<span class="meta-highlight">내가 등록</span>` : "";

  // ── 금액 부호 ──
  const prefix = isIncome ? "+" : "−";

  // ── 계좌 정보 (expense 전용) ──
  const accountHtml = tx.accountName
    ? `<span class="card-destination">📌 ${escapeHtml(tx.accountName)}</span>` : "";

  // ── 완료 처리자 ──
  const completedByHtml = (isCompleted && tx.completedByName)
    ? `<span class="meta-item">✅ 완료: <strong>${escapeHtml(tx.completedByName)}</strong> (${formatDateTime(tx.completedAt)})</span>` : "";

  // ── 수정자 ──
  const updatedByHtml = (tx.isEdited && tx.updatedByName)
    ? `<span class="meta-item">✏️ 수정: <strong>${escapeHtml(tx.updatedByName)}</strong> (${formatDateTime(tx.updatedAt)})</span>` : "";

  card.innerHTML = `
    <div class="card-header">
      <div class="card-header-left">
        <span class="card-name">${escapeHtml(tx.counterparty)}</span>
        <span class="card-date">📅 ${formatDate(tx.date)}</span>
      </div>
      <div class="card-header-right">
        ${newBadge}${editedBadge}${typeBadge}${statusBadge}
      </div>
    </div>

    <div class="card-body">
      <span class="card-prefix">${prefix}</span>
      <span class="card-amount">${formatAmount(tx.amount)}</span>
      ${tx.memo ? `<span class="card-memo">📝 ${escapeHtml(tx.memo)}</span>` : ""}
      ${accountHtml}
    </div>

    <div class="card-meta">
      <span class="meta-item">👤 등록: <strong>${escapeHtml(tx.createdByName ?? "알 수 없음")}</strong></span>
      ${myBadge}
      ${completedByHtml}
      ${updatedByHtml}
    </div>

    <div class="card-actions">
      ${buildActionButtons(tx, isMyCard)}
    </div>
  `;

  return card;
}

// ----------------------------------------------------------------
// buildStatusBadge(tx) — 상태 배지 (pending / processing / completed)
// ----------------------------------------------------------------
function buildStatusBadge(tx) {
  const isIncome = tx.type === "income";

  const map = {
    pending: {
      cls:   "badge-pending",
      icon:  "⏳",
      label: isIncome ? "입금대기" : "송금대기"
    },
    processing: {
      cls:   "badge-processing",
      icon:  "🔄",
      label: isIncome ? "입금진행중" : "송금진행중"
    },
    completed: {
      cls:   isIncome ? "badge-completed-deposit" : "badge-completed-transfer",
      icon:  "✅",
      label: isIncome ? "입금완료" : "송금완료"
    }
  };

  const s = map[tx.status] ?? map.pending;
  return `<span class="badge ${s.cls}">${s.icon} ${s.label}</span>`;
}

// ----------------------------------------------------------------
// buildActionButtons(tx, isMyCard) — 카드 하단 버튼
//
// 상태별 버튼:
//   pending    → [수정] [삭제*] [진행중으로] [완료처리]
//   processing → [수정] [삭제*] [완료처리]
//   completed  → [수정] [숨기기/복원] [이력]
//   (* 삭제는 내가 등록한 항목만)
// ----------------------------------------------------------------
function buildActionButtons(tx, isMyCard) {
  const isIncome    = tx.type === "income";
  const isCompleted = tx.status === "completed";
  let html = "";

  // ── 공통: 수정 ──
  html += `<button class="btn btn-outline btn-sm" data-action="edit" data-id="${tx.id}">✏️ 수정</button>`;

  if (isCompleted) {
    // 숨기기 / 복원
    html += tx.hidden
      ? `<button class="btn btn-hide btn-sm" data-action="unhide" data-id="${tx.id}">👁️ 복원</button>`
      : `<button class="btn btn-hide btn-sm" data-action="hide"   data-id="${tx.id}">🙈 숨기기</button>`;
    html += `<button class="btn btn-ghost btn-sm" data-action="history" data-id="${tx.id}">📋 이력</button>`;

  } else {
    // 삭제 (내가 등록한 항목만)
    if (isMyCard) {
      html += `<button class="btn btn-ghost btn-sm" data-action="delete" data-id="${tx.id}">🗑️ 삭제</button>`;
    }

    // pending → processing 버튼
    if (tx.status === "pending") {
      const midLabel  = isIncome ? "🔄 입금진행중으로" : "🔄 송금진행중으로";
      html += `<button class="btn btn-check btn-sm"
                data-action="status"
                data-id="${tx.id}"
                data-next-status="processing">${midLabel}</button>`;
    }

    // → completed 버튼
    const completeLabel = isIncome ? "✅ 입금완료 처리" : "✅ 송금완료 처리";
    const completeCls   = isIncome ? "btn-complete-deposit" : "btn-complete-transfer";
    html += `<button class="btn ${completeCls} btn-sm"
              data-action="status"
              data-id="${tx.id}"
              data-next-status="completed">${completeLabel}</button>`;

    html += `<button class="btn btn-ghost btn-sm" data-action="history" data-id="${tx.id}">📋 이력</button>`;
  }

  return html;
}

// ================================================================
// 리스트 렌더링
// ================================================================
export function renderList(containerId, emptyId, entries, currentUid) {
  const container = document.getElementById(containerId);
  const emptyEl   = document.getElementById(emptyId);
  if (!container) return;

  // 빈 상태 요소 이외 카드 제거
  Array.from(container.children).forEach((child) => {
    if (!child.classList.contains("empty-state")) child.remove();
  });

  if (!entries || entries.length === 0) {
    emptyEl?.classList.remove("hidden");
    return;
  }

  emptyEl?.classList.add("hidden");
  entries.forEach((tx) => container.appendChild(renderTransactionCard(tx, currentUid)));
}

// ================================================================
// 변경 이력 모달 렌더링
// ================================================================
export function renderHistoryModal(history) {
  const listEl = document.getElementById("history-list");
  if (!listEl) return;

  if (!history?.length) {
    listEl.innerHTML = `<p style="color:var(--color-text-muted);padding:20px 0;text-align:center;">변경 이력이 없습니다.</p>`;
    return;
  }

  const sorted = [...history].reverse();
  listEl.innerHTML = sorted.map((h) => {
    const dotClass = { created: "dot-created", updated: "dot-updated", status_changed: "dot-status" }[h.action] ?? "";
    const label    = { created: "최초 등록", updated: "내용 수정", status_changed: "상태 변경" }[h.action] ?? h.action;
    return `
      <div class="history-item">
        <div class="history-dot ${dotClass}"></div>
        <div class="history-content">
          <div class="history-action">${label}</div>
          <div class="history-detail">${escapeHtml(h.detail ?? "")}</div>
          <div class="history-meta">👤 ${escapeHtml(h.by ?? "알 수 없음")} · ${h.at ? formatDateTime(new Date(h.at)) : "-"}</div>
        </div>
      </div>`;
  }).join("");
}

// ================================================================
// 폼 헬퍼 — income (입금)
// ================================================================
export function resetIncomeForm() {
  document.getElementById("deposit-id").value      = "";
  document.getElementById("deposit-date").value    = getTodayStr();
  document.getElementById("deposit-name").value    = "";
  document.getElementById("deposit-amount").value  = "";
  document.getElementById("deposit-memo").value    = "";
  document.getElementById("deposit-amount-preview").textContent = "";
  document.getElementById("deposit-form-error").classList.add("hidden");
  document.getElementById("deposit-modal-title").textContent = "입금 예정 등록";
  document.getElementById("deposit-submit-btn").textContent  = "등록하기";
}

// tx.counterparty → deposit-name 필드에 채움
export function fillIncomeForm(tx) {
  document.getElementById("deposit-id").value      = tx.id;
  document.getElementById("deposit-date").value    = tx.date;
  document.getElementById("deposit-name").value    = tx.counterparty ?? "";   // ← counterparty
  document.getElementById("deposit-amount").value  = tx.amount;
  document.getElementById("deposit-memo").value    = tx.memo ?? "";
  document.getElementById("deposit-amount-preview").textContent =
    tx.amount ? tx.amount.toLocaleString("ko-KR") + " 원" : "";
  document.getElementById("deposit-form-error").classList.add("hidden");
  document.getElementById("deposit-modal-title").textContent = "입금 내역 수정";
  document.getElementById("deposit-submit-btn").textContent  = "수정하기";
}

// ================================================================
// 폼 헬퍼 — expense (송금)
// ================================================================
export function resetExpenseForm() {
  document.getElementById("transfer-id").value          = "";
  document.getElementById("transfer-date").value        = getTodayStr();
  document.getElementById("transfer-name").value        = "";
  document.getElementById("transfer-destination").value = "";
  document.getElementById("transfer-amount").value      = "";
  document.getElementById("transfer-memo").value        = "";
  document.getElementById("transfer-amount-preview").textContent = "";
  document.getElementById("transfer-form-error").classList.add("hidden");
  document.getElementById("transfer-modal-title").textContent = "송금 예정 등록";
  document.getElementById("transfer-submit-btn").textContent  = "등록하기";
}

// tx.counterparty → transfer-name, tx.accountName → transfer-destination
export function fillExpenseForm(tx) {
  document.getElementById("transfer-id").value          = tx.id;
  document.getElementById("transfer-date").value        = tx.date;
  document.getElementById("transfer-name").value        = tx.counterparty ?? "";  // ← counterparty
  document.getElementById("transfer-destination").value = tx.accountName  ?? "";  // ← accountName
  document.getElementById("transfer-amount").value      = tx.amount;
  document.getElementById("transfer-memo").value        = tx.memo ?? "";
  document.getElementById("transfer-amount-preview").textContent =
    tx.amount ? tx.amount.toLocaleString("ko-KR") + " 원" : "";
  document.getElementById("transfer-form-error").classList.add("hidden");
  document.getElementById("transfer-modal-title").textContent = "송금 내역 수정";
  document.getElementById("transfer-submit-btn").textContent  = "수정하기";
}

// ================================================================
// 공통 UI 헬퍼
// ================================================================
export function showFormError(errorElId, message) {
  const el = document.getElementById(errorElId);
  if (!el) return;
  el.textContent = message;
  el.classList.remove("hidden");
}

// 탭 전환 UI
export function switchTab(tabName) {
  // main.js에서 "income-pending" / "expense-pending" 으로 전달받지만
  // HTML의 data-tab은 기존 "deposit-pending" / "transfer-pending" 유지 가능
  // → HTML data-tab 값을 그대로 tabName으로 사용하므로 매핑 불필요

  document.querySelectorAll(".tab-btn, .mobile-tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  document.querySelectorAll(".tab-content").forEach((section) => {
    // section id 형식: "tab-{tabName}"
    const id = section.id.replace("tab-", "");
    section.classList.toggle("hidden", id !== tabName);
  });
}

// ================================================================
// 내부 헬퍼
// ================================================================
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}
