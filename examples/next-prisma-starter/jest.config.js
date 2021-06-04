module.exports = {
  verbose: true,
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  modulePathIgnorePatterns: ['<rootDir>/playwright/'],
  moduleDirectories: ['node_modules', 'src'],
};
