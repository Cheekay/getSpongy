'use client'

import { useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { markRsvpPaid } from '@/lib/actions/checkout'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '')

type PaymentFormInnerProps = {
  clientSecret: string
  rsvpId: string
  onSuccess: (qrJwt: string) => void
  onError: (msg: string) => void
}

function PaymentFormInner({ clientSecret, rsvpId, onSuccess, onError }: PaymentFormInnerProps) {
  const stripeInstance = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripeInstance || !elements) return
    setLoading(true)

    const card = elements.getElement(CardElement)
    if (!card) { setLoading(false); return }

    const { error, paymentIntent } = await stripeInstance.confirmCardPayment(clientSecret, {
      payment_method: { card },
    })

    if (error) {
      onError(error.message ?? 'Payment failed')
      setLoading(false)
      return
    }

    if (paymentIntent?.status === 'succeeded') {
      const result = await markRsvpPaid({ rsvpId, paymentIntentId: paymentIntent.id })
      if (result.error) { onError(result.error); setLoading(false); return }
      onSuccess(result.qrJwt!)
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="bg-surface-container-highest rounded-xl px-4 py-4">
        <CardElement
          options={{
            style: {
              base: { color: '#f8f5fd', fontSize: '16px', '::placeholder': { color: '#acaab1' } },
              invalid: { color: '#f87171' },
            },
          }}
        />
      </div>
      <button
        type="submit"
        disabled={!stripeInstance || loading}
        className="w-full py-3.5 rounded-full bg-primary text-on-primary font-label font-semibold disabled:opacity-50"
      >
        {loading ? 'Processing…' : 'Pay & Get Ticket'}
      </button>
    </form>
  )
}

export default function PaymentForm(props: PaymentFormInnerProps) {
  return (
    <Elements stripe={stripePromise} options={{ clientSecret: props.clientSecret }}>
      <PaymentFormInner {...props} />
    </Elements>
  )
}
