const { packageJest } = require("../../jest.preset.cjs");

const config = packageJest("analyze", __dirname);
config.moduleNameMapper = {
  ...config.moduleNameMapper,
  "^@sw3d/compose$": `${__dirname}/../compose/src/index.ts`,
  "^@sw3d/layout$": `${__dirname}/../layout/src/index.ts`,
  "^@sw3d/parser-typescript$": `${__dirname}/../parser-typescript/src/index.ts`,
};
// Fixture package.json files include intentional invalid JSON. Jest's haste map
// parses every package.json under rootDir and aborts on bad-pkg/package.json.
config.modulePathIgnorePatterns = ["<rootDir>/fixtures"];
module.exports = config;
