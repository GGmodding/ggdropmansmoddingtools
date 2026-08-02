(() => {
  "use strict";

  const PAYPAL = "https://paypal.me/kd19902";
  const DISCORD = "https://discord.gg/PTwyDTFyR";

  function makeLink({ id, href, title, text, style }) {
    const a = document.createElement("a");
    a.id = id;
    a.className = "btn";
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.title = title;
    a.textContent = text;
    a.style.cssText = style;
    return a;
  }

  function inject() {
    const actions =
      document.querySelector(".topbar__actions") ||
      document.querySelector("header .topbar") ||
      document.querySelector("header");
    if (!actions) return;

    const dirty = document.getElementById("dirty-pill");
    const insert = (el) => {
      if (dirty && dirty.parentNode === actions) actions.insertBefore(el, dirty);
      else actions.appendChild(el);
    };

    if (!document.getElementById("gg-discord-link")) {
      insert(
        makeLink({
          id: "gg-discord-link",
          href: DISCORD,
          title: "Join the GGdropman Discord",
          text: "Discord",
          style:
            "border-color:rgba(88,101,242,0.7);color:#c5caff;text-decoration:none;display:inline-flex;align-items:center;",
        })
      );
    }

    if (!document.getElementById("gg-donate-link")) {
      insert(
        makeLink({
          id: "gg-donate-link",
          href: PAYPAL,
          title: "Support GGdropman via PayPal",
          text: "Donate",
          style:
            "border-color:rgba(240,193,74,0.65);color:#f5e6b8;text-decoration:none;display:inline-flex;align-items:center;",
        })
      );
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", inject);
  } else {
    inject();
  }

  window.GGDonate = { PAYPAL, DISCORD, inject };
})();
