import express from 'express';
import { RegisterRoutes } from '../src/generated/routes';
import {
  assertTsoaRoutesMounted,
  getRegisteredExpressRoutes,
  importantTsoaRoutes,
} from '../src/utils/tsoaRouteReadiness';

describe('generated TSOA route registration', () => {
  it('mounts important spec-declared mobile routes', () => {
    const app = express();

    RegisterRoutes(app);

    expect(() => assertTsoaRoutesMounted(app)).not.toThrow();

    const registeredRoutes = getRegisteredExpressRoutes(app);
    for (const expectedRoute of importantTsoaRoutes) {
      expect(registeredRoutes).toContainEqual(expectedRoute);
    }
  });

  it('throws when important generated routes are missing', () => {
    const app = express();

    expect(() => assertTsoaRoutesMounted(app)).toThrow(
      'Generated TSOA routes did not mount: GET /api/v1/customer/search'
    );
  });
});
