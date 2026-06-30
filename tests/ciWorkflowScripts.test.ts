import fs from 'fs';
import path from 'path';

describe('CI workflow scripts', () => {
  it('only references package.json scripts that exist', () => {
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'ci.yml');

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const workflow = fs.readFileSync(workflowPath, 'utf8');
    const scripts = packageJson.scripts ?? {};
    const referencedScripts = Array.from(workflow.matchAll(/\bnpm run ([\w:-]+)/g), (match) => match[1]);
    const missingScripts = referencedScripts.filter((scriptName) => !scripts[scriptName]);

    expect(missingScripts).toEqual([]);
  });
});
