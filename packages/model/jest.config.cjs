const { packageJest } = require("../../jest.preset.cjs");

const config = packageJest("model", __dirname);
delete config.moduleNameMapper["^@sw3d/model$"];
module.exports = config;
