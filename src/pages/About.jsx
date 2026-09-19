import { Link } from 'react-router-dom'

const About = () => {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <p className="text-teal-600 font-semibold uppercase tracking-[0.2em] text-xs">VAISHNAVI MEDICARE TRUST</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mt-2">Home Nursing &amp; Patient Care Services</h1>

        <section className="mt-8">
          <h2 className="text-2xl font-bold text-slate-900">About Us</h2>
          <p className="mt-2 text-slate-700 text-lg">Caring for lives, one home at a time.</p>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold text-slate-900">Who We Are</h2>
          <div className="mt-4 text-slate-600 space-y-4 text-[15px] leading-relaxed">
            <p>
              Vaishnavi Medicare Trust is a Bangalore-based home nursing and patient care organization dedicated to
              delivering compassionate, professional care to patients in the comfort of their own homes and families.
              Founded by Mrs. Manjula Sridhar, the Trust has been serving patients and families across Bangalore for
              over a decade.
            </p>
            <p>
              Operating as a registered not-for-profit Trust in Karnataka, Vaishnavi Medicare is driven not just by
              service delivery, but by a deeper commitment to dignity, compassion, and the belief that quality
              healthcare should be accessible to every patient — whether in a hospital, a care facility, or their own
              home.
            </p>
            <p>
              Our primary care facility is located at No. 33/1, 17th Cross, 11th Main, Malleshwaram, Bangalore –
              560003, near Spire Hospital. We extend home nursing staff support across Bangalore and surrounding areas.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold text-slate-900">Our Reach at a Glance</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-3xl font-bold text-teal-700">10+</p>
              <p className="mt-1 text-sm text-slate-600">Years of Service</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-3xl font-bold text-teal-700">1,000+</p>
              <p className="mt-1 text-sm text-slate-600">In-Facility Patients Served</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-3xl font-bold text-teal-700">5,000+</p>
              <p className="mt-1 text-sm text-slate-600">Homes Supported</p>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold text-slate-900">Our Founder</h2>
          <div className="mt-4 text-slate-600 space-y-4 text-[15px] leading-relaxed">
            <p>
              Vaishnavi Medicare Trust was founded and is led by Mrs. Manjula Sridhar, whose vision of person-centred,
              home-based care has shaped every aspect of how the organisation operates.
            </p>
            <p>
              Mrs. Sridhar has attended international workshops including an ‘End of Life’ care workshop in Hong Kong,
              bringing global best practices in palliative and terminal care to the families she serves in Bangalore.
              Her commitment to the field has been recognised with multiple state-level awards for healthcare service.
            </p>
            <p>
              Under her leadership, the Trust has built a team of credentialled nurses, trained caregivers, and care
              coordinators who share a unified commitment to patient dignity and family peace of mind.
            </p>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold text-slate-900">What We Do</h2>
          <p className="mt-4 text-slate-600 text-[15px] leading-relaxed">
            Vaishnavi Medicare Trust provides a comprehensive range of home nursing and patient care services:
          </p>
          <ul className="mt-3 list-disc pl-5 text-slate-600 space-y-2 text-[15px] leading-relaxed">
            <li>Home Nursing Services — certified nurses at your doorstep</li>
            <li>In-Facility Nursing Care — at our Malleshwaram care unit</li>
            <li>Trained Attendant &amp; Caregiver Services — non-clinical daily-life support</li>
            <li>Palliative and End-of-Life Care — including specialist cancer patient care</li>
            <li>Post-Surgical and Post-Hospitalization Care</li>
            <li>Physiotherapy at Home</li>
            <li>Dementia and Disability Care</li>
            <li>NRI Family Care Management — on-ground coordination for families residing abroad</li>
            <li>24/7 Emergency Ambulance Support</li>
          </ul>
          <p className="mt-4 text-slate-600 text-[15px] leading-relaxed">
            We offer round-the-clock nursing care in 8-hour, 12-hour, or live-in arrangements, tailored to each
            patient’s clinical needs and family circumstances.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold text-slate-900">Our Team &amp; Standards</h2>
          <p className="mt-4 text-slate-600 text-[15px] leading-relaxed">
            Every Care Professional at Vaishnavi Medicare is held to a rigorous standard before being placed with a
            patient:
          </p>
          <ul className="mt-3 list-disc pl-5 text-slate-600 space-y-2 text-[15px] leading-relaxed">
            <li>Certified Registered Nurses (RNs) or formally trained nursing professionals</li>
            <li>Mandatory background verification and government-issued ID submission</li>
            <li>Medical knowledge and nursing competency assessment</li>
            <li>Specialized training for assigned care type: post-surgical, palliative, dementia, and more</li>
            <li>Ongoing training on clinical protocols, infection control, and patient communication</li>
          </ul>
          <p className="mt-4 text-slate-600 text-[15px] leading-relaxed">
            Nursing staff at our facility and in the field are equipped to handle IV administration, nebulization,
            oxygen support, wound care, catheter care, NG tube management, physiotherapy, and continuous vitals
            monitoring.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold text-slate-900">Care for NRI Families</h2>
          <p className="mt-4 text-slate-600 text-[15px] leading-relaxed">
            For families living abroad with elderly or ill relatives in Bangalore, we serve as trusted on-ground care
            coordinators. Our NRI care management service includes:
          </p>
          <ul className="mt-3 list-disc pl-5 text-slate-600 space-y-2 text-[15px] leading-relaxed">
            <li>Regular health updates and care reports to the family</li>
            <li>Coordination with hospitals, specialists, and diagnostic centres</li>
            <li>Medication management and prescription follow-up</li>
            <li>Emergency response and hospital admission support on behalf of the family</li>
          </ul>
          <p className="mt-4 text-slate-600 text-[15px] leading-relaxed">
            We understand that distance makes caregiving difficult. Our goal is to ensure that families abroad have
            complete confidence that their loved ones are in safe, professional hands.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold text-slate-900">Our Values</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-lg font-semibold text-slate-900">Compassion</h3>
              <p className="mt-2 text-slate-600 text-[15px] leading-relaxed">
                We believe that great care is not just clinical — it is human. Every patient interaction is guided by
                empathy, patience, and respect for the individual’s dignity.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-lg font-semibold text-slate-900">Professionalism</h3>
              <p className="mt-2 text-slate-600 text-[15px] leading-relaxed">
                From credential verification to supervisory check-ins and formal complaint resolution, we hold
                ourselves to professional standards in everything we do.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-lg font-semibold text-slate-900">Transparency</h3>
              <p className="mt-2 text-slate-600 text-[15px] leading-relaxed">
                Families are kept informed at every step — from care plans and staffing to billing and service changes.
                We do not surprise our clients.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-lg font-semibold text-slate-900">Accessibility</h3>
              <p className="mt-2 text-slate-600 text-[15px] leading-relaxed">
                As a not-for-profit trust, our mission is to make quality home care accessible to patients who need it
                most, regardless of background or circumstance.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-2xl font-bold text-slate-900">Get in Touch</h2>
          <div className="mt-4 text-slate-600 space-y-1 text-[15px] leading-relaxed">
            <p>We are here to help. Reach out to speak with a Care Coordinator:</p>
            <p className="font-medium text-slate-800">Vaishnavi Medicare Trust</p>
            <p>No. 33/1, 17th Cross, 11th Main, Malleshwaram, Bangalore – 560003</p>
            <p>(Near Spire Hospital)</p>
            <p>Website: vaishnavimedicare.com</p>
            <p>We typically respond to inquiries within four hours during business hours.</p>
          </div>
          <p className="mt-6 text-sm text-slate-500">
            Vaishnavi Medicare Trust | vaishnavimedicare.com | Malleshwaram, Bangalore – 560003
          </p>
        </section>

        <div className="mt-10 rounded-2xl border border-slate-200 p-4 sm:p-5">
          <p className="text-xs uppercase tracking-wider text-slate-500">Book care</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Link
              to="/senior-care"
              className="rounded-xl bg-slate-900 px-4 py-4 text-white text-[20px] leading-tight hover:bg-slate-800 transition-colors"
            >
              Senior care at home
            </Link>
            <Link
              to="/in-house"
              className="rounded-xl bg-slate-900 px-4 py-4 text-white text-[20px] leading-tight hover:bg-slate-800 transition-colors"
            >
              In-house &amp; premises care
            </Link>
          </div>
          <div className="mt-4">
            <Link
              to="/"
              className="inline-flex items-center justify-center px-5 py-2.5 rounded-full border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default About
