import { Link } from 'react-router-dom'

const Privacy = () => {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <p className="text-teal-600 font-semibold uppercase tracking-[0.2em] text-xs">VAISHNAVI MEDICARE TRUST</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mt-2">Home Nursing &amp; Patient Care Services</h1>
        <h2 className="text-2xl font-bold text-slate-900 mt-8">Privacy Policy</h2>
        <p className="mt-3 text-sm text-slate-500">Last Updated: April 2026 | Version 1.0</p>
        <p className="mt-2 text-slate-600 text-[15px] leading-relaxed">
          Your privacy matters to us.
        </p>
        <p className="mt-2 text-slate-600 text-[15px] leading-relaxed">
          This Privacy Policy explains what personal and health data we collect, why we collect it, how we use and
          protect it, and your rights under India&apos;s Digital Personal Data Protection Act (DPDP Act), 2023. By using
          our services or website, you consent to the practices described in this Policy.
        </p>

        <div className="mt-8 space-y-8 text-slate-600 text-[15px] leading-relaxed">
          <section>
            <h2 className="text-xl font-bold text-slate-900">1. Who We Are (Data Fiduciary)</h2>
            <p className="mt-3">
              Vaishnavi Medicare Trust is the Data Fiduciary responsible for the personal data collected in connection
              with our care services and website. We are a registered not-for-profit Trust in Karnataka, operating from:
            </p>
            <p className="mt-2">No. 33/1, 17th Cross, 11th Main, Malleshwaram, Bangalore - 560003</p>
            <p>Website: vaishnavimedicare.com</p>
            <p>
              For all data-related queries, requests, or complaints, please contact us at the address above or via our
              website contact form.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">2. What Personal Data We Collect</h2>
            <h3 className="mt-3 font-semibold text-slate-800">2.1 Patient &amp; Care Data (Sensitive Personal Data)</h3>
            <p className="mt-2">When you engage our services, we collect:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Full name, date of birth, and gender of the patient</li>
              <li>Home address and location details for care delivery</li>
              <li>Medical history, current diagnoses, and known allergies</li>
              <li>Medications and prescription details</li>
              <li>Treating physician name and contact details</li>
              <li>Vitals records (blood pressure, blood sugar, oxygen levels, pulse)</li>
              <li>Care notes, wound care records, and shift reports</li>
              <li>Emergency contact details of family members or legal guardians</li>
            </ul>
            <h3 className="mt-4 font-semibold text-slate-800">2.2 Contact &amp; Communication Data</h3>
            <p className="mt-2">When you contact us via phone, WhatsApp, or our website contact form, we collect:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Your name and contact number</li>
              <li>Email address (where provided)</li>
              <li>The content of your inquiry or message</li>
            </ul>
            <h3 className="mt-4 font-semibold text-slate-800">2.3 Billing &amp; Payment Data</h3>
            <p className="mt-2">For invoicing and payment processing, we collect:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Name and address for billing purposes</li>
              <li>Payment method reference (UPI transaction ID, bank reference number)</li>
              <li>Invoice history and service records</li>
            </ul>
            <p className="mt-2">
              We do not store full bank account numbers, card details, or UPI PINs. Payment transactions are conducted
              directly via your chosen payment method.
            </p>
            <h3 className="mt-4 font-semibold text-slate-800">2.4 Website Data</h3>
            <p className="mt-2">When you visit vaishnavimedicare.com, standard website analytics may collect:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>IP address and browser type</li>
              <li>Pages visited and time spent on the site</li>
              <li>Referring website or search query</li>
            </ul>
            <p className="mt-2">
              This data is used solely to understand website usage and improve the user experience. It is not linked to
              individual patient records.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">3. Why We Collect Your Data (Purpose)</h2>
            <p className="mt-3">We collect and process personal data only for the following specified purposes:</p>
            <div className="mt-3 rounded-lg border border-slate-200 overflow-hidden">
              <div className="grid grid-cols-2 bg-slate-50 text-slate-700 font-semibold text-sm">
                <div className="px-3 py-2 border-r border-slate-200">Purpose</div>
                <div className="px-3 py-2">Data Used</div>
              </div>
              {[
                ['Delivering care services', 'Patient health data, contact details, care plan, vitals'],
                ['Caregiver assignment and scheduling', 'Patient name, address, care requirements, shift schedule'],
                ['Family communication and updates', 'Contact details of patient and family/NRI representative'],
                ['Billing and invoicing', 'Name, address, service records, payment reference'],
                ['Insurance claim support', 'Clinical records, invoices, physician referrals (with consent)'],
                ['Emergency response', 'Patient health data, home address, emergency contacts'],
                ['Regulatory compliance', 'Staff records, patient records, audit trails'],
                ['Website improvement', 'Anonymised website analytics data'],
              ].map(([purpose, data]) => (
                <div key={purpose} className="grid grid-cols-2 text-sm border-t border-slate-200">
                  <div className="px-3 py-2 border-r border-slate-200">{purpose}</div>
                  <div className="px-3 py-2">{data}</div>
                </div>
              ))}
            </div>
            <p className="mt-3">
              We do not use your personal data for marketing, advertising, or any purpose not listed above without
              obtaining separate explicit consent.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">4. Legal Basis for Processing</h2>
            <p className="mt-3">
              Under the DPDP Act 2023, we process your personal data on the following lawful bases:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Consent - you provide explicit, informed consent at the time of enrolling for our services. Consent may be withdrawn at any time (subject to ongoing care obligations).</li>
              <li>Contractual necessity - processing is necessary to fulfil the Service Agreement between you and the Trust.</li>
              <li>Legal obligation - certain data must be retained to comply with applicable Indian law (e.g., nursing home regulations, tax records, labour law compliance).</li>
              <li>Vital interests - in a medical emergency, we may process data to protect the life of the patient without waiting for explicit consent.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">5. How We Share Your Data</h2>
            <h3 className="mt-3 font-semibold text-slate-800">5.1 With Care Professionals</h3>
            <p className="mt-2">
              Assigned nurses, attendants, and physiotherapists are given access only to the patient data they need to
              deliver care. All Care Professionals are bound by confidentiality obligations.
            </p>
            <h3 className="mt-4 font-semibold text-slate-800">5.2 With Third-Party Service Providers</h3>
            <p className="mt-2">
              We may share data with the following categories of third parties, only with your explicit consent and only
              to the extent necessary:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Hospitals and specialist clinics - for referrals, admissions, or test coordination</li>
              <li>Diagnostic laboratories - for blood tests or investigations as instructed by the treating physician</li>
              <li>Health insurers - for claim submission, where you have requested our support</li>
              <li>Ambulance and emergency services - to coordinate patient transport</li>
            </ul>
            <p className="mt-2">
              All third-party data sharing is governed by written Data Sharing Agreements. Only the minimum necessary
              data is shared, transmitted via secure encrypted channels. A data sharing register is maintained to track
              all such disclosures.
            </p>
            <h3 className="mt-4 font-semibold text-slate-800">5.3 Legal Disclosures</h3>
            <p className="mt-2">
              We may disclose personal data without consent where required by applicable law, court order, or regulatory
              authority (including the Data Protection Board of India).
            </p>
            <h3 className="mt-4 font-semibold text-slate-800">5.4 No Sale of Data</h3>
            <p className="mt-2">
              We do not sell, rent, or trade your personal data to any third party for commercial or marketing purposes
              under any circumstances.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">6. How Long We Keep Your Data</h2>
            <p className="mt-3">
              We retain personal data for as long as it is necessary for the purposes stated in this Policy, and in
              accordance with applicable legal requirements:
            </p>
            <div className="mt-3 rounded-lg border border-slate-200 overflow-hidden">
              <div className="grid grid-cols-2 bg-slate-50 text-slate-700 font-semibold text-sm">
                <div className="px-3 py-2 border-r border-slate-200">Data Type</div>
                <div className="px-3 py-2">Retention Period</div>
              </div>
              {[
                ['Patient care records and vitals logs', 'Minimum 5 years after last service date, or as required by Karnataka nursing regulations'],
                ['Billing and invoice records', '7 years (in line with Indian tax and accounting requirements)'],
                ['Staff records', 'Duration of employment plus 3 years'],
                ['Website analytics data', 'Up to 12 months, in anonymised form'],
                ['Complaint and grievance records', '3 years from resolution date'],
              ].map(([type, period]) => (
                <div key={type} className="grid grid-cols-2 text-sm border-t border-slate-200">
                  <div className="px-3 py-2 border-r border-slate-200">{type}</div>
                  <div className="px-3 py-2">{period}</div>
                </div>
              ))}
            </div>
            <p className="mt-3">After the applicable retention period, data is securely deleted or anonymised.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">7. How We Protect Your Data</h2>
            <p className="mt-3">
              We implement appropriate technical and organisational measures to protect personal data against
              unauthorised access, loss, or disclosure:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>SSL/TLS encryption for all data transmitted via our website</li>
              <li>Secure contact form submissions with server-side protection</li>
              <li>Access controls: only authorised staff can access patient records</li>
              <li>Physical security at our care facility in Malleshwaram</li>
              <li>Staff confidentiality obligations enforced through employment contracts</li>
            </ul>
            <p className="mt-3">As our digital infrastructure expands, the following additional controls will be implemented:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Web Application Firewall (WAF) and intrusion detection</li>
              <li>Multi-Factor Authentication (MFA) for all staff system logins</li>
              <li>Role-Based Access Control (RBAC) for patient record systems</li>
              <li>End-to-end encryption for all patient data at rest and in transit</li>
              <li>Quarterly vulnerability assessments and penetration testing</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">8. Data Breach Response</h2>
            <p className="mt-3">In the event of a personal data breach, we will:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Immediately contain and assess the scope of the breach</li>
              <li>Notify affected patients as soon as reasonably possible</li>
              <li>Report the breach to the Data Protection Board of India within the statutory notification period under the DPDP Act 2023</li>
              <li>Take remedial action to prevent recurrence and document the incident in our breach register</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">9. Your Rights Under the DPDP Act 2023</h2>
            <p className="mt-3">As a Data Principal (the individual whose data we hold), you have the following rights:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Right to Access - request a summary of the personal data we hold about you</li>
              <li>Right to Correction - request correction of inaccurate or incomplete data</li>
              <li>Right to Erasure - request deletion of your data, subject to our legal retention obligations</li>
              <li>Right to Grievance Redressal - raise a complaint with us about how your data is handled</li>
              <li>Right to Nominate - nominate a person to exercise your rights in the event of death or incapacity</li>
              <li>Right to Withdraw Consent - withdraw previously given consent, where processing is consent-based</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, please contact us via the website contact form or in writing at our
              Malleshwaram address. We will respond within the timelines prescribed by the DPDP Act. Where a request
              cannot be fulfilled due to a legal obligation, we will explain the reason in writing.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">10. Cookies &amp; Website Tracking</h2>
            <p className="mt-3">
              Our website may use cookies and similar tracking technologies to understand how visitors use the site.
              These are used for:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li>Essential functionality (e.g., contact form submission)</li>
              <li>Analytics (e.g., understanding page visits and user journeys)</li>
            </ul>
            <p className="mt-3">
              We do not use cookies for advertising or behavioural profiling. You can manage or disable cookies through
              your browser settings. Disabling cookies may affect certain website features.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">11. Care of Minors</h2>
            <p className="mt-3">
              Where our services are provided to patients under the age of 18, personal data is collected and processed
              only with the consent of a parent or legal guardian. All care decisions for minor patients require the
              authorisation of their parent or guardian.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">12. Changes to This Policy</h2>
            <p className="mt-3">
              We may update this Privacy Policy from time to time to reflect changes in our services, technology, or
              applicable law. Where changes are material, we will notify you via email, SMS, or a notice on our website
              at least 14 days before the changes take effect.
            </p>
            <p className="mt-2">The current version of this Policy is always available at vaishnavimedicare.com.</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-900">13. Complaints &amp; Data Protection Authority</h2>
            <p className="mt-3">
              If you are not satisfied with our response to a data-related complaint, you have the right to escalate
              your complaint to the Data Protection Board of India, established under the DPDP Act 2023.
            </p>
            <p className="mt-2">To raise a complaint with us first, please contact:</p>
            <p className="mt-2 font-medium text-slate-800">Vaishnavi Medicare Trust - Data Queries</p>
            <p>No. 33/1, 17th Cross, 11th Main, Malleshwaram, Bangalore - 560003</p>
            <p>Website: vaishnavimedicare.com</p>
            <p className="pt-2 text-sm text-slate-500">
              Vaishnavi Medicare Trust | vaishnavimedicare.com | Malleshwaram, Bangalore - 560003
            </p>
          </section>
        </div>

        <p className="mt-12 text-sm text-slate-500">
          <Link to="/terms" className="text-teal-700 font-medium hover:underline">
            Terms & conditions
          </Link>
          {' · '}
          <Link to="/" className="text-teal-700 font-medium hover:underline">
            Home
          </Link>
        </p>
      </div>
    </div>
  )
}

export default Privacy
