import { ScrollArea } from '../../shared/ScrollArea'
import { useState, useEffect, useMemo } from 'react'
import { SETTINGS_KEYS, setSetting } from '../../../lib/resources'
import { useSetting } from '../../../hooks/useSetting'
import {
  type ModelPriceThresholds,
  type MultiCurrencyPriceThresholds,
  parseMultiCurrencyPriceThresholds,
} from '../../../hooks/useDisplaySettings'
import { ThemeEditor } from '../ThemeEditor'
import { useT } from '../../../hooks/useT'
import { useLocaleStore } from '../../../stores/locale'
import type { Translation } from '@shared/i18n/index.js'
import {
  detectAvailableFonts,
  extractPrimaryFamily,
  toFontFamilyValue,
  resolveDefaultFamily,
  DEFAULT_TERMINAL_FONT,
} from '../../../lib/fonts'

function ThemePicker() {
  return <ThemeEditor />
}

interface ToggleDefinition {
  key: string
  label: Translation
  description: Translation
  defaultValue?: string
}

const FEED_TOGGLES: ToggleDefinition[] = [
  {
    key: SETTINGS_KEYS.DISPLAY_SHOW_THINKING,
    label: { en: 'Show thinking blocks', fr: 'Afficher les blocs de réflexion' },
    description: {
      en: 'Display AI reasoning content in the feed',
      fr: 'Affiche le contenu de raisonnement de l’IA dans le fil',
    },
  },
  {
    key: SETTINGS_KEYS.DISPLAY_SHOW_VERBOSE_TOOL_OUTPUT,
    label: { en: 'Show expanded tool output', fr: 'Afficher la sortie détaillée des outils' },
    description: {
      en: 'Always show full tool call details instead of compact view',
      fr: 'Affiche toujours le détail complet des appels d’outils au lieu d’une vue compacte',
    },
  },
  {
    key: SETTINGS_KEYS.DISPLAY_SHOW_STATS,
    label: { en: 'Show stats bar', fr: 'Afficher la barre de statistiques' },
    description: {
      en: 'Display model, tokens, and timing information',
      fr: 'Affiche les informations sur le modèle, les jetons et le temps',
    },
  },
  {
    key: SETTINGS_KEYS.DISPLAY_SHOW_AGENT_DEFINITIONS,
    label: { en: 'Show agent definitions', fr: 'Afficher les définitions d’agents' },
    description: {
      en: 'Display agent definition injections in the feed',
      fr: 'Affiche les injections de définitions d’agents dans le fil',
    },
  },
  {
    key: SETTINGS_KEYS.DISPLAY_SHOW_WORKFLOW_BARS,
    label: { en: 'Show workflow bars', fr: 'Afficher les barres de workflow' },
    description: {
      en: 'Display workflow start and end markers',
      fr: 'Affiche les marqueurs de début et de fin de workflow',
    },
  },
]

const PERF_TOGGLES: ToggleDefinition[] = [
  {
    key: SETTINGS_KEYS.DISPLAY_USE_NATIVE_SCROLLBARS,
    label: {
      en: 'Use native scrollbars in tool calls',
      fr: 'Utiliser les barres de défilement natives dans les appels d’outils',
    },
    description: {
      en: 'Swap custom styled scrollbars for native ones in tool call views (file previews, arguments, results). Faster, but native scrollbars look different on some platforms.',
      fr: 'Remplace les barres de défilement personnalisées par des barres natives dans les vues d’appels d’outils (aperçus de fichiers, arguments, résultats). Plus rapide, mais l’apparence diffère selon les plateformes.',
    },
    defaultValue: 'false',
  },
  {
    key: SETTINGS_KEYS.DISPLAY_USE_NATIVE_SCROLLBARS_CODE_BLOCKS,
    label: {
      en: 'Use native scrollbars in code blocks',
      fr: 'Utiliser les barres de défilement natives dans les blocs de code',
    },
    description: {
      en: 'Swap custom styled scrollbars for native ones in markdown code blocks and tables.',
      fr: 'Remplace les barres de défilement personnalisées par des barres natives dans les blocs de code et les tableaux Markdown.',
    },
    defaultValue: 'false',
  },
  {
    key: SETTINGS_KEYS.DISPLAY_COLLAPSE_LARGE_TOOL_CALLS,
    label: { en: 'Collapse large tool calls automatically', fr: 'Réduire automatiquement les grands appels d’outils' },
    description: {
      en: 'Start finished tool calls with large outputs collapsed; click to expand. Speeds up loading long sessions.',
      fr: 'Démarre les appels d’outils terminés avec les grandes sorties réduites ; cliquez pour développer. Accélère le chargement des longues sessions.',
    },
    defaultValue: 'false',
  },
  {
    key: SETTINGS_KEYS.DISPLAY_DEFER_CODE_HIGHLIGHT_WHILE_STREAMING,
    label: {
      en: 'Defer code highlighting while streaming',
      fr: 'Différer la coloration syntaxique pendant le streaming',
    },
    description: {
      en: 'While a code block is streaming, wait until it closes to highlight it. Smoother streaming, but code stays plain until the end.',
      fr: 'Pendant qu’un bloc de code diffuse, attend sa fermeture pour le colorer. Streaming plus fluide, mais le code reste brut jusqu’à la fin.',
    },
    defaultValue: 'false',
  },
  {
    key: SETTINGS_KEYS.DISPLAY_FEED_VIRTUALIZATION,
    label: { en: 'Virtualize long feeds', fr: 'Virtualiser les longs fils' },
    description: {
      en: 'Mount only the most recent items and reveal older ones as you scroll up. Faster on very long sessions, but older history loading is experimental.',
      fr: 'Ne monte que les éléments les plus récents et révèle les plus anciens en remontant. Plus rapide sur les très longues sessions, mais le chargement de l’historique ancien est expérimental.',
    },
    defaultValue: 'false',
  },
  {
    key: SETTINGS_KEYS.DISPLAY_SHOW_SYNTAX_HIGHLIGHTING,
    label: { en: 'Show syntax highlighting', fr: 'Afficher la coloration syntaxique' },
    description: {
      en: 'Nicer formatting, but costly - applies to code blocks, diffs, and file previews',
      fr: 'Mise en forme plus agréable, mais coûteuse - s’applique aux blocs de code, aux diffs et aux aperçus de fichiers',
    },
    defaultValue: 'true',
  },
]

const PRICING_MAIN_TOGGLE: ToggleDefinition = {
  key: SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICES,
  label: { en: 'Show prices under model names', fr: 'Afficher les prix sous les noms de modèles' },
  description: {
    en: 'Display configured rates and discounts below model names in the selector and lists',
    fr: 'Affiche les tarifs et remises configurés sous les noms de modèles dans le sélecteur et les listes',
  },
  defaultValue: 'false',
}

const PRICING_SUB_TOGGLES: ToggleDefinition[] = [
  {
    key: SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_INPUT,
    label: { en: 'Input price', fr: 'Prix d’entrée (Input)' },
    description: {
      en: 'Show input token rate (/ 1M tokens)',
      fr: 'Afficher le tarif des jetons d’entrée (/ 1M jetons)',
    },
    defaultValue: 'true',
  },
  {
    key: SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_OUTPUT,
    label: { en: 'Output price', fr: 'Prix de sortie (Output)' },
    description: {
      en: 'Show output token rate (/ 1M tokens)',
      fr: 'Afficher le tarif des jetons de sortie (/ 1M jetons)',
    },
    defaultValue: 'true',
  },
  {
    key: SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_CACHE_READ,
    label: { en: 'Cache read price', fr: 'Prix de lecture cache' },
    description: {
      en: 'Show cache read token rate (/ 1M tokens)',
      fr: 'Afficher le tarif de lecture du cache (/ 1M jetons)',
    },
    defaultValue: 'true',
  },
  {
    key: SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_CACHE_WRITE,
    label: { en: 'Cache write price', fr: 'Prix d’écriture cache' },
    description: {
      en: 'Show cache write token rate (/ 1M tokens)',
      fr: 'Afficher le tarif d’écriture du cache (/ 1M jetons)',
    },
    defaultValue: 'true',
  },
]

const PRICING_POPOVER_TOGGLE: ToggleDefinition = {
  key: SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_POPOVER,
  label: { en: 'Show pricing hover popover', fr: 'Afficher l’infobulle de tarification au survol' },
  description: {
    en: 'Display detailed pricing card tooltip when hovering over a model row',
    fr: 'Affiche une carte détaillée des tarifs lors du survol d’une ligne de modèle',
  },
  defaultValue: 'true',
}

const PRICING_COLORS_TOGGLE: ToggleDefinition = {
  key: SETTINGS_KEYS.DISPLAY_ENABLE_MODEL_PRICE_COLORS,
  label: { en: 'Price color tiers (Low / Medium / High)', fr: 'Paliers de couleur des prix (Bas / Moyen / Élevé)' },
  description: {
    en: 'Color-code price rates based on configured thresholds (green/yellow/red)',
    fr: 'Colore les tarifs selon les seuils configurés (vert/jaune/rouge)',
  },
  defaultValue: 'true',
}

const PRICING_COLOR_NAME_BY_OUTPUT_TOGGLE: ToggleDefinition = {
  key: SETTINGS_KEYS.DISPLAY_COLOR_MODEL_NAME_BY_OUTPUT_PRICE,
  label: { en: 'Color model name by output price', fr: 'Colorer le nom du modèle selon le prix de sortie' },
  description: {
    en: 'Display model names in the color tier of their output price',
    fr: 'Affiche les noms des modèles avec la couleur correspondant au palier de prix de sortie',
  },
  defaultValue: 'false',
}

const PRICING_IN_BAR_TOGGLE: ToggleDefinition = {
  key: SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_IN_BAR,
  label: { en: 'Show model price in bottom bar', fr: 'Afficher le prix du modèle dans la barre inférieure' },
  description: {
    en: 'Display rates of the active model in the bottom provider/model indicator',
    fr: 'Affiche les tarifs du modèle actif dans l’indicateur en bas d’écran',
  },
  defaultValue: 'false',
}

const PRICING_IN_BAR_SUB_TOGGLES: ToggleDefinition[] = [
  {
    key: SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_IN_BAR_INPUT,
    label: { en: 'Input price in bar', fr: 'Prix d’entrée dans la barre' },
    description: {
      en: 'Show active model input token rate in the bottom bar',
      fr: 'Affiche le tarif des jetons d’entrée dans la barre inférieure',
    },
    defaultValue: 'true',
  },
  {
    key: SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_IN_BAR_OUTPUT,
    label: { en: 'Output price in bar', fr: 'Prix de sortie dans la barre' },
    description: {
      en: 'Show active model output token rate in the bottom bar',
      fr: 'Affiche le tarif des jetons de sortie dans la barre inférieure',
    },
    defaultValue: 'true',
  },
  {
    key: SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_IN_BAR_CACHE_READ,
    label: { en: 'Cache read price in bar', fr: 'Prix de lecture cache dans la barre' },
    description: {
      en: 'Show active model cache read rate in the bottom bar',
      fr: 'Affiche le tarif de lecture cache dans la barre inférieure',
    },
    defaultValue: 'true',
  },
  {
    key: SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_IN_BAR_CACHE_WRITE,
    label: { en: 'Cache write price in bar', fr: 'Prix d’écriture cache dans la barre' },
    description: {
      en: 'Show active model cache write rate in the bottom bar',
      fr: 'Affiche le tarif d’écriture cache dans la barre inférieure',
    },
    defaultValue: 'true',
  },
]

export function DisplayTab() {
  const t = useT()
  const applyLocale = useLocaleStore((state) => state.applyLocale)
  const showThinking = useSetting(SETTINGS_KEYS.DISPLAY_SHOW_THINKING, 'true')
  const showVerboseToolOutput = useSetting(SETTINGS_KEYS.DISPLAY_SHOW_VERBOSE_TOOL_OUTPUT, 'true')
  const showStats = useSetting(SETTINGS_KEYS.DISPLAY_SHOW_STATS, 'true')
  const showAgentDefinitions = useSetting(SETTINGS_KEYS.DISPLAY_SHOW_AGENT_DEFINITIONS, 'true')
  const showWorkflowBars = useSetting(SETTINGS_KEYS.DISPLAY_SHOW_WORKFLOW_BARS, 'true')
  const nativeScrollbars = useSetting(SETTINGS_KEYS.DISPLAY_USE_NATIVE_SCROLLBARS, 'false')
  const nativeScrollbarsCodeBlocks = useSetting(SETTINGS_KEYS.DISPLAY_USE_NATIVE_SCROLLBARS_CODE_BLOCKS, 'false')
  const collapseLargeToolCalls = useSetting(SETTINGS_KEYS.DISPLAY_COLLAPSE_LARGE_TOOL_CALLS, 'false')
  const deferCodeHighlightWhileStreaming = useSetting(
    SETTINGS_KEYS.DISPLAY_DEFER_CODE_HIGHLIGHT_WHILE_STREAMING,
    'false',
  )
  const feedVirtualization = useSetting(SETTINGS_KEYS.DISPLAY_FEED_VIRTUALIZATION, 'false')
  const syntaxHighlighting = useSetting(SETTINGS_KEYS.DISPLAY_SHOW_SYNTAX_HIGHLIGHTING, 'true')
  const maxVisibleItems = useSetting(SETTINGS_KEYS.DISPLAY_MAX_VISIBLE_ITEMS, '300')
  const storedLocale = useSetting(SETTINGS_KEYS.DISPLAY_LOCALE, 'automatic')
  const isLoading = showThinking.loading

  const showModelPrices = useSetting(SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICES, 'false')
  const showModelPriceInput = useSetting(SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_INPUT, 'true')
  const showModelPriceOutput = useSetting(SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_OUTPUT, 'true')
  const showModelPriceCacheRead = useSetting(SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_CACHE_READ, 'true')
  const showModelPriceCacheWrite = useSetting(SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_CACHE_WRITE, 'true')
  const showModelPricePopover = useSetting(SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_POPOVER, 'true')
  const enableModelPriceColors = useSetting(SETTINGS_KEYS.DISPLAY_ENABLE_MODEL_PRICE_COLORS, 'true')
  const colorModelNameByOutputPrice = useSetting(SETTINGS_KEYS.DISPLAY_COLOR_MODEL_NAME_BY_OUTPUT_PRICE, 'false')
  const showModelPriceInBar = useSetting(SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_IN_BAR, 'false')
  const showModelPriceInBarInput = useSetting(SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_IN_BAR_INPUT, 'true')
  const showModelPriceInBarOutput = useSetting(SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_IN_BAR_OUTPUT, 'true')
  const showModelPriceInBarCacheRead = useSetting(SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_IN_BAR_CACHE_READ, 'true')
  const showModelPriceInBarCacheWrite = useSetting(SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_IN_BAR_CACHE_WRITE, 'true')

  const [maxItemsLocal, setMaxItemsLocal] = useState(maxVisibleItems.value)

  useEffect(() => {
    setMaxItemsLocal(maxVisibleItems.value)
  }, [maxVisibleItems.value])

  const saveMaxItems = () => {
    const num = parseInt(maxItemsLocal, 10)
    const clamped = isNaN(num) || num < 0 ? 0 : Math.min(num, 9999)
    setMaxItemsLocal(String(clamped))
    void setSetting(SETTINGS_KEYS.DISPLAY_MAX_VISIBLE_ITEMS, String(clamped))
  }

  const allToggles = [
    ...FEED_TOGGLES,
    ...PERF_TOGGLES,
    PRICING_MAIN_TOGGLE,
    ...PRICING_SUB_TOGGLES,
    PRICING_POPOVER_TOGGLE,
    PRICING_COLORS_TOGGLE,
    PRICING_COLOR_NAME_BY_OUTPUT_TOGGLE,
    PRICING_IN_BAR_TOGGLE,
    ...PRICING_IN_BAR_SUB_TOGGLES,
  ]

  const localValues: Record<string, string> = {
    [SETTINGS_KEYS.DISPLAY_SHOW_THINKING]: showThinking.value,
    [SETTINGS_KEYS.DISPLAY_SHOW_VERBOSE_TOOL_OUTPUT]: showVerboseToolOutput.value,
    [SETTINGS_KEYS.DISPLAY_SHOW_STATS]: showStats.value,
    [SETTINGS_KEYS.DISPLAY_SHOW_AGENT_DEFINITIONS]: showAgentDefinitions.value,
    [SETTINGS_KEYS.DISPLAY_SHOW_WORKFLOW_BARS]: showWorkflowBars.value,
    [SETTINGS_KEYS.DISPLAY_USE_NATIVE_SCROLLBARS]: nativeScrollbars.value,
    [SETTINGS_KEYS.DISPLAY_USE_NATIVE_SCROLLBARS_CODE_BLOCKS]: nativeScrollbarsCodeBlocks.value,
    [SETTINGS_KEYS.DISPLAY_COLLAPSE_LARGE_TOOL_CALLS]: collapseLargeToolCalls.value,
    [SETTINGS_KEYS.DISPLAY_DEFER_CODE_HIGHLIGHT_WHILE_STREAMING]: deferCodeHighlightWhileStreaming.value,
    [SETTINGS_KEYS.DISPLAY_FEED_VIRTUALIZATION]: feedVirtualization.value,
    [SETTINGS_KEYS.DISPLAY_SHOW_SYNTAX_HIGHLIGHTING]: syntaxHighlighting.value,
    [SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICES]: showModelPrices.value,
    [SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_INPUT]: showModelPriceInput.value,
    [SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_OUTPUT]: showModelPriceOutput.value,
    [SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_CACHE_READ]: showModelPriceCacheRead.value,
    [SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_CACHE_WRITE]: showModelPriceCacheWrite.value,
    [SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_POPOVER]: showModelPricePopover.value,
    [SETTINGS_KEYS.DISPLAY_ENABLE_MODEL_PRICE_COLORS]: enableModelPriceColors.value,
    [SETTINGS_KEYS.DISPLAY_COLOR_MODEL_NAME_BY_OUTPUT_PRICE]: colorModelNameByOutputPrice.value,
    [SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_IN_BAR]: showModelPriceInBar.value,
    [SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_IN_BAR_INPUT]: showModelPriceInBarInput.value,
    [SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_IN_BAR_OUTPUT]: showModelPriceInBarOutput.value,
    [SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_IN_BAR_CACHE_READ]: showModelPriceInBarCacheRead.value,
    [SETTINGS_KEYS.DISPLAY_SHOW_MODEL_PRICE_IN_BAR_CACHE_WRITE]: showModelPriceInBarCacheWrite.value,
  }

  const [local, setLocal] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(allToggles.map((toggle) => [toggle.key, (localValues[toggle.key] ?? toggle.defaultValue) === 'true'])),
  )

  useEffect(() => {
    setLocal(Object.fromEntries(allToggles.map((toggle) => [toggle.key, (localValues[toggle.key] ?? toggle.defaultValue) === 'true'])))
  }, [JSON.stringify(localValues)])

  const handleToggle = (key: string) => {
    const newValue = String(!local[key as keyof typeof local])
    setLocal((prev) => ({ ...prev, [key]: newValue === 'true' }))
    void setSetting(key, newValue)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-text-muted">
        {t({ en: 'Loading settings...', fr: 'Chargement des paramètres...' })}
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-6 max-w-2xl p-6">
        <div>
          <h3 className="text-sm font-medium text-text-primary mb-2">{t({ en: 'Theme', fr: 'Thème' })}</h3>
          <ThemePicker />
        </div>

        <LanguageSetting t={t} storedLocale={storedLocale.value} applyLocale={applyLocale} />

        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-medium text-text-primary mb-2">
            {t({ en: 'Feed Items', fr: 'Éléments du fil' })}
          </h3>
          <ToggleList toggles={FEED_TOGGLES} local={local} onToggle={handleToggle} />
        </div>

        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-medium text-text-primary mb-2">
            {t({ en: 'Performance', fr: 'Performances' })}
          </h3>
          <p className="text-xs text-text-muted mb-3">
            {t({
              en: 'Tune these settings to keep OpenFox snappy during long sessions or on low-end hardware.',
              fr: 'Ajustez ces paramètres pour garder OpenFox fluide pendant les longues sessions ou sur du matériel moins puissant.',
            })}
          </p>
          <div className="mb-4">
            <label className="flex items-start justify-between gap-3 cursor-pointer">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-text-primary font-medium">
                  {t({ en: 'Maximum visible feed items', fr: 'Nombre maximal d’éléments visibles dans le fil' })}
                </div>
                <div className="text-xs text-text-muted mt-0.5">
                  {t({
                    en: 'Keep only the N most recent items mounted in the DOM. Older items are unloaded to save memory. Set to 0 to keep all items.',
                    fr: 'Ne conserve que les N éléments les plus récents montés dans le DOM. Les éléments plus anciens sont déchargés pour économiser de la mémoire. Mettre 0 pour tout conserver.',
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <input
                  type="number"
                  min="0"
                  max="9999"
                  step="50"
                  value={maxItemsLocal}
                  onChange={(e) => setMaxItemsLocal(e.target.value)}
                  onBlur={saveMaxItems}
                  onKeyDown={(e) => e.key === 'Enter' && saveMaxItems()}
                  className="w-20 px-2 py-1 text-sm bg-bg-tertiary border border-border rounded text-text-primary text-right focus:outline-none focus:border-accent-primary"
                />
                <span className="text-xs text-text-muted">{t({ en: 'items', fr: 'éléments' })}</span>
              </div>
            </label>
          </div>
          <ToggleList toggles={PERF_TOGGLES} local={local} onToggle={handleToggle} />
        </div>

        <div className="border-t border-border pt-4">
          <ModelPickerPreferences />
        </div>

        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-medium text-text-primary mb-4">
            {t({ en: 'Model Pricing', fr: 'Tarification des modèles' })}
          </h3>
          <div className="space-y-4">
            <ToggleList toggles={[PRICING_POPOVER_TOGGLE]} local={local} onToggle={handleToggle} />
            <ToggleList toggles={[PRICING_MAIN_TOGGLE]} local={local} onToggle={handleToggle} />
            {local[PRICING_MAIN_TOGGLE.key] && (
              <div className="pl-4 space-y-3 border-l-2 border-border/50 ml-2">
                <ToggleList toggles={PRICING_SUB_TOGGLES} local={local} onToggle={handleToggle} />
              </div>
            )}
            <ToggleList toggles={[PRICING_IN_BAR_TOGGLE]} local={local} onToggle={handleToggle} />
            {local[PRICING_IN_BAR_TOGGLE.key] && (
              <div className="pl-4 space-y-3 border-l-2 border-border/50 ml-2">
                <ToggleList toggles={PRICING_IN_BAR_SUB_TOGGLES} local={local} onToggle={handleToggle} />
              </div>
            )}
            <ToggleList toggles={[PRICING_COLORS_TOGGLE]} local={local} onToggle={handleToggle} />
            {local[PRICING_COLORS_TOGGLE.key] && (
              <div className="pl-4 space-y-4 border-l-2 border-border/50 ml-2">
                <ToggleList toggles={[PRICING_COLOR_NAME_BY_OUTPUT_TOGGLE]} local={local} onToggle={handleToggle} />
                <PriceThresholdsEditor
                  mode="fiat"
                  title="Price Color Thresholds — Standard Currencies ($ / €)"
                  unitLabel="$/€ / 1M"
                />
                <PriceThresholdsEditor
                  mode="tokens"
                  title="Price Color Thresholds — Tokens / Credits (tk)"
                  unitLabel="tk / 1M"
                />
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <h3 className="text-sm font-medium text-text-primary mb-2">{t({ en: 'Terminal', fr: 'Terminal' })}</h3>
          <TerminalFontEditor />
        </div>
      </div>
    </ScrollArea>
  )
}

function ModelPickerPreferences() {
  const t = useT()
  const savedHeight = useSetting(SETTINGS_KEYS.DISPLAY_MODEL_SELECTOR_HEIGHT, 'default')
  const savedCollapse = useSetting(SETTINGS_KEYS.DISPLAY_COLLAPSE_PROVIDERS_BY_DEFAULT, 'false')
  const savedCollapseFavorites = useSetting(SETTINGS_KEYS.DISPLAY_COLLAPSE_FAVORITES_BY_DEFAULT, 'false')

  const handleHeightChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    void setSetting(SETTINGS_KEYS.DISPLAY_MODEL_SELECTOR_HEIGHT, e.target.value)
  }

  const handleCollapseChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void setSetting(SETTINGS_KEYS.DISPLAY_COLLAPSE_PROVIDERS_BY_DEFAULT, String(e.target.checked))
  }

  const handleCollapseFavoritesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void setSetting(SETTINGS_KEYS.DISPLAY_COLLAPSE_FAVORITES_BY_DEFAULT, String(e.target.checked))
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-text-primary mb-2">
          {t({ en: 'Model Selector', fr: 'Sélecteur de modèles' })}
        </h3>
        <p className="text-xs text-text-muted mb-3">
          {t({
            en: 'Customize the appearance and default behavior of the model selector dropdown in the bottom bar.',
            fr: 'Personnalisez l’apparence et le comportement par défaut du menu déroulant de sélection des modèles dans la barre inférieure.',
          })}
        </p>
      </div>

      <div className="space-y-3">
        <label className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm text-text-primary">
              {t({ en: 'Dropdown height', fr: 'Hauteur du menu déroulant' })}
            </div>
            <div className="text-xs text-text-muted">
              {t({
                en: 'Choose how much vertical space the model list occupies.',
                fr: 'Choisissez l’espace vertical occupé par la liste des modèles.',
              })}
            </div>
          </div>
          <select
            value={savedHeight.value}
            onChange={handleHeightChange}
            aria-label={t({ en: 'Dropdown height', fr: 'Hauteur du menu déroulant' })}
            className="text-xs bg-bg-tertiary border border-border rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent-primary"
          >
            <option value="default">{t({ en: 'Default (80% max)', fr: 'Par défaut (80% max)' })}</option>
            <option value="full_height">{t({ en: 'Full screen height', fr: 'Plein écran' })}</option>
          </select>
        </label>

        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <div>
            <div className="text-sm text-text-primary">
              {t({ en: 'Collapse providers by default', fr: 'Réduire les fournisseurs par défaut' })}
            </div>
            <div className="text-xs text-text-muted">
              {t({
                en: 'Start with all provider sections folded so only their headers are visible.',
                fr: 'Démarrer avec toutes les sections de fournisseurs repliées.',
              })}
            </div>
          </div>
          <input
            type="checkbox"
            checked={savedCollapse.value === 'true'}
            onChange={handleCollapseChange}
            aria-label={t({ en: 'Collapse providers by default', fr: 'Réduire les fournisseurs par défaut' })}
            className="rounded border-border text-accent-primary focus:ring-accent-primary/50"
          />
        </label>

        <label className="flex items-center justify-between gap-4 cursor-pointer">
          <div>
            <div className="text-sm text-text-primary">
              {t({ en: 'Collapse favorites by default', fr: 'Réduire les favoris par défaut' })}
            </div>
            <div className="text-xs text-text-muted">
              {t({
                en: 'Start with the favorites section folded.',
                fr: 'Démarrer avec la section des favoris repliée.',
              })}
            </div>
          </div>
          <input
            type="checkbox"
            checked={savedCollapseFavorites.value === 'true'}
            onChange={handleCollapseFavoritesChange}
            aria-label={t({ en: 'Collapse favorites by default', fr: 'Réduire les favoris par défaut' })}
            className="rounded border-border text-accent-primary focus:ring-accent-primary/50"
          />
        </label>
      </div>
    </div>
  )
}

function ToggleList({
  toggles,
  local,
  onToggle,
}: {
  toggles: readonly ToggleDefinition[]
  local: Record<string, boolean>
  onToggle: (key: string) => void
}) {
  const t = useT()
  return (
    <div className="space-y-4">
      {toggles.map(({ key, label, description }) => (
        <label key={key} className="flex items-start justify-between gap-3 cursor-pointer">
          <div className="flex-1 min-w-0">
            <div className="text-sm text-text-primary font-medium">{t(label)}</div>
            <div className="text-xs text-text-muted mt-0.5">{t(description)}</div>
          </div>
          <button
            type="button"
            onClick={() => onToggle(key)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
              local[key] ? 'bg-accent-primary' : 'bg-bg-tertiary'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                local[key] ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </label>
      ))}
    </div>
  )
}

function PriceThresholdsEditor({
  mode,
  title,
  unitLabel,
}: {
  mode: 'fiat' | 'tokens'
  title: string
  unitLabel: string
}) {
  const thresholdsSetting = useSetting(SETTINGS_KEYS.DISPLAY_MODEL_PRICE_THRESHOLDS)
  const raw = thresholdsSetting.value
  const multiThresholds = useMemo(() => parseMultiCurrencyPriceThresholds(raw), [raw])
  const currentThresholds = mode === 'fiat' ? multiThresholds.usd : multiThresholds.tokens
  const [localThresholds, setLocalThresholds] = useState<ModelPriceThresholds>(currentThresholds)

  useEffect(() => {
    setLocalThresholds(mode === 'fiat' ? multiThresholds.usd : multiThresholds.tokens)
  }, [multiThresholds, mode])

  const handleUpdate = (
    category: keyof ModelPriceThresholds,
    level: 'low' | 'medium',
    value: number,
  ) => {
    const updatedCategory = {
      ...localThresholds[category],
      [level]: value,
    }
    const updatedSingle: ModelPriceThresholds = {
      ...localThresholds,
      [category]: updatedCategory,
    }
    setLocalThresholds(updatedSingle)

    const updatedMulti: MultiCurrencyPriceThresholds = {
      ...multiThresholds,
      ...(mode === 'fiat'
        ? { usd: updatedSingle, eur: updatedSingle }
        : { tokens: updatedSingle }),
    }
    void setSetting(SETTINGS_KEYS.DISPLAY_MODEL_PRICE_THRESHOLDS, JSON.stringify(updatedMulti))
  }

  const categories: Array<{
    key: keyof ModelPriceThresholds
    label: string
  }> = [
    { key: 'input', label: 'Input' },
    { key: 'output', label: 'Output' },
    { key: 'cacheRead', label: 'Cache Read' },
    { key: 'cacheWrite', label: 'Cache Write' },
  ]

  return (
    <div className="pt-2 space-y-3">
      <div className="text-xs font-semibold text-text-primary">{title}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {categories.map(({ key, label }) => (
          <div key={key} className="p-2.5 bg-bg-secondary border border-border/70 rounded-md space-y-1.5">
            <div className="font-medium text-text-primary flex justify-between">
              <span>{label}</span>
              <span className="text-[10px] text-text-muted">{unitLabel}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-accent-success font-medium">Low (≤)</span>
                <input
                  type="number"
                  step={mode === 'fiat' ? '0.01' : '1'}
                  value={localThresholds[key].low}
                  onChange={(e) => handleUpdate(key, 'low', parseFloat(e.target.value) || 0)}
                  className="w-full mt-0.5 px-2 py-1 bg-bg-tertiary border border-border rounded text-text-primary text-xs"
                />
              </div>
              <div>
                <span className="text-[10px] text-accent-warning font-medium">Med (≤)</span>
                <input
                  type="number"
                  step={mode === 'fiat' ? '0.01' : '1'}
                  value={localThresholds[key].medium}
                  onChange={(e) => handleUpdate(key, 'medium', parseFloat(e.target.value) || 0)}
                  className="w-full mt-0.5 px-2 py-1 bg-bg-tertiary border border-border rounded text-text-primary text-xs"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LanguageSetting({
  t,
  storedLocale,
  applyLocale,
}: {
  t: (tx: Translation, vars?: Record<string, string | number>) => string
  storedLocale: string
  applyLocale: (setting: string | undefined) => void
}) {
  const options = [
    { value: 'automatic', label: t({ en: 'Automatic', fr: 'Automatique' }) },
    { value: 'en', label: 'English' },
    { value: 'fr', label: 'Français' },
  ]

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    applyLocale(value)
    void setSetting(SETTINGS_KEYS.DISPLAY_LOCALE, value)
  }

  return (
    <div className="border-t border-border pt-4">
      <h3 className="text-sm font-medium text-text-primary mb-2">{t({ en: 'Language', fr: 'Langue' })}</h3>
      <p className="text-xs text-text-muted mb-3">
        {t({ en: 'Language of the interface.', fr: 'Langue de l’interface.' })}
      </p>
      <select
        aria-label={t({ en: 'Language', fr: 'Langue' })}
        value={storedLocale}
        onChange={handleChange}
        className="w-full px-2 py-1.5 text-sm text-text-primary bg-bg-tertiary border border-border rounded focus:outline-none focus:ring-2 focus:ring-accent-primary/50 focus:border-accent-primary"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function TerminalFontEditor() {
  const t = useT()
  const savedValue = useSetting(SETTINGS_KEYS.DISPLAY_TERMINAL_FONT, DEFAULT_TERMINAL_FONT).value
  const [localValue, setLocalValue] = useState(savedValue)
  const [fonts, setFonts] = useState<string[]>([])
  const [selectedFamily, setSelectedFamily] = useState<string>('')

  useEffect(() => {
    setLocalValue(savedValue)
    const primary = extractPrimaryFamily(savedValue)
    setSelectedFamily(primary)
  }, [savedValue])

  useEffect(() => {
    const available = detectAvailableFonts()
    setFonts(available)
    const primary = extractPrimaryFamily(savedValue)
    if (!primary || !available.includes(primary)) {
      setSelectedFamily(resolveDefaultFamily(available))
    }
  }, [])

  const handleSelect = (family: string) => {
    setSelectedFamily(family)
    const formatted = toFontFamilyValue(family)
    setLocalValue(formatted)
    void setSetting(SETTINGS_KEYS.DISPLAY_TERMINAL_FONT, toFontFamilyValue(family))
  }

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value)
  }

  const handleCustomBlur = () => {
    void setSetting(SETTINGS_KEYS.DISPLAY_TERMINAL_FONT, localValue.trim() || DEFAULT_TERMINAL_FONT)
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm text-text-primary font-medium mb-1">
          {t({ en: 'Terminal Font Family', fr: 'Police du terminal' })}
        </label>
        <p className="text-xs text-text-muted mb-3">
          {t({
            en: 'Choose from monospace fonts detected on your system, or enter a custom CSS font-family.',
            fr: 'Choisissez parmi les polices à chasse fixe détectées sur votre système ou saisissez une propriété font-family CSS personnalisée.',
          })}
        </p>
      </div>

      {fonts.length > 0 && (
        <div className="space-y-1.5">
          <label className="block text-xs text-text-muted">
            {t({ en: 'Installed Monospace Fonts', fr: 'Polices monospace installées' })}
          </label>
          <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto p-1 bg-bg-tertiary rounded border border-border">
            {fonts.map((font) => (
              <button
                key={font}
                type="button"
                onClick={() => handleSelect(font)}
                className={`text-left px-2 py-1.5 rounded text-xs truncate transition-colors ${
                  selectedFamily === font
                    ? 'bg-accent-primary text-text-inverse font-medium'
                    : 'text-text-primary hover:bg-bg-secondary'
                }`}
                style={{ fontFamily: `"${font}", monospace` }}
              >
                {font}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="block text-xs text-text-muted">
          {t({ en: 'Custom font-family (CSS)', fr: 'font-family personnalisée (CSS)' })}
        </label>
        <input
          type="text"
          value={localValue}
          onChange={handleCustomChange}
          onBlur={handleCustomBlur}
          placeholder={DEFAULT_TERMINAL_FONT}
          className="w-full px-2.5 py-1.5 text-xs text-text-primary bg-bg-tertiary border border-border rounded font-mono focus:outline-none focus:ring-2 focus:ring-accent-primary/50 focus:border-accent-primary"
        />
      </div>

      <div className="p-3 bg-bg-tertiary rounded border border-border">
        <div className="text-xs text-text-muted mb-1.5">{t({ en: 'Preview', fr: 'Aperçu' })}</div>
        <div
          className="text-xs text-text-primary bg-bg-primary p-2.5 rounded border border-border/50"
          style={{ fontFamily: localValue || DEFAULT_TERMINAL_FONT }}
        >
          <span>$ echo &quot;The quick brown fox jumps over 1337 lazy dogs.&quot;</span>
          <br />
          <span className="text-text-muted">
            const x = 42; -&gt; != == &lt;= &gt;= [0..9] {'{'} foo: &apos;bar&apos; {'}'}
          </span>
        </div>
      </div>
    </div>
  )
}
