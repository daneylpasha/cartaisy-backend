import type { Application } from 'express';

export interface ExpectedRoute {
  method: string;
  path: string;
}

export const importantTsoaRoutes: ExpectedRoute[] = [
  { method: 'GET', path: '/api/v1/customer/search' },
  { method: 'GET', path: '/api/v1/products/:productId' },
  { method: 'POST', path: '/api/v1/cart/create' },
  { method: 'GET', path: '/api/v1/cart/:cartId' },
  { method: 'POST', path: '/api/v1/checkout/handoff' },
  { method: 'GET', path: '/api/v1/customer/favorites' },
];

const collectRoutes = (stack: any[] = [], mountedPath = ''): ExpectedRoute[] => {
  const routes: ExpectedRoute[] = [];

  for (const layer of stack) {
    if (layer.route?.path && layer.route?.methods) {
      routes.push(
        ...Object.keys(layer.route.methods).map((method) => ({
          method: method.toUpperCase(),
          path: `${mountedPath}${layer.route.path}`,
        }))
      );
    }

    if (layer.handle?.stack) {
      routes.push(...collectRoutes(layer.handle.stack, mountedPath));
    }
  }

  return routes;
};

export const getRegisteredExpressRoutes = (app: Application): ExpectedRoute[] => {
  return collectRoutes((app as any)._router?.stack);
};

export const assertTsoaRoutesMounted = (
  app: Application,
  expectedRoutes: ExpectedRoute[] = importantTsoaRoutes
): void => {
  const registeredRoutes = getRegisteredExpressRoutes(app);
  const missingRoutes = expectedRoutes.filter((expected) => {
    return !registeredRoutes.some((route) => route.method === expected.method && route.path === expected.path);
  });

  if (missingRoutes.length > 0) {
    throw new Error(
      `Generated TSOA routes did not mount: ${missingRoutes
        .map((route) => `${route.method} ${route.path}`)
        .join(', ')}`
    );
  }
};
