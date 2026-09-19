import { Link } from 'react-router-dom'

const Section = ({ id, title, children }) => (
  <section id={id} className="scroll-mt-24">
    <h2 className="text-xl font-bold text-slate-900 mt-10 first:mt-0">{title}</h2>
    <div className="mt-3 text-slate-600 text-[15px] leading-relaxed space-y-3">{children}</div>
  </section>
)

const Terms = () => {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <p className="text-teal-600 font-semibold uppercase tracking-[0.2em] text-xs">VAISHNAVI MEDICARE TRUST</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mt-2">Home Nursing & Patient Care Services</h1>
        <h2 className="text-2xl font-bold text-slate-900 mt-8">Terms & Conditions</h2>
        <p className="mt-3 text-sm text-slate-500">Last Updated: April 2026 | Version 1.0</p>
        <p className="mt-2 text-slate-600 text-[15px] leading-relaxed">
          Please review these Terms carefully before using our services.
          By accessing our website, app, or services, you agree to be bound by these Terms. If you do not agree, please do not use our services.
        </p>

        <div className="mt-8">
          <Section title="1. Use of the Platform">
            <p>
              By accessing Vaishnavi Medicare websites or apps, you agree to use them only for lawful purposes and in a way that does not infringe the rights of others or restrict or inhibit anyone else&apos;s use of the service.
            </p>
            <p>You agree not to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Use the platform for any unlawful or fraudulent purpose</li>
              <li>Transmit unsolicited communications or spam</li>
              <li>Attempt to gain unauthorized access to any part of our systems or data</li>
              <li>Post or transmit material that is harmful, offensive, or defamatory</li>
            </ul>
            <p>We reserve the right to restrict or terminate access to the platform where these obligations are breached.</p>
          </Section>

          <Section title="2. Bookings & Care Services">
            <p>
              Service availability, pricing, and timelines may vary by location and clinical suitability. Availability is subject to prior confirmation for areas outside the standard service zone.
            </p>
            <p>A confirmed booking is subject to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Caregiver assignment based on availability and care requirements</li>
              <li>Medical clearance where required by the nature of the care</li>
              <li>Completion of any onboarding steps communicated to you, including execution of a written Service Agreement</li>
            </ul>
            <p>
              The Trust will contact you within four (4) hours of an inquiry during business hours. Care typically commences within 24 to 48 hours of confirmation. All fees, shift schedules, and care scope will be specified in writing in your Service Agreement before any payment is made.
            </p>
          </Section>

          <Section id="cancellation" title="3. Cancellations & Refunds">
            <p>
              Cancellation and refund rules depend on the package or facility you selected and the notice period at the time of booking. The following general terms apply:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Cancellation requests must be submitted in writing via email or letter</li>
              <li>Prorated refunds will be issued for unused service days, less any applicable service or processing fees</li>
              <li>Refunds will be processed within 7 to 14 business days via the original payment method</li>
            </ul>
            <p>
              Where a refund applies, processing times may follow the original payment method and banking partners. For specific cases, please contact support with your booking reference. No refund will be issued where services have been withdrawn due to misconduct directed at our Care Professionals.
            </p>
          </Section>

          <Section title="4. Client Obligations">
            <p>To enable safe and effective care delivery, you agree to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Provide accurate and complete medical history, medications, allergies, and physician contact details prior to service commencement</li>
              <li>Ensure the care environment is safe, clean, and accessible for Care Professionals</li>
              <li>Treat all Care Professionals with dignity and respect</li>
              <li>Provide a treating physician&apos;s prescription for clinically complex care where required</li>
            </ul>
            <p>The Trust shall not be liable for adverse outcomes arising from incomplete or inaccurate information provided by the client.</p>
          </Section>

          <Section title="5. Limitation of Liability">
            <p>
              Care is provided by qualified professionals and partner organizations according to the agreed scope of the Service Agreement. To the extent permitted by law, Vaishnavi Medicare is not liable for:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Indirect or consequential losses arising from use of the platform or services</li>
              <li>Adverse outcomes arising from a patient&apos;s underlying medical condition or disease progression</li>
              <li>Delays in emergency response caused by factors outside the Trust&apos;s reasonable control</li>
            </ul>
            <p>
              The Trust&apos;s aggregate liability to a client shall not exceed the total fees paid by the client for the relevant service period. Statutory rights that cannot be excluded under applicable Indian law remain unaffected.
            </p>
          </Section>

          <Section title="6. Privacy & Data Protection">
            <p>
              Patient health data is treated as sensitive personal data under India&apos;s Digital Personal Data Protection Act (DPDP Act), 2023. By using our services, you consent to:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Collection of health and contact data necessary to deliver care</li>
              <li>Secure storage of your data on protected systems</li>
              <li>Sharing of data with treating physicians, hospitals, or laboratories only with your explicit consent</li>
            </ul>
            <p>We will not sell, rent, or share your personal data with third parties for marketing purposes. For full details, please refer to our Privacy Policy on vaishnavimedicare.com.</p>
          </Section>

          <Section title="7. Changes to These Terms">
            <p>
              We may update these Terms from time to time. Where changes are material, we will notify you via email, SMS, or a notice on our website at least 14 days before the changes take effect.
            </p>
            <p>Continued use of the service after changes constitutes acceptance of the revised terms, except where additional consent is required by law.</p>
          </Section>

          <Section title="8. Governing Law">
            <p>
              These Terms are governed by the laws of India and the State of Karnataka. Any disputes will first be directed to our grievance resolution process. If unresolved, disputes will be subject to the exclusive jurisdiction of the courts in Bangalore, Karnataka.
            </p>
          </Section>

          <Section title="9. Contact Us">
            <p>If you have questions about these Terms, please reach out:</p>
            <p className="font-medium text-slate-800">Vaishnavi Medicare Trust</p>
            <p>No. 33/1, 17th Cross, 11th Main, Malleshwaram, Bangalore - 560003</p>
            <p>Website: vaishnavimedicare.com</p>
            <p className="pt-2 text-sm text-slate-500">
              Vaishnavi Medicare Trust | vaishnavimedicare.com | Malleshwaram, Bangalore - 560003
            </p>
          </Section>
        </div>

        <p className="mt-12 text-sm text-slate-500">
          Related:{' '}
          <Link to="/privacy" className="text-teal-700 font-medium hover:underline">
            Privacy policy
          </Link>
          {' · '}
          <Link to="/about" className="text-teal-700 font-medium hover:underline">
            About us
          </Link>
        </p>
      </div>
    </div>
  )
}

export default Terms
