/** Brand colors from Vaishnavi Medicare wordmark */
export const BRAND_RED = '#C41E1A'
export const BRAND_BLUE = '#5BA8DC'

/**
 * Wordmark: VAISHNAVI (red) + MEDICARE (sky blue), matching logo artwork.
 * @param {'sm'|'md'|'lg'} size
 * @param {'inline'|'stack'} layout
 */
export default function BrandName({
  size = 'md',
  layout = 'inline',
  showTagline = false,
  className = '',
  as: Tag = 'span',
}) {
  const nameSize =
    size === 'lg'
      ? 'text-2xl sm:text-3xl'
      : size === 'sm'
        ? 'text-base sm:text-lg'
        : 'text-xl sm:text-2xl lg:text-[1.65rem]'

  const name = (
    <span
      className={`font-bold uppercase tracking-wide leading-none ${
        layout === 'stack' ? 'flex flex-col gap-0.5' : 'inline'
      } ${nameSize}`}
    >
      <span style={{ color: BRAND_RED }}>Vaishnavi</span>
      {layout === 'inline' ? <span className="text-transparent"> </span> : null}
      <span style={{ color: BRAND_BLUE }}>Medicare</span>
    </span>
  )

  if (!showTagline) {
    return (
      <Tag className={className}>
        {name}
      </Tag>
    )
  }

  return (
    <Tag className={`min-w-0 ${className}`}>
      {name}
      <span className="mt-1 block text-[10px] font-medium normal-case tracking-normal leading-snug text-slate-700 sm:text-[11px]">
        Compassionate · Professional · Personalized Care
      </span>
    </Tag>
  )
}
