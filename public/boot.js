// Runs before the app, from its own file: the page's Content-Security-Policy allows no
// inline script (that is the point of it), so what used to sit in a <script> block in
// index.html lives here.
(function () {
  // 1. Never run inside someone else's page. Framed invisibly over a decoy, the app's
  //    buttons (remove, approve, pay) could be clicked by someone who thinks they are
  //    clicking something else. A response header is the proper tool (X-Frame-Options, or
  //    CSP frame-ancestors), but GitHub Pages can't send headers and browsers ignore
  //    frame-ancestors in a <meta>. So: break out if allowed, and show nothing if not.
  if (window.top !== window.self) {
    document.documentElement.style.display = 'none';
    try { window.top.location = window.self.location.href; } catch (error) { /* another origin's frame: stay hidden */ }
    return;
  }

  // 2. Restore the address GitHub Pages' 404.html stashed before sending a deep link to
  //    index.html (a static host knows no route but "/").
  var redirect = sessionStorage.redirect;
  delete sessionStorage.redirect;
  if (redirect && redirect !== window.location.pathname + window.location.search + window.location.hash) {
    window.history.replaceState(null, null, redirect);
  }
})();
