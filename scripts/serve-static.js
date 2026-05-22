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
  "/api": "/api/health",
  "/api/": "/api/health",
  "/api/contact": "/api/market-price?resource=contact",
  "/api/waitlist/browser": "/api/market-price?resource=browser-waitlist",
  "/api/admin/summary": "/api/admin?resource=summary",
  "/api/admin/premium/subscriptions": "/api/admin?resource=premium/subscriptions",
  "/api/admin/seo/landings": "/api/admin?resource=seo/landings",
  "/api/admin/seo/generate-landings": "/api/admin?resource=seo/generate-landings",
  "/api/admin/viraliza": "/api/admin?resource=viraliza",
  "/api/address-intelligence": "/api/market-price?resource=address-intelligence",
  "/api/property-assessment": "/api/market-price?resource=property-assessment",
  "/api/photo-condition-analysis": "/api/market-price?resource=photo-condition-analysis",
  "/admin": "/admin.html",
  "/backoffice/marketing/viraliza": "/admin.html",
  "/que-analiza": "/que-analiza.html",
  "/datos": "/datos.html",
  "/premium": "/premium.html",
  "/noticias": "/noticias.html",
  "/faq": "/faq.html",
  "/contacto": "/contacto.html",
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
  const seoCity = pathname.match(/^\/(precio-metro-cuadrado|precio-alquiler|saber-si-piso-esta-caro)\/([^/]+)\/?$/);
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
