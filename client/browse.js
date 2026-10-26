// Finding a city without the globe: search, a country list (with US states),
// and an optional GPS shortcut to the nearest supported sky.
import { CITIES, citiesIn, countryList, countryOf, nearestCity, placeLabel, searchCities, US_STATES } from "../src/cities.js";
import { showModal, toast } from "./ui.js";

const sub = (c) => {
  const p = placeLabel(c);
  return [p.region, p.country].filter(Boolean).join(", ");
};

function item(main, subText, onClick) {
  const li = document.createElement("li");
  const b = document.createElement("button");
  b.type = "button";
  b.innerHTML = '<span class="r-main"></span><span class="r-sub"></span>';
  b.querySelector(".r-main").textContent = main;
  b.querySelector(".r-sub").textContent = subText;
  b.addEventListener("click", onClick);
  li.append(b);
  return li;
}

export function setupSearch({ input, list, onPick }) {
  let results = [];
  let active = -1;
  const render = () => {
    list.replaceChildren();
    if (!input.value.trim()) {
      list.hidden = true;
      return;
    }
    if (!results.length) {
      const li = document.createElement("li");
      li.className = "search-empty";
      li.textContent = "No supported city matches. Try a capital or a US state's largest city.";
      list.append(li);
    }
    results.forEach((c, i) => {
      const li = item(c.nameEn, sub(c), () => pick(c));
      li.firstChild.setAttribute("aria-selected", String(i === active));
      li.firstChild.setAttribute("role", "option");
      list.append(li);
    });
    list.hidden = false;
  };
  const pick = (c) => {
    input.value = "";
    results = [];
    render();
    input.blur();
    onPick(c);
  };
  input.addEventListener("input", () => {
    results = searchCities(input.value, 12);
    active = results.length ? 0 : -1;
    render();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!results.length) return;
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
      render();
    } else if (e.key === "Enter" && results[active]) pick(results[active]);
    else if (e.key === "Escape") {
      input.value = "";
      results = [];
      render();
    }
  });
  document.addEventListener("pointerdown", (e) => {
    if (!list.contains(e.target) && e.target !== input) list.hidden = true;
  });
  input.addEventListener("focus", () => input.value && render());
}

export function setupBrowse({ sheet, openBtn, onPick }) {
  const title = sheet.querySelector("#browse-title");
  const list = sheet.querySelector("#browse-list");
  const back = sheet.querySelector("#browse-back");
  const stack = [];
  const show = (heading, items, canBack) => {
    title.textContent = heading;
    list.replaceChildren(...items);
    list.scrollTop = 0;
    back.hidden = !canBack;
  };
  const countries = () => {
    stack.length = 0;
    show(
      `Countries (${countryList().length})`,
      countryList().map((c) =>
        item(c.en, c.code === "US" ? "Browse by state · 50 cities" : `${c.count} ${c.count === 1 ? "city" : "cities"}`, () => (c.code === "US" ? states() : cities(c.code))),
      ),
      false,
    );
  };
  const states = () => {
    stack.push(countries);
    show(
      "United States · by state",
      [...US_STATES]
        .sort((a, b) => a[2].localeCompare(b[2], "en"))
        .map(([code, , en]) => {
          const city = CITIES.find((c) => c.state === code);
          return item(city.nameEn, en, () => pick(city));
        }),
      true,
    );
  };
  const cities = (code) => {
    stack.push(countries);
    const list = citiesIn(code).sort((a, b) => (b.kind === "capital") - (a.kind === "capital") || a.nameEn.localeCompare(b.nameEn, "en"));
    show(
      countryOf(list[0]).en,
      list.map((c) => item(c.nameEn, c.kind === "capital" ? "Capital" : "Major city", () => pick(c))),
      true,
    );
  };
  const pick = (c) => {
    sheet.hidden = true;
    onPick(c);
  };
  openBtn.addEventListener("click", () => {
    countries();
    sheet.hidden = false;
    list.querySelector("button")?.focus();
  });
  back.addEventListener("click", () => (stack.pop() || countries)());
  sheet.querySelector("#browse-close").addEventListener("click", () => (sheet.hidden = true));
  sheet.addEventListener("keydown", (e) => e.key === "Escape" && (sheet.hidden = true));
}

// GPS gives a position only; the suggestion is the nearest catalog city.
export function setupGps({ button, onPick, onPreview }) {
  button.addEventListener("click", () => {
    if (!("geolocation" in navigator) || !window.isSecureContext) {
      toast("Location isn't available in this browser. Pick a city on the globe or search instead.", 4200);
      return;
    }
    button.disabled = true;
    button.textContent = "📍 Locating…";
    const done = () => {
      button.disabled = false;
      button.textContent = "📍 Near me";
    };
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        done();
        const near = nearestCity(pos.coords.latitude, pos.coords.longitude);
        onPreview(near.city);
        const km = near.km < 10 ? near.km.toFixed(1) : Math.round(near.km).toLocaleString("en-US");
        showModal({
          title: "Nearest sky",
          body: [`${near.city.nameEn} (${sub(near.city)})`, `About ${km} km from you. You can write in any city's sky, wherever you are.`],
          actions: [
            { label: "Stay on the globe" },
            { label: `Go to ${near.city.nameEn}`, primary: true, onClick: () => onPick(near.city) },
          ],
        });
      },
      (err) => {
        done();
        if (err.code === 1) toast("Location permission was denied. Pick a city on the globe or search instead.", 4500);
        else toast("Couldn't find your location. Pick a city on the globe or search instead.", 4500);
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60 * 1000 },
    );
  });
}

