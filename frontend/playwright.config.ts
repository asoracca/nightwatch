import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests/e2e',timeout:900000,use:{baseURL:process.env.TEST_FRONTEND_URL||'http://localhost:3000'},workers:1});
