import settings from './original-time-settings-data.json' with {type:'json'}

const {minimumDeltaMs,maximumDeltaMs,timeScale}=settings.branches[0]!

/** CKTimeManager::PreProcess clamps and scales milliseconds before behaviors
 * and physics consume them. Both original graphics timing modes use these
 * same limits. RAF scheduling itself is supplied by the browser. */
export function originalScriptDeltaMs(elapsedMs:number) {
  if(!Number.isFinite(elapsedMs)||elapsedMs<0)throw new Error('Invalid script frame time')
  return Math.fround(Math.min(maximumDeltaMs,Math.max(minimumDeltaMs,Math.fround(elapsedMs)))*timeScale)
}
