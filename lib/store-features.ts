const BAD_PREFIX = "-"

export function isGoodFeature(feature: string): boolean {
  return !feature.startsWith(BAD_PREFIX)
}

export function featureLabel(feature: string): string {
  return isGoodFeature(feature) ? feature : feature.slice(BAD_PREFIX.length)
}

export function encodeFeature(label: string, isGood: boolean): string {
  return isGood ? label : `${BAD_PREFIX}${label}`
}
