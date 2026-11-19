import { render, screen, within } from '@testing-library/react'
import { createInstance } from 'i18next'
import type { ComponentType } from 'react'
import { I18nextProvider } from 'react-i18next'
import { afterEach, describe, expect, it, vi } from 'vitest'
import enApp from '@/locales/en/app.json'
import zhApp from '@/locales/zh/app.json'

const pack = {
  id: 'demo pack/#1',
  title: 'Demo Exam Pack',
  exam: 'Demo Exam',
  source_lang: 'en',
  ui_lang: 'en',
}
const math = { id: 'math + lab&unit=1', title: 'Math', title_source: 'Math' }
const science = { id: 'science/lab', title: 'Science', title_source: 'Science' }
const start = '2031-03-17T14:35:00+02:00'
const examDate = '2031-04-25'
// A variable specifier defers Vite's resolution until the skipped test runs.
const examsHomePath = '../../features/exam-prep/components/ExamsHome'

function mockPackList(
  subjects: Array<
    typeof math & {
      next_session?: string | null
      progress?: { done: number; total: number }
      exam_date?: string
    }
  >
) {
  const requests = vi.fn(async (input: string, init?: RequestInit) => {
    const path = new URL(input, window.location.origin).pathname
    if (path === '/api/exam-packs' && (init?.method ?? 'GET') === 'GET') {
      return Response.json([{ ...pack, subjects }])
    }
    return Response.json({}, { status: 404 })
  })
  vi.stubGlobal('fetch', requests)
  return requests
}

async function renderHome(ExamsHome: ComponentType, locale: 'en' | 'zh' = 'en') {
  const i18n = createInstance()
  await i18n.init({
    lng: locale,
    fallbackLng: 'en',
    resources: { en: { app: enApp }, zh: { app: zhApp } },
    defaultNS: 'app',
    keySeparator: false,
    nsSeparator: false,
  })
  render(
    <I18nextProvider i18n={i18n}>
      <ExamsHome />
    </I18nextProvider>
  )
  return within(await screen.findByRole('article', { name: pack.title }))
}

describe.skip('S2 study plan links and next sessions KITCHEN-PENDING #65', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    window.history.replaceState(null, '', '/')
  })

  it('links each subject to its own plan in the active workspace and keeps Continue on S3', async () => {
    window.history.replaceState(null, '', '/learning/exams?dt_workspace=study+room')
    mockPackList([math, science])
    const { ExamsHome }: typeof import('@/features/exam-prep/components/ExamsHome') = await import(
      /* @vite-ignore */ examsHomePath
    )
    const card = await renderHome(ExamsHome)

    const subjects = card.getAllByRole('listitem')
    expect(subjects).toHaveLength(2)
    for (const [index, subject] of [math, science].entries()) {
      const row = within(subjects[index])
      const plan = row.getByRole('link', { name: /^Plan\b/ })
      expect(plan).toBeVisible()
      expect(plan.tabIndex).toBeGreaterThanOrEqual(0)

      const target = new URL(plan.getAttribute('href') ?? '', window.location.origin)
      expect(target.pathname).toBe('/learning/exams/demo%20pack%2F%231/plan')
      expect(target.searchParams.getAll('subject')).toEqual([subject.id])
      expect(target.searchParams.get('dt_workspace')).toBe('study room')

      const continueLink = row.getByRole('link', {
        name: `Continue ${subject.title}`,
      })
      expect(
        new URL(continueLink.getAttribute('href') ?? '', window.location.origin).pathname
      ).toBe(`/learning/exams/demo%20pack%2F%231/${encodeURIComponent(subject.id)}`)
    }
  })

  it.each(['en', 'zh'] as const)(
    'renders a localized date and time from the pack list in %s',
    async locale => {
      const requests = mockPackList([{ ...math, next_session: start }])
      const { ExamsHome }: typeof import('@/features/exam-prep/components/ExamsHome') =
        await import(/* @vite-ignore */ examsHomePath)
      const card = await renderHome(ExamsHome, locale)

      expect(
        card.getByRole('link', {
          name: locale === 'zh' ? /^规划/ : /^Plan\b/,
        })
      ).toBeVisible()
      expect(card.getByText(/^Next session\b/)).toBeVisible()
      const time = card.getByRole('time')
      const dateTime = time.getAttribute('datetime')
      expect(dateTime).toBeTruthy()
      expect(Date.parse(dateTime ?? '')).toBe(Date.parse(start))
      const instant = new Date(start)
      expect(time).toHaveTextContent(
        new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(instant)
      )
      expect(time).toHaveTextContent(
        new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(instant)
      )
      expect(requests).toHaveBeenCalledTimes(1)
    }
  )

  it.each([
    { label: 'absent', fields: {} },
    { label: 'null', fields: { next_session: null } },
    { label: 'invalid', fields: { next_session: 'not-a-date' } },
  ])('omits an $label session and keeps progress and the exam date usable', async ({ fields }) => {
    mockPackList([
      {
        ...math,
        ...fields,
        progress: { done: 1, total: 4 },
        exam_date: examDate,
      },
    ])
    const { ExamsHome }: typeof import('@/features/exam-prep/components/ExamsHome') = await import(
      /* @vite-ignore */ examsHomePath
    )
    const card = await renderHome(ExamsHome)

    expect(card.queryByText(/^Next session\b/)).not.toBeInTheDocument()
    expect(card.getByRole('link', { name: /^Plan\b/ })).toBeVisible()
    expect(card.getByRole('progressbar', { name: 'Progress' })).toHaveAttribute(
      'aria-valuetext',
      '1 / 4'
    )
    const times = card.getAllByRole('time')
    expect(times).toHaveLength(1)
    expect(times[0]).toHaveAttribute('datetime', examDate)
    expect(times[0]).toHaveTextContent('Apr 25, 2031')
  })
})
