import { expect, test } from '@playwright/test'
import path from 'node:path'

// Full acceptance flow against real services: real upload → API → worker (YOLO11n/ByteTrack) → stored results → browser.
test('real upload → YOLO/ByteTrack → saved results → browser', async ({ page }) => {
  test.skip(
    !process.env.TEST_VIDEO_PATH || !process.env.TEST_USER_A_EMAIL || !process.env.TEST_USER_A_PASSWORD,
    'Requires a real clip, running API/worker/Supabase and a dedicated test user.',
  )
  const videoPath = process.env.TEST_VIDEO_PATH!
  const title = path.basename(videoPath).replace(/\.[^.]+$/, '')

  await page.goto('/')
  await page.getByLabel('Email', { exact: true }).fill(process.env.TEST_USER_A_EMAIL!)
  await page.getByLabel('Password', { exact: true }).fill(process.env.TEST_USER_A_PASSWORD!)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()

  await page.goto('/data-vault')
  await page.getByRole('button', { name: 'Upload footage' }).first().click()
  await page.getByLabel('Choose video files').setInputFiles(videoPath)
  await page.getByRole('button', { name: /Upload & analyze/ }).click()
  await expect(page.getByRole('status').filter({ hasText: /verified/ })).toBeVisible({ timeout: 180_000 })

  await page.getByRole('button', { name: `View details for ${title}` }).first().click()
  await page.getByRole('button', { name: /Investigate footage/ }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()

  // Wait for the worker to finish; the stored investigation then appears.
  await expect(page.getByText('Accepted observations').first()).toBeVisible({ timeout: 850_000 })
  await expect(page.getByAltText(/Sample \d+/)).toBeVisible()
  await expect(page.getByRole('table')).toBeVisible()
  await page.getByRole('button', { name: 'Summary', exact: true }).click()
  await expect(page.getByText('Deterministic and evidence-only', { exact: false })).toBeVisible()
})
