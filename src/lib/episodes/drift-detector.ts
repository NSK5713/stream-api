export type DriftDetectorInput = {
  jikanCount?: number;
  anilistCount?: number;
  anidbCount?: number;
  tmdbCount?: number;
  baseCount: number;
  anilistEpisodeCount?: number | null;
  identityKnown?: boolean;
};

export type DriftDetectorResult = {
  drift: boolean;
  reasons: string[];
};

function countDrift(sourceCount: number | undefined, baseCount: number, label: string): string | null {
  if (sourceCount === undefined || sourceCount <= 0 || baseCount <= 0) {
    return null;
  }

  const delta = Math.abs(sourceCount - baseCount) / baseCount;
  if (delta > 0.2) {
    return `${label}_count_mismatch`;
  }

  return null;
}

export function detectEpisodeDrift(input: DriftDetectorInput): DriftDetectorResult {
  const reasons: string[] = [];

  if (input.baseCount <= 0) {
    return { drift: true, reasons: ["empty_base"] };
  }

  for (const [label, count] of [
    ["jikan", input.jikanCount],
    ["anilist", input.anilistCount],
    ["anidb", input.anidbCount],
    ["tmdb", input.tmdbCount],
  ] as const) {
    const reason = countDrift(count, input.baseCount, label);
    if (reason) reasons.push(reason);
  }

  if (
    input.jikanCount !== undefined &&
    input.jikanCount > 0 &&
    input.anilistCount !== undefined &&
    input.anilistCount > 0 &&
    input.jikanCount !== input.anilistCount
  ) {
    reasons.push("jikan!=anilist");
  }

  if (input.identityKnown && input.anilistEpisodeCount != null && input.anilistEpisodeCount > 0) {
    const identityDelta = Math.abs(input.anilistEpisodeCount - input.baseCount) / input.baseCount;
    if (identityDelta > 0.2) {
      reasons.push("identity_episode_count_mismatch");
    }
  }

  if (!input.identityKnown) {
    return { drift: reasons.length > 0, reasons };
  }

  const drift = reasons.some(
    (reason) =>
      reason.endsWith("_count_mismatch") ||
      reason === "jikan!=anilist" ||
      reason === "identity_episode_count_mismatch" ||
      reason === "empty_base",
  );

  return { drift, reasons };
}
