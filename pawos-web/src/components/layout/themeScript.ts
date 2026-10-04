/** localStorage key holding the visitor's light / dark choice. */
export const THEME_STORAGE_KEY = "pawos-theme";

/**
 * Runs in <head> before first paint: applies a saved choice as <html data-theme>, so the page never
 * flashes the other theme. Kept tiny and dependency-free. (Plain module, not "use client", so the
 * server layout can inline it.)
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;
