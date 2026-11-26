import { describe, expect, it } from 'vitest'
import { connectorEnv } from '../src/main/engines'

describe('connectorEnv', () => {
  it('maps saved keys to the variables their SDKs read and skips empty ones', () => {
    expect(connectorEnv({ resendKey: ' re_1 ', posthogKey: '', posthogHost: 'https://app.posthog.com', sentryDsn: '', firecrawlKey: 'fc-2', stripeKey: '' }))
      .toEqual({ RESEND_API_KEY: 're_1', FIRECRAWL_API_KEY: 'fc-2' })
  })

  it('sends the PostHog host only with a PostHog key', () => {
    expect(connectorEnv({ resendKey: '', posthogKey: 'phc_3', posthogHost: 'https://eu.posthog.com', sentryDsn: '', firecrawlKey: '', stripeKey: '' }))
      .toEqual({ POSTHOG_API_KEY: 'phc_3', POSTHOG_HOST: 'https://eu.posthog.com' })
  })
})
