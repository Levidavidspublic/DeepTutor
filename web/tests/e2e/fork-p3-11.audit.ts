import { expect, test } from '@playwright/test'
import { sourceModuleInventory } from './fixtures/modules'

const start = '2031-03-17T14:35:00Z'
const pack = {
  id: 'demo pack #1',
  title: 'Demo Exam Pack',
  exam: 'Demo Exam',
  source_lang: 'en',
  ui_lang: 'en',
  subjects: [
    { id: 'math+lab&unit=1', title: 'Math', title_source: 'Math', next_session: start },
    {
      id: 'science',
      title: 'Science',
      title_source: 'Science',
      progress: { done: 1, total: 4 },
      exam_date: '2031-04-25',
      next_session: null,
    },
  ],
}

test.describe.skip("S2 links to a subject's study plan KITCHEN-PENDING #65", () => {
  test.use({ locale: 'en-US', timezoneId: 'UTC', serviceWorkers: 'block' })

  test('shows the next session and opens the right plan with the keyboard', async ({ page }) => {
    const ui = { language: 'en', response_language: 'en', theme: 'light' }
    await page.route('**/api/**', async route => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      if (request.method() === 'GET') {
        if (path === '/api/auth/status') {
          return route.fulfill({ json: { enabled: false, authenticated: true, is_admin: true } })
        }
        if (path === '/api/modules') return route.fulfill({ json: sourceModuleInventory })
        if (path === '/api/settings' || path === '/api/settings/ui') {
          return route.fulfill({ json: { ...ui, ui } })
        }
        if (path === '/api/exam-packs') return route.fulfill({ json: [pack] })
      }
      return route.fulfill({ status: 404, json: {} })
    })
    await page.routeWebSocket('**/ws**', socket => socket.close())

    await page.goto('/learning/exams?dt_workspace=study+room')
    const card = page.getByRole('article', { name: pack.title })
    const math = card.getByRole('listitem').filter({
      has: page.getByRole('link', { name: 'Continue Math', exact: true }),
    })
    const science = card.getByRole('listitem').filter({
      has: page.getByRole('link', { name: 'Continue Science', exact: true }),
    })
    await expect(math.getByText(/^Next session\b/)).toBeVisible()
    const sessionTime = math.getByRole('time')
    await expect(sessionTime).toHaveAttribute('datetime', /.+/)
    expect(Date.parse((await sessionTime.getAttribute('datetime')) ?? '')).toBe(Date.parse(start))
    await expect(sessionTime).toContainText('Mar 17, 2031')
    await expect(sessionTime).toContainText('2:35 PM')
    await expect(science.getByText(/^Next session\b/)).toHaveCount(0)
    await expect(science.getByRole('progressbar', { name: 'Progress' })).toHaveAttribute(
      'aria-valuetext',
      '1 / 4'
    )
    await expect(science.getByRole('time')).toHaveAttribute('datetime', '2031-04-25')
    await expect(science.getByRole('link', { name: /^Plan\b/ })).toBeVisible()

    const plan = math.getByRole('link', { name: /^Plan\b/ })
    expect(await plan.evaluate(link => link.tabIndex)).toBeGreaterThanOrEqual(0)
    await plan.focus()
    await expect(plan).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(
      url =>
        url.pathname === '/learning/exams/demo%20pack%20%231/plan' &&
        url.searchParams.get('subject') === pack.subjects[0].id &&
        url.searchParams.get('dt_workspace') === 'study room'
    )
  })
})
