import { useLocalizedString } from '../../hooks/useLocalizedString'
import { badgeToneClasses, pluginIcon } from './plugin-ui-utils'
import { formatPluginPrice } from '../../lib/plugin-model-meta'
import type { PluginModelMetadataView } from '@shared/plugin.js'

/**
 * Renders plugin-contributed model metadata (pricing + badges) inside the model
 * row. Nothing renders when the plugin supplied no metadata.
 */
export function PluginModelMeta({ metadata }: { metadata?: PluginModelMetadataView }) {
  const localize = useLocalizedString()
  if (!metadata) return null

  const price = metadata.pricing ? formatPluginPrice(metadata.pricing) : null

  return (
    <>
      {(metadata.badges ?? []).map((badge, index) => {
        const hasLabel = Boolean(badge.label && (badge.label.en || badge.label.fr))
        const tooltipText = badge.tooltip ? localize(badge.tooltip) : hasLabel ? localize(badge.label) : undefined
        const Icon = badge.icon ? pluginIcon(badge.icon) : null

        return (
          <span
            key={`${badge.label?.en || 'badge'}-${index}`}
            data-plugin-badge
            title={tooltipText}
            className={
              hasLabel
                ? `inline-flex items-center gap-1 text-[10px] leading-none px-1.5 py-0.5 rounded border ${badgeToneClasses(
                    badge.tone,
                  )}`
                : 'inline-flex items-center cursor-help shrink-0'
            }
          >
            {Icon ? <Icon className="w-3.5 h-3.5 shrink-0" /> : null}
            {hasLabel ? <span>{localize(badge.label)}</span> : null}
          </span>
        )
      })}
      {price ? (
        <span data-plugin-price className="text-[10px] text-text-muted whitespace-nowrap">
          {price}
        </span>
      ) : null}
    </>
  )
}
