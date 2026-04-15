
// ================================================================
// main.js  (v2 — 2026-04 리팩토링)
//
// [변경 내역]
//   - addTransaction/updateTransaction → addEntry/updateEntry
//   - deleteTransaction → deleteEntry
//   - hideTransaction/unhideTransaction → hideEntry/unhideEntry
//   - subscribeToTransactions → subscribeToEntries
//   - subscribeToBalance, saveBalance 제거 (잔액은 stats.js 계산)
//   - state.initialBalance, state.unsubBalance 제거
//   - setupBalanceForm 제거
//   - "deposit" → "income", "transfer" → "expense"
//   - data.name → data.counterparty, data.destination → data.accountName
// ================================================================

import { login, logout, onAuthChange, getUserDisplayName } from "./auth.js";
import {
  addEntry, updateEntry, changeStatus,
  deleteEntry, hideEntry, unhideEntry,
  subscribeToEntries,
  getStatusLabel
} from "./db.js";
import { updateStatsDisplay, formatAmount } from "./stats.js";
import { applyAllFilters, getTabTransactions } from "./filters.js";
import {
  showLoading, hideLoading,
  showToast, openModal, closeModal, closeAllModals,
  setButtonLoading,
  renderList, renderHistoryModal,
  resetIncomeForm, fillIncomeForm,
  resetExpenseForm, fillExpenseForm,
  showFormError, switchTab,
  formatAmountPreview
} from "./ui.js";
const ADMIN_EMAIL = "gungo98@naver.com";
function isAdminUser() {
  return state.user?.email === ADMIN_EMAIL;
}
// ================================================================
// 앱 전역 상태
// ================================================================
const state = {
  user:          null,   // 현재 로그인 사용자
  entries:       [],     // Firestore ledger_entries 전체 목록
  currentTab:    "income-pending",

  // 필터 상태
  filters: {
    keyword:      "",
    dateFilter:   "all",
    statusFilter: "all",
    amountMin:    null,
    amountMax:    null,
    sortBy:       "newest",
    showHidden:   false,
  },

  completedFilter: "all",   // 완료 탭 서브 필터 (all / income / expense)

  // 확인 팝업 대기 데이터
  pendingDeleteId:     null,
  pendingStatusChange: null,  // { id, nextStatus, currentStatus }

  // Firestore 구독 해제 함수
  unsubEntries: null,
};

// ================================================================
// 앱 초기화
// ================================================================
function init() {
  setupLoginForm();
  setupLogoutBtn();
  setupIncomeForm();
  setupExpenseForm();
  setupTabNav();
  setupFilters();
  setupCompletedFilter();
  setupModalCloseButtons();
  setupDeleteConfirm();
  setupStatusConfirm();
  setupAmountPreview();
  hideBalanceSettingBtn();   // 잔액 설정 버튼 숨김 (Firestore 저장 제거됨)

  // Firebase 인증 상태 감지
  onAuthChange((user) => {
    if (user) onLogin(user);
    else      onLogout();
  });
}

// 잔액 설정 버튼 — Firestore 저장 제거로 불필요, 숨김 처리
function hideBalanceSettingBtn() {
  const btn = document.getElementById("balance-setting-btn");
  if (btn) {
    btn.style.display = "none";
    // 잔액 노트 텍스트 업데이트
    const note = document.querySelector(".balance-note");
    if (note) note.textContent = "입금완료 − 송금완료 자동 계산";
  }
}

// ================================================================
// 로그인 / 로그아웃
// ================================================================
function setupLoginForm() {
  document.getElementById("login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const emailEl = document.getElementById("login-email");
    const passEl  = document.getElementById("login-password");
    const errorEl = document.getElementById("login-error");
    const btn     = document.getElementById("login-btn");

    errorEl.classList.add("hidden");
    setButtonLoading(btn, true);

    try {
      await login(emailEl.value, passEl.value);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.remove("hidden");
    } finally {
      setButtonLoading(btn, false, "로그인");
    }
  });
}

function onLogin(user) {
  state.user = user;
  document.getElementById("login-screen").classList.add("hidden");
  document.getElementById("app-screen").classList.remove("hidden");
  document.getElementById("header-username").textContent =
    getUserDisplayName(user) + "님";

  startSubscriptions();
  toggleRoleUI();
}

function toggleRoleUI() {
  const isAdmin = isAdminUser();

  const ids = [
    "add-deposit-btn-pc",
    "add-transfer-btn-pc",
    "add-deposit-btn-mobile",
    "add-transfer-btn-mobile"
  ];

  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = isAdmin ? "" : "none";
  });
}

function onLogout() {
  state.unsubEntries?.();
  state.user = null;
  state.entries = [];

  document.getElementById("app-screen").classList.add("hidden");
  document.getElementById("login-screen").classList.remove("hidden");
  document.getElementById("login-email").value = "";
  document.getElementById("login-password").value = "";
  document.getElementById("login-error").classList.add("hidden");

  toggleRoleUI();
}
function setupLogoutBtn() {
  document.getElementById("logout-btn")?.addEventListener("click", async () => {
    if (!confirm("로그아웃 하시겠습니까?")) return;
    await logout();
    showToast("로그아웃 되었습니다.", "info");
  });
}

// ================================================================
// Firestore 실시간 구독
// ================================================================
function startSubscriptions() {
  state.unsubEntries = subscribeToEntries((entries, error) => {
    if (error) {
      showToast("데이터를 불러오는 중 오류가 발생했습니다.", "error");
      return;
    }
    state.entries = entries;
    renderCurrentView();
  });
}

// ================================================================
// 전체 화면 재렌더링
// ================================================================
function renderCurrentView() {
  if (!state.user) return;

  // 통계 업데이트 (initialBalance 없이 entries 기반 계산)
  updateStatsDisplay(state.entries);

  // 세 탭 모두 렌더링 (배지 업데이트를 위해)
  renderTabList("income-pending");
  renderTabList("expense-pending");
  renderTabList("completed");
}

function renderTabList(tab) {
  // 1. 탭별 기본 분리
  const tabData = getTabTransactions(
    state.entries,
    tab,
    state.completedFilter,
    state.filters.showHidden
  );

  // 2. 검색/필터/정렬 적용
  const filtered = applyAllFilters(tabData, state.filters);

  // 3. 컨테이너 ID 매핑
  const containerMap = {
    "income-pending":  "deposit-pending-list",    // HTML ID 유지
    "expense-pending": "transfer-pending-list",   // HTML ID 유지
    "completed":       "completed-list",
  };
  const emptyMap = {
    "income-pending":  "deposit-pending-empty",
    "expense-pending": "transfer-pending-empty",
    "completed":       "completed-empty",
  };

  renderList(
    containerMap[tab],
    emptyMap[tab],
    filtered,
    state.user.uid
  );

  // 4. 카드 버튼 이벤트 연결
  attachCardEvents(document.getElementById(containerMap[tab]));
}

// ================================================================
// 카드 버튼 이벤트 (이벤트 위임)
// ================================================================
function attachCardEvents(container) {
  if (!container) return;

  // 기존 리스너 제거 후 재등록 (cloneNode로 이벤트 초기화)
  const clone = container.cloneNode(true);
  container.replaceWith(clone);

  clone.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || !state.user) return;

    const { action, id } = btn.dataset;
    const entry = state.entries.find((t) => t.id === id);
    if (!entry) return;

    switch (action) {
      case "edit":
  if (!isAdminUser()) {
    showToast("수정 권한이 없습니다.", "error");
    return;
  }
  handleEdit(entry);
  break;
      case "delete":
  if (!isAdminUser()) {
    showToast("삭제 권한이 없습니다.", "error");
    return;
  }
  handleDeleteRequest(entry);
  break;
      case "status":  handleStatusRequest(entry, btn.dataset.nextStatus); break;
      case "hide":    await handleHide(id, true);     break;
      case "unhide":  await handleHide(id, false);    break;
      case "history": handleHistory(entry);           break;
    }
  });
}

// ── 수정 ──
function handleEdit(entry) {
  if (entry.type === "income") {
    fillIncomeForm(entry);
    openModal("deposit-modal");   // HTML 모달 ID 유지
  } else {
    fillExpenseForm(entry);
    openModal("transfer-modal");  // HTML 모달 ID 유지
  }
}

// ── 삭제 요청 (확인 팝업) ──
function handleDeleteRequest(entry) {
  state.pendingDeleteId = entry.id;
  document.getElementById("delete-target-info").innerHTML =
    `<strong>${entry.type === "income" ? "🔽 입금" : "🔼 송금"}</strong>
     &nbsp;${entry.counterparty}
     &nbsp;|&nbsp; ${formatAmount(entry.amount)}
     &nbsp;|&nbsp; ${entry.date}`;
  openModal("delete-modal");
}

// ── 상태 변경 요청 (확인 팝업) ──
function handleStatusRequest(entry, nextStatus) {
  const isIncome    = entry.type === "income";
  const nextLabel   = nextStatus === "completed"
    ? (isIncome ? "입금완료" : "송금완료")
    : (isIncome ? "입금진행중" : "송금진행중");

  state.pendingStatusChange = {
    id:            entry.id,
    nextStatus,
    currentStatus: entry.status
  };

  document.getElementById("status-modal-title").textContent =
    nextStatus === "completed" ? "완료 처리 확인" : "상태 변경 확인";

  document.getElementById("status-modal-message").innerHTML =
    `이 항목을 <strong>${nextLabel}</strong> 상태로 변경하시겠습니까?`;

  document.getElementById("status-target-info").innerHTML =
    `<strong>${entry.counterparty}</strong>
     &nbsp;|&nbsp; ${formatAmount(entry.amount)}
     &nbsp;|&nbsp; ${entry.date}`;

  openModal("status-modal");
}

// ── 숨기기 / 복원 ──
async function handleHide(id, hide) {
  try {
    if (hide) {
      await hideEntry(id);
      showToast("항목이 숨겨졌습니다.", "info");
    } else {
      await unhideEntry(id);
      showToast("항목이 복원되었습니다.", "success");
    }
  } catch {
    showToast("처리 중 오류가 발생했습니다.", "error");
  }
}

// ── 이력 보기 ──
function handleHistory(entry) {
  renderHistoryModal(entry.history ?? []);
  openModal("history-modal");
}

// ================================================================
// 삭제 확인 모달
// ================================================================
function setupDeleteConfirm() {
  document.getElementById("delete-confirm-btn")?.addEventListener("click", async () => {
    if (!state.pendingDeleteId) return;
    const btn = document.getElementById("delete-confirm-btn");
    setButtonLoading(btn, true);
    try {
      await deleteEntry(state.pendingDeleteId);
      closeModal("delete-modal");
      showToast("항목이 삭제되었습니다.", "success");
    } catch {
      showToast("삭제 중 오류가 발생했습니다.", "error");
    } finally {
      setButtonLoading(btn, false, "삭제하기");
      state.pendingDeleteId = null;
    }
  });
}

// ================================================================
// 상태 변경 확인 모달
// ================================================================
function setupStatusConfirm() {
  document.getElementById("status-confirm-btn")?.addEventListener("click", async () => {
    if (!state.pendingStatusChange || !state.user) return;

    const { id, nextStatus, currentStatus } = state.pendingStatusChange;
    const btn = document.getElementById("status-confirm-btn");
    setButtonLoading(btn, true);

    // 완료 처리 시 카드 슬라이드 아웃 애니메이션
    if (nextStatus === "completed") {
      const card = document.querySelector(`[data-id="${id}"]`);
      card?.classList.add("completing");
      await new Promise((r) => setTimeout(r, 350));
    }

    try {
      await changeStatus(id, nextStatus, state.user, currentStatus);
      closeModal("status-modal");
      const msg = nextStatus === "completed"
        ? "완료 처리되었습니다. 잔액이 자동으로 업데이트됩니다."
        : `상태가 변경되었습니다: ${getStatusLabel(nextStatus)}`;
      showToast(msg, "success");
    } catch {
      showToast("상태 변경 중 오류가 발생했습니다.", "error");
    } finally {
      setButtonLoading(btn, false, "확인");
      state.pendingStatusChange = null;
    }
  });
}

// ================================================================
// 입금(income) 등록/수정 폼
// ================================================================
function setupIncomeForm() {
  document.getElementById("add-deposit-btn-pc")?.addEventListener("click", () => {
    resetIncomeForm();
    openModal("deposit-modal");
  });

  document.getElementById("add-deposit-btn-mobile")?.addEventListener("click", () => {
    resetIncomeForm();
    openModal("deposit-modal");
  });

  document.getElementById("deposit-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!state.user) return;

    if (!isAdminUser()) {
      showToast("등록 권한이 없습니다.", "error");
      return;
    }

    const id = document.getElementById("deposit-id").value;
    const btn = document.getElementById("deposit-submit-btn");
    const isEdit = !!id;

    const data = {
      type: "income",
      date: document.getElementById("deposit-date").value,
      counterparty: document.getElementById("deposit-name").value,
      amount: document.getElementById("deposit-amount").value,
      memo: document.getElementById("deposit-memo").value,
      accountName: "",
    };

    setButtonLoading(btn, true);

    try {
      if (isEdit) {
        await updateEntry(id, data, state.user);
        showToast("입금 내역이 수정되었습니다.", "success");
      } else {
        await addEntry(data, state.user);
        showToast("입금 예정 항목이 등록되었습니다.", "success");
      }
      closeModal("deposit-modal");
    } catch (err) {
      showFormError("deposit-form-error", err.message);
    } finally {
      setButtonLoading(btn, false, isEdit ? "수정하기" : "등록하기");
    }
  });
}
// ================================================================
// 송금(expense) 등록/수정 폼
// ================================================================
function setupExpenseForm() {
  document.getElementById("add-transfer-btn-pc")?.addEventListener("click", () => {
    resetExpenseForm();
    openModal("transfer-modal");
  });

  document.getElementById("add-transfer-btn-mobile")?.addEventListener("click", () => {
    resetExpenseForm();
    openModal("transfer-modal");
  });

  document.getElementById("transfer-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!state.user) return;

    if (!isAdminUser()) {
      showToast("등록 권한이 없습니다.", "error");
      return;
    }

    const id = document.getElementById("transfer-id").value;
    const btn = document.getElementById("transfer-submit-btn");
    const isEdit = !!id;

    const data = {
      type: "expense",
      date: document.getElementById("transfer-date").value,
      counterparty: document.getElementById("transfer-name").value,
      accountName: document.getElementById("transfer-destination").value,
      amount: document.getElementById("transfer-amount").value,
      memo: document.getElementById("transfer-memo").value,
    };

    setButtonLoading(btn, true);

    try {
      if (isEdit) {
        await updateEntry(id, data, state.user);
        showToast("송금 내역이 수정되었습니다.", "success");
      } else {
        await addEntry(data, state.user);
        showToast("송금 예정 항목이 등록되었습니다.", "success");
      }
      closeModal("transfer-modal");
    } catch (err) {
      showFormError("transfer-form-error", err.message);
    } finally {
      setButtonLoading(btn, false, isEdit ? "수정하기" : "등록하기");
    }
  });
}
// ================================================================
// 탭 네비게이션
// ================================================================
function setupTabNav() {
  document.querySelectorAll(".tab-btn, .mobile-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      if (!tab) return;
      state.currentTab = tab;
      switchTab(tab);
      renderTabList(tab);
    });
  });
}

// ================================================================
// 검색 & 필터
// ================================================================
function setupFilters() {
  // 키워드 검색
  document.getElementById("search-input")?.addEventListener("input", (e) => {
    state.filters.keyword = e.target.value;
    renderCurrentView();
  });

  // 날짜 필터 버튼
  document.querySelectorAll("[data-date-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-date-filter]")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.filters.dateFilter = btn.dataset.dateFilter;
      renderCurrentView();
    });
  });

  // 상태 필터
  document.getElementById("status-filter")?.addEventListener("change", (e) => {
    state.filters.statusFilter = e.target.value;
    renderCurrentView();
  });

  // 정렬
  document.getElementById("sort-select")?.addEventListener("change", (e) => {
    state.filters.sortBy = e.target.value;
    renderCurrentView();
  });

  // 금액 범위
  document.getElementById("amount-min")?.addEventListener("input", (e) => {
    state.filters.amountMin = e.target.value ? Number(e.target.value) : null;
    renderCurrentView();
  });
  document.getElementById("amount-max")?.addEventListener("input", (e) => {
    state.filters.amountMax = e.target.value ? Number(e.target.value) : null;
    renderCurrentView();
  });
}

// ================================================================
// 완료 탭 서브 필터 & 숨긴 항목 토글
// ================================================================
function setupCompletedFilter() {
  document.querySelectorAll("[data-completed-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-completed-filter]")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.completedFilter = btn.dataset.completedFilter;
      renderTabList("completed");
    });
  });

  document.getElementById("show-hidden-toggle")?.addEventListener("change", (e) => {
    state.filters.showHidden = e.target.checked;
    renderTabList("completed");
  });
}

// ================================================================
// 모달 닫기 공통 처리
// ================================================================
function setupModalCloseButtons() {
  // data-close-modal 속성 버튼
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-close-modal]");
    if (btn) closeModal(btn.dataset.closeModal);
  });

  // 배경 클릭으로 닫기
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // ESC 키
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAllModals();
  });
}

// ================================================================
// 금액 입력 미리보기
// ================================================================
function setupAmountPreview() {
  const pairs = [
    ["deposit-amount",  "deposit-amount-preview"],
    ["transfer-amount", "transfer-amount-preview"],
  ];
  pairs.forEach(([inputId, previewId]) => {
    document.getElementById(inputId)?.addEventListener("input", (e) => {
      const el = document.getElementById(previewId);
      if (el) el.textContent = formatAmountPreview(e.target.value);
    });
  });
}

// ================================================================
// 앱 시작
// ================================================================
init();
