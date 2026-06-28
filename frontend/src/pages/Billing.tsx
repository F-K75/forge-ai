import { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { api } from '../lib/api'
import { CreditCard, Check, Sparkles, Zap, BadgePercent, ShieldCheck, ExternalLink } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import clsx from 'clsx'

interface Plan {
  tier: string
  name: string
  price_monthly: number
  price_annual: number
  credits: number
  features: string[]
  max_projects: number
}

interface Subscription {
  id: string
  plan: string
  status: string
  current_period_end: string
  cancel_at_period_end: boolean
}

export default function Billing() {
  const { user, fetchMe } = useAuthStore()
  const queryClient = useQueryClient()
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('monthly')
  
  const { data: plans, isLoading: plansLoading, isError: plansError } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get('/billing/plans').then(r => r.data),
  })

  const { data: subscription, isLoading: subLoading, isError: subError } = useQuery({
    queryKey: ['subscription'],
    queryFn: () => api.get('/billing/subscription').then(r => r.data),
  })

  const startCheckout = useMutation({
    mutationFn: (data: { plan: string; interval: string }) => 
      api.post('/billing/checkout', { 
        plan: data.plan, 
        interval: billingInterval,
        success_url: window.location.origin + '/billing',
        cancel_url: window.location.origin + '/billing',
      }).then(r => r.data),
  })

  useEffect(() => {
    fetchMe()
  }, [fetchMe])

  const handleSelectPlan = (plan: Plan) => {
    if (plan.tier === 'free') return
    startCheckout.mutate({ plan: plan.tier, interval: billingInterval })
  }

  const getSavings = (plan: Plan) => {
    if (!plan.price_annual || !plan.price_monthly) return 0
    const monthlyTotal = plan.price_monthly * 12
    return Math.round(((monthlyTotal - plan.price_annual) / monthlyTotal) * 100)
  }

  if (plansLoading || subLoading) {
    return (
      <div className="min-h-screen bg-forge-bg text-forge-text p-6">
        <div className="max-w-5xl mx-auto">
          <div className="space-y-4" aria-label="Loading billing information">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-48 bg-forge-surface rounded-xl animate-pulse" aria-hidden="true" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (plansError || subError) {
    return (
      <div className="min-h-screen bg-forge-bg text-forge-text p-6 flex items-center justify-center">
        <div className="text-center" role="alert">
          <h3 className="text-xl font-semibold text-red-400 mb-2">Failed to load billing data</h3>
          <p className="text-forge-text-secondary mb-4">Something went wrong. Please try again.</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-violet-600 text-white rounded-xl hover:bg-violet-500 transition focus:outline-none focus:ring-2 focus:ring-violet-500"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-forge-bg text-forge-text p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Billing & Plans</h1>
          <p className="text-forge-text-secondary">Manage your subscription and credits</p>
        </div>

        <div className="bg-forge-surface border border-forge-border rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-forge-text-secondary">Current plan</div>
              <div className="text-2xl font-bold text-white capitalize flex items-center gap-2">
                {user?.plan || 'Free'}
                {(user?.plan || 'free') === 'free' && (
                  <span className="text-xs bg-forge-border px-2 py-0.5 rounded-full" aria-label="Starter plan">Starter</span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-forge-text-secondary">Credits available</div>
              <div className="text-2xl font-bold text-violet-400">{user?.credits ?? 0}</div>
            </div>
          </div>

          {subscription?.data?.subscription && (
            <div className="mt-4 pt-4 border-t border-forge-border">
              <div className="text-sm text-forge-text-secondary">
                Subscription status: <span className="capitalize text-white">{subscription.data.subscription.status}</span>
              </div>
              {subscription.data.subscription.cancel_at_period_end && (
                <div className="text-sm text-amber-400 mt-1">
                  Subscription will end at period end
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-4 mb-8" role="radiogroup" aria-label="Billing interval">
          <button
            type="button"
            onClick={() => setBillingInterval('monthly')}
            role="radio"
            aria-checked={billingInterval === 'monthly'}
            className={clsx(
              'px-6 py-2 rounded-lg text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-violet-500',
              billingInterval === 'monthly' 
                ? 'bg-violet-600 text-white' 
                : 'bg-forge-surface text-forge-text-secondary hover:bg-forge-border'
            )}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setBillingInterval('annual')}
            role="radio"
            aria-checked={billingInterval === 'annual'}
            className={clsx(
              'px-6 py-2 rounded-lg text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-violet-500',
              billingInterval === 'annual' 
                ? 'bg-violet-600 text-white' 
                : 'bg-forge-surface text-forge-text-secondary hover:bg-forge-border'
            )}
          >
            Annual
            <BadgePercent className="inline-block w-3 h-3 ml-1" aria-label="Saves 20%" />
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4 relative" role="list" aria-label="Available plans">
          {plans?.map((plan: Plan) => {
            const isCurrent = plan.tier === (user?.plan || 'free')
            const savings = getSavings(plan)
            const price = billingInterval === 'annual' ? plan.price_annual / 12 : plan.price_monthly
            
            return (
              <div
                key={plan.tier}
                role="listitem"
                className={clsx(
                  'rounded-xl border p-6 flex flex-col',
                  isCurrent
                    ? 'border-violet-500 bg-violet-500/10'
                    : 'border-forge-border bg-forge-surface'
                )}
              >
                {plan.tier === 'pro' && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-violet-600 text-white text-xs font-bold rounded-full" aria-label="Most popular plan">
                    Most Popular
                  </div>
                )}

                <div className="mb-4">
                  <h3 className="text-xl font-semibold text-white">{plan.name}</h3>
                  <div className="mt-2">
                    <span className="text-3xl font-bold text-white">${price}</span>
                    <span className="text-forge-text-secondary">/mo</span>
                  </div>
                  {billingInterval === 'annual' && plan.price_annual > 0 && (
                    <div className="text-xs text-emerald-400 mt-1">
                      ${plan.price_annual} billed annually ({savings}% savings)
                    </div>
                  )}
                </div>

                <div className="mb-4" aria-label={`${plan.credits} credits per month`}>
                  <span className="text-violet-400 font-medium">{plan.credits} credits</span>
                  <span className="text-forge-text-secondary"> / month</span>
                </div>

                <ul className="space-y-2 mb-6 flex-1" role="list">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
                      <span className="text-forge-text-secondary">{feature}</span>
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <div className="text-center py-2 px-4 bg-forge-bg border border-forge-border rounded-lg text-white font-medium" aria-label="Current plan">
                    Current plan
                  </div>
                ) : (
                  <button
                    onClick={() => handleSelectPlan(plan)}
                    disabled={startCheckout.isPending}
                    className="w-full py-2 px-4 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium rounded-lg transition focus:outline-none focus:ring-2 focus:ring-violet-500"
                    aria-disabled={startCheckout.isPending}
                  >
                    {startCheckout.isPending ? 'Processing...' : 'Select plan'}
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-12">
          <h2 className="text-xl font-semibold text-white mb-4">Frequently asked questions</h2>
          <div className="space-y-3" role="list">
            <details className="group" role="group" aria-labelledby="faq-1">
              <summary id="faq-1" className="cursor-pointer p-4 bg-forge-surface border border-forge-border rounded-xl text-white font-medium list-none focus:outline-none focus:ring-2 focus:ring-violet-500">
                How do credits work?
              </summary>
              <div className="p-4 text-sm text-forge-text-secondary">
                Credits are consumed during AI builds. Each build uses a variable amount based on complexity.
              </div>
            </details>
            <details className="group" role="group" aria-labelledby="faq-2">
              <summary id="faq-2" className="cursor-pointer p-4 bg-forge-surface border border-forge-border rounded-xl text-white font-medium list-none focus:outline-none focus:ring-2 focus:ring-violet-500">
                Can I change plans anytime?
              </summary>
              <div className="p-4 text-sm text-forge-text-secondary">
                Yes, you can upgrade or downgrade at any time. Changes take effect immediately.
              </div>
            </details>
          </div>

          <h2 className="text-xl font-semibold text-white mt-8 mb-4">Buy credits</h2>
          <div className="grid gap-4 md:grid-cols-4" role="list" aria-label="Credit packages">
            {[100, 500, 1000, 5000].map(credits => (
              <button
                key={credits}
                onClick={() => api.post('/billing/credits/purchase', { package_id: `credits_${credits}` })}
                className="p-4 border border-forge-border rounded-xl hover:bg-forge-surface transition focus:outline-none focus:ring-2 focus:ring-violet-500"
                aria-label={`Purchase ${credits} credits for $${credits / 10}`}
              >
                <div className="text-2xl font-bold text-white">{credits} credits</div>
                <div className="text-forge-text-secondary">${credits / 10} USD</div>
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-forge-border">
          <a 
            href="https://billing.stripe.com/p/login/test_14k47k" 
            className="inline-flex items-center gap-2 text-sm text-violet-400 hover:text-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-500 rounded"
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink className="w-4 h-4" aria-hidden="true" />
            Manage subscription in Stripe portal
          </a>
        </div>
      </div>
    </div>
  )
}