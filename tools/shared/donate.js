(() => {
  "use strict";

  const PAYPAL = "https://paypal.me/kd19902";

  function inject() {
    if (document.getElementById("gg-donate-link")) return;
    const actions =
      document.querySelector(".topbar__actions") ||
      document.querySelector("header .topbar") ||
      document.querySelector("header");
    if (!actions) return;

    const a = document.createElement("a");
    a.id = "gg-donate-link";
    a.className = "btn gg-donate-btn";
    a.href = PAYPAL;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.title = "Support GGdropman via PayPal";
    a.textContent = "Donate";
    a.style.cssText =
      "border-color:rgba(240,193,74,0.65);color:#f5e6b8;text-decoration:none;display:inline-flex;align-items:center;";

    // Prefer after brand actions, before end of bar
    const dirty = document.getElementById("dirty-pill");
    if (dirty && dirty.parentNode === actions) {
      actions.insertBefore(a, dirty);
    } else {
      actions.appendChild(a);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inject);
  } else {
    inject();
  }

  window.GGDonate = { PAYPAL, inject };
})();
