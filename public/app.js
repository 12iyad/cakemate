const $ = (selector) => document.querySelector(selector);
const trainMessages = $("#trainMessages");
const trainInput = $("#trainInput");
const testTab = $("#testTab");
let bakeryId = window.localStorage.getItem("cakemateBakeryId") || "";
let setupSessionId = window.localStorage.getItem("cakemateSetupSession") || "";
let customerSessionId = window.localStorage.getItem("cakemateCustomerSession") || "";

$("#loginForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const name = $("#loginName").value.trim();
  const bakery = $("#loginBakery").value.trim();
  bakeryId = `local-${slugify(name)}-${slugify(bakery)}`;
  window.localStorage.setItem("cakemateBakeryId", bakeryId);
  $("#loginView").hidden = true; $("#appView").hidden = false;
  loadWelcome();
});
$("#trainForm").addEventListener("submit", (event) => { event.preventDefault(); sendTrain(trainInput.value); });
$("#customerForm").addEventListener("submit", (event) => { event.preventDefault(); sendCustomer(); });
$("#restartButton").addEventListener("click", resetTraining);
$("#resetCustomer").addEventListener("click", resetCustomer);
$("#exampleButton").addEventListener("click", () => { $("#customerInput").value = "hi, can i get a biscoff cake for saturday?"; $("#customerInput").focus(); });
document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => { if (!tab.disabled) switchTab(tab.dataset.tab); }));

if (bakeryId) { $("#loginView").hidden = true; $("#appView").hidden = false; loadWelcome(); }

async function loadWelcome() {
  const params = new URLSearchParams({ bakeryId }); if (setupSessionId) params.set("sessionId", setupSessionId);
  const response = await fetch(`/api/setup/welcome?${params}`); receiveTraining(await response.json());
}
async function sendTrain(message) {
  const text = (message || "").trim(); if (!text) return;
  addMessage(trainMessages, "baker", text); trainInput.value = ""; setTrainLoading(true, "Teaching your agent…");
  try { const response = await fetch("/api/setup/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: setupSessionId, bakeryId, message: text }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Setup chat failed."); receiveTraining(payload); } catch (error) { addMessage(trainMessages, "agent", error.message); } finally { setTrainLoading(false, ""); }
}
function receiveTraining(payload) {
  setupSessionId = payload.sessionId; window.localStorage.setItem("cakemateSetupSession", setupSessionId);
  addMessage(trainMessages, "agent", payload.assistantMessage);
  const done = payload.progress === 100; testTab.disabled = !done; testTab.querySelector(".lock").textContent = done ? "Ready" : "Locked";
  if (payload.profile.business.name) $("#customerHeading").textContent = `@${payload.profile.business.name.replace(/\s+/g, "").toLowerCase()} DMs`;
}
async function resetTraining() {
  const response = await fetch("/api/setup/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: setupSessionId, bakeryId }) });
  trainMessages.innerHTML = ""; setupSessionId = ""; window.localStorage.removeItem("cakemateSetupSession"); receiveTraining(await response.json());
}
async function sendCustomer() {
  const message = $("#customerInput").value.trim(); if (!message) return;
  addMessage($("#customerMessages"), "customer", message); $("#customerInput").value = ""; setCustomerLoading(true, "Thinking…");
  try { const response = await fetch("/api/demo/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: customerSessionId || undefined, bakeryId, message }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Chat failed."); customerSessionId = payload.sessionId; window.localStorage.setItem("cakemateCustomerSession", customerSessionId); addMessage($("#customerMessages"), "agent", payload.assistantMessage); } catch (error) { addMessage($("#customerMessages"), "agent", error.message); } finally { setCustomerLoading(false, ""); }
}
async function resetCustomer() {
  const response = await fetch("/api/demo/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: customerSessionId || undefined, bakeryId }) }); const payload = await response.json(); customerSessionId = payload.sessionId; window.localStorage.setItem("cakemateCustomerSession", customerSessionId); $("#customerMessages").innerHTML = '<div class="empty-state"><p>Try a real customer question and see how your Cakemate replies.</p></div>';
}
function switchTab(tab) { const training = tab === "train"; $("#trainView").hidden = !training; $("#testView").hidden = training; document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("is-active", item.dataset.tab === tab)); (training ? trainInput : $("#customerInput")).focus(); }
function addMessage(container, role, text) { const message = document.createElement("article"); message.className = `message ${role}`; message.textContent = text; container.append(message); container.scrollTop = container.scrollHeight; }
function setTrainLoading(loading, text) { trainInput.disabled = loading; $("#trainForm button").disabled = loading; $("#trainStatus").textContent = text; }
function setCustomerLoading(loading, text) { $("#customerInput").disabled = loading; $("#customerForm button").disabled = loading; $("#customerStatus").textContent = text; }
function slugify(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
