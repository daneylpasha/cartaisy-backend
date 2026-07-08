import fs from 'fs';
import path from 'path';

describe('CI workflow scripts', () => {
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'ci.yml');

  it('only references package.json scripts that exist', () => {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const workflow = fs.readFileSync(workflowPath, 'utf8');
    const scripts = packageJson.scripts ?? {};
    const referencedScripts = Array.from(workflow.matchAll(/\bnpm run ([\w:-]+)/g), (match) => match[1]);
    const missingScripts = referencedScripts.filter((scriptName) => !scripts[scriptName]);

    expect(missingScripts).toEqual([]);
  });

  it('runs the required backend checks in CI', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8');

    expect(workflow).toMatch(/\bnpm run type-check\b/);
    expect(workflow).toMatch(/\bnpm test\b/);
    expect(workflow).toMatch(/\bnpm run build\b/);
    expect(workflow).toContain('--testPathIgnorePatterns tests/shopify.integration.test.ts');
  });

  it('does not use unsupported expressions in service image fields', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8');

    expect(workflow).toContain('image: mongo:7.0');
    expect(workflow).toContain('image: redis:7-alpine');
    expect(workflow).not.toMatch(/image:\s+[^\n]*\$\{\{\s*env\./);
  });

  it('loads the Docker build output before the smoke test runs it', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8');

    expect(workflow).toMatch(/uses:\s+docker\/build-push-action@v7[\s\S]*push:\s+false[\s\S]*load:\s+true[\s\S]*tags:\s+cartaisy\/backend:test/);
  });

  it('uses current maintained action majors instead of retired ones', () => {
    const workflow = fs.readFileSync(workflowPath, 'utf8');

    [
      'actions/checkout@v7',
      'actions/setup-node@v6',
      'actions/upload-artifact@v7',
      'github/codeql-action/upload-sarif@v4',
      'codecov/codecov-action@v7',
      'docker/setup-buildx-action@v4',
      'docker/build-push-action@v7',
      'gitleaks/gitleaks-action@v3',
    ].forEach((actionRef) => {
      expect(workflow).toContain(actionRef);
    });

    [
      'actions/checkout@v4',
      'actions/setup-node@v4',
      'actions/upload-artifact@v3',
      'actions/upload-artifact@v4',
      'github/codeql-action/upload-sarif@v2',
      'github/codeql-action/upload-sarif@v3',
      'codecov/codecov-action@v3',
      'docker/setup-buildx-action@v3',
      'docker/build-push-action@v5',
      'gitleaks/gitleaks-action@v2',
    ].forEach((actionRef) => {
      expect(workflow).not.toContain(actionRef);
    });
  });
});
