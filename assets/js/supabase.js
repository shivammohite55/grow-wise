/* ============================================================
   Grow Wise — GreenPlan AI
   Supabase backend integration
   ------------------------------------------------------------
   - Supabase (PostgreSQL) is the system of record for plans,
     trees, watering logs, drive joins and health checks.
   - localStorage is a backup on this device, so the demo never
     breaks if Supabase is offline or anonymous sign-in is off.
   - The publishable key below is public by design (Supabase
     docs: it is safe to embed in frontend code). Row Level
     Security in supabase/schema.sql is what protects the data.
     Never put the service_role key in frontend code.
   ============================================================ */

(function () {
  var SUPABASE_URL = "https://rmbohbyqyceqwhlklexq.supabase.co";
  var SUPABASE_ANON_KEY = "sb_publishable_u_qOjLut7lRTbOYYnWQKSw_ejpt5TTy";
  var LS_KEY = "growwise_v1";

  var sb = null;
  var userId = null;
  var mode = "local"; // "supabase" | "local"

  function setStatus(text) {
    try {
      var el = document.getElementById("gwBackendStatus");
      if (!el) {
        el = document.createElement("p");
        el.id = "gwBackendStatus";
        el.className = "mini";
        el.style.marginTop = "8px";
        var footer = document.querySelector("footer");
        if (footer) footer.appendChild(el);
      }
      el.textContent = text;
    } catch (e) { /* status is cosmetic only */ }
  }

  /* ---------- localStorage backup ---------- */
  function saveLocal() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        trees: window.trees || [],
        joinedDrives: window.joinedDrives || {},
        nextId: window.nextId || 7
      }));
    } catch (e) { /* storage unavailable (private mode) */ }
  }

  function restoreLocal() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      var data = JSON.parse(raw);
      if (data && Array.isArray(data.trees) && data.trees.length) {
        window.trees = data.trees;
        window.joinedDrives = data.joinedDrives || {};
        if (data.nextId) window.nextId = data.nextId;
        return true;
      }
    } catch (e) { /* ignore corrupt backup */ }
    return false;
  }

  /* ---------- helpers ---------- */
  function toISODate(str) {
    if (!str) return null;
    var d = new Date(str);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  function healthToDb(h) {
    return h === "Healthy" ? "healthy"
      : h === "Stressed" ? "stressed"
      : h === "Needs attention" ? "needs_attention" : "healthy";
  }
  function healthFromDb(h) {
    return h === "healthy" ? "Healthy"
      : h === "stressed" ? "Stressed"
      : h === "needs_attention" ? "Needs attention" : "Healthy";
  }
  function fmtDriveDate(iso) {
    try {
      return new Date(iso + "T12:00:00").toLocaleDateString("en-IN", {
        weekday: "short", day: "numeric", month: "short", year: "numeric"
      });
    } catch (e) { return iso; }
  }

  /* ---------- Supabase: plans / trees / joins ---------- */
  async function sbInsertPlan(plan) {
    if (!sb || !userId || !plan) return null;
    try {
      var rec = {
        user_id: userId,
        journey: window.currentJourney || "community",
        district: plan.district,
        planting_date: toISODate(plan.date) || new Date().toISOString().slice(0, 10),
        tree_count: plan.count,
        purpose: null,
        soil: null,
        water_source: null,
        maintenance: null,
        location_text: plan.district,
        species_requested: null,
        recommendation: plan.mix || [],
        suitability_score: null,
        survival_forecast: null
      };
      var res = await sb.from("plans").insert(rec).select("id").single();
      if (res.error) throw res.error;
      return res.data ? res.data.id : null;
    } catch (e) { return null; }
  }

  async function sbInsertTree(tree, planId) {
    if (!sb || !userId || !tree) return null;
    try {
      var res = await sb.from("trees").insert({
        user_id: userId,
        plan_id: planId || null,
        species: tree.species,
        location: tree.loc,
        planted_on: toISODate(tree.planted),
        health: healthToDb(tree.health),
        last_watered_on: new Date().toISOString().slice(0, 10)
      }).select("id").single();
      if (res.error) throw res.error;
      return res.data ? res.data.id : null;
    } catch (e) { return null; }
  }

  async function sbInsertJoin(driveId, name, mobile, count) {
    if (!sb) return false;
    try {
      var res = await sb.from("drive_joins").insert({
        drive_id: driveId,
        user_id: userId || null,
        name: name,
        mobile: mobile,
        volunteers_count: count
      });
      if (res.error) throw res.error;
      return true;
    } catch (e) { return false; }
  }

  async function sbLoadDrives() {
    if (!sb) return;
    try {
      var res = await sb.from("drives").select("*").order("drive_date", { ascending: true });
      if (res.error || !res.data || !res.data.length) return;
      // Dedupe by title (defensive: the seed data was run twice in the
      // SQL Editor once, creating duplicate drive rows 11-20).
      var seen = {};
      var rows = res.data.filter(function (d) {
        if (seen[d.title]) return false;
        seen[d.title] = true;
        return true;
      });
      // Keep the original photos (matched by title); use DB for everything else.
      var byTitle = {};
      (window.DRIVES || []).forEach(function (d) { byTitle[d.title] = d.img; });
      var mapped = rows.map(function (d) {
        return {
          id: d.id,
          title: d.title,
          org: d.organiser,
          type: d.type,
          city: d.city,
          date: fmtDriveDate(d.drive_date),
          time: d.start_time || "7:00 AM",
          venue: d.venue,
          trees: d.trees_target || 0,
          joined: d.joined_count || 0,
          img: byTitle[d.title] || ""
        };
      });
      window.DRIVES.length = 0;
      mapped.forEach(function (d) { window.DRIVES.push(d); });
      if (typeof renderDrives === "function") renderDrives("all");
    } catch (e) { /* keep hardcoded drives as fallback */ }
  }

  async function sbLoadTrees() {
    if (!sb || !userId) return;
    try {
      var res = await sb.from("trees").select("*").order("created_at", { ascending: true });
      if (res.error || !res.data || !res.data.length) return;
      res.data.forEach(function (row) {
        var exists = (window.trees || []).some(function (t) { return t._sbId === row.id; });
        if (exists) return;
        // Avoid duplicating the seed grove on first sync.
        var dup = (window.trees || []).some(function (t) {
          return t.species === row.species && t.loc === row.location;
        });
        if (dup) return;
        window.trees.push({
          id: window.nextId++,
          _sbId: row.id,
          species: row.species,
          loc: row.location || "Pune",
          planted: row.planted_on ? new Date(row.planted_on + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "Recently",
          health: healthFromDb(row.health),
          watered: "0 days ago",
          waters: 0
        });
      });
      if (typeof renderTracker === "function") renderTracker();
      if (typeof renderDashboard === "function") renderDashboard();
      saveLocal();
    } catch (e) { /* keep local trees as fallback */ }
  }

  /* ---------- wrap the app's existing actions ---------- */
  function wrapActions() {
    // Save a plan -> also save plan + trees to Supabase
    if (typeof savePlanToTracker === "function" && !savePlanToTracker._gwWrapped) {
      var origSave = savePlanToTracker;
      var wrappedSave = function () {
        var before = (window.trees || []).length;
        var plan = window.lastPlan;
        origSave();
        saveLocal();
        var added = (window.trees || []).slice(before);
        if (sb && userId && plan) {
          sbInsertPlan(plan).then(function (planId) {
            added.forEach(function (t) {
              sbInsertTree(t, planId).then(function (id) { if (id) t._sbId = id; });
            });
          });
        }
      };
      wrappedSave._gwWrapped = true;
      window.savePlanToTracker = wrappedSave;
    }

    // Add a tree manually -> also save to Supabase
    if (typeof addTree === "function" && !addTree._gwWrapped) {
      var origAdd = addTree;
      var wrappedAdd = function () {
        var before = (window.trees || []).length;
        origAdd();
        saveLocal();
        var added = (window.trees || [])[(window.trees || []).length - 1];
        if (sb && userId && added && (window.trees || []).length > before) {
          sbInsertTree(added, null).then(function (id) { if (id) added._sbId = id; });
        }
      };
      wrappedAdd._gwWrapped = true;
      window.addTree = wrappedAdd;
    }

    // Log watering -> also log to Supabase
    if (typeof logWater === "function" && !logWater._gwWrapped) {
      var origLog = logWater;
      var wrappedLog = function (i) {
        var tree = (window.trees || [])[i];
        origLog(i);
        saveLocal();
        if (sb && userId && tree && tree._sbId) {
          sb.from("watering_logs").insert({
            tree_id: tree._sbId, watered_on: new Date().toISOString().slice(0, 10), litres: 10
          }).then(function () {});
          sb.from("trees").update({ last_watered_on: new Date().toISOString().slice(0, 10), health: healthToDb(tree.health) }).eq("id", tree._sbId).then(function () {});
        }
      };
      wrappedLog._gwWrapped = true;
      window.logWater = wrappedLog;
    }

    // Health change -> also update Supabase
    if (typeof setHealth === "function" && !setHealth._gwWrapped) {
      var origHealth = setHealth;
      var wrappedHealth = function (i, h) {
        var tree = (window.trees || [])[i];
        origHealth(i, h);
        saveLocal();
        if (sb && userId && tree && tree._sbId) {
          sb.from("trees").update({ health: healthToDb(h) }).eq("id", tree._sbId).then(function () {});
        }
      };
      wrappedHealth._gwWrapped = true;
      window.setHealth = wrappedHealth;
    }

    // Join a drive -> also insert a drive_joins row
    if (typeof submitJoin === "function" && !submitJoin._gwWrapped) {
      var origJoin = submitJoin;
      var wrappedJoin = function () {
        var nameEl = document.getElementById("jName");
        var phoneEl = document.getElementById("jPhone");
        var countEl = document.getElementById("jCount");
        var name = nameEl ? nameEl.value.trim() : "";
        var phone = phoneEl ? phoneEl.value.trim() : "";
        var count = countEl ? Math.max(1, parseInt(countEl.value) || 1) : 1;
        var target = window.joinTarget;
        origJoin();
        saveLocal();
        if (sb && target) sbInsertJoin(target.id, name, phone, count);
      };
      wrappedJoin._gwWrapped = true;
      window.submitJoin = wrappedJoin;
    }
  }

  /* ---------- init ---------- */
  function init() {
    var restored = restoreLocal();
    if (restored) {
      if (typeof renderTracker === "function") renderTracker();
      if (typeof renderDashboard === "function") renderDashboard();
    }
    wrapActions();

    if (!window.supabase || !window.supabase.createClient) {
      setStatus("Backend: local mode — your trees save in this browser. Supabase library did not load.");
      return;
    }
    try {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      window.GWSupabase = sb;
    } catch (e) {
      setStatus("Backend: local mode — your trees save in this browser.");
      return;
    }

    // Anonymous sign-in (no password needed for the demo).
    // If anonymous sign-in is off in Supabase Auth, we stay in local mode.
    var signIn = sb.auth.getSession().then(function (s) {
      if (s && s.data && s.data.session) return s.data.session.user;
      return sb.auth.signInAnonymously().then(function (r) {
        if (r.error) throw r.error;
        return r.data ? r.data.user : null;
      });
    });

    signIn.then(function (user) {
      if (!user) throw new Error("no user");
      userId = user.id;
      mode = "supabase";
      setStatus("Backend: Supabase connected — your trees, plans and drive joins save to the database and survive a refresh.");
      sbLoadDrives();
      sbLoadTrees();
    }).catch(function () {
      mode = "local";
      setStatus("Backend: local mode — your trees save in this browser. Turn on Anonymous sign-in in Supabase Auth to sync across devices.");
      // Drives/species are still readable without sign-in.
      sbLoadDrives();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
