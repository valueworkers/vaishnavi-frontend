import { useEffect, useState } from 'react'
import { emptyFaqContactsView, fetchFaqContacts } from '../api/faqContactsApi'

/** Loads GET /faq/contacts/ for navbar / home contact + social links. */
export const useFaqContacts = () => {
  const [contacts, setContacts] = useState(emptyFaqContactsView)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const load = ({ force = false } = {}) => {
      setIsLoading(true)
      fetchFaqContacts({ force })
        .then((data) => {
          if (!cancelled) setContacts(data)
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false)
        })
    }

    load()

    const onUpdated = () => load({ force: true })
    window.addEventListener('faq-contacts-updated', onUpdated)
    return () => {
      cancelled = true
      window.removeEventListener('faq-contacts-updated', onUpdated)
    }
  }, [])

  return { contacts, isLoading }
}
