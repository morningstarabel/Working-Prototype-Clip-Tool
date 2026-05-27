import type { AnalyzedClip, TranscriptData, TranscriptSegment } from "@/types";

export const MIN_CLIP_SEC = 15;
export const MAX_CLIP_SEC = 60;
export const MIN_CLIPS = 10;
export const MAX_CLIPS = 20;

// Engagement marker patterns
const EMOTION_WORDS =
  /\b(love|hate|amazing|terrible|insane|crazy|shocked|heartbreaking|beautiful|awful|best|worst|never|always|finally|secret|truth|afraid|excited|angry|happy|sad|cry|laugh|wow|omg|incredible|unbelievable|devastating|hilarious|stunning|disgusting|brilliant|disaster|miracle|nightmare|dream|nightmare|perfect|horrible|fantastic|awful|magnificent|ridiculous|outrageous|breathtaking|mind-blowing|life-changing|game-changing)\b/gi;

const STRONG_STATEMENTS =
  /\b(i promise|i swear|i guarantee|i assure you|believe me|trust me|let me tell you|here's the thing|the truth is|the fact is|nothing will ever|absolutely|completely|totally|literally|actually|honestly|seriously|really|truly|genuinely)\b/gi;

const CONFLICT_INDICATORS =
  /\b(but|however|although|despite|yet|nevertheless|on the other hand|contrary|disagree|argue|debate|fight|battle|struggle|challenge|problem|issue|crisis|conflict|tension|dispute|controversy|oppose|reject|deny|refuse)\b/gi;

const SURPRISE_INDICATORS =
  /\b(suddenly|unexpectedly|surprisingly|shockingly|amazingly|incredibly|unbelievably|wait a minute|hold on|you won't believe|can you believe|guess what|you're not gonna believe|no way|holy cow|what the|are you kidding)\b/gi;

const STORYTELLING_MARKERS =
  /\b(once upon a time|let me tell you a story|picture this|imagine|remember when|back then|at that moment|then|after that|before that|during this time|meanwhile|later|eventually|finally|in the end|the story goes|i remember|i'll never forget)\b/gi;

const HIGH_ENERGY_MARKERS =
  /\b(boom|bang|pow|right now|immediately|instantly|quickly|fast|rapidly|hurry|rush|urgent|emergency|critical|essential|must-have|can't miss|don't miss|watch this|check this out|listen up|pay attention|focus)\b/gi;

const QUESTION_PATTERNS =
  /^(why|how|what|when|where|who|which|can|could|would|should|will|do|does|did|is|are|was|were|have|has|had)\b/i;

const FILLER_PATTERN = /^(um|uh|like|so|well|you know|i mean|kind of|sort of|basically|actually|honestly|literally)[\s,]/i;
const LOW_VALUE_PATTERN =
  /placeholder|pending whisper|\[segment \d+ —/i;
const SILENCE_PATTERN = /^\s*$|^[.\s]{3,}$/;

export type VideoRegion = "beginning" | "middle" | "end";

export interface ClipScores {
  engagement: number;
  emotion: number;
  hook: number;
  conflict: number;
  surprise: number;
  storytelling: number;
  energy: number;
  composite: number;
}

export interface ScoredCandidate {
  start: number;
  end: number;
  text: string;
  region: VideoRegion;
  scores: ClipScores;
  segmentIds: number[];
  reasons: string[];
  hookText: string;
}

export function maxPossibleClips(durationSec: number): number {
  return Math.floor(durationSec / MIN_CLIP_SEC);
}

export function targetClipCount(durationSec: number): number {
  const maxPossible = maxPossibleClips(durationSec);
  const byLength = Math.floor(durationSec / 22);
  const desired = Math.min(MAX_CLIPS, Math.max(MIN_CLIPS, byLength));
  return Math.min(desired, maxPossible);
}

export function getRegion(
  midpoint: number,
  duration: number
): VideoRegion {
  const ratio = midpoint / duration;
  if (ratio < 0.33) return "beginning";
  if (ratio < 0.67) return "middle";
  return "end";
}

export function overlaps(
  a: { start: number; end: number },
  b: { start: number; end: number }
): boolean {
  return a.start < b.end && a.end > b.start;
}

// Simplified emotional keyword scoring
const EMOTIONAL_KEYWORDS = /\b(unglaublich|wow|geil|krass|oh\s+mein\s+gott|nice|perfekt|amazing|crazy|incredible|shocked|love|hate|insane|OMG|WOW|YES|NO|STOP|WAIT)\b/gi;

function scoreSegmentEmotion(text: string): number {
  if (!text || text.length < 2) return 0;

  let score = 0;

  // Check for emotional keywords
  const emotionalMatches = text.match(EMOTIONAL_KEYWORDS) || [];
  score += Math.min(4, emotionalMatches.length * 1.5);

  // Check for exclamation marks
  const exclamations = (text.match(/!/g) || []).length;
  score += Math.min(3, exclamations * 1.5);

  // Check for ALL CAPS words
  const allCapsWords = text.match(/\b[A-Z]{3,}\b/g) || [];
  score += Math.min(3, allCapsWords.length * 1.0);

  return Math.min(10, score);
}

function findBestClips(
  transcript: TranscriptData,
  duration: number
): ScoredCandidate[] {
  const segments = transcript.sentences && transcript.sentences.length
    ? transcript.sentences
    : transcript.segments;

  const candidates: ScoredCandidate[] = [];
  const seen = new Set<string>();

  console.log(
    `[scoring] analyzing ${segments.length} segments for emotional content`
  );

  for (const segment of segments) {
    const score = scoreSegmentEmotion(segment.text);

    // Only create clips for segments with score > 3
    if (score > 3) {
      console.log(
        `[scoring] found emotional segment at ${segment.start.toFixed(1)}s-${segment.end.toFixed(1)}s (score=${score.toFixed(1)}): "${segment.text.substring(0, 60)}..."`
      );

      // Create multiple clip lengths around this segment
      const lengths = [15, 18, 22, 28];
      const segmentMid = (segment.start + segment.end) / 2;

      for (const len of lengths) {
        const start = Math.max(0, segmentMid - len / 2);
        const end = Math.min(duration, start + len);

        if (end - start >= MIN_CLIP_SEC && end - start <= MAX_CLIP_SEC) {
          const key = `${start.toFixed(1)}-${end.toFixed(1)}`;

          if (!seen.has(key)) {
            seen.add(key);

            const candidate: ScoredCandidate = {
              start,
              end,
              text: segments
                .filter((s) => s.start < end && s.end > start)
                .map((s) => s.text)
                .join(" ")
                .trim(),
              region: getRegion(segmentMid, duration),
              scores: {
                engagement: score / 10,
                emotion: score / 10,
                hook: (score / 10) * 0.8,
                conflict: 0.3,
                surprise: 0.3,
                storytelling: 0.2,
                energy: (score / 10) * 0.9,
                composite: score / 10,
              },
              segmentIds: segments
                .filter((s) => s.start < end && s.end > start)
                .map((s) => s.id),
              reasons: [`Emotional segment detected (score=${score.toFixed(1)})`],
              hookText: segment.text.substring(0, 40),
            };

            candidates.push(candidate);
            console.log(
              `[scoring] created clip ${start.toFixed(1)}s-${end.toFixed(1)}s (len=${(end - start).toFixed(1)}s)`
            );
          }
        }
      }
    }
  }

  console.log(
    `[scoring] total clips found: ${candidates.length} from ${segments.length} segments`
  );
  return candidates;
}

export function generateCandidates(
  transcript: TranscriptData,
  duration: number
): ScoredCandidate[] {
  const candidates = findBestClips(transcript, duration);

  // If no emotional clips found, fall back to segment-based clips
  if (candidates.length === 0) {
    console.log(
      `[scoring] no emotional segments found, falling back to segment-based clips`
    );
    const segments = transcript.sentences && transcript.sentences.length
      ? transcript.sentences
      : transcript.segments;

    for (let i = 0; i < segments.length; i++) {
      for (let j = i; j < Math.min(i + 3, segments.length); j++) {
        const start = segments[i].start;
        const end = segments[j].end;
        const len = end - start;

        if (len >= MIN_CLIP_SEC && len <= MAX_CLIP_SEC) {
          candidates.push({
            start,
            end,
            text: segments
              .slice(i, j + 1)
              .map((s) => s.text)
              .join(" ")
              .trim(),
            region: getRegion((start + end) / 2, duration),
            scores: {
              engagement: 0.5,
              emotion: 0.5,
              hook: 0.4,
              conflict: 0.3,
              surprise: 0.3,
              storytelling: 0.2,
              energy: 0.5,
              composite: 0.45,
            },
            segmentIds: segments.slice(i, j + 1).map((s) => s.id),
            reasons: ["Fallback segment-based clip"],
            hookText: "Interesting moment",
          });
        }
      }
    }
  }

  return candidates;
}


function getAnchorTimes(transcript: TranscriptData, duration: number): number[] {
  const anchors = new Set<number>();
  const segments = transcript.sentences && transcript.sentences.length
    ? transcript.sentences
    : transcript.segments;

  for (const segment of segments) {
    const text = segment.text.toLowerCase();
    const segmentMid = (segment.start + segment.end) / 2;

    if (
      hasMatch(EMOTION_WORDS, text) ||
      hasMatch(STRONG_STATEMENTS, text) ||
      hasMatch(CONFLICT_INDICATORS, text) ||
      hasMatch(SURPRISE_INDICATORS, text) ||
      hasMatch(STORYTELLING_MARKERS, text) ||
      hasMatch(HIGH_ENERGY_MARKERS, text) ||
      hasMatch(QUESTION_PATTERNS, text.trim())
    ) {
      anchors.add(segmentMid);
      anchors.add(Math.min(duration, segment.start + (segment.end - segment.start) * 0.15));
      anchors.add(Math.max(0, segment.end - (segment.end - segment.start) * 0.15));
    }

    if (segment.words && segment.words.length) {
      anchors.add(segment.words[0].start);
      anchors.add(segment.words[segment.words.length - 1].end);
    }
  }

  const regionAnchors = [0.12, 0.45, 0.78].map((ratio) => ratio * duration);
  regionAnchors.forEach((t) => anchors.add(Math.min(duration, Math.max(0, t))));

  if (anchors.size === 0) {
    return regionAnchors;
  }

  return Array.from(anchors)
    .filter((time) => time >= 0 && time <= duration)
    .sort((a, b) => a - b);
}

function hasMatch(pattern: RegExp, text: string): boolean {
  return Boolean(text && text.match(pattern));
}

function findSentenceBoundary(
  segments: TranscriptSegment[],
  timestamp: number,
  direction: -1 | 1
): number {
  const targetSegment = segments.find((s) => s.start <= timestamp && s.end >= timestamp);
  if (!targetSegment) return timestamp;

  const segText = targetSegment.text;
  const localStart = targetSegment.start;
  const localEnd = targetSegment.end;
  const segmentDuration = localEnd - localStart;

  const mapCharToTime = (charIndex: number): number =>
    localStart + (segmentDuration * charIndex) / Math.max(1, segText.length);

  if (direction === -1) {
    let lastBoundary = -1;
    for (let i = 0; i < segText.length && mapCharToTime(i) < timestamp; i++) {
      if (/[.!?]/.test(segText[i])) {
        lastBoundary = i;
      }
    }

    if (lastBoundary !== -1) {
      return mapCharToTime(lastBoundary + 1);
    }

    const segmentIndex = segments.indexOf(targetSegment);
    for (let i = segmentIndex - 1; i >= 0; i--) {
      const previous = segments[i].text;
      const boundary = Math.max(
        previous.lastIndexOf("."),
        previous.lastIndexOf("!"),
        previous.lastIndexOf("?")
      );
      if (boundary !== -1) {
        return (
          segments[i].start +
          ((boundary + 1) / Math.max(1, previous.length)) *
            (segments[i].end - segments[i].start)
        );
      }
      if (previous.trim()) return segments[i].start;
    }

    return 0;
  }

  let nextBoundary = -1;
  for (let i = 0; i < segText.length; i++) {
    const timeAtChar = mapCharToTime(i);
    if (timeAtChar >= timestamp && /[.!?]/.test(segText[i])) {
      nextBoundary = i;
      break;
    }
  }

  if (nextBoundary !== -1) {
    return mapCharToTime(nextBoundary + 1);
  }

  const segmentIndex = segments.indexOf(targetSegment);
  for (let i = segmentIndex + 1; i < segments.length; i++) {
    const nextSegment = segments[i].text;
    const firstBoundary = Math.min(
      ...[nextSegment.indexOf("."), nextSegment.indexOf("!"), nextSegment.indexOf("?")]
        .filter((v) => v !== -1)
    );
    if (firstBoundary !== Infinity) {
      return (
        segments[i].start +
        ((firstBoundary + 1) / Math.max(1, nextSegment.length)) *
          (segments[i].end - segments[i].start)
      );
    }
    if (nextSegment.trim()) return segments[i].end;
  }

  return localEnd;
}

export function scoreWindow(
  transcript: TranscriptData,
  start: number,
  end: number,
  duration: number
): ScoredCandidate {
  const overlapping = transcript.segments.filter(
    (s) => s.start < end && s.end > start
  );
  const text = overlapping.map((s) => s.text).join(" ").trim();
  const midpoint = (start + end) / 2;
  const windowLen = end - start;

  const engagement = scoreEngagement(text, overlapping, windowLen);
  const emotion = scoreEmotion(text);
  const hook = scoreHookStrength(text, overlapping, start, duration);
  const conflict = scoreConflict(text);
  const surprise = scoreSurprise(text);
  const storytelling = scoreStorytelling(text);
  const energy = scoreEnergy(text);

  const region = getRegion(midpoint, duration);
  const regionBoost =
    region === "beginning" ? 0.04 : region === "end" ? 0.03 : 0.02;
  const lengthBoost =
    windowLen >= 22 && windowLen <= 48 ? 0.06 : windowLen < 18 ? -0.04 : 0;

  const composite = clamp01(
    engagement * 0.25 + 
    emotion * 0.18 + 
    hook * 0.22 + 
    conflict * 0.12 + 
    surprise * 0.10 + 
    storytelling * 0.08 + 
    energy * 0.05 + 
    regionBoost + 
    lengthBoost
  );

  const reasons = generateScoreReasons({
    engagement,
    emotion,
    hook,
    conflict,
    surprise,
    storytelling,
    energy,
    composite,
  }, text);

  const hookText = extractHookText(text);

  return {
    start: round1(start),
    end: round1(end),
    text,
    region,
    segmentIds: overlapping.map((s) => s.id),
    scores: {
      engagement: round2(engagement),
      emotion: round2(emotion),
      hook: round2(hook),
      conflict: round2(conflict),
      surprise: round2(surprise),
      storytelling: round2(storytelling),
      energy: round2(energy),
      composite: round2(composite),
    },
    reasons,
    hookText,
  };
}

function scoreEngagement(
  text: string,
  segments: TranscriptSegment[],
  windowLen: number
): number {
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  if (wordCount < 4) return 0.15;
  if (LOW_VALUE_PATTERN.test(text)) return 0.25;
  if (SILENCE_PATTERN.test(text)) return 0.1;

  // Filter out filler-heavy content
  const fillerCount = words.filter(w => FILLER_PATTERN.test(w)).length;
  const fillerRatio = fillerCount / Math.max(1, wordCount);
  if (fillerRatio > 0.3) return 0.2;

  const wps = wordCount / windowLen;
  const wpsScore =
    wps >= 1.2 && wps <= 4.5
      ? 1
      : wps < 0.6
        ? 0.2
        : 0.55;

  const segmentDensity = Math.min(1, segments.length / 4);
  const avgSegLen =
    segments.reduce((sum, s) => sum + (s.end - s.start), 0) /
    Math.max(1, segments.length);
  const pacingScore =
    avgSegLen >= 2 && avgSegLen <= 12 ? 1 : avgSegLen > 20 ? 0.35 : 0.6;

  const uniqueRatio =
    new Set(words.map((w) => w.toLowerCase())).size / Math.max(1, wordCount);
  const diversityScore = uniqueRatio >= 0.45 ? 1 : uniqueRatio * 1.4;

  // Bonus for strong statements and questions
  const strongStatementBonus = hasMatch(STRONG_STATEMENTS, text) ? 0.15 : 0;
  const questionBonus = hasMatch(QUESTION_PATTERNS, text.trim()) ? 0.12 : 0;

  return clamp01(
    wpsScore * 0.35 + 
    segmentDensity * 0.22 + 
    pacingScore * 0.18 + 
    diversityScore * 0.13 +
    strongStatementBonus +
    questionBonus -
    (fillerRatio * 0.2)
  );
}

function scoreEmotion(text: string): number {
  if (!text || LOW_VALUE_PATTERN.test(text)) return 0.2;

  const words = text.split(/\s+/).filter(Boolean);
  const emotionHits = (text.match(EMOTION_WORDS) ?? []).length;
  const emotionDensity = Math.min(1, emotionHits / 2);

  const exclamations = (text.match(/!/g) ?? []).length;
  const questions = (text.match(/\?/g) ?? []).length;
  const punctuationScore = Math.min(1, (exclamations + questions) / 2);

  const capsWords = words.filter((w) => w.length > 2 && w === w.toUpperCase()).length;
  const capsScore = Math.min(1, capsWords / 2);

  const intensityWords =
    /\b(must|need|can't|won't|never|always|literally|actually|real|insane)\b/gi;
  const intensityHits = (text.match(intensityWords) ?? []).length;
  const intensityScore = Math.min(1, intensityHits / 2);

  // Bonus for strong statements
  const strongStatementScore = hasMatch(STRONG_STATEMENTS, text) ? 0.2 : 0;

  return clamp01(
    emotionDensity * 0.35 +
      punctuationScore * 0.22 +
      capsScore * 0.13 +
      intensityScore * 0.18 +
      strongStatementScore
  );
}

function scoreConflict(text: string): number {
  if (!text || LOW_VALUE_PATTERN.test(text)) return 0.1;

  const conflictHits = (text.match(CONFLICT_INDICATORS) ?? []).length;
  const conflictDensity = Math.min(1, conflictHits / 2);

  // Bonus for contrastive structures (but, however, although)
  const contrastiveWords = /\b(but|however|although|despite|yet|nevertheless)\b/gi;
  const contrastiveHits = (text.match(contrastiveWords) ?? []).length;
  const contrastiveScore = Math.min(1, contrastiveHits / 1.5);

  // Bonus for disagreement/argument words
  const disagreementWords = /\b(disagree|argue|debate|fight|battle|struggle|oppose|reject)\b/gi;
  const disagreementHits = (text.match(disagreementWords) ?? []).length;
  const disagreementScore = Math.min(1, disagreementHits);

  return clamp01(
    conflictDensity * 0.4 +
    contrastiveScore * 0.35 +
    disagreementScore * 0.25
  );
}

function scoreSurprise(text: string): number {
  if (!text || LOW_VALUE_PATTERN.test(text)) return 0.1;

  const surpriseHits = (text.match(SURPRISE_INDICATORS) ?? []).length;
  const surpriseDensity = Math.min(1, surpriseHits / 1.5);

  // Bonus for unexpected phrases
  const unexpectedPhrases = /\b(you won't believe|can you believe|guess what|you're not gonna believe|no way|holy cow|what the|are you kidding)\b/gi;
  const unexpectedHits = (text.match(unexpectedPhrases) ?? []).length;
  const unexpectedScore = Math.min(1, unexpectedHits);

  // Bonus for sudden transition words
  const suddenWords = /\b(suddenly|unexpectedly|surprisingly|shockingly|amazingly|incredibly|unbelievably)\b/gi;
  const suddenHits = (text.match(suddenWords) ?? []).length;
  const suddenScore = Math.min(1, suddenHits / 2);

  return clamp01(
    surpriseDensity * 0.4 +
    unexpectedScore * 0.35 +
    suddenScore * 0.25
  );
}

function scoreStorytelling(text: string): number {
  if (!text || LOW_VALUE_PATTERN.test(text)) return 0.1;

  const storytellingHits = (text.match(STORYTELLING_MARKERS) ?? []).length;
  const storytellingDensity = Math.min(1, storytellingHits / 2);

  // Bonus for narrative structure words
  const narrativeWords = /\b(then|after that|before that|during this time|meanwhile|later|eventually|finally|in the end)\b/gi;
  const narrativeHits = (text.match(narrativeWords) ?? []).length;
  const narrativeScore = Math.min(1, narrativeHits / 2);

  // Bonus for personal memory markers
  const memoryWords = /\b(i remember|i'll never forget|back then|at that moment)\b/gi;
  const memoryHits = (text.match(memoryWords) ?? []).length;
  const memoryScore = Math.min(1, memoryHits);

  return clamp01(
    storytellingDensity * 0.4 +
    narrativeScore * 0.35 +
    memoryScore * 0.25
  );
}

function scoreEnergy(text: string): number {
  if (!text || LOW_VALUE_PATTERN.test(text)) return 0.1;

  const energyHits = (text.match(HIGH_ENERGY_MARKERS) ?? []).length;
  const energyDensity = Math.min(1, energyHits / 2);

  // Bonus for urgency words
  const urgencyWords = /\b(right now|immediately|instantly|hurry|rush|urgent|emergency|critical)\b/gi;
  const urgencyHits = (text.match(urgencyWords) ?? []).length;
  const urgencyScore = Math.min(1, urgencyHits / 1.5);

  // Bonus for attention-grabbing phrases
  const attentionWords = /\b(watch this|check this out|listen up|pay attention|focus|can't miss|don't miss)\b/gi;
  const attentionHits = (text.match(attentionWords) ?? []).length;
  const attentionScore = Math.min(1, attentionHits);

  // Bonus for exclamations
  const exclamations = (text.match(/!/g) ?? []).length;
  const exclamationScore = Math.min(1, exclamations / 2);

  return clamp01(
    energyDensity * 0.35 +
    urgencyScore * 0.25 +
    attentionScore * 0.25 +
    exclamationScore * 0.15
  );
}

function scoreHookStrength(
  text: string,
  segments: TranscriptSegment[],
  windowStart: number,
  videoDuration: number
): number {
  if (!text || LOW_VALUE_PATTERN.test(text)) {
    const positionScore =
      windowStart < videoDuration * 0.15
        ? 0.75
        : windowStart > videoDuration * 0.8
          ? 0.65
          : 0.4;
    return positionScore * 0.5;
  }

  const firstSegment = segments[0]?.text ?? text;
  const opening = firstSegment.split(/[.!?]/)[0]?.trim() ?? text;
  const openingWords = opening.split(/\s+/).filter(Boolean);

  let score = 0.5;

  if (openingWords.length >= 3 && openingWords.length <= 14) score += 0.2;
  if (openingWords.length > 22) score -= 0.15;
  if (hasMatch(FILLER_PATTERN, opening)) score -= 0.25;
  if (/\?/.test(opening)) score += 0.15;
  if (/\d/.test(opening.slice(0, 60))) score += 0.1;
  if (/\b(you|your|why|how|what|secret|truth|mistake|mistakes)\b/i.test(opening)) {
    score += 0.15;
  }
  if (/^(here's|this is|watch|listen|imagine|stop)/i.test(opening)) {
    score += 0.12;
  }

  const first8 = openingWords.slice(0, 8).join(" ");
  if (first8.length >= 12 && first8.length <= 48) score += 0.1;

  // Bonus for surprise indicators in opening
  if (hasMatch(SURPRISE_INDICATORS, opening)) score += 0.18;
  
  // Bonus for strong statements in opening
  if (hasMatch(STRONG_STATEMENTS, opening)) score += 0.15;
  
  // Bonus for emotional words in opening
  if (hasMatch(EMOTION_WORDS, opening)) score += 0.12;

  return clamp01(score);
}

function generateScoreReasons(
  scores: ClipScores,
  text: string
): string[] {
  const reasons: string[] = [];
  
  if (scores.engagement > 0.6) {
    reasons.push(`High engagement (${scores.engagement.toFixed(2)})`);
  }
  if (scores.emotion > 0.5) {
    reasons.push(`Strong emotional content (${scores.emotion.toFixed(2)})`);
  }
  if (scores.conflict > 0.4) {
    reasons.push(`Contains conflict/contrast (${scores.conflict.toFixed(2)})`);
  }
  if (scores.surprise > 0.4) {
    reasons.push(`Surprising elements (${scores.surprise.toFixed(2)})`);
  }
  if (scores.storytelling > 0.4) {
    reasons.push(`Storytelling structure (${scores.storytelling.toFixed(2)})`);
  }
  if (scores.energy > 0.4) {
    reasons.push(`High energy (${scores.energy.toFixed(2)})`);
  }
  if (scores.hook > 0.5) {
    reasons.push(`Strong hook (${scores.hook.toFixed(2)})`);
  }
  
  // Add specific pattern matches
  if (hasMatch(EMOTION_WORDS, text)) {
    reasons.push('Emotional language detected');
  }
  if (hasMatch(STRONG_STATEMENTS, text)) {
    reasons.push('Strong statements present');
  }
  if (hasMatch(CONFLICT_INDICATORS, text)) {
    reasons.push('Conflict indicators found');
  }
  if (hasMatch(SURPRISE_INDICATORS, text)) {
    reasons.push('Surprise elements detected');
  }
  if (hasMatch(STORYTELLING_MARKERS, text)) {
    reasons.push('Storytelling markers present');
  }
  if (hasMatch(HIGH_ENERGY_MARKERS, text)) {
    reasons.push('High-energy language');
  }
  if (hasMatch(QUESTION_PATTERNS, text.trim())) {
    reasons.push('Question format');
  }
  
  if (reasons.length === 0) {
    reasons.push(`Overall score ${scores.composite.toFixed(2)}`);
  }
  
  return reasons;
}

function extractHookText(text: string): string {
  if (!text || LOW_VALUE_PATTERN.test(text)) {
    return "You need to see this";
  }
  
  // Get the first sentence
  const firstSentence = text.split(/[.!?]/)[0]?.trim();
  if (!firstSentence) return "Interesting moment";
  
  // Get first 8-10 words
  const words = firstSentence.split(/\s+/).filter(Boolean);
  const hookWords = words.slice(0, 10);
  const hookText = hookWords.join(" ");
  
  // Clean up filler at start
  const cleanedHook = hookText.replace(FILLER_PATTERN, '').trim();
  
  // Ensure reasonable length
  if (cleanedHook.length > 60) {
    return cleanedHook.slice(0, 57) + "...";
  }
  
  return cleanedHook || "Compelling moment";
}

export function selectRankedClips(
  candidates: ScoredCandidate[],
  duration: number
): ScoredCandidate[] {
  const target = targetClipCount(duration);
  const minPerRegion = Math.max(2, Math.floor(target / 4));

  const byComposite = [...candidates].sort(
    (a, b) => b.scores.composite - a.scores.composite
  );

  const selected: ScoredCandidate[] = [];
  const regionCounts: Record<VideoRegion, number> = {
    beginning: 0,
    middle: 0,
    end: 0,
  };

  const tryAdd = (c: ScoredCandidate): boolean => {
    if (selected.some((s) => overlaps(s, c))) return false;
    selected.push(c);
    regionCounts[c.region]++;
    return true;
  };

  // Phase 1: guarantee variety across beginning / middle / end
  for (const region of ["beginning", "middle", "end"] as VideoRegion[]) {
    const regional = byComposite.filter((c) => c.region === region);
    for (const c of regional) {
      if (regionCounts[region] >= minPerRegion) break;
      tryAdd(c);
    }
  }

  // Phase 2: fill to target with highest composite non-overlapping
  for (const c of byComposite) {
    if (selected.length >= target) break;
    tryAdd(c);
  }

  const effectiveMin = Math.min(MIN_CLIPS, target);

  // Phase 3: if still under minimum (short video edge case), relax threshold
  if (selected.length < effectiveMin) {
    const relaxed = [...candidates]
      .sort((a, b) => b.scores.composite - a.scores.composite)
      .filter((c) => c.scores.composite >= 0.22);

    for (const c of relaxed) {
      if (selected.length >= effectiveMin) break;
      tryAdd(c);
    }
  }

  // Cap at MAX_CLIPS
  const ranked = selected
    .sort((a, b) => b.scores.composite - a.scores.composite)
    .slice(0, MAX_CLIPS);

  return ranked;
}

export function toAnalyzedClip(candidate: ScoredCandidate, rank: number): AnalyzedClip {
  const viralScore = Math.max(
    1,
    Math.min(10, Math.round(candidate.scores.composite * 10))
  );

  const hookText = candidate.hookText || extractHookText(candidate.text);
  const curiosityHook = `What happens at ${formatTime(candidate.start)}?`;
  const emotionalHook = pickEmotionalHook(candidate.text);
  
  // Generate detailed reasoning from the reasons array
  const reasoningText = [
    `Rank #${rank}.`,
    `Composite score: ${candidate.scores.composite.toFixed(2)}.`,
    ...candidate.reasons.slice(0, 4), // Top 4 reasons
    `Region: ${candidate.region}.`,
    `Timestamp: ${formatTime(candidate.start)}–${formatTime(candidate.end)}.`,
  ].join(" ");

  return {
    start_time: candidate.start,
    end_time: candidate.end,
    platform: ["shorts", "reels", "tiktok"],
    hook_options: {
      curiosity: curiosityHook,
      bold: hookText.slice(0, 40),
      emotional: emotionalHook,
    },
    best_hook: hookText,
    caption_style: "bold-white-outline",
    title: `Clip ${rank} — ${formatTime(candidate.start)}`.slice(0, 60),
    viral_score: viralScore,
    score: round2(candidate.scores.composite),
    reasoning: reasoningText,
  };
}

function pickEmotionalHook(text: string): string {
  if (!text || LOW_VALUE_PATTERN.test(text)) return "You need to see this";
  const match = text.match(EMOTION_WORDS);
  if (match?.[0]) {
    return `That ${match[0].toLowerCase()} moment hits hard`;
  }
  return "This part hits different";
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
