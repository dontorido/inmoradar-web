function normalizeResource(value) {
  return String(value || "").trim().replace(/^\/+|\/+$/g, "");
}

function normalizeMethod(value) {
  return String(value || "GET").trim().toUpperCase();
}

function normalizeMethods(route = {}) {
  const raw = route.methods || route.method || "GET";
  const values = Array.isArray(raw) ? raw : [raw];
  return values.map(normalizeMethod).filter(Boolean);
}

function normalizeRoute(route = {}) {
  const resource = normalizeResource(route.resource);
  if (!resource) throw new Error("admin_route_resource_required");
  if (typeof route.handler !== "function") throw new Error("admin_route_handler_required");
  return {
    ...route,
    resource,
    methods: normalizeMethods(route)
  };
}

function createAdminRouter(routes = []) {
  return routes.map(normalizeRoute);
}

function findAdminRoute(routes = [], { resource, method } = {}) {
  const requestedResource = normalizeResource(resource);
  if (!requestedResource) return null;
  const candidates = routes.filter((route) => route.resource === requestedResource);
  if (!candidates.length) return null;

  const requestedMethod = normalizeMethod(method);
  const route = candidates.find((candidate) => candidate.methods.includes(requestedMethod));
  if (!route) {
    return {
      status: 405,
      payload: { ok: false, error: "method_not_allowed" }
    };
  }

  return { route };
}

function normalizeHandlerResult(result, fallbackStatus = 200) {
  if (result && typeof result === "object" && "status" in result && "payload" in result) {
    return result;
  }
  return {
    status: fallbackStatus,
    payload: result
  };
}

async function dispatchAdminRoute(routes = [], context = {}) {
  const found = findAdminRoute(routes, {
    resource: context.resource,
    method: context.req?.method
  });
  if (!found) return null;
  if (!found.route) return found;

  const result = await found.route.handler(context);
  return normalizeHandlerResult(result, found.route.status || 200);
}

module.exports = {
  createAdminRouter,
  dispatchAdminRoute,
  findAdminRoute,
  normalizeMethod,
  normalizeResource
};
