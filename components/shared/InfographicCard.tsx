import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { SvgXml } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Props {
  title?: string;
  /** AI-generated SVG markup (vector). Fallback when resolvers fail. */
  svg?: string;
  /** English image prompt — runs through Wikipedia search, LoremFlickr, etc. */
  imagePrompt?: string;
  /** Explicit image URL (overrides resolver). */
  imageUrl?: string;
  caption?: string;
  accentColor?: string;
}

/**
 * Generic English filler AI drops into every imagePrompt. Stripping these lets
 * keyword-based image services return topic-matched results rather than random
 * photos tagged with "Detailed" or "Scientific".
 */
const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'with', 'and', 'or', 'by', 'for', 'at', 'to', 'from', 'is',
  'detailed', 'high', 'quality', 'resolution', 'photograph', 'photo', 'picture', 'image', 'images',
  'illustration', 'illustrations', 'drawing', 'painting', 'scientific', 'realistic', 'photorealistic',
  'educational', 'textbook', 'style', 'background', 'clean', 'detail', 'showing', 'shows', 'featuring',
  'depicting', 'depicts', 'close', 'up', 'view', 'perspective', 'angle', 'vibrant', 'colorful',
  'beautiful', 'professional', 'artistic', 'modern', 'classic', 'cinematic', 'lighting', 'accurate',
]);

function extractKeywords(prompt: string, maxLen = 120): string {
  const cleaned = prompt
    .replace(/[\u0600-\u06FF]+/g, '')          // strip Arabic
    .replace(/[^a-zA-Z0-9\s,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  // Empty keywords used to fall through to "education science" — that caused
  // generic image services to return random topics (cats, etc). Better to
  // surface the empty state and let the UI show a fallback message.
  if (cleaned.length === 0) return '';
  const tokens = cleaned.split(/[\s,]+/).filter(t => t.length > 2 && !STOPWORDS.has(t));
  const result = tokens.length > 0 ? tokens.join(' ') : cleaned;
  return result.length > maxLen ? result.slice(0, maxLen) : result;
}

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return h;
}

// ══════════════════════════════════════════════════════════════════════════
//   Image resolvers — Wikipedia first (real scientific images), then fallbacks
// ══════════════════════════════════════════════════════════════════════════

/**
 * Module-scope cache — successful Wikipedia resolutions persist across mounts
 * within the session. Arabic lesson cards rendered repeatedly share the result
 * instead of hammering the API per scroll.
 */
const WIKI_CACHE = new Map<string, string | null>();

/**
 * Resolve an image via Wikipedia's pageimages API. Returns a direct
 * upload.wikimedia.org URL on success, or null if no match. One network call,
 * aggressively cached in WIKI_CACHE.
 */
async function resolveWikipediaImage(keywords: string, thumbSize = 600): Promise<string | null> {
  if (!keywords) return null;
  const key = `${keywords}::${thumbSize}`;
  if (WIKI_CACHE.has(key)) return WIKI_CACHE.get(key)!;

  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${encodeURIComponent(keywords)}&gsrlimit=1&prop=pageimages&pithumbsize=${thumbSize}&origin=*`;
    // 6s timeout — if Wikipedia is slow, we'd rather fall through to other sources.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) { WIKI_CACHE.set(key, null); return null; }
    const data = await res.json();
    const pages = data?.query?.pages;
    if (!pages) { WIKI_CACHE.set(key, null); return null; }
    const first: any = Object.values(pages)[0];
    const thumb = first?.thumbnail?.source;
    const resolved = typeof thumb === 'string' && thumb.length > 0 ? thumb : null;
    WIKI_CACHE.set(key, resolved);
    return resolved;
  } catch {
    WIKI_CACHE.set(key, null);
    return null;
  }
}

export function pollinationsUrl(prompt: string, width = 512, height = 384, seed?: number): string {
  const keywords = extractKeywords(prompt, 80);
  // Same prompt → same seed → same image (deterministic). Avoids the previous
  // behaviour where a retry would just shuffle to another random AI generation.
  const s = seed ?? Math.abs(hashString(keywords || prompt || 'default')) % 100000;
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(keywords)}?width=${width}&height=${height}&seed=${s}&nologo=true`;
}

// NOTE: loremFlickrUrl and picsumUrl previously fell back to random/photographic
// stock images (cats, landscapes, etc) when keywords didn't match — that's the
// source of the "cat photo in a biology lesson" bug. We no longer use them
// inside the resolver. Kept here only for back-compat exports; do not call.
export function loremFlickrUrl(prompt: string, width = 512, height = 384, seed?: number): string {
  const keywords = extractKeywords(prompt, 60)
    .split(/\s+/).filter(Boolean).slice(0, 3).join(',');
  const kw = keywords || 'education';
  const s = seed ?? Math.abs(hashString(prompt || 'default')) % 100000;
  return `https://loremflickr.com/${width}/${height}/${encodeURIComponent(kw)}?lock=${s}`;
}

export function picsumUrl(width = 512, height = 384, seed?: number): string {
  const s = seed ?? Math.floor(Math.random() * 1000);
  return `https://picsum.photos/seed/${s}/${width}/${height}`;
}

export default function InfographicCard({
  title, svg, imagePrompt, imageUrl, caption, accentColor = '#3B82F6',
}: Props) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(imageUrl || null);
  const [resolving, setResolving] = useState(!imageUrl);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [imgLoading, setImgLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  // Provider index tracked inside the resolver — the UI only sees the final URL.
  const providerIndex = useRef(0);

  const effectivePrompt = imagePrompt && imagePrompt.trim() ? imagePrompt : (title || '');
  const keywords = extractKeywords(effectivePrompt, 80);

  // Resolve pipeline (TOPIC-MATCHED ONLY): Wikipedia → pollinations.
  // The previous version fell back to LoremFlickr / picsum — both of which
  // return random stock photos when the keyword doesn't match a known tag,
  // which is why biology lessons were occasionally getting cat / landscape
  // photos. Now we only use sources that respect the prompt; if both fail,
  // we surface a clear "no relevant image" state instead of misleading the
  // user with an unrelated picture.
  useEffect(() => {
    if (imageUrl) {
      setResolvedUrl(imageUrl);
      setResolving(false);
      return;
    }
    if (!effectivePrompt || !keywords) {
      setResolvedUrl(null);
      setResolving(false);
      setFailed(true);
      return;
    }

    let cancelled = false;
    setResolving(true);
    setFailed(false);
    providerIndex.current = 0;

    (async () => {
      // Tier 1 — Wikipedia pageimages (topic-matched, CORS-enabled, CDN-backed)
      const wiki = await resolveWikipediaImage(keywords);
      if (cancelled) return;
      if (wiki) {
        providerIndex.current = 0;
        setResolvedUrl(wiki);
        setResolving(false);
        return;
      }

      // Tier 2 — pollinations.ai (AI-generated, deterministic per keyword)
      providerIndex.current = 1;
      setResolvedUrl(pollinationsUrl(effectivePrompt, 512, 384));
      setResolving(false);
    })();

    return () => { cancelled = true; };
  }, [effectivePrompt, keywords, imageUrl, retryCount]);

  const sanitizedSvg = resolvedUrl ? null : sanitizeSvg(svg);

  const cardWidth = Math.min(SCREEN_WIDTH - 80, 340);
  const height = expanded ? cardWidth : cardWidth * 0.7;

  const handleError = () => {
    if (__DEV__) { try { console.log('[Infographic] onError for', resolvedUrl); } catch {} }
    // Topic-matched cascade only: Wikipedia (0) → pollinations (1) → fail.
    // We deliberately do NOT fall back to random stock photos.
    if (providerIndex.current === 0) {
      providerIndex.current = 1;
      setResolvedUrl(pollinationsUrl(effectivePrompt, 512, 384));
      setImgLoading(true);
    } else {
      setFailed(true);
    }
  };

  const handleRetry = () => {
    setFailed(false);
    setImgLoading(true);
    setRetryCount(c => c + 1); // re-runs the resolver useEffect
  };

  // Error or nothing to show — message reflects the new "topic-matched only" policy.
  if ((!resolvedUrl && !sanitizedSvg && !resolving) || failed) {
    return (
      <View style={[s.card, { borderRightColor: accentColor }]}>
        {title && <Text style={[s.title, { color: accentColor }]}>{title}</Text>}
        <View style={s.errBox}>
          <Ionicons name="image-outline" size={32} color="#CBD5E1" />
          <Text style={s.errText}>لا توجد صورة مطابقة لهذا المحتوى</Text>
          {!!effectivePrompt && (
            <TouchableOpacity style={s.retryBtn} onPress={handleRetry}>
              <Ionicons name="reload" size={12} color="#3B82F6" />
              <Text style={s.retryText}>إعادة البحث</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  const providerLabel = (() => {
    switch (providerIndex.current) {
      case 0: return 'يبحث في ويكيبيديا...';
      case 1: return 'يُولّد صورة AI...';
      default: return 'يحمّل...';
    }
  })();

  return (
    <TouchableOpacity
      style={[s.card, { borderRightColor: accentColor }]}
      onPress={() => setExpanded(!expanded)}
      activeOpacity={0.85}
    >
      {title && (
        <View style={s.titleRow}>
          <Ionicons name="image-outline" size={14} color={accentColor} />
          <Text style={[s.title, { color: accentColor }]}>{title}</Text>
        </View>
      )}
      <View style={[s.mediaBox, { width: cardWidth, height }]}>
        {resolvedUrl ? (
          <>
            <Image
              key={`${providerIndex.current}-${retryCount}-${resolvedUrl}`}
              source={{ uri: resolvedUrl }}
              style={{ width: '100%', height: '100%', borderRadius: 8 }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
              onLoadStart={() => setImgLoading(true)}
              onLoadEnd={() => setImgLoading(false)}
              onError={handleError}
            />
            {(resolving || imgLoading) && (
              <View style={s.loadOverlay}>
                <ActivityIndicator color={accentColor} />
                <Text style={s.loadText}>{resolving ? 'يبحث في ويكيبيديا...' : providerLabel}</Text>
              </View>
            )}
          </>
        ) : sanitizedSvg ? (
          <SvgXml
            xml={sanitizedSvg}
            width="100%"
            height="100%"
            onError={() => setFailed(true)}
          />
        ) : (
          <View style={s.loadOverlay}>
            <ActivityIndicator color={accentColor} />
            <Text style={s.loadText}>يبحث في ويكيبيديا...</Text>
          </View>
        )}
      </View>
      {caption && <Text style={s.caption}>{caption}</Text>}
      <View style={s.expandHint}>
        <Ionicons
          name={expanded ? 'contract-outline' : 'expand-outline'}
          size={11}
          color={Colors.textMuted}
        />
        <Text style={s.expandText}>{expanded ? 'اضغط للتصغير' : 'اضغط للتكبير'}</Text>
      </View>
    </TouchableOpacity>
  );
}

function sanitizeSvg(raw: any): string | null {
  if (!raw || typeof raw !== 'string') return null;
  let cleaned = raw.replace(/```[\w]*\s*/g, '').replace(/```\s*$/g, '').trim();
  const match = cleaned.match(/<svg[\s\S]*?<\/svg>/i);
  if (!match) return null;
  return match[0]
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/javascript:/gi, '');
}

const s = StyleSheet.create({
  card: {
    backgroundColor: '#FAFBFC',
    borderRadius: 12,
    padding: 12,
    borderRightWidth: 3,
    borderRightColor: Colors.primary,
    marginBottom: 8,
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    marginBottom: 8,
  },
  title: { fontSize: 13, fontWeight: '800', textAlign: 'right' },
  mediaBox: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  loadOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(248,250,252,0.9)',
  },
  loadText: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  caption: {
    fontSize: 11, color: Colors.textMuted, textAlign: 'center',
    marginTop: 8, lineHeight: 16,
  },
  expandHint: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6,
  },
  expandText: { fontSize: 10, color: Colors.textMuted },
  errBox: {
    alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 30, width: '100%',
  },
  errText: { fontSize: 12, color: Colors.textMuted },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#DBEAFE', borderRadius: 100,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#93C5FD', marginTop: 4,
  },
  retryText: { fontSize: 11, fontWeight: '700', color: '#1D4ED8' },
});
