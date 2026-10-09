/** @type {(displayName: string, rootDir: string) => import('jest').Config} */
function packageJest(displayName, rootDir) {
  return {
    displayName,
    rootDir,
    testEnvironment: "node",
    extensionsToTreatAsEsm: [".ts"],
    transform: {
      "^.+\\.ts$": [
        "ts-jest",
        {
          useESM: true,
          tsconfig: `${rootDir}/tsconfig.spec.json`,
        },
      ],
    },
    moduleNameMapper: {
      "^(\\.{1,2}/.*)\\.js$": "$1",
      "^@sw3d/model$": `${rootDir}/../model/src/index.ts`,
    },
  };
}

module.exports = { packageJest };
