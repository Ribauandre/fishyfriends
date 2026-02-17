const fs = require('fs');
const path = require('path');

const buildDir = path.join(process.cwd(), 'build');
const docsDir = path.join(process.cwd(), 'docs');

async function rmDir(dir) {
  try {
    await fs.promises.rm(dir, { recursive: true, force: true });
  } catch (e) {
    // ignore
  }
}

async function copyDir(src, dest) {
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fs.promises.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else if (entry.isSymbolicLink()) {
      const realPath = await fs.promises.readlink(srcPath);
      await fs.promises.symlink(realPath, destPath);
    } else {
      await fs.promises.copyFile(srcPath, destPath);
    }
  }
}

(async () => {
  try {
    const buildStat = await fs.promises.stat(buildDir).catch(() => null);
    if (!buildStat || !buildStat.isDirectory()) {
      console.error('Build directory not found. Run `npm run build` first.');
      process.exit(1);
    }

    console.log('Removing existing docs/ ...');
    await rmDir(docsDir);
    console.log('Copying build/ -> docs/ ...');
    await copyDir(buildDir, docsDir);
    console.log('Done. build/ contents copied to docs/');
  } catch (err) {
    console.error('Error moving build to docs:', err);
    process.exit(1);
  }
})();
