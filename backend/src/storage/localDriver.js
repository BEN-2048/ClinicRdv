const fs = require('fs');
const path = require('path');

const KEY_PATTERN = /^documents\/[0-9a-f-]{36}$/;

const createLocalDriver = (rootDir) => {
  const resolve = (key) => {
    if (!KEY_PATTERN.test(key)) throw new Error('Clé de stockage invalide');
    return path.join(rootDir, ...key.split('/'));
  };

  return {
    name: 'local',
    async put(key, buffer) {
      const target = resolve(key);
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.writeFile(target, buffer, { flag: 'wx', mode: 0o600 });
    },
    async read(key) {
      return fs.promises.readFile(resolve(key));
    },
    async remove(key) {
      await fs.promises.unlink(resolve(key));
    },
  };
};

module.exports = { createLocalDriver, KEY_PATTERN };
