import {test,expect} from '@playwright/test';
import path from 'node:path';
test('real upload → YOLO/ByteTrack → saved results → browser',async({page})=>{
  test.skip(!process.env.TEST_VIDEO_PATH||!process.env.TEST_USER_A_EMAIL||!process.env.TEST_USER_A_PASSWORD,'Requires a real clip, running API/worker/Supabase and a dedicated test user.');
  await page.goto('/');
  await page.getByLabel('Email',{exact:true}).fill(process.env.TEST_USER_A_EMAIL!);
  await page.getByLabel('Password',{exact:true}).fill(process.env.TEST_USER_A_PASSWORD!);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByLabel('Real video',{exact:true}).setInputFiles(process.env.TEST_VIDEO_PATH!);
  await page.getByRole('button',{name:'Upload & evaluate',exact:true}).click();
  await expect(page.getByRole('heading',{name:path.basename(process.env.TEST_VIDEO_PATH!)})).toBeVisible({timeout:180000});
  await expect(page.getByRole('heading',{name:'Investigation',exact:true})).toBeVisible({timeout:850000});
  await expect(page.getByAltText(/Sample/)).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await page.getByRole('button',{name:'Explain verified results'}).click();
  await expect(page.getByText('Evidence-only report with citations')).toBeVisible();
});
