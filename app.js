/**
 * برنامه ۱۰ مدرسه طاها
 * Student + Admin school schedule app
 * Static HTML/CSS/JS + Firebase Firestore
 * ورود مدیر با رمز ساده (پروژه دانش‌آموزی)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-storage.js";

import {
  firebaseConfig,
  ADMIN_PASSWORD,
  GROUPS,
  DAYS,
  DAY_ORDER_MAP
} from "./firebase-config.js";

/* ========== Firebase Init ========== */
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// Offline persistence (safe – won't crash if fails)
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === "failed-precondition") {
    console.warn("Persistence failed: multiple tabs open");
  } else if (err.code === "unimplemented") {
    console.warn("Persistence not supported in this browser");
  }
});

/* ========== State ========== */
const state = {
  group: localStorage.getItem("taha_group") || null,
  field: localStorage.getItem("taha_field") || null,
  branch: localStorage.getItem("taha_branch") || null,
  lessons: [],
  tasks: [],
  profiles: [],
  resources: [],
  currentView: "home",
  currentDay: "شنبه",
  taskFilter: "همه",
  adminTab: "dashboard",
  adminLessonFilter: { group: GROUPS[0], day: "شنبه" },
  adminTaskFilter: { group: GROUPS[0], day: "همه" },
  editingLessonId: null,
  editingTaskId: null,
  unsubLessons: null,
  unsubTasks: null,
  unsubProfiles: null,
  unsubResources: null,
  isOnline: navigator.onLine,
  isAdmin: false
};

/* ========== DOM Helpers ========== */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function showScreen(id) {
  $$(".screen").forEach((s) => s.classList.remove("active"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active");
}

function showView(viewId) {
  state.currentView = viewId;
  $$("#screen-student .view").forEach((v) => v.classList.remove("active"));
  const el = document.getElementById("view-" + viewId);
  if (el) el.classList.add("active");

  $$(".nav-item").forEach((n) => {
    n.classList.toggle("active", n.dataset.view === viewId);
  });
}

function showAdminView(tabId) {
  state.adminTab = tabId;
  $$("#screen-admin .admin-view").forEach((v) => v.classList.remove("active"));
  const el = document.getElementById("admin-" + tabId);
  if (el) el.classList.add("active");

  $$(".admin-tab").forEach((t) => {
    t.classList.toggle("active", t.dataset.tab === tabId);
  });
}

function showToast(message, type = "info") {
  const container = $("#toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const icons = { success: "✅", error: "❌", warning: "⚠️", info: "ℹ️" };
  toast.innerHTML = `<span>${icons[type] || icons.info}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

function hideLoading() {
  const el = $("#loading-overlay");
  if (el) {
    el.classList.add("fade-out");
    setTimeout(() => el.classList.add("hidden"), 350);
  }
}

function parseTimeOrder(timeStr) {
  // "08:00 - 09:30" → minutes from midnight of start time
  if (!timeStr) return 0;
  const match = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (!match) return 0;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function getTodayName() {
  // JS: 0=Sun ... 6=Sat. Iranian week starts Saturday.
  const map = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
  return map[new Date().getDay()];
}

function friendlyError(err) {
  if (!err) return "خطای ناشناخته رخ داد.";
  const code = err.code || "";
  if (code === "permission-denied" || code.includes("permission")) {
    return "دسترسی مجاز نیست.";
  }
  if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
    return "ایمیل یا رمز عبور اشتباه است.";
  }
  if (code === "auth/user-not-found") {
    return "کاربری با این ایمیل یافت نشد.";
  }
  if (code === "auth/too-many-requests") {
    return "تعداد تلاش‌ها زیاد است. کمی صبر کنید.";
  }
  if (code === "auth/invalid-email") {
    return "فرمت ایمیل نامعتبر است.";
  }
  if (code === "unavailable" || !navigator.onLine) {
    return "اتصال اینترنت برقرار نیست.";
  }
  return err.message || "خطایی رخ داد. دوباره تلاش کنید.";
}

/* ========== LocalStorage ========== */
function saveGroup(field, branch) {
  const group = `دهم ${field} شعبه ${branch}`;
  state.group = group;
  state.field = field;
  state.branch = branch;
  localStorage.setItem("taha_group", group);
  localStorage.setItem("taha_field", field);
  localStorage.setItem("taha_branch", branch);
}

function clearGroup() {
  state.group = null;
  state.field = null;
  state.branch = null;
  localStorage.removeItem("taha_group");
  localStorage.removeItem("taha_field");
  localStorage.removeItem("taha_branch");
}

/* ========== Firestore Subscriptions ========== */
function subscribeData() {
  if (state.unsubLessons) state.unsubLessons();
  if (state.unsubTasks) state.unsubTasks();
  if (state.unsubProfiles) state.unsubProfiles();
  if (state.unsubResources) state.unsubResources();

  state.unsubProfiles = onSnapshot(collection(db, "profiles"), snap => {
    state.profiles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderFiles();
  }, err => showToast(friendlyError(err), "error"));
  state.unsubResources = onSnapshot(collection(db, "resources"), snap => {
    state.resources = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderFiles();
  }, err => showToast(friendlyError(err), "error"));

  if (!state.group) return;

  // Lessons
  const lessonsQ = query(
    collection(db, "lessons"),
    where("group", "==", state.group),
    orderBy("dayOrder"),
    orderBy("timeOrder")
  );

  state.unsubLessons = onSnapshot(
    lessonsQ,
    (snap) => {
      state.lessons = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderAllStudent();
    },
    (err) => {
      console.error("Lessons snapshot error:", err);
      // Fallback: try without orderBy if index missing
      if (err.code === "failed-precondition") {
        const simpleQ = query(
          collection(db, "lessons"),
          where("group", "==", state.group)
        );
        state.unsubLessons = onSnapshot(simpleQ, (snap) => {
          state.lessons = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.dayOrder || 0) - (b.dayOrder || 0) || (a.timeOrder || 0) - (b.timeOrder || 0));
          renderAllStudent();
        });
      } else {
        showToast(friendlyError(err), "error");
      }
    }
  );

  // Tasks
  const tasksQ = query(
    collection(db, "tasks"),
    where("group", "==", state.group),
    orderBy("dayOrder")
  );

  state.unsubTasks = onSnapshot(
    tasksQ,
    (snap) => {
      state.tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderAllStudent();
    },
    (err) => {
      console.error("Tasks snapshot error:", err);
      if (err.code === "failed-precondition") {
        const simpleQ = query(
          collection(db, "tasks"),
          where("group", "==", state.group)
        );
        state.unsubTasks = onSnapshot(simpleQ, (snap) => {
          state.tasks = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a, b) => (a.dayOrder || 0) - (b.dayOrder || 0));
          renderAllStudent();
        });
      } else {
        showToast(friendlyError(err), "error");
      }
    }
  );
}

/* ========== Student Render ========== */
function renderAllStudent() {
  updateHeader();
  renderHome();
  renderSchedule();
  renderTasks();
  renderFiles();
  renderSettings();
}

function updateHeader() {
  const title = $("#header-group");
  if (title) title.textContent = state.group || "—";

  const badge = $("#sync-badge");
  if (badge) {
    badge.classList.toggle("offline", !state.isOnline);
    badge.querySelector("span:last-child").textContent = state.isOnline
      ? "آنلاین"
      : "آفلاین";
  }
}

function renderHome() {
  const container = $("#home-content");
  if (!container) return;

  const today = getTodayName();
  const todayLessons = state.lessons.filter((l) => l.day === today);
  const todayTasks = state.tasks.filter((t) => t.day === today);

  let html = `
    <div class="welcome-card">
      <h2>سلام! 👋</h2>
      <p>${state.group || ""}</p>
    </div>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-num">${todayLessons.length}</div>
        <div class="stat-label">درس امروز</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${todayTasks.length}</div>
        <div class="stat-label">کار امروز</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${state.lessons.length}</div>
        <div class="stat-label">کل دروس</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${state.tasks.length}</div>
        <div class="stat-label">کل کارها</div>
      </div>
    </div>
  `;

  // Today's schedule summary
  html += `<div class="section-title"><span class="icon">📅</span> برنامه امروز (${today})</div>`;

  if (todayLessons.length === 0) {
    html += `
      <div class="empty-state" style="padding:1.5rem">
        <p>برای امروز درسی ثبت نشده است.</p>
      </div>`;
  } else {
    todayLessons.forEach((l) => {
      html += `
        <div class="today-lesson-card">
          <div class="time-badge">${esc(l.time || "")}</div>
          <div class="lesson-info">
            <h4>${esc(l.name || "")}</h4>
            <span>${esc(l.teacher || "—")}</span>
          </div>
        </div>`;
    });
  }

  // Today's tasks
  if (todayTasks.length > 0) {
    html += `<div class="section-title mt-3"><span class="icon">✅</span> کارهای امروز</div>`;
    todayTasks.forEach((t) => {
      html += `
        <div class="task-card">
          <h3>${esc(t.title || "")}</h3>
          <div class="task-desc">${esc(t.desc || "")}</div>
        </div>`;
    });
  }

  container.innerHTML = html;
}

function renderSchedule() {
  const tabsEl = $("#day-tabs");
  const listEl = $("#schedule-list");
  if (!tabsEl || !listEl) return;

  // Day tabs
  tabsEl.innerHTML = DAYS.map(
    (d) =>
      `<button class="day-tab ${d.name === state.currentDay ? "active" : ""}" data-day="${d.name}">${d.name}</button>`
  ).join("");

  tabsEl.querySelectorAll(".day-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.currentDay = btn.dataset.day;
      renderSchedule();
    });
  });

  // Lessons for selected day
  const dayLessons = state.lessons
    .filter((l) => l.day === state.currentDay)
    .sort((a, b) => (a.timeOrder || 0) - (b.timeOrder || 0));

  if (dayLessons.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📚</div>
        <p>هنوز برنامه‌ای برای این کلاس ثبت نشده.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = dayLessons
    .map(
      (l) => `
    <div class="lesson-card">
      <div class="lesson-time">${esc(l.time || "")}</div>
      <div class="lesson-details">
        <h3>${esc(l.name || "")}</h3>
        <div class="teacher">${esc(l.teacher || "—")}</div>
      </div>
    </div>`
    )
    .join("");
}

function renderTasks() {
  const filtersEl = $("#task-filters");
  const listEl = $("#tasks-list");
  if (!filtersEl || !listEl) return;

  const filters = ["همه", ...DAYS.map((d) => d.name)];
  filtersEl.innerHTML = filters
    .map(
      (f) =>
        `<button class="filter-tab ${f === state.taskFilter ? "active" : ""}" data-filter="${f}">${f}</button>`
    )
    .join("");

  filtersEl.querySelectorAll(".filter-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.taskFilter = btn.dataset.filter;
      renderTasks();
    });
  });

  let filtered = state.tasks;
  if (state.taskFilter !== "همه") {
    filtered = state.tasks.filter((t) => t.day === state.taskFilter);
  }

  filtered = [...filtered].sort((a, b) => (a.dayOrder || 0) - (b.dayOrder || 0));

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <p>فعلاً کاری برای این کلاس ثبت نشده.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = filtered
    .map(
      (t) => `
    <div class="task-card">
      <span class="task-day">${esc(t.day || "")}</span>
      <h3>${esc(t.title || "")}</h3>
      <div class="task-desc">${esc(t.desc || "")}</div>
    </div>`
    )
    .join("");
}

function renderFiles() {
  const profilesEl = $("#student-profiles");
  const filesEl = $("#student-files-list");
  if (!profilesEl || !filesEl) return;
  const visibleProfiles = state.profiles.filter(p => !p.group || p.group === "همه کلاس‌ها" || p.group === state.group);
  profilesEl.innerHTML = visibleProfiles.length ? visibleProfiles.map(p => `
    <div class="profile-card">
      ${p.photoURL ? `<img class="profile-avatar" src="${esc(p.photoURL)}" alt="">` : `<div class="profile-avatar profile-placeholder">${p.role === "معلم" ? "👨‍🏫" : "🎓"}</div>`}
      <div class="profile-info"><strong>${esc(p.name || "")}</strong><span>${esc(p.role || "")}</span>${p.bio ? `<small>${esc(p.bio)}</small>` : ""}</div>
    </div>`).join("") : `<div class="empty-state"><p>هنوز پروفایلی ثبت نشده است.</p></div>`;

  const visibleFiles = state.resources.filter(f => !f.group || f.group === "همه کلاس‌ها" || f.group === state.group);
  if (!visibleFiles.length) {
    filesEl.innerHTML = `<div class="empty-state"><div class="empty-icon">📂</div><p>هنوز فایلی برای این کلاس منتشر نشده است.</p></div>`;
    return;
  }
  filesEl.innerHTML = visibleFiles.map(f => {
    const isVideo = (f.contentType || "").startsWith("video/");
    const isImage = (f.contentType || "").startsWith("image/");
    const preview = isImage ? `<a href="${esc(f.downloadURL)}" target="_blank" rel="noopener"><img class="resource-preview" src="${esc(f.downloadURL)}" alt="${esc(f.title)}"></a>` : isVideo ? `<video class="resource-preview" controls preload="metadata"><source src="${esc(f.downloadURL)}" type="${esc(f.contentType)}"></video>` : `<div class="resource-file-icon">${(f.contentType || "").includes("pdf") ? "📕" : "📄"}</div>`;
    return `<article class="resource-card">${preview}<div class="resource-info"><h3>${esc(f.title || f.fileName || "فایل")}</h3><p>${esc(f.profileName || "")}${f.group && f.group !== "همه کلاس‌ها" ? ` · ${esc(f.group)}` : ""}</p>${f.description ? `<small>${esc(f.description)}</small>` : ""}<a class="btn btn-secondary btn-sm resource-open" href="${esc(f.downloadURL)}" target="_blank" rel="noopener" download>مشاهده / دریافت فایل</a></div></article>`;
  }).join("");
}

function renderSettings() {
  const el = $("#settings-group");
  if (el) el.textContent = state.group || "—";
}

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

/* ========== Class Selection ========== */
function initClassSelect() {
  let selectedField = state.field || null;
  let selectedBranch = state.branch || null;

  const fieldBtns = $$("#field-options .option-btn");
  const branchBtns = $$("#branch-options .option-btn");
  const enterBtn = $("#btn-enter");

  function updateEnterBtn() {
    enterBtn.disabled = !(selectedField && selectedBranch);
  }

  fieldBtns.forEach((btn) => {
    if (btn.dataset.value === selectedField) btn.classList.add("active");
    btn.addEventListener("click", () => {
      fieldBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedField = btn.dataset.value;
      updateEnterBtn();
    });
  });

  branchBtns.forEach((btn) => {
    if (btn.dataset.value === selectedBranch) btn.classList.add("active");
    btn.addEventListener("click", () => {
      branchBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      selectedBranch = btn.dataset.value;
      updateEnterBtn();
    });
  });

  updateEnterBtn();

  enterBtn.addEventListener("click", () => {
    if (!selectedField || !selectedBranch) return;
    saveGroup(selectedField, selectedBranch);
    startStudentApp();
  });
}

function startStudentApp() {
  showScreen("screen-student");
  showView("home");
  subscribeData();
  renderAllStudent();
}

/* ========== Admin Auth (رمز ساده) ========== */
function initAdminLogin() {
  const form = $("#admin-login-form");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const password = $("#admin-password").value;
    const btn = $("#btn-admin-login");
    btn.disabled = true;
    btn.textContent = "در حال ورود...";

    if (password === ADMIN_PASSWORD) {
      state.isAdmin = true;
      sessionStorage.setItem("taha_admin", "1");
      showScreen("screen-admin");
      showAdminView("dashboard");
      loadAdminData();
      showToast("ورود موفق", "success");
      $("#admin-password").value = "";
    } else {
      showToast("رمز عبور اشتباه است.", "error");
    }

    btn.disabled = false;
    btn.textContent = "ورود";
  });
}

/* ========== Admin Data ========== */
let adminLessonsUnsub = null;
let adminTasksUnsub = null;
let allAdminLessons = [];
let allAdminTasks = [];
let allAdminProfiles = [];
let allAdminResources = [];
let adminProfilesUnsub = null;
let adminResourcesUnsub = null;

function loadAdminData() {
  // Subscribe to all lessons (admin needs all groups)
  if (adminLessonsUnsub) adminLessonsUnsub();
  if (adminTasksUnsub) adminTasksUnsub();

  adminLessonsUnsub = onSnapshot(
    collection(db, "lessons"),
    (snap) => {
      allAdminLessons = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderAdminLessons();
      renderAdminDashboard();
    },
    (err) => showToast(friendlyError(err), "error")
  );

  adminTasksUnsub = onSnapshot(
    collection(db, "tasks"),
    (snap) => {
      allAdminTasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderAdminTasks();
      renderAdminDashboard();
    },
    (err) => showToast(friendlyError(err), "error")
  );

  if (adminProfilesUnsub) adminProfilesUnsub();
  if (adminResourcesUnsub) adminResourcesUnsub();
  adminProfilesUnsub = onSnapshot(collection(db, "profiles"), snap => {
    allAdminProfiles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    state.profiles = allAdminProfiles;
    renderAdminProfiles();
    renderFiles();
    populateResourceProfiles();
  }, err => showToast(friendlyError(err), "error"));
  adminResourcesUnsub = onSnapshot(collection(db, "resources"), snap => {
    allAdminResources = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    state.resources = allAdminResources;
    renderAdminResources();
    renderFiles();
  }, err => showToast(friendlyError(err), "error"));
}

function renderAdminDashboard() {
  const el = $("#admin-dashboard-content");
  if (!el) return;

  const lessonCount = allAdminLessons.length;
  const taskCount = allAdminTasks.length;
  const groupsWithData = new Set([
    ...allAdminLessons.map((l) => l.group),
    ...allAdminTasks.map((t) => t.group)
  ]);

  el.innerHTML = `
    <div class="stats-grid" style="grid-template-columns:1fr 1fr">
      <div class="stat-card">
        <div class="stat-num">${lessonCount}</div>
        <div class="stat-label">کل دروس</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${taskCount}</div>
        <div class="stat-label">کل کارها</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${groupsWithData.size}</div>
        <div class="stat-label">کلاس‌های فعال</div>
      </div>
      <div class="stat-card">
        <div class="stat-num">${GROUPS.length}</div>
        <div class="stat-label">کل کلاس‌ها</div>
      </div>
    </div>
    <div class="card mt-3">
      <div class="card-title">راهنمای سریع</div>
      <p class="text-secondary text-sm mt-1">
        از تب «برنامه کلاسی» برای افزودن، ویرایش یا حذف دروس استفاده کنید.
        از تب «کارهای روزانه» برای مدیریت تکالیف و کارها استفاده کنید.
      </p>
    </div>
  `;
}

function renderAdminLessons() {
  const listEl = $("#admin-lessons-list");
  if (!listEl) return;

  const { group, day } = state.adminLessonFilter;
  let filtered = allAdminLessons.filter((l) => l.group === group);
  if (day !== "همه") filtered = filtered.filter((l) => l.day === day);
  filtered.sort(
    (a, b) =>
      (a.dayOrder || 0) - (b.dayOrder || 0) ||
      (a.timeOrder || 0) - (b.timeOrder || 0)
  );

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📚</div>
        <p>درسی برای این فیلتر ثبت نشده.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = filtered
    .map(
      (l) => `
    <div class="list-item">
      <div class="item-info">
        <h4>${esc(l.name || "")}</h4>
        <div class="item-meta">
          ${esc(l.day || "")} · ${esc(l.time || "")}<br>
          ${esc(l.teacher || "—")} · ${esc(l.group || "")}
        </div>
      </div>
      <div class="item-actions">
        <button class="btn btn-secondary btn-sm" data-edit-lesson="${l.id}">ویرایش</button>
        <button class="btn btn-danger btn-sm" data-del-lesson="${l.id}">حذف</button>
      </div>
    </div>`
    )
    .join("");

  listEl.querySelectorAll("[data-edit-lesson]").forEach((btn) => {
    btn.addEventListener("click", () => openLessonModal(btn.dataset.editLesson));
  });
  listEl.querySelectorAll("[data-del-lesson]").forEach((btn) => {
    btn.addEventListener("click", () => confirmDelete("lesson", btn.dataset.delLesson));
  });
}

function renderAdminTasks() {
  const listEl = $("#admin-tasks-list");
  if (!listEl) return;

  const { group, day } = state.adminTaskFilter;
  let filtered = allAdminTasks.filter((t) => t.group === group);
  if (day !== "همه") filtered = filtered.filter((t) => t.day === day);
  filtered.sort((a, b) => (a.dayOrder || 0) - (b.dayOrder || 0));

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <p>کاری برای این فیلتر ثبت نشده.</p>
      </div>`;
    return;
  }

  listEl.innerHTML = filtered
    .map(
      (t) => `
    <div class="list-item">
      <div class="item-info">
        <h4>${esc(t.title || "")}</h4>
        <div class="item-meta">
          ${esc(t.day || "")} · ${esc(t.group || "")}<br>
          ${esc(t.desc || "")}
        </div>
      </div>
      <div class="item-actions">
        <button class="btn btn-secondary btn-sm" data-edit-task="${t.id}">ویرایش</button>
        <button class="btn btn-danger btn-sm" data-del-task="${t.id}">حذف</button>
      </div>
    </div>`
    )
    .join("");

  listEl.querySelectorAll("[data-edit-task]").forEach((btn) => {
    btn.addEventListener("click", () => openTaskModal(btn.dataset.editTask));
  });
  listEl.querySelectorAll("[data-del-task]").forEach((btn) => {
    btn.addEventListener("click", () => confirmDelete("task", btn.dataset.delTask));
  });
}

/* ========== Profiles & Learning Resources ========== */
function populateResourceProfiles() {
  const select = $("#resource-profile");
  if (!select) return;
  const previous = select.value;
  select.innerHTML = `<option value="">انتخاب پروفایل</option>` + allAdminProfiles.map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.role || "")})</option>`).join("");
  if (allAdminProfiles.some(p => p.id === previous)) select.value = previous;
}

function renderAdminProfiles() {
  const el = $("#admin-profiles-list");
  if (!el) return;
  el.innerHTML = allAdminProfiles.length ? allAdminProfiles.map(p => `
    <div class="list-item"><div class="profile-mini">${p.photoURL ? `<img src="${esc(p.photoURL)}" alt="">` : "👤"}</div><div class="item-info"><h4>${esc(p.name || "")}</h4><div class="item-meta">${esc(p.role || "")} · ${esc(p.group || "همه کلاس‌ها")}</div></div><div class="item-actions"><button class="btn btn-danger btn-sm" data-del-profile="${p.id}">حذف</button></div></div>`).join("") : `<div class="empty-state"><p>پروفایلی ثبت نشده است.</p></div>`;
  el.querySelectorAll("[data-del-profile]").forEach(btn => btn.addEventListener("click", () => deleteProfile(btn.dataset.delProfile)));
}

function renderAdminResources() {
  const el = $("#admin-resources-list");
  if (!el) return;
  el.innerHTML = allAdminResources.length ? allAdminResources.map(f => `
    <div class="list-item"><div class="item-info"><h4>${esc(f.title || f.fileName || "فایل")}</h4><div class="item-meta">${esc(f.profileName || "")} · ${esc(f.group || "همه کلاس‌ها")}<br>${esc(f.fileName || "")}</div></div><div class="item-actions"><a class="btn btn-secondary btn-sm" href="${esc(f.downloadURL)}" target="_blank" rel="noopener">بازکردن</a><button class="btn btn-danger btn-sm" data-del-resource="${f.id}">حذف</button></div></div>`).join("") : `<div class="empty-state"><p>فایلی منتشر نشده است.</p></div>`;
  el.querySelectorAll("[data-del-resource]").forEach(btn => btn.addEventListener("click", () => deleteResource(btn.dataset.delResource)));
}

async function saveProfile(e) {
  e.preventDefault();
  if (!state.isAdmin) return;
  const name = $("#profile-name").value.trim();
  const role = $("#profile-role").value;
  const group = $("#profile-group").value;
  const bio = $("#profile-bio").value.trim();
  const photo = $("#profile-photo").files[0];
  const btn = $("#btn-save-profile");
  if (!name) return;
  btn.disabled = true; btn.textContent = "در حال ثبت...";
  try {
    let photoURL = "", photoPath = "";
    if (photo) {
      if (!photo.type.startsWith("image/")) throw new Error("لطفاً برای پروفایل فقط عکس انتخاب کنید.");
      if (photo.size > 5 * 1024 * 1024) throw new Error("حجم عکس پروفایل باید کمتر از ۵ مگابایت باشد.");
      photoPath = `profiles/${Date.now()}_${safeFileName(photo.name)}`;
      const uploaded = await uploadBytes(storageRef(storage, photoPath), photo);
      photoURL = await getDownloadURL(uploaded.ref);
    }
    await addDoc(collection(db, "profiles"), { name, role, group, bio, photoURL, photoPath, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    $("#profile-form").reset();
    showToast("پروفایل با موفقیت ثبت شد.", "success");
  } catch (err) { showToast(err.message || friendlyError(err), "error"); }
  finally { btn.disabled = false; btn.textContent = "ثبت پروفایل"; }
}

function safeFileName(name) { return (name || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100); }

async function uploadResource(e) {
  e.preventDefault();
  if (!state.isAdmin) return;
  const file = $("#resource-file").files[0];
  const profile = allAdminProfiles.find(p => p.id === $("#resource-profile").value);
  if (!file || !profile) { showToast("پروفایل و فایل را انتخاب کنید.", "warning"); return; }
  if (file.size > 50 * 1024 * 1024) { showToast("حجم فایل بیشتر از ۵۰ مگابایت است.", "warning"); return; }
  const allowed = file.type === "application/pdf" || file.type.startsWith("image/") || file.type.startsWith("video/") || /\.(docx?|pptx?)$/i.test(file.name);
  if (!allowed) { showToast("فقط PDF، عکس، ویدئو و فایل Word/PowerPoint مجاز است.", "warning"); return; }
  const btn = $("#btn-upload-resource");
  btn.disabled = true; btn.textContent = "در حال آپلود...";
  const path = `resources/${Date.now()}_${safeFileName(file.name)}`;
  try {
    const uploaded = await uploadBytes(storageRef(storage, path), file, { contentType: file.type || "application/octet-stream" });
    const downloadURL = await getDownloadURL(uploaded.ref);
    await addDoc(collection(db, "resources"), {
      title: $("#resource-title").value.trim(), description: $("#resource-desc").value.trim(),
      profileId: profile.id, profileName: profile.name, profileRole: profile.role,
      group: $("#resource-group").value, fileName: file.name, contentType: file.type || "application/octet-stream",
      size: file.size, storagePath: path, downloadURL, createdAt: serverTimestamp()
    });
    $("#resource-form").reset();
    showToast("فایل آپلود و منتشر شد.", "success");
  } catch (err) { showToast(friendlyError(err), "error"); }
  finally { btn.disabled = false; btn.textContent = "آپلود و انتشار"; }
}

async function deleteResource(id) {
  if (!state.isAdmin || !confirm("این فایل حذف شود؟")) return;
  const item = allAdminResources.find(x => x.id === id);
  try {
    if (item?.storagePath) await deleteObject(storageRef(storage, item.storagePath)).catch(() => {});
    await deleteDoc(doc(db, "resources", id));
    showToast("فایل حذف شد.", "success");
  } catch (err) { showToast(friendlyError(err), "error"); }
}

async function deleteProfile(id) {
  if (!state.isAdmin || !confirm("این پروفایل حذف شود؟ فایل‌های منتشرشده‌اش حذف نمی‌شوند.")) return;
  const item = allAdminProfiles.find(x => x.id === id);
  try {
    if (item?.photoPath) await deleteObject(storageRef(storage, item.photoPath)).catch(() => {});
    await deleteDoc(doc(db, "profiles", id));
    showToast("پروفایل حذف شد.", "success");
  } catch (err) { showToast(friendlyError(err), "error"); }
}

/* ========== Admin Modals ========== */
function openLessonModal(id = null) {
  state.editingLessonId = id;
  const modal = $("#lesson-modal");
  const title = $("#lesson-modal-title");
  title.textContent = id ? "ویرایش درس" : "افزودن درس";

  if (id) {
    const lesson = allAdminLessons.find((l) => l.id === id);
    if (lesson) {
      $("#lesson-group").value = lesson.group || "";
      $("#lesson-day").value = lesson.day || "";
      $("#lesson-time").value = lesson.time || "";
      $("#lesson-name").value = lesson.name || "";
      $("#lesson-teacher").value = lesson.teacher || "";
    }
  } else {
    $("#lesson-group").value = state.adminLessonFilter.group;
    $("#lesson-day").value = state.adminLessonFilter.day === "همه" ? "شنبه" : state.adminLessonFilter.day;
    $("#lesson-time").value = "";
    $("#lesson-name").value = "";
    $("#lesson-teacher").value = "";
  }

  modal.classList.add("open");
}

function closeLessonModal() {
  $("#lesson-modal").classList.remove("open");
  state.editingLessonId = null;
}

function openTaskModal(id = null) {
  state.editingTaskId = id;
  const modal = $("#task-modal");
  const title = $("#task-modal-title");
  title.textContent = id ? "ویرایش کار" : "افزودن کار";

  if (id) {
    const task = allAdminTasks.find((t) => t.id === id);
    if (task) {
      $("#task-group").value = task.group || "";
      $("#task-day").value = task.day || "";
      $("#task-title").value = task.title || "";
      $("#task-desc").value = task.desc || "";
    }
  } else {
    $("#task-group").value = state.adminTaskFilter.group;
    $("#task-day").value = state.adminTaskFilter.day === "همه" ? "شنبه" : state.adminTaskFilter.day;
    $("#task-title").value = "";
    $("#task-desc").value = "";
  }

  modal.classList.add("open");
}

function closeTaskModal() {
  $("#task-modal").classList.remove("open");
  state.editingTaskId = null;
}

async function saveLesson(e) {
  e.preventDefault();
  const group = $("#lesson-group").value;
  const day = $("#lesson-day").value;
  const time = $("#lesson-time").value.trim();
  const name = $("#lesson-name").value.trim();
  const teacher = $("#lesson-teacher").value.trim();

  if (!group || !day || !time || !name) {
    showToast("لطفاً فیلدهای ضروری را پر کنید.", "warning");
    return;
  }

  const btn = $("#btn-save-lesson");
  btn.disabled = true;
  btn.textContent = "در حال ذخیره...";

  const data = {
    group,
    day,
    dayOrder: DAY_ORDER_MAP[day] || 0,
    time,
    timeOrder: parseTimeOrder(time),
    name,
    teacher,
    updatedAt: serverTimestamp()
  };

  try {
    if (state.editingLessonId) {
      await updateDoc(doc(db, "lessons", state.editingLessonId), data);
      showToast("با موفقیت ذخیره شد.", "success");
    } else {
      await addDoc(collection(db, "lessons"), data);
      showToast("با موفقیت ذخیره شد.", "success");
    }
    closeLessonModal();
  } catch (err) {
    showToast(friendlyError(err), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "ذخیره درس";
  }
}

async function saveTask(e) {
  e.preventDefault();
  const group = $("#task-group").value;
  const day = $("#task-day").value;
  const title = $("#task-title").value.trim();
  const desc = $("#task-desc").value.trim();

  if (!group || !day || !title) {
    showToast("لطفاً فیلدهای ضروری را پر کنید.", "warning");
    return;
  }

  const btn = $("#btn-save-task");
  btn.disabled = true;
  btn.textContent = "در حال ذخیره...";

  const data = {
    group,
    day,
    dayOrder: DAY_ORDER_MAP[day] || 0,
    title,
    desc,
    updatedAt: serverTimestamp()
  };

  try {
    if (state.editingTaskId) {
      await updateDoc(doc(db, "tasks", state.editingTaskId), data);
      showToast("با موفقیت ذخیره شد.", "success");
    } else {
      await addDoc(collection(db, "tasks"), data);
      showToast("با موفقیت ذخیره شد.", "success");
    }
    closeTaskModal();
  } catch (err) {
    showToast(friendlyError(err), "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "ذخیره کار";
  }
}

function confirmDelete(type, id) {
  const overlay = $("#confirm-modal");
  const msg = $("#confirm-message");
  msg.textContent =
    type === "lesson"
      ? "آیا از حذف این درس مطمئن هستید؟"
      : "آیا از حذف این کار مطمئن هستید؟";

  overlay.classList.add("open");

  const yesBtn = $("#confirm-yes");
  const noBtn = $("#confirm-no");

  const cleanup = () => {
    overlay.classList.remove("open");
    yesBtn.replaceWith(yesBtn.cloneNode(true));
    noBtn.replaceWith(noBtn.cloneNode(true));
  };

  $("#confirm-yes").onclick = async () => {
    cleanup();
    try {
      if (type === "lesson") {
        await deleteDoc(doc(db, "lessons", id));
      } else {
        await deleteDoc(doc(db, "tasks", id));
      }
      showToast("با موفقیت حذف شد.", "success");
    } catch (err) {
      showToast(friendlyError(err), "error");
    }
  };

  $("#confirm-no").onclick = cleanup;
}

/* ========== Populate Select Options ========== */
function populateSelects() {
  const groupOptions = GROUPS.map(
    (g) => `<option value="${g}">${g}</option>`
  ).join("");
  const dayOptions = DAYS.map(
    (d) => `<option value="${d.name}">${d.name}</option>`
  ).join("");
  const dayOptionsAll =
    `<option value="همه">همه روزها</option>` + dayOptions;

  // Admin filter selects
  const alGroup = $("#admin-lesson-group");
  const alDay = $("#admin-lesson-day");
  const atGroup = $("#admin-task-group");
  const atDay = $("#admin-task-day");

  if (alGroup) alGroup.innerHTML = groupOptions;
  if (alDay) alDay.innerHTML = dayOptionsAll;
  if (atGroup) atGroup.innerHTML = groupOptions;
  if (atDay) atDay.innerHTML = dayOptionsAll;

  // Files feature group selectors
  ["#profile-group", "#resource-group"].forEach(sel => {
    const el = $(sel);
    if (el) el.innerHTML = `<option value="همه کلاس‌ها">همه کلاس‌ها</option>` + groupOptions;
  });

  // Modal selects
  const lg = $("#lesson-group");
  const ld = $("#lesson-day");
  const tg = $("#task-group");
  const td = $("#task-day");

  if (lg) lg.innerHTML = groupOptions;
  if (ld) ld.innerHTML = dayOptions;
  if (tg) tg.innerHTML = groupOptions;
  if (td) td.innerHTML = dayOptions;
}

/* ========== Event Bindings ========== */
function bindEvents() {
  // Bottom nav
  $$(".nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      showView(item.dataset.view);
    });
  });

  // Change class
  $("#btn-change-class")?.addEventListener("click", () => {
    clearGroup();
    if (state.unsubLessons) state.unsubLessons();
    if (state.unsubTasks) state.unsubTasks();
    if (state.unsubProfiles) state.unsubProfiles();
    if (state.unsubResources) state.unsubResources();
    showScreen("screen-select");
  });

  // Admin link from select screen
  $("#link-admin")?.addEventListener("click", () => {
    showScreen("screen-admin-login");
  });

  // Back from admin login
  $("#link-back-student")?.addEventListener("click", () => {
    if (state.group) {
      startStudentApp();
    } else {
      showScreen("screen-select");
    }
  });

  // Admin tabs
  $$(".admin-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      showAdminView(tab.dataset.tab);
    });
  });

  // Admin logout
  $("#btn-admin-logout")?.addEventListener("click", () => {
    state.isAdmin = false;
    sessionStorage.removeItem("taha_admin");
    if (adminLessonsUnsub) adminLessonsUnsub();
    if (adminTasksUnsub) adminTasksUnsub();
    if (adminProfilesUnsub) adminProfilesUnsub();
    if (adminResourcesUnsub) adminResourcesUnsub();
    if (state.group) {
      startStudentApp();
    } else {
      showScreen("screen-select");
    }
    showToast("خارج شدید.", "info");
  });

  // Admin filters
  $("#admin-lesson-group")?.addEventListener("change", (e) => {
    state.adminLessonFilter.group = e.target.value;
    renderAdminLessons();
  });
  $("#admin-lesson-day")?.addEventListener("change", (e) => {
    state.adminLessonFilter.day = e.target.value;
    renderAdminLessons();
  });
  $("#admin-task-group")?.addEventListener("change", (e) => {
    state.adminTaskFilter.group = e.target.value;
    renderAdminTasks();
  });
  $("#admin-task-day")?.addEventListener("change", (e) => {
    state.adminTaskFilter.day = e.target.value;
    renderAdminTasks();
  });

  // Add buttons
  $("#btn-add-lesson")?.addEventListener("click", () => openLessonModal());
  $("#btn-add-task")?.addEventListener("click", () => openTaskModal());

  // Forms
  $("#profile-form")?.addEventListener("submit", saveProfile);
  $("#resource-form")?.addEventListener("submit", uploadResource);
  $("#lesson-form")?.addEventListener("submit", saveLesson);
  $("#task-form")?.addEventListener("submit", saveTask);

  // Modal closes
  $("#lesson-modal-close")?.addEventListener("click", closeLessonModal);
  $("#task-modal-close")?.addEventListener("click", closeTaskModal);
  $("#lesson-modal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeLessonModal();
  });
  $("#task-modal")?.addEventListener("click", (e) => {
    if (e.target === e.currentTarget) closeTaskModal();
  });

  // Online/offline
  window.addEventListener("online", () => {
    state.isOnline = true;
    updateHeader();
    showToast("اتصال برقرار شد.", "success");
  });
  window.addEventListener("offline", () => {
    state.isOnline = false;
    updateHeader();
    showToast("اتصال قطع شد. داده‌های ذخیره‌شده نمایش داده می‌شود.", "warning");
  });
}

/* ========== Init ========== */
function init() {
  populateSelects();
  initClassSelect();
  initAdminLogin();
  bindEvents();

  // اگر قبلاً وارد پنل مدیر شده بود (در همین تب)
  if (sessionStorage.getItem("taha_admin") === "1") {
    state.isAdmin = true;
    showScreen("screen-admin");
    showAdminView("dashboard");
    loadAdminData();
  } else if (state.group) {
    startStudentApp();
  } else {
    showScreen("screen-select");
  }

  hideLoading();
}

// Start
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
