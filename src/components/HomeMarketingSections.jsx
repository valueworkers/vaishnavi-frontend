import {
  FiActivity,
  FiCheck,
  FiClipboard,
  FiHeart,
  FiHome,
  FiMonitor,
  FiUsers,
  FiUser,
} from 'react-icons/fi'
import {
  FaHandshake,
  FaHospital,
  FaHouseUser,
  FaUserNurse,
  FaWalking,
  FaBrain,
  FaHandHoldingHeart,
  FaUserFriends,
  FaProcedures,
  FaBone,
} from 'react-icons/fa'
import {
  CARE_APPROACH,
  DOCTOR_REFERRALS,
  OUR_SERVICES,
  WHO_WE_CARE_FOR,
  WHY_CHOOSE,
} from '../constants/homeMarketing'

const iconClass = 'h-5 w-5'

const whoIcon = (key) => {
  switch (key) {
    case 'seniors':
      return <FaUserFriends className="h-5 w-5" aria-hidden />
    case 'bed':
      return <FaProcedures className="h-5 w-5" aria-hidden />
    case 'bone':
      return <FaBone className="h-5 w-5" aria-hidden />
    case 'brain':
      return <FaBrain className="h-5 w-5" aria-hidden />
    case 'nurse':
      return <FaUserNurse className="h-5 w-5" aria-hidden />
    case 'home':
      return <FiHome className={iconClass} aria-hidden />
    case 'hands':
      return <FaHandHoldingHeart className="h-5 w-5" aria-hidden />
    default:
      return <FiHeart className={iconClass} aria-hidden />
  }
}

const serviceIcon = (key) => {
  switch (key) {
    case 'hospital':
      return <FaHospital className="h-5 w-5" aria-hidden />
    case 'homeCare':
      return <FaHouseUser className="h-5 w-5" aria-hidden />
    case 'rehab':
      return <FaWalking className="h-5 w-5" aria-hidden />
    default:
      return <FiHeart className={iconClass} aria-hidden />
  }
}

const whyIcon = (key) => {
  switch (key) {
    case 'person':
      return <FiUser className={iconClass} aria-hidden />
    case 'team':
      return <FiUsers className={iconClass} aria-hidden />
    case 'handshake':
      return <FaHandshake className="h-5 w-5" aria-hidden />
    case 'flex':
      return <FiHome className={iconClass} aria-hidden />
    case 'family':
      return <FiUsers className={iconClass} aria-hidden />
    default:
      return <FiHeart className={iconClass} aria-hidden />
  }
}

const approachIcon = (key) => {
  switch (key) {
    case 'assess':
      return <FiClipboard className={iconClass} aria-hidden />
    case 'plan':
      return <FiCheck className={iconClass} aria-hidden />
    case 'care':
      return <FiHeart className={iconClass} aria-hidden />
    case 'rehab':
      return <FaWalking className="h-5 w-5" aria-hidden />
    case 'monitor':
      return <FiMonitor className={iconClass} aria-hidden />
    case 'update':
      return <FiUsers className={iconClass} aria-hidden />
    default:
      return <FiActivity className={iconClass} aria-hidden />
  }
}

const SectionHeading = ({ id, title, intro }) => (
  <div className="mx-auto max-w-3xl text-center">
    <h2 id={id} className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
      {title}
    </h2>
    {intro ? <p className="mt-1 text-sm text-slate-600 sm:text-base">{intro}</p> : null}
  </div>
)

export default function HomeMarketingSections() {
  return (
    <>
      <section
        aria-labelledby="who-we-care-heading"
        className="border-y border-slate-200 bg-slate-50 py-7 defer-render-section sm:py-8"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            id="who-we-care-heading"
            title="Who we care for"
            intro="Support across life stages and recovery needs."
          />
          <ul className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-7">
            {WHO_WE_CARE_FOR.map((item) => (
              <li
                key={item.key}
                className="flex min-h-[6.25rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-3 text-center shadow-sm"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#1e3a5f]/10 text-[#1e3a5f]">
                  {whoIcon(item.icon)}
                </span>
                <p className="text-[11px] font-semibold leading-snug text-slate-800 sm:text-xs">{item.label}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section
        id="our-services"
        aria-labelledby="our-services-heading"
        className="bg-white py-7 defer-render-section sm:py-8"
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading
            id="our-services-heading"
            title="Our services"
            intro="In-facility care, home care, and rehabilitation — coordinated around each patient."
          />
          <div className="mt-5 grid gap-3 md:grid-cols-3 sm:gap-4">
            {OUR_SERVICES.map((svc) => (
              <article
                key={svc.key}
                className="flex h-full flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow duration-200 hover:shadow-md"
              >
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#1e3a5f] text-white">
                    {serviceIcon(svc.icon)}
                  </span>
                  <h3 className="text-base font-semibold text-slate-900 sm:text-lg">{svc.title}</h3>
                </div>
                <ul className="mt-3 flex-1 space-y-1.5">
                  {svc.items.map((line) => (
                    <li key={line} className="flex gap-2 text-sm text-slate-700">
                      <FiCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section
        aria-label="Why choose us, referral partners, and care approach"
        className="border-t border-slate-200 bg-slate-50 py-7 defer-render-section sm:py-8"
      >
        <div className="mx-auto grid max-w-6xl gap-3 px-4 sm:gap-4 sm:px-6 lg:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-lg font-bold text-[#9f2a2a] sm:text-xl">Why choose Vaishnavi Medicare?</h2>
            <ul className="mt-3 space-y-3">
              {WHY_CHOOSE.map((item) => (
                <li key={item.title} className="flex gap-2.5">
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                    {whyIcon(item.icon)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-0.5 text-sm leading-snug text-slate-600">{item.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex flex-col rounded-xl bg-[#1e3a5f] p-4 text-white shadow-sm sm:p-5">
            <h2 className="text-center text-lg font-bold sm:text-xl">For doctors & hospitals</h2>
            <p className="mt-2 text-center text-sm leading-snug text-slate-200">
              Looking for dependable post-discharge or long-term care for your patients?
            </p>
            <ol className="mt-4 flex flex-wrap items-center justify-center gap-1.5 text-center text-[11px] font-semibold uppercase tracking-wide sm:gap-2 sm:text-xs">
              <li className="rounded-full bg-white/10 px-2.5 py-1.5">Hospital</li>
              <li aria-hidden className="text-teal-300">
                →
              </li>
              <li className="rounded-full bg-white/10 px-2.5 py-1.5">Vaishnavi Medicare</li>
              <li aria-hidden className="text-teal-300">
                →
              </li>
              <li className="rounded-full bg-white/10 px-2.5 py-1.5">Recovery at home</li>
            </ol>
            <p className="mt-3 text-sm leading-snug text-slate-200">
              We work alongside families, hospitals, and healthcare professionals to provide continued care after acute
              hospital treatment.
            </p>
            <div className="mt-auto pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-200">
                Referral support available for
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {DOCTOR_REFERRALS.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-[#1e3a5f]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <h2 className="text-lg font-bold text-[#9f2a2a] sm:text-xl">Our care approach</h2>
            <ol className="mt-3 space-y-2.5">
              {CARE_APPROACH.map((step, idx) => (
                <li key={step.title} className="flex gap-2.5">
                  <span className="relative mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[#1e3a5f]">
                    {approachIcon(step.icon)}
                    <span className="sr-only">Step {idx + 1}</span>
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                    <p className="mt-0.5 text-sm leading-snug text-slate-600">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </>
  )
}
