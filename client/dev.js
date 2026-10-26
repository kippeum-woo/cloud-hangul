// Developer-only demo panel (open with ?dev=1). It previews other cities,
// local times, weather and message aging in this browser only, and shows the
// city's shared supply tier. It never changes shared data.
import { PRESETS, WEATHER_LABELS } from "../src/weather.js";
import { timeLabel } from "../src/clock.js";
import { serverNow } from "./api.js";

const QUICK = [
  ["kr-seoul", "Seoul"],
  ["us-ny-new-york", "New York"],
  ["us-az-phoenix", "Phoenix (no DST)"],
  ["np-kathmandu", "Kathmandu (+5:45)"],
  ["no-longyearbyen", "Longyearbyen (polar)"],
  ["au-sydney", "Sydney"],
  ["us-hi-honolulu", "Honolulu"],
  ["is-reykjavik", "Reykjavík"],
];

export function setupDev({ dev, onChange, goto, sky, supply }) {
  const panel = document.getElementById("dev");
  const toggle = document.createElement("button");
  toggle.className = "pill small dev-toggle";
  toggle.textContent = "🛠 Dev";
  toggle.addEventListener("click", () => (panel.hidden = !panel.hidden));
  document.body.append(toggle);

  const presetLabel = { ...WEATHER_LABELS, windy: "Windy" };
  panel.innerHTML = `
    <h3>Developer demo panel</h3>
    <p style="margin:0 0 6px;color:#7a5a00">Only affects this browser's view. Shared messages and letters are not changed.</p>
    <section><strong>City</strong>
      <div class="row">${QUICK.map(([id, n]) => `<button data-city="${id}">${n}</button>`).join("")}</div>
    </section>
    <section><strong>Local time</strong> <span id="dev-time"></span>
      <label>Hours <input type="range" id="dev-hours" min="-24" max="24" step="0.25" value="0" /> <span id="dev-hours-v">0h</span></label>
      <label>Date <select id="dev-days">
        <option value="0">Today</option><option value="57">+57 days</option><option value="120">+120 days</option>
        <option value="180">+180 days</option><option value="240">+240 days</option>
      </select></label>
      <div class="row"><button id="dev-now">Now</button></div>
    </section>
    <section><strong>Weather</strong>
      <label><select id="dev-weather"><option value="">Live</option>${Object.keys(PRESETS)
        .map((k) => `<option value="${k}">${presetLabel[k]}</option>`)
        .join("")}</select></label>
    </section>
    <section><strong>Message age</strong>
      <label><input type="range" id="dev-age" min="0" max="24" step="0.25" value="0" /> <span id="dev-age-v">+0h</span></label>
    </section>
    <section><strong>Shared supply</strong>
      <div id="dev-supply">—</div>
      <div class="row"><button id="dev-supply-btn">Check supply</button></div>
    </section>
    <section><label><input type="checkbox" id="dev-motion" /> Preview reduced motion</label></section>`;

  const $ = (id) => panel.querySelector(`#${id}`);
  const tick = () => {
    if (sky.city) $("dev-time").textContent = `${sky.city.nameEn} ${timeLabel(serverNow() + dev.timeOffset, sky.city.tz)}`;
  };
  const applyTime = () => {
    const h = Number($("dev-hours").value);
    const d = Number($("dev-days").value);
    dev.timeOffset = h * 3600000 + d * 86400000;
    $("dev-hours-v").textContent = `${h > 0 ? "+" : ""}${h}h`;
    onChange();
    tick();
  };
  panel.querySelectorAll("[data-city]").forEach((b) => b.addEventListener("click", () => goto(b.dataset.city)));
  $("dev-hours").addEventListener("input", applyTime);
  $("dev-days").addEventListener("change", applyTime);
  $("dev-now").addEventListener("click", () => {
    $("dev-hours").value = "0";
    $("dev-days").value = "0";
    applyTime();
  });
  $("dev-weather").addEventListener("change", (e) => {
    dev.weather = e.target.value || null;
    onChange();
  });
  $("dev-age").addEventListener("input", (e) => {
    const h = Number(e.target.value);
    dev.ageOffset = h * 3600000;
    $("dev-age-v").textContent = `+${h}h`;
  });
  $("dev-supply-btn").addEventListener("click", async () => {
    try {
      const s = await supply();
      const mins = Math.max(0, Math.round((s.nextRefillAt - serverNow()) / 60000));
      $("dev-supply").textContent = `${s.active} active visitors · tier ${s.tier.decks} deck(s) per refill, cap ${s.tier.capacity} · ${s.reserved} reserved · next refill in ~${mins} min`;
    } catch {
      $("dev-supply").textContent = "Open a city first";
    }
  });
  $("dev-motion").addEventListener("change", (e) => {
    dev.reducedMotion = e.target.checked ? true : null;
  });
  toggle.addEventListener("click", tick);
}
