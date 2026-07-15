import { memo } from 'react'

interface TruncatedIndicatorProps {
  className?: string
}

export const TruncatedIndicator = memo(function TruncatedIndicator({ className = '' }: TruncatedIndicatorProps) {
  return <div className={`text-[10px] text-accent-warning ${className}`}>Output truncated</div>
})
