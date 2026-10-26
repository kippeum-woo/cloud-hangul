// Toasts and a small modal dialog.
const toastEl = document.getElementById("toast");
let toastTimer = null;

export function toast(text, ms = 2600) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastEl.hidden = true), ms);
}

const modal = document.getElementById("modal");
let closeModal = null;

// actions: [{ label, primary, onClick }]. onClick returning false keeps it open.
export function showModal({ title, body, actions }) {
  closeModal?.();
  document.getElementById("modal-title").textContent = title;
  const bodyEl = document.getElementById("modal-body");
  bodyEl.replaceChildren(...(Array.isArray(body) ? body : [body]).map((b) => (typeof b === "string" ? Object.assign(document.createElement("p"), { textContent: b }) : b)));
  const row = document.getElementById("modal-actions");
  row.replaceChildren();
  const close = () => {
    modal.hidden = true;
    closeModal = null;
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => e.key === "Escape" && close();
  for (const a of actions) {
    const b = document.createElement("button");
    b.className = `pill${a.primary ? " primary" : ""}`;
    b.textContent = a.label;
    b.addEventListener("click", async () => {
      if ((await a.onClick?.()) !== false) close();
    });
    row.append(b);
  }
  modal.hidden = false;
  modal.onclick = (e) => e.target === modal && close();
  document.addEventListener("keydown", onKey);
  closeModal = close;
  row.querySelector(".primary, button")?.focus();
  return close;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// Native share sheet when there is one, otherwise copy the link.
export async function shareLink(url, title) {
  if (navigator.share) {
    try {
      await navigator.share({ url, title });
      return "shared";
    } catch (error) {
      if (error?.name === "AbortError") return "cancelled";
    }
  }
  return (await copyText(url)) ? "copied" : "failed";
}
