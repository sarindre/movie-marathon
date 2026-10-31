// "Get the app" section: PWA install prompt + desktop download links.
// Hidden inside the packaged desktop/mobile apps, which are already installed.
(function () {
  const section = document.getElementById("get-app");
  const inShell = /Electron/i.test(navigator.userAgent) || window.Capacitor || location.protocol === "file:";
  if (inShell) return;
  section.hidden = false;

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

  // Install as an app (Chrome/Edge/Android).
  let deferred;
  const btn = document.getElementById("install-btn");
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    btn.hidden = false;
  });
  btn.onclick = async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    btn.hidden = true;
  };
  window.addEventListener("appinstalled", () => { btn.hidden = true; });

  // iOS Safari has no install prompt; show manual steps.
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.navigator.standalone;
  document.getElementById("ios-tip").hidden = !ios;

  // Only offer downloads that actually exist on this server.
  for (const a of document.querySelectorAll("a[data-download]")) {
    fetch(a.getAttribute("href"), { method: "HEAD" }).then((r) => { a.hidden = !r.ok; }).catch(() => {});
  }
})();
