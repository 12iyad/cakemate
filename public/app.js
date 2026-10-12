const $ = (selector) => document.querySelector(selector);
let bakeryId = window.localStorage.getItem("cakemateBakeryId") || "";
let customerSessionId = window.localStorage.getItem("cakemateCustomerSession") || "";
let step = 0;
let setupBusy = false;
const onboarding = { items: [], paymentMethods: [], business: {} };
const steps = [
  { label: "Step 1 of 3", title: "What do you sell?", intro: "Add the things customers can ask Cakemate about. You can always change these later." },
  { label: "Step 2 of 3", title: "How can customers pay?", intro: "This is saved as context for your agent. It will not take payments or promise anything." },
  { label: "Step 3 of 3", title: "A few basics", intro: "This tells Cakemate who it is helping and where your bakery is based." },
];

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = $("#loginName").value.trim();
  const bakery = $("#loginBakery").value.trim();
  bakeryId = `local-${slugify(name)}-${slugify(bakery)}`;
  onboarding.business = { bakerName: name, name: bakery };
  window.localStorage.setItem("cakemateBakeryId", bakeryId);
  await restoreSetup();
});
$("#addItemButton").addEventListener("click", () => { onboarding.items.push({ name: "", variations: "", price: "", description: "" }); persistDraft(); renderItems(); });
$("#nextButton").addEventListener("click", nextStep);
$("#backButton").addEventListener("click", () => { if (setupBusy) return; collectStep(); step -= 1; persistDraft(); renderStep(); });
$("#customerForm").addEventListener("submit", (event) => { event.preventDefault(); sendCustomer(); });
$("#resetCustomer").addEventListener("click", resetCustomer);
$("#exampleButton").addEventListener("click", () => { $("#customerInput").value = "hi, can i get a biscoff cake for saturday?"; $("#customerInput").focus(); });
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => { if (!tab.disabled) switchTab(tab.dataset.tab); }));

$("#setupRetry").addEventListener("click", () => { $("#setupRetry").hidden = true; void restoreSetup(); });
$("#setupView").addEventListener("input", () => { collectStep(); persistDraft(); });
$("#setupView").addEventListener("change", () => { collectStep(); persistDraft(); });
if (bakeryId) void restoreSetup();

function draftKey() { return `cakemateSetupDraft:${bakeryId}`; }
function persistDraft() {
  if (!bakeryId) return;
  try { window.localStorage.setItem(draftKey(), JSON.stringify({ ...onboarding, step })); } catch { /* Form stays usable if browser storage is full. */ }
}
function applyProfile(profile) {
  onboarding.items = (profile.products?.items || []).map((item) => ({ name: "", variations: "", price: "", description: "", ...item }));
  onboarding.paymentMethods = [...(profile.ordering?.paymentMethods || [])];
  onboarding.business = { ...onboarding.business, ...profile.business };
}
function enableCustomerTest() {
  $("#testTab").disabled = false;
  $("#testTab .lock").textContent = "Ready";
  $("#customerHeading").textContent = `@${(onboarding.business.name || "").replace(/\s+/g, "").toLowerCase()} DMs`;
}
async function restoreSetup() {
  $("#loginView").hidden = true;
  $("#appView").hidden = false;
  setSetupLoading(true, "Loading your saved setup…");
  let draft;
  try { draft = JSON.parse(window.localStorage.getItem(draftKey()) || "null"); } catch { /* Ignore invalid drafts. */ }
  try {
    const response = await fetch(`/api/onboarding/profile?bakeryId=${encodeURIComponent(bakeryId)}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not load your saved setup.");
    applyProfile(payload.profile);
    if (draft && Array.isArray(draft.items) && draft.business && Array.isArray(draft.paymentMethods)) {
      onboarding.items = draft.items;
      onboarding.business = { ...onboarding.business, ...draft.business };
      onboarding.paymentMethods = draft.paymentMethods;
      step = Number.isInteger(draft.step) ? Math.max(0, Math.min(2, draft.step)) : 0;
    }
    renderStep();
    if (!payload.profile.setupComplete) persistDraft();
    if (payload.profile.setupComplete) {
      enableCustomerTest();
      if (!draft) { setSetupLoading(false, ""); switchTab("test"); }
    }
    setSetupLoading(false, "");
  } catch (error) {
    $("#setupStatus").textContent = error.message;
    // Do not permit a blank form to overwrite a profile that failed to load.
    $("#setupRetry").hidden = false;
    $("#setupRetry").disabled = false;
  }
}

function renderStep() {
  const copy = steps[step]; $("#stepLabel").textContent = copy.label; $("#stepTitle").textContent = copy.title; $("#stepIntro").textContent = copy.intro;
  $("#stepProducts").hidden = step !== 0; $("#stepPayments").hidden = step !== 1; $("#stepBusiness").hidden = step !== 2; $("#backButton").hidden = step === 0; $("#nextButton").innerHTML = step === 2 ? "Finish setup <span>→</span>" : "Next <span>→</span>";
  if (step === 0 && onboarding.items.length === 0) onboarding.items.push({ name: "", variations: "", price: "", description: "" });
  if (step === 0) renderItems();
  if (step === 1) {
    const choices = [...document.querySelectorAll('input[name="payment"]')];
    choices.forEach((input) => { input.checked = onboarding.paymentMethods.includes(input.value); });
    $("#otherPayment").value = onboarding.paymentMethods.filter((method) => !choices.some((input) => input.value === method)).join(", ");
  }
  if (step === 2) { $("#bakerName").value = onboarding.business.bakerName || ""; $("#bakeryName").value = onboarding.business.name || ""; $("#bakeryLocation").value = onboarding.business.location || ""; }
}
function renderItems() {
  const rows = $("#productRows"); rows.innerHTML = "";
  onboarding.items.forEach((item, index) => {
    const row = document.createElement("section"); row.className = "product-row";
    row.innerHTML = `<div class="row-title"><strong>Item ${index + 1}</strong>${onboarding.items.length > 1 ? `<button type="button" class="remove-item" data-index="${index}">Remove</button>` : ""}</div><label>Item<input data-field="name" data-index="${index}" value="${escapeAttribute(item.name)}" placeholder="e.g. Brownie box" /></label><label>Variations<input data-field="variations" data-index="${index}" value="${escapeAttribute(item.variations)}" placeholder="e.g. 6, 12, 24" /></label><label>Price<input data-field="price" data-index="${index}" value="${escapeAttribute(item.price)}" placeholder="e.g. £12 / £20 / £36" /></label><label class="description-label">Description<textarea data-field="description" data-index="${index}" placeholder="Short menu description">${escapeHtml(item.description)}</textarea><button type="button" class="generate-description" data-index="${index}">Generate description</button></label>`;
    rows.append(row);
  });
  rows.querySelectorAll("input, textarea").forEach((input) => input.addEventListener("input", () => { onboarding.items[Number(input.dataset.index)][input.dataset.field] = input.value; }));
  rows.querySelectorAll(".remove-item").forEach((button) => button.addEventListener("click", () => { onboarding.items.splice(Number(button.dataset.index), 1); persistDraft(); renderItems(); }));
  rows.querySelectorAll(".generate-description").forEach((button) => button.addEventListener("click", () => generateDescription(Number(button.dataset.index), button)));
}
async function generateDescription(index, button) { const item = onboarding.items[index]; if (!item.name.trim()) { $("#setupStatus").textContent = "Add the item name first."; return; } button.disabled = true; button.textContent = "Generating…"; try { const response = await fetch("/api/onboarding/generate-description", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(item) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Could not generate a description."); item.description = payload.description; persistDraft(); renderItems(); } catch (error) { $("#setupStatus").textContent = error.message; button.disabled = false; button.textContent = "Generate description"; } }
async function nextStep() {
  if (setupBusy) return;
  collectStep();
  persistDraft();
  if (step === 0 && !onboarding.items.some((item) => item.name.trim())) {
    $("#setupStatus").textContent = "Add at least one item to continue.";
    return;
  }
  if (step < 2) {
    step += 1;
    persistDraft();
    $("#setupStatus").textContent = "";
    renderStep();
    return;
  }
  if (!onboarding.business.name) {
    $("#setupStatus").textContent = "Add your bakery name to finish.";
    return;
  }
  setSetupLoading(true, "Saving your agent context…");
  try {
    const response = await fetch("/api/onboarding/save", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ bakeryId, ...onboarding, setupComplete: true }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Could not save setup.");
    applyProfile(payload.profile);
    window.localStorage.removeItem(draftKey());
    enableCustomerTest();
    renderStep();
    setSetupLoading(false, "Setup saved.");
    switchTab("test");
  } catch (error) {
    setSetupLoading(false, error.message);
  }
}
function collectStep() { if (step === 1) { onboarding.paymentMethods = [...document.querySelectorAll('input[name="payment"]:checked')].map((input) => input.value); const other = $("#otherPayment").value.trim(); if (other) onboarding.paymentMethods.push(other); } if (step === 2) onboarding.business = { bakerName: $("#bakerName").value.trim(), name: $("#bakeryName").value.trim(), location: $("#bakeryLocation").value.trim() }; }
async function sendCustomer() { const message = $("#customerInput").value.trim(); if (!message) return; addMessage($("#customerMessages"), "customer", message); $("#customerInput").value = ""; setCustomerLoading(true, "Thinking…"); try { const response = await fetch("/api/demo/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: customerSessionId || undefined, bakeryId, message }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Chat failed."); customerSessionId = payload.sessionId; window.localStorage.setItem("cakemateCustomerSession", customerSessionId); addMessage($("#customerMessages"), "agent", payload.assistantMessage); } catch (error) { addMessage($("#customerMessages"), "agent", error.message); } finally { setCustomerLoading(false, ""); } }
async function resetCustomer() { const response = await fetch("/api/demo/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: customerSessionId || undefined, bakeryId }) }); const payload = await response.json(); customerSessionId = payload.sessionId; window.localStorage.setItem("cakemateCustomerSession", customerSessionId); $("#customerMessages").innerHTML = '<div class="empty-state"><p>Try a real customer question and see how your Cakemate replies.</p></div>'; }
function switchTab(tab) { if (setupBusy) return; if (!$("#setupView").hidden) collectStep(); const setup = tab === "setup"; $("#setupView").hidden = !setup; $("#testView").hidden = setup; document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("is-active", item.dataset.tab === tab)); }
function addMessage(container, role, text) { const message = document.createElement("article"); message.className = `message ${role}`; message.textContent = text; container.append(message); container.scrollTop = container.scrollHeight; }
function setSetupLoading(loading, text) {
  setupBusy = loading;
  $("#setupView").querySelectorAll("input, textarea, button").forEach((element) => { element.disabled = loading; });
  $("#setupStatus").textContent = text;
}
function setCustomerLoading(loading, text) { $("#customerInput").disabled = loading; $("#customerForm button").disabled = loading; $("#customerStatus").textContent = text; }
function slugify(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function escapeHtml(value) { return value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]); }
function escapeAttribute(value) { return escapeHtml(value); }
