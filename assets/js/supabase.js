/* ============================================================
   Grow Wise — GreenPlan AI
   Supabase backend integration
   ------------------------------------------------------------
   - Supabase (PostgreSQL) is the system of record for plans,
     trees, watering logs, drive joins and health checks.
   - Pune district only (Nov 2026): plans store the Pune taluka;
     drives are filtered to Pune district.
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
    // Never shown on screen: the site reads like a normal product,
    // with nothing about the backend, database or sync state visible.
    try { if (window.console && console.info) console.info("[GrowWise] " + text); } catch (e) { /* ignore */ }
  }

  /* ---------- localStorage backup ---------- */
  // The 12 Pune species. Anything else in a saved tracker copy (e.g. Mango,
  // Rain Tree, Gulmohar, Tamarind from before the Pune-only update) is stale
  // test data and is dropped when the backup is restored.
  var KNOWN_SPECIES = ["Neem", "Karanj", "Bahava (Amaltas)", "Jamun", "Banyan", "Peepal",
    "Amla", "Arjun", "Mahua", "Shirish", "Kachnar", "Dudhi"];
  function isKnownSpecies(name) {
    if (window.SPECIES && window.SPECIES.length) {
      return window.SPECIES.some(function (s) { return s.name === name; });
    }
    return KNOWN_SPECIES.indexOf(name) >= 0;
  }
  // Drop stale species and collapse identical saves (same species, place,
  // planted date and quantity) to one entry, keeping the first.
  function cleanTrees(list) {
    var seen = {};
    return (list || []).filter(function (t) {
      if (!t || !isKnownSpecies(t.species)) return false;
      var key = [t.species, t.loc || "", t.planted || "", t.qty || 1].join("|");
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }
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
        // Clean stale test data out of the saved copy before using it.
        var cleaned = cleanTrees(data.trees);
        if (!cleaned.length) return false; // fall back to the fresh seed grove
        window.trees = cleaned;
        // Drop joins to drives that no longer exist (non-Pune drives).
        var jd = data.joinedDrives || {};
        var driveIds = {};
        (window.DRIVES || []).forEach(function (d) { driveIds[d.id] = true; });
        Object.keys(jd).forEach(function (k) { if (!driveIds[k]) delete jd[k]; });
        window.joinedDrives = jd;
        if (data.nextId) window.nextId = data.nextId;
        saveLocal(); // persist the cleaned copy
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
        location_text: "Pune district — " + plan.district,
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
      // Pune district only (Nov 2026): drop any non-Pune drive rows
      // from the live DB, so the site stays Pune-only even before the
      // database migration runs. If nothing survives the filter, keep
      // the hardcoded Pune drives as fallback.
      rows = rows.filter(function (d) {
        return ((d.district || "").toLowerCase() === "pune" ||
                (d.city || "").toLowerCase() === "pune");
      });
      if (!rows.length) return;
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
      // Real joined counts: sum drive_joins per drive (the drives row
      // count is never updated when someone joins), and restore the
      // current user's own joins so "You're in" survives a reload
      // or a sign-in on another device.
      try {
        var jr = await sb.from("drive_joins").select("drive_id,user_id,volunteers_count");
        if (!jr.error && jr.data) {
          var totals = {};
          jr.data.forEach(function (j) {
            totals[j.drive_id] = (totals[j.drive_id] || 0) + (j.volunteers_count || 1);
            if (userId && j.user_id === userId) window.joinedDrives[j.drive_id] = j.volunteers_count || 1;
          });
          mapped.forEach(function (d) {
            if (totals[d.id] != null) { d.joined = totals[d.id]; d.joinedDb = true; }
          });
          saveLocal();
        }
      } catch (e) { /* counts stay as stored */ }
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
        if (!isKnownSpecies(row.species)) return; // stale pre-Pune species from test saves
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
        if (sb && target) sbInsertJoin(target.id, name, phone, count).then(function () { sbLoadDrives(); loadMyDrives(); });
      };
      wrappedJoin._gwWrapped = true;
      window.submitJoin = wrappedJoin;
    }
  }


  /* ---------- auth: email + password (roles in profiles) ---------- */
  var currentUser = null;
  function gwVal(id) { var el = document.getElementById(id); return el ? el.value.trim() : ""; }
  function isGuest() { return !!(currentUser && currentUser.is_anonymous); }
  function roleLabel(r) {
    return { individual: "Individual", ngo: "NGO", college: "College",
             municipal: "Municipal body", csr: "CSR team" }[r] || r || "Member";
  }
  function friendlyAuthError(e) {
    var m = (e && e.message) || "Something went wrong. Please try again.";
    if (/invalid login credentials/i.test(m)) return "Wrong email or password — check them and try again.";
    if (/email not confirmed/i.test(m)) return "Please confirm your email first — check your inbox for the link.";
    if (/signups are disabled|logins are disabled|email.*disabled/i.test(m))
      return "Email sign-in is switched off in Supabase — enable it in Dashboard > Authentication > Providers > Email.";
    return m;
  }
  async function loadProfile() {
    window.GWProfile = null;
    if (!sb || !userId) return null;
    try {
      var res = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (!res.error && res.data) window.GWProfile = res.data;
    } catch (e) { /* no profile yet — guest or brand-new account */ }
    return window.GWProfile;
  }
  function updateAuthUI() {
    var btn = document.getElementById("authBtn");
    var prof = window.GWProfile;
    var loggedIn = !!(currentUser && !currentUser.is_anonymous);
    if (btn) btn.textContent = loggedIn ? ((prof && prof.full_name) || "Account") : "Sign in";
    var out = document.getElementById("authLoggedOut");
    var inn = document.getElementById("authLoggedIn");
    if (out) out.style.display = loggedIn ? "none" : "block";
    if (inn) inn.style.display = loggedIn ? "block" : "none";
    if (loggedIn && prof) {
      var n = document.getElementById("accName"); if (n) n.textContent = prof.full_name || currentUser.email;
      var e = document.getElementById("accEmail"); if (e) e.textContent = currentUser.email || "";
      var r = document.getElementById("accRole"); if (r) r.textContent = roleLabel(prof.role);
    }
    if (typeof refreshOrganiserUI === "function") refreshOrganiserUI();
  }
  // The signed-in account changed (new id) — drop the old guest backup
  // and reload onto a clean slate for the new account.
  function switchUser() {
    try { localStorage.removeItem(LS_KEY); } catch (e) { /* ignore */ }
    location.reload();
  }
  async function signUp(role) {
    if (typeof authErr === "function") authErr("up", null);
    if (!sb) { if (typeof authErr === "function") authErr("up", "Sign-in is not available right now. Check your connection and try again."); return; }
    var name = gwVal("sName"), email = gwVal("sEmail"), pass = gwVal("sPass");
    var org = gwVal("sOrg"), taluka = gwVal("sTaluka");
    if (name.length < 2) return authErr("up", "Please add your name.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return authErr("up", "Please add a valid email address.");
    if (pass.length < 6) return authErr("up", "Password needs at least 6 characters.");
    if (role !== "individual" && org.length < 2) return authErr("up", "Please add your organisation name.");
    var wasGuest = isGuest();
    try {
      var user, session;
      if (wasGuest) {
        // Guest -> real account: the user id stays the same, so every
        // tree, plan and drive join saved as a guest stays yours.
        var up = await sb.auth.updateUser({ email: email, password: pass });
        if (up.error) throw up.error;
        user = up.data.user; session = true;
      } else {
        var su = await sb.auth.signUp({ email: email, password: pass });
        if (su.error) throw su.error;
        user = su.data.user; session = !!su.data.session;
        if (!session) {
          if (typeof authErr === "function") authErr("up", "Account created — check " + email + " for a confirmation link, then sign in.");
          return;
        }
      }
      if (!user) throw new Error("no user");
      var prof = { id: user.id, full_name: role === "individual" ? name : org, role: role, district: taluka || "Pune City" };
      var pr = await sb.from("profiles").upsert(prof);
      if (pr.error) throw pr.error;
      currentUser = user; userId = user.id; window.GWProfile = prof;
      if (!wasGuest) { switchUser(); return; } // fresh account: new id, reload clean
      updateAuthUI();
      if (typeof toast === "function") toast("Welcome, " + name.split(" ")[0] + " — your account is ready.");
      if (typeof go === "function") go("dashboard");
    } catch (e) {
      if (typeof authErr === "function") authErr("up", friendlyAuthError(e));
    }
  }
  async function signIn() {
    if (typeof authErr === "function") authErr("in", null);
    if (!sb) { if (typeof authErr === "function") authErr("in", "Sign-in is not available right now. Check your connection and try again."); return; }
    var email = gwVal("aEmail"), pass = gwVal("aPass");
    if (!email || !pass) return authErr("in", "Add your email and password.");
    var r = await sb.auth.signInWithPassword({ email: email, password: pass });
    if (r.error) return authErr("in", friendlyAuthError(r.error));
    switchUser();
  }
  async function signOut() {
    try { if (sb) await sb.auth.signOut(); } catch (e) { /* ignore */ }
    switchUser();
  }
  async function resetPassword() {
    var email = gwVal("aEmail") || (currentUser && currentUser.email) || "";
    if (!email) { if (typeof authErr === "function") authErr("in", "Type your email above first, then tap “Forgot your password?”."); return; }
    if (!sb) return;
    var r = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + "#auth" });
    if (r.error) return authErr("in", friendlyAuthError(r.error));
    if (typeof toast === "function") toast("Reset link sent to " + email + " — check your inbox.");
  }
  async function createDrive() {
    var errEl = document.getElementById("driveFormErr");
    function fail(m) { if (errEl) { errEl.textContent = m; errEl.style.display = "block"; } }
    if (errEl) errEl.style.display = "none";
    if (!sb || !currentUser || currentUser.is_anonymous) return fail("Sign in with your organisation account to organise a drive.");
    var prof = window.GWProfile;
    if (!prof || ["ngo", "college", "municipal", "csr"].indexOf(prof.role) < 0)
      return fail("Only NGO, college, municipal and CSR accounts can organise drives.");
    var title = gwVal("dTitle"), taluka = gwVal("dTaluka"), venue = gwVal("dVenue");
    var date = gwVal("dDate"), time = gwVal("dTime") || "7:00 AM";
    var trees = Math.max(1, parseInt(gwVal("dTrees"), 10) || 0);
    if (title.length < 3) return fail("Please add a drive title.");
    if (!venue || venue.length < 3) return fail("Please add the venue / meeting point.");
    if (!date) return fail("Please pick a date.");
    var typeMap = { ngo: "NGO", college: "College", municipal: "Municipal", csr: "CSR" };
    var res = await sb.from("drives").insert({
      title: title, organiser: prof.full_name || "Team Grow Wise",
      type: typeMap[prof.role] || "NGO", city: taluka, district: "Pune",
      drive_date: date, start_time: time, venue: venue,
      trees_target: trees, joined_count: 0, organiser_id: currentUser.id
    });
    if (res.error) return fail("Could not publish the drive: " + res.error.message);
    if (typeof toast === "function") toast("Drive published — it now shows in the list.");
    var f = document.getElementById("driveForm"); if (f) f.style.display = "none";
    await sbLoadDrives(); loadMyDrives();
  }
  async function loadMyDrives() {
    var box = document.getElementById("myDrivesList");
    if (!box) return;
    var prof = window.GWProfile;
    if (!sb || !currentUser || currentUser.is_anonymous || !prof ||
        ["ngo", "college", "municipal", "csr"].indexOf(prof.role) < 0) { box.innerHTML = ""; return; }
    var res = await sb.from("drives").select("*").eq("organiser_id", currentUser.id).order("drive_date", { ascending: true });
    if (res.error || !res.data || !res.data.length) {
      box.innerHTML = '<div class="card"><p>No drives organised yet — publish your first one above.</p></div>';
      return;
    }
    var ids = res.data.map(function (d) { return d.id; });
    var joins = await sb.from("drive_joins").select("drive_id,name,volunteers_count").in("drive_id", ids);
    var byDrive = {};
    (joins.data || []).forEach(function (j) { (byDrive[j.drive_id] = byDrive[j.drive_id] || []).push(j); });
    box.innerHTML = res.data.map(function (d) {
      var js = byDrive[d.id] || [];
      var total = js.reduce(function (a, j) { return a + (j.volunteers_count || 1); }, 0);
      var names = js.map(function (j) { return esc(j.name) + " (" + (j.volunteers_count || 1) + ")"; }).join(", ") || "No registrations yet";
      var when = (typeof fmtDriveDate === "function") ? fmtDriveDate(d.drive_date) : d.drive_date;
      return '<div class="card"><h3>' + esc(d.title) + '</h3><p>🗓️ ' + esc(when) + ' · 📍 ' + esc(d.venue) + '<br/>🌱 ' + (d.trees_target || 0) + ' trees planned · 👥 ' + total + ' volunteers joined</p><p class="mini">' + names + '</p></div>';
    }).join("");
  }
  window.GWAuth = { signUp: signUp, signIn: signIn, signOut: signOut,
    resetPassword: resetPassword, createDrive: createDrive,
    loadMyDrives: loadMyDrives, isGuest: isGuest, roleLabel: roleLabel };

  /* ---------- init ---------- */
  function init() {
    var restored = restoreLocal();
    if (restored) {
      if (typeof renderTracker === "function") renderTracker();
      if (typeof renderDashboard === "function") renderDashboard();
    }
    wrapActions();

    if (!window.supabase || !window.supabase.createClient) {
      setStatus("Library did not load — your trees save in this browser for now.");
      return;
    }
    try {
      sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      window.GWSupabase = sb;
    } catch (e) {
      setStatus("Your trees save in this browser for now.");
      return;
    }

    // Session first: a signed-in account keeps its id and data;
    // otherwise fall back to an anonymous guest session.
    var signIn = sb.auth.getSession().then(function (s) {
      if (s && s.data && s.data.session) return s.data.session.user;
      return sb.auth.signInAnonymously().then(function (r) {
        if (r.error) throw r.error;
        return r.data ? r.data.user : null;
      });
    });

    signIn.then(function (user) {
      if (!user) throw new Error("no user");
      currentUser = user;
      userId = user.id;
      mode = "supabase";
      setStatus("Connected — your trees, plans and drive joins are saved and survive a refresh.");
      loadProfile().then(function () {
        sbLoadDrives();
        sbLoadTrees();
        updateAuthUI();
      });
    }).catch(function () {
      mode = "local";
      setStatus("Your trees save in this browser for now.");
      // Drives/species are still readable without sign-in.
      sbLoadDrives();
      updateAuthUI();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
