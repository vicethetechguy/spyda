import { parseDesignDocument, type DesignDocument, type LegacyBreakdown } from './design-document'
import { buildConstraintProfile, type ConstraintProfile } from './constraint-engine'
import { inferLayoutIntelligence, type LayoutIntelligenceModel } from './layout-intelligence'
import { createVisionAdapter, type VisionAnalysis, type VisionOcrWord } from './vision-adapter'

export type DesignIntelligenceBundle = {
  architectureVersion: 'spyda-v2'
  designDocument: DesignDocument
  visionAnalysis: VisionAnalysis
  layoutIntelligence: LayoutIntelligenceModel
  constraintProfile: ConstraintProfile
}

export async function buildDesignIntelligence({
  breakdown,
  imageDataUrl,
  ocrWords = [],
  environment = {},
}: {
  breakdown: LegacyBreakdown
  imageDataUrl: string
  ocrWords?: VisionOcrWord[]
  environment?: Record<string, string | undefined>
}): Promise<DesignIntelligenceBundle> {
  const document = parseDesignDocument(breakdown.designDocument)
  const adapter = createVisionAdapter(environment)
  const visionAnalysis = await adapter.analyze({ imageDataUrl, document, ocrWords })
  const layoutIntelligence = inferLayoutIntelligence(document, visionAnalysis)
  const constraintProfile = buildConstraintProfile(document, layoutIntelligence)

  return {
    architectureVersion: 'spyda-v2',
    designDocument: document,
    visionAnalysis,
    layoutIntelligence,
    constraintProfile,
  }
}
