const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const port = Number(process.argv[2] || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

const rewrites = {
  "/sitemap.xml": "/api/sitemap",
  "/api/news": "/api/sitemap?format=news",
  "/api/lemonsqueezy-portal": "/api/lemonsqueezy-checkout?resource=portal",
  "/api/extension-usage": "/api/extension-version?resource=usage",
  "/api/status": "/api/health?resource=status",
  "/api/status/": "/api/health?resource=status",
  "/api": "/api/health",
  "/api/": "/api/health",
  "/api/contact": "/api/market-price?resource=contact",
  "/api/waitlist/browser": "/api/market-price?resource=browser-waitlist",
  "/api/analytics/event": "/api/market-price?resource=owned-analytics-event",
  "/api/saved-properties/email-report": "/api/check-premium?resource=saved-properties-email-report",
  "/api/saved-properties/report": "/api/check-premium?resource=saved-properties-report",
  "/api/admin/summary": "/api/admin?resource=summary",
  "/api/admin/premium/subscriptions": "/api/admin?resource=premium/subscriptions",
  "/api/admin/seo/landings": "/api/admin?resource=seo/landings",
  "/api/admin/seo/generate-landings": "/api/admin?resource=seo/generate-landings",
  "/api/admin/seo-autogenerate/run": "/api/admin?resource=seo-autogenerate/run",
  "/api/admin/kpis/settings": "/api/admin?resource=kpis/settings",
  "/api/admin/parking/summary": "/api/admin?resource=parking/summary",
  "/api/admin/viraliza": "/api/admin?resource=viraliza",
  "/api/admin/linkedin": "/api/admin?resource=linkedin",
  "/api/admin/linkedin/connect": "/api/admin?resource=linkedin/connect",
  "/api/admin/linkedin/callback": "/api/admin?resource=linkedin/callback",
  "/api/admin/linkedin/disconnect": "/api/admin?resource=linkedin/disconnect",
  "/api/admin/linkedin/test-connection": "/api/admin?resource=linkedin/test-connection",
  "/api/admin/linkedin/settings": "/api/admin?resource=linkedin/settings",
  "/api/admin/linkedin/posts": "/api/admin?resource=linkedin/posts",
  "/api/admin/linkedin/autopublisher/run": "/api/admin?resource=linkedin/autopublisher/run",
  "/api/admin/meta": "/api/admin?resource=meta",
  "/api/admin/meta/connect": "/api/admin?resource=meta/connect",
  "/api/admin/meta/callback": "/api/admin?resource=meta/callback",
  "/api/admin/meta/disconnect": "/api/admin?resource=meta/disconnect",
  "/api/admin/meta/pages": "/api/admin?resource=meta/pages",
  "/api/admin/meta/test-connection": "/api/admin?resource=meta/test-connection",
  "/api/admin/meta/settings": "/api/admin?resource=meta/settings",
  "/api/admin/meta/posts": "/api/admin?resource=meta/posts",
  "/api/admin/meta/autopublisher/run": "/api/admin?resource=meta/autopublisher/run",
  "/api/address-intelligence": "/api/market-price?resource=address-intelligence",
  "/api/property-assessment": "/api/market-price?resource=property-assessment",
  "/api/parking-assessment": "/api/market-price?resource=parking-assessment",
  "/api/kpi-settings": "/api/market-price?resource=kpi-settings",
  "/api/photo-condition-analysis": "/api/market-price?resource=photo-condition-analysis",
  "/admin": "/admin.html",
  "/backoffice/marketing/viraliza": "/admin.html",
  "/backoffice/marketing/linkedin": "/admin.html",
  "/backoffice/marketing/meta": "/admin.html",
  "/saber-si-piso-esta-caro": "/saber-si-piso-esta-caro.html",
  "/saber-si-piso-esta-caro/": "/saber-si-piso-esta-caro.html",
  "/que-analiza": "/que-analiza.html",
  "/datos": "/datos.html",
  "/metodologia": "/metodologia.html",
  "/premium": "/premium.html",
  "/clientes": "/clientes.html",
  "/inmuebles-guardados": "/inmuebles-guardados.html",
  "/noticias": "/noticias.html",
  "/faq": "/faq.html",
  "/contacto": "/contacto.html",
  "/status": "/status.html",
  "/status/": "/status.html",
  "/privacidad": "/privacidad.html",
  "/terminos": "/terminos.html",
  "/success": "/success.html",
  "/cancel": "/cancel.html"
};

function routeDynamic(pathname) {
  const article = pathname.match(/^\/noticias\/([^/]+)\/?$/);
  if (article) {
    return `/article.html?slug=${encodeURIComponent(article[1])}`;
  }
  const seoCity = pathname.match(/^\/(precio-metro-cuadrado|precio-alquiler|saber-si-piso-esta-caro|guias)\/([^/]+)\/?$/);
  if (seoCity) {
    return `/api/seo-page?slug=${seoCity[1]}/${encodeURIComponent(seoCity[2])}`;
  }
  return rewrites[pathname] || pathname;
}

function runApiHandler(apiRoute, req, res) {
  const routeOnly = apiRoute.split("?")[0];
  const functionPath = path.normalize(path.join(root, `${routeOnly}.js`));
  if (!functionPath.startsWith(path.join(root, "api"))) {
    res.writeHead(403);
    res.end("Forbidden");
    return true;
  }
  if (!fs.existsSync(functionPath)) return false;
  req.url = apiRoute;
  delete require.cache[require.resolve(functionPath)];
  const handler = require(functionPath);
  handler(req, res);
  return true;
}

http.createServer((req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host}`);
  const routeBase = routeDynamic(parsed.pathname);
  const route = routeBase.startsWith("/api/") && !routeBase.includes("?") ? `${routeBase}${parsed.search}` : routeBase;
  if (route.startsWith("/api/") && runApiHandler(route, req, res)) return;

  const relative = route === "/" ? "/index.html" : route;
  const filePath = path.normalize(path.join(root, relative));

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, body) => {
    if (error) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "content-type": types[path.extname(filePath)] || "application/octet-stream" });
    res.end(body);
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`InmoRadar web: http://127.0.0.1:${port}`);
});
