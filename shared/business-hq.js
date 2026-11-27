export const BUSINESS_HQ_TIERS = {
  shop: ['Local store', 'Supermarket', 'Retail complex'],
  taxi: ['Parking lot', 'Fleet garage', 'Dispatch headquarters'],
  transport: ['Truck yard', 'Distribution depot', 'Regional logistics hub'],
  construction: ['Small site', 'Large construction project', 'Infrastructure complex'],
  it: ['Startup office', 'Technology campus', 'Global headquarters'],
  bank: ['Local branch', 'Corporate bank', 'Banking skyscraper'],
  clothing: ['Boutique', 'Garment studio', 'Fashion campus'],
  factory: ['Workshop', 'Assembly plant', 'Automated factory'],
  dealer: ['Small lot', 'Premium showroom', 'Automotive complex'],
  shipping: ['Small dock', 'Cargo terminal', 'International port'],
  oil: ['Single rig', 'Oil field', 'Refinery complex'],
  sports: ['Training ground', 'Stadium', 'International sports complex'],
  holding: ['Corporate office', 'Treasury headquarters', 'Global corporate campus'],
  space: ['Research centre', 'Launch facility', 'Spaceport'],
  logistics_empire: ['Regional network', 'Multimodal terminal', 'Global logistics command centre'],
  tech_conglomerate: ['Engineering campus', 'R&D complex', 'Global technology HQ'],
  aerospace_titan: ['Orbital research hub', 'Launch complex', 'Aerospace command centre']
};

export function getBusinessHqTier(type, level = 1) {
  const names = BUSINESS_HQ_TIERS[type] || ['Small Facility', 'Regional Campus', 'Global Headquarters'];
  const lv = Math.max(1, Number(level || 1));
  if (lv >= 25) {
    return { tier: 3, tierLabel: 'Advanced Stage', stageTitle: names[2], nextTierAt: null, nextStageTitle: null };
  }
  if (lv >= 10) {
    return { tier: 2, tierLabel: 'Growth Stage', stageTitle: names[1], nextTierAt: 25, nextStageTitle: names[2] };
  }
  return { tier: 1, tierLabel: 'Early Stage', stageTitle: names[0], nextTierAt: 10, nextStageTitle: names[1] };
}
