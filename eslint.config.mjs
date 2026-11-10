import next from "eslint-config-next/core-web-vitals";
const config = [
  ...next,
  { ignores: [".next/**", "playwright-report/**", "test-results/**"] },
];
export default config;
